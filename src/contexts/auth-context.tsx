
"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
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
import { doc, setDoc, getDoc, updateDoc, collection, serverTimestamp, writeBatch, FieldValue, arrayUnion, arrayRemove, query, where, getDocs } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';


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
  acceptInvitation: (invitationId: string) => Promise<{success: boolean; message: string}>;
  declineInvitation: (invitationId: string) => Promise<{success: boolean; message: string}>;
  revokeInvitation: (invitationId: string) => Promise<{success: boolean; message: string}>;
  refreshUserData: () => Promise<void>;
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
  const { toast } = useToast();

  const fetchAppUserData = useCallback(async (fbUser: FirebaseUser | null): Promise<User | null> => {
    if (!fbUser) return null;

    const userDocRef = doc(db, "users", fbUser.uid);
    const userDocSnap = await getDoc(userDocRef);

    if (userDocSnap.exists()) {
      const appUserDataFromDb = userDocSnap.data() as Omit<User, 'uid' | 'email' | 'name'> & { name: string, email: string }; // Firestore data
      let currentFarmName: string | null = null;
      let currentStaffMembers: string[] = [];
      let currentIsFarmOwner = appUserDataFromDb.isFarmOwner;
      let currentFarmId = appUserDataFromDb.farmId;

      if (currentFarmId) {
        const farmDocRef = doc(db, "farms", currentFarmId);
        const farmDocSnap = await getDoc(farmDocRef);
        if (farmDocSnap.exists()) {
          const farmData = farmDocSnap.data();
          currentFarmName = farmData?.farmName || null;
          currentIsFarmOwner = farmData?.ownerId === fbUser.uid; // Recalculate based on farm doc
          if (currentIsFarmOwner) {
            currentStaffMembers = farmData?.staffMembers || [];
          }
        } else {
          console.warn(`Farm document ${currentFarmId} not found for user ${fbUser.uid}. User may need reassignment.`);
          // If farm doc is missing, this user might be orphaned or was removed from a farm.
          // A robust solution might create a new personal farm or reset their farmId.
          // For now, reflect that they are not associated with this (potentially non-existent) farm.
          // Their user doc might still have an old farmId.
          // The crucial part is *isFarmOwner* should be false if their farmId doesn't match ownerId of existing farm
          currentFarmName = "Farm not found";
          currentIsFarmOwner = false; // Cannot be owner of a non-existent farm
        }
      } else {
        // User has no farmId in their user document. Could be a new user mid-registration
        // or an old user before farmId was standard.
        // Or a staff member who was removed and their farmId was cleared (though removeStaffMember reassigns).
        // Let's assume they might need to create/join a farm.
         console.log(`User ${fbUser.uid} has no farmId in their user document.`);
      }
      
      return {
        uid: fbUser.uid,
        email: fbUser.email,
        name: appUserDataFromDb.name || fbUser.displayName, // Prioritize name from DB
        farmId: currentFarmId,
        farmName: currentFarmName,
        isFarmOwner: currentIsFarmOwner,
        staffMembers: currentIsFarmOwner ? currentStaffMembers : [],
      };
    } else {
      console.warn(`User document for UID ${fbUser.uid} not found. This user might be new or data is inconsistent.`);
      // If user doc doesn't exist but they are authenticated, they might be in the process of registration
      // or an error occurred. For now, return minimal data.
      return {
        uid: fbUser.uid,
        email: fbUser.email,
        name: fbUser.displayName,
        farmId: null,
        farmName: null,
        isFarmOwner: false,
        staffMembers: [],
      };
    }
  }, []);


  const refreshUserData = useCallback(async () => {
    if (firebaseUser) {
      setIsLoading(true);
      const updatedUser = await fetchAppUserData(firebaseUser);
      setUser(updatedUser);
      setIsLoading(false);
    }
  }, [firebaseUser, fetchAppUserData]);


  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUserInstance) => {
      setIsLoading(true);
      setFirebaseUser(fbUserInstance);
      if (fbUserInstance) {
        const appUser = await fetchAppUserData(fbUserInstance);
        setUser(appUser);
      } else {
        setUser(null);
      }
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, [fetchAppUserData]);

  const loginUser = async (email: string, password: string): Promise<FirebaseUserCredential> => {
    return signInWithEmailAndPassword(auth, email, password);
  };

  const registerUser = async (name: string, farmNameFromInput: string, email: string, password: string): Promise<FirebaseUserCredential> => {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const fbUser = userCredential.user;
    await firebaseUpdateProfile(fbUser, { displayName: name });

    const userDocRef = doc(db, "users", fbUser.uid);
    const newFarmId = fbUser.uid; // User's initial farmId is their own UID, they own this farm.

    const userDataForFirestore = {
      uid: fbUser.uid,
      email: fbUser.email,
      name: name,
      farmId: newFarmId,
      isFarmOwner: true,
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
    batch.set(doc(db, "farms", newFarmId), farmDataForFirestore);
    await batch.commit();

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
    const userUpdateData: { name?: string, updatedAt?: FieldValue } = {};
    if (name !== user.name && name) userUpdateData.name = name;

    if (Object.keys(userUpdateData).length > 0) {
        userUpdateData.updatedAt = serverTimestamp();
        batch.update(userDocRef, userUpdateData); 
    }

    let updatedLocalFarmName = user.farmName;
    if (user.isFarmOwner && user.farmId && newFarmName !== user.farmName && newFarmName) { 
      const farmDocRef = doc(db, "farms", user.farmId);
      batch.update(farmDocRef, { farmName: newFarmName, updatedAt: serverTimestamp() }); 
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
          // inviterUid is derived from idToken on server
          inviterFarmId: user.farmId 
        }),
      });
      return await response.json();
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
          // ownerUid is derived from idToken on server
          ownerFarmId: user.farmId 
        }),
      });

      const result = await response.json();
      if (result.success) {
        await refreshUserData(); // Refresh owner's data to update staff list
      }
      return result;
    } catch (error) {
      console.error("Client-side error removing staff member:", error);
      return { success: false, message: "Failed to send removal request. Please try again."};
    }
  };

  const acceptInvitation = async (invitationId: string): Promise<{success: boolean; message: string}> => {
    if (!firebaseUser) return { success: false, message: "You must be logged in to accept an invitation." };
    try {
      const idToken = await firebaseUser.getIdToken();
      const response = await fetch('/api/farm/invitations/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
        body: JSON.stringify({ invitationId }),
      });
      const result = await response.json();
      if (result.success) {
        await refreshUserData(); // Refresh user data to reflect new farm association
      }
      return result;
    } catch (error) {
      console.error("Error accepting invitation:", error);
      return { success: false, message: "Failed to accept invitation. Please try again." };
    }
  };

  const declineInvitation = async (invitationId: string): Promise<{success: boolean; message: string}> => {
    if (!firebaseUser) return { success: false, message: "You must be logged in to decline an invitation." };
    try {
      const idToken = await firebaseUser.getIdToken();
      const response = await fetch('/api/farm/invitations/decline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
        body: JSON.stringify({ invitationId }),
      });
      // No need to refresh user data here as it doesn't change their farm association
      return await response.json();
    } catch (error) {
      console.error("Error declining invitation:", error);
      return { success: false, message: "Failed to decline invitation. Please try again." };
    }
  };

  const revokeInvitation = async (invitationId: string): Promise<{success: boolean; message: string}> => {
    if (!firebaseUser || !user?.isFarmOwner) return { success: false, message: "Only farm owners can revoke invitations." };
    try {
      const idToken = await firebaseUser.getIdToken();
      const response = await fetch('/api/farm/invitations/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
        body: JSON.stringify({ invitationId }),
      });
      // No need to refresh user data here typically, but might refresh pending list on profile page.
      return await response.json();
    } catch (error) {
      console.error("Error revoking invitation:", error);
      return { success: false, message: "Failed to revoke invitation. Please try again." };
    }
  };


  const logoutUser = async () => {
    await firebaseSignOut(auth);
    // setUser(null) and setFirebaseUser(null) are handled by onAuthStateChanged
    router.push('/login'); 
  };

  const isAuthenticated = !!user && !!firebaseUser;

  return (
    <AuthContext.Provider value={{ 
        user, 
        firebaseUser, 
        isAuthenticated, 
        isLoading, 
        loginUser, 
        registerUser, 
        logoutUser, 
        updateUserProfile, 
        inviteStaffMemberByEmail, 
        removeStaffMember,
        acceptInvitation,
        declineInvitation,
        revokeInvitation,
        refreshUserData
    }}>
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
