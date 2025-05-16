
"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import {
  Auth,
  User as FirebaseUser,
  onAuthStateChanged,
  signOut as firebaseSignOut,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile as firebaseUpdateProfile
} from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { doc, setDoc, getDoc, updateDoc, collection, query, where, getDocs, serverTimestamp, writeBatch, DocumentData } from 'firebase/firestore';

interface User {
  uid: string;
  email: string | null;
  name: string | null;
  farmId?: string | null;
  farmName?: string | null;
  isFarmOwner?: boolean;
  staffMembers?: string[]; // UIDs of staff, only relevant for farm owners
}

interface AuthContextType {
  user: User | null;
  firebaseUser: FirebaseUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  loginUser: (email: string, password: string) => Promise<FirebaseUserCredential>;
  registerUser: (name: string, farmNameFromInput: string, email: string, password: string) => Promise<FirebaseUserCredential>;
  logoutUser: () => Promise<void>;
  updateUserProfile: (name: string, newFarmName: string) => Promise<void>;
  inviteStaffMemberByEmail: (emailToInvite: string) => Promise<{success: boolean; message: string}>;
  removeStaffMember: (staffUidToRemove: string) => Promise<{success: boolean; message: string}>;
}

interface FirebaseUserCredential {
  user: FirebaseUser;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      setIsLoading(true); // Start loading when auth state changes
      setFirebaseUser(fbUser);
      if (fbUser) {
        const userDocRef = doc(db, "users", fbUser.uid);
        const userDocSnap = await getDoc(userDocRef);

        if (userDocSnap.exists()) {
          const appUserData = userDocSnap.data() as User; // User data from 'users' collection
          let currentFarmName: string | null = null;
          let currentStaffMembers: string[] = [];
          let currentIsFarmOwner = appUserData.isFarmOwner; // Default to value from user doc
          let currentFarmId = appUserData.farmId;


          if (currentFarmId) { // User is associated with a farm
            const farmDocRef = doc(db, "farms", currentFarmId);
            const farmDocSnap = await getDoc(farmDocRef);
            if (farmDocSnap.exists()) {
              const farmData = farmDocSnap.data();
              currentFarmName = farmData?.farmName || null;
              // Ensure isFarmOwner reflects the user's status regarding *this* farmId
              currentIsFarmOwner = farmData?.ownerId === fbUser.uid;
              if (currentIsFarmOwner) {
                currentStaffMembers = farmData?.staffMembers || [];
              }
            } else {
                console.warn(`Farm document ${currentFarmId} not found for user ${fbUser.uid}. The user might be in a limbo state or their assigned farm was deleted.`);
                // If farm doc is missing, this user might be orphaned.
                // For safety, treat as not owning this (potentially non-existent) farm.
                // A more robust solution might create a new personal farm for them here.
                currentFarmId = null; 
                currentFarmName = null;
                currentIsFarmOwner = false;
            }
          }
           setUser({
            uid: fbUser.uid,
            email: fbUser.email,
            name: appUserData.name || fbUser.displayName,
            farmId: currentFarmId,
            farmName: currentFarmName,
            isFarmOwner: currentIsFarmOwner,
            staffMembers: currentIsFarmOwner ? currentStaffMembers : [],
          });

        } else {
          console.warn(`User document for UID ${fbUser.uid} not found during auth state change. This could happen if registration was interrupted.`);
          // If user doc doesn't exist but they are authenticated, something is wrong.
          // Potentially log them out or redirect to complete profile. For now, set user to null.
          setUser(null);
        }
      } else {
        setUser(null);
      }
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const loginUser = async (email: string, password: string): Promise<FirebaseUserCredential> => {
    return signInWithEmailAndPassword(auth, email, password);
  };

  const registerUser = async (name: string, farmNameFromInput: string, email: string, password: string): Promise<FirebaseUserCredential> => {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const fbUser = userCredential.user;
    await firebaseUpdateProfile(fbUser, { displayName: name });

    const userDocRef = doc(db, "users", fbUser.uid);
    // Generate a unique ID for the new farm. Using the owner's UID is a simple way to ensure uniqueness for their initial farm.
    const newFarmId = fbUser.uid; 

    const userDataForFirestore = { 
      uid: fbUser.uid,
      email: fbUser.email,
      name: name,
      farmId: newFarmId, // User's initial farmId is their own UID
      isFarmOwner: true, // They own this initial farm
      createdAt: serverTimestamp(),
    };

    const farmDataForFirestore = {
      farmId: newFarmId, 
      farmName: farmNameFromInput,
      ownerId: fbUser.uid,
      staffMembers: [], 
      createdAt: serverTimestamp(),
    };

    const batch = writeBatch(db);
    batch.set(userDocRef, userDataForFirestore);
    batch.set(doc(db, "farms", newFarmId), farmDataForFirestore); // Create the farm document
    await batch.commit();

    // Update local user state immediately
    setUser({
      uid: fbUser.uid,
      email: fbUser.email,
      name: name,
      farmId: newFarmId,
      farmName: farmNameFromInput,
      isFarmOwner: true,
      staffMembers: [], 
    });
    return userCredential;
  };

  const updateUserProfile = async (name: string, newFarmName: string): Promise<void> => {
    if (!firebaseUser || !user) throw new Error("User not authenticated.");
    
    const updatesToFirebaseUser: { displayName?: string } = {};
    if (name !== user.name && name) { 
      updatesToFirebaseUser.displayName = name;
    }

    if (Object.keys(updatesToFirebaseUser).length > 0) {
        await firebaseUpdateProfile(firebaseUser, updatesToFirebaseUser);
    }
    
    const batch = writeBatch(db);
    const userDocRef = doc(db, "users", firebaseUser.uid);
    const userUpdateData: { name?: string } = {};
    if (name !== user.name && name) userUpdateData.name = name;

    if (Object.keys(userUpdateData).length > 0) {
        batch.update(userDocRef, userUpdateData); 
    }

    let updatedLocalFarmName = user.farmName;
    if (user.isFarmOwner && user.farmId && newFarmName !== user.farmName && newFarmName) { 
      const farmDocRef = doc(db, "farms", user.farmId);
      batch.update(farmDocRef, { farmName: newFarmName }); 
      updatedLocalFarmName = newFarmName;
    }

    await batch.commit();
    setUser(prevUser => prevUser ? { ...prevUser, name: name || prevUser.name, farmName: updatedLocalFarmName } : null);
  };

  const inviteStaffMemberByEmail = async (emailToInvite: string): Promise<{success: boolean; message: string}> => {
    if (!user || !user.isFarmOwner || !user.farmId || !firebaseUser) {
      return { success: false, message: "Only authenticated farm owners can invite staff." };
    }
    if (!emailToInvite) {
      return { success: false, message: "Email address is required." };
    }

    try {
      const idToken = await firebaseUser.getIdToken();
      const response = await fetch('/api/farm/invite-staff', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({ 
          invitedEmail: emailToInvite,
          inviterUid: user.uid,
          inviterFarmId: user.farmId 
        }),
      });

      const result = await response.json();
      // Note: The actual addition to staffMembers array and user's farmId update
      // would happen after the invited user accepts (via a separate mechanism not built here).
      // This API route currently just logs a pending invitation conceptually.
      // For immediate UI update for the owner (to see who they *tried* to invite), you might
      // want to handle this differently or have the API return more info for the owner.
      // For now, the message from API is displayed.
      return result;

    } catch (error) {
      console.error("Client-side error inviting staff member:", error);
      return { success: false, message: "Failed to send invitation request. Please try again."};
    }
  };

  const removeStaffMember = async (staffUidToRemove: string): Promise<{success: boolean; message: string}> => {
    if (!user || !user.isFarmOwner || !user.farmId || !firebaseUser) {
      return { success: false, message: "Only authenticated farm owners can remove staff." };
    }
     if (user.uid === staffUidToRemove) {
         return { success: false, message: "Owner cannot remove themselves as staff." };
    }

    try {
      const idToken = await firebaseUser.getIdToken();
      const response = await fetch('/api/farm/remove-staff', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({ 
          staffUidToRemove,
          ownerUid: user.uid,
          ownerFarmId: user.farmId 
        }),
      });

      const result = await response.json();
      if (result.success) {
        // Optimistically update the local state for the owner
        setUser(prev => {
          if (!prev || !prev.staffMembers) return prev;
          return { ...prev, staffMembers: prev.staffMembers.filter(uid => uid !== staffUidToRemove) };
        });
      }
      return result;
    } catch (error) {
      console.error("Client-side error removing staff member:", error);
      return { success: false, message: "Failed to send removal request. Please try again."};
    }
  };

  const logoutUser = async () => {
    await firebaseSignOut(auth);
    setUser(null);
    setFirebaseUser(null);
    router.push('/login'); 
  };

  const isAuthenticated = !!user && !!firebaseUser;

  return (
    <AuthContext.Provider value={{ user, firebaseUser, isAuthenticated, isLoading, loginUser, registerUser, logoutUser, updateUserProfile, inviteStaffMemberByEmail, removeStaffMember }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
