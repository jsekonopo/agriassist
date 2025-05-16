
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
import { doc, setDoc, getDoc, updateDoc, collection, query, where, getDocs, serverTimestamp, arrayUnion, arrayRemove, writeBatch, DocumentData } from 'firebase/firestore';

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
      setFirebaseUser(fbUser);
      if (fbUser) {
        const userDocRef = doc(db, "users", fbUser.uid);
        const userDocSnap = await getDoc(userDocRef);

        if (userDocSnap.exists()) {
          const appUserData = userDocSnap.data() as User;
          let currentFarmName: string | null = null;
          let currentStaffMembers: string[] = [];
          let currentIsFarmOwner = appUserData.isFarmOwner;

          if (appUserData.farmId) {
            const farmDocRef = doc(db, "farms", appUserData.farmId);
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
                console.warn(`Farm document ${appUserData.farmId} not found for user ${fbUser.uid}.`);
                // If farm doc is missing, user might be an owner of a farm that was deleted, or staff of deleted farm
                // Reset farm-specific fields if farm doc doesn't exist
                appUserData.farmId = null; 
                currentIsFarmOwner = false; 
            }
          }
          setUser({
            uid: fbUser.uid,
            email: fbUser.email,
            name: appUserData.name || fbUser.displayName,
            farmId: appUserData.farmId,
            farmName: currentFarmName,
            isFarmOwner: currentIsFarmOwner,
            staffMembers: currentIsFarmOwner ? currentStaffMembers : [], // Only owner sees staff list for this farm
          });
        } else {
          console.warn(`User document for UID ${fbUser.uid} not found during auth state change.`);
          setUser(null); // Or handle as an error/incomplete registration
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
    const newFarmId = doc(collection(db, "farms")).id; 

    const userDataForFirestore: User & { createdAt: any } = { 
      uid: fbUser.uid,
      email: fbUser.email,
      name: name,
      farmId: newFarmId,
      isFarmOwner: true,
      createdAt: serverTimestamp(),
    };

    const farmDataForFirestore = {
      farmId: newFarmId, // Store the farmId also within the farm document for consistency
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
    if (name !== user.name && name) { // Ensure name is not empty
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

    let updatedFarmName = user.farmName;
    if (user.isFarmOwner && user.farmId && newFarmName !== user.farmName && newFarmName) { // Ensure newFarmName is not empty
      const farmDocRef = doc(db, "farms", user.farmId);
      batch.update(farmDocRef, { farmName: newFarmName }); 
      updatedFarmName = newFarmName;
    }

    await batch.commit();
    setUser(prevUser => prevUser ? { ...prevUser, name: name || prevUser.name, farmName: updatedFarmName } : null);
  };

  const inviteStaffMemberByEmail = async (emailToInvite: string): Promise<{success: boolean; message: string}> => {
    if (!user || !user.isFarmOwner || !user.farmId) {
      return { success: false, message: "Only farm owners can invite staff." };
    }
    if (!emailToInvite || emailToInvite.toLowerCase() === user.email?.toLowerCase()) { 
      return { success: false, message: "Invalid email or cannot invite yourself."};
    }
    
    try {
      // In a real implementation, this would write to a 'pendingInvitations' collection
      // and a Cloud Function would process it (send email, handle acceptance).
      // For now, this is a simulation.
      console.log(`Simulating logging of invitation for ${emailToInvite} to farm ${user.farmId} by ${user.name}`);
      // Example: const pendingRef = await addDoc(collection(db, "pendingInvitations"), { inviterFarmId: user.farmId, invitedEmail: emailToInvite, ... });

      // The following part is a placeholder for what a Cloud Function would do upon acceptance
      // This client-side approach for updating other users is NOT secure for production
      // and relies on overly permissive Firestore rules.
      // We are keeping it for now to demonstrate the flow conceptually.
      const usersRef = collection(db, "users");
      const q = query(usersRef, where("email", "==", emailToInvite.toLowerCase()));
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        return { success: false, message: `User with email ${emailToInvite} not found.` };
      }

      const invitedUserDoc = querySnapshot.docs[0];
      const invitedUserData = invitedUserDoc.data();

      if (invitedUserData.farmId === user.farmId) {
        return { success: false, message: `${emailToInvite} is already part of your farm.`};
      }
      if (invitedUserData.isFarmOwner && invitedUserData.farmId !== user.farmId) {
         return { success: false, message: `${emailToInvite} is an owner of another farm.`};
      }

      const batch = writeBatch(db);
      // Update the invited user's document
      batch.update(invitedUserDoc.ref, { farmId: user.farmId, isFarmOwner: false });
      // Add the invited user's UID to the owner's farm document
      const farmDocRef = doc(db, "farms", user.farmId);
      batch.update(farmDocRef, { staffMembers: arrayUnion(invitedUserDoc.id) });
      await batch.commit();

      // Update local state for owner
      setUser(prev => prev ? ({...prev, staffMembers: [...(prev.staffMembers || []), invitedUserDoc.id]}) : null);

      return { success: true, message: `${emailToInvite} has been added to your farm staff. (Simulated: Real invite would require email confirmation)` };

    } catch (error) {
      console.error("Error inviting staff member:", error);
      return { success: false, message: "Failed to invite staff member. Please try again."};
    }
  };


  const removeStaffMember = async (staffUidToRemove: string): Promise<{success: boolean; message: string}> => {
    if (!user || !user.isFarmOwner || !user.farmId) {
      return { success: false, message: "Only farm owners can remove staff." };
    }
    if (user.uid === staffUidToRemove) {
         return { success: false, message: "Owner cannot remove themselves as staff." };
    }

    try {
      const batch = writeBatch(db);
      const farmDocRef = doc(db, "farms", user.farmId);
      batch.update(farmDocRef, {
        staffMembers: arrayRemove(staffUidToRemove) 
      });

      const removedStaffUserDocRef = doc(db, "users", staffUidToRemove);
      
      const staffUserSnap = await getDoc(removedStaffUserDocRef);
      let staffNameForNewFarm = "User";
      if (staffUserSnap.exists()) {
        staffNameForNewFarm = staffUserSnap.data().name || "User";
      }
      
      const newPersonalFarmId = doc(collection(db, "farms")).id; // Generate a new unique farm ID
      const newPersonalFarmData = {
        farmId: newPersonalFarmId,
        farmName: `${staffNameForNewFarm}'s Personal Farm`, 
        ownerId: staffUidToRemove,
        staffMembers: [],
        createdAt: serverTimestamp(),
      };
      const newPersonalFarmDocRef = doc(db, "farms", newPersonalFarmId);
      batch.set(newPersonalFarmDocRef, newPersonalFarmData); 

      batch.update(removedStaffUserDocRef, {
        farmId: newPersonalFarmId,
        isFarmOwner: true 
      });

      await batch.commit();
      
      setUser(prev => {
        if (!prev || !prev.staffMembers) return prev;
        return { ...prev, staffMembers: prev.staffMembers.filter(uid => uid !== staffUidToRemove) };
      });

      return { success: true, message: `${staffNameForNewFarm} has been removed from your farm and assigned to their own personal farm.`};
    } catch (error) { // Added opening brace
      console.error("Error removing staff member:", error);
      let errorMessage = "Failed to remove staff member.";
      if (error instanceof Error) {
        errorMessage += ` Details: ${error.message}`;
      }
      return { success: false, message: errorMessage};
    } // Added closing brace
  };

  const logoutUser = async () => {
    await firebaseSignOut(auth);
    setUser(null);
    setFirebaseUser(null);
    // Forcing a hard reload to clear all states and redirect might be too aggressive.
    // Next.js router should handle redirection if layout checks auth state.
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

    
