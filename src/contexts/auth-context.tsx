
"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  User as FirebaseUser,
  onAuthStateChanged,
  signOut as firebaseSignOut,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile as firebaseUpdateProfile,
  getIdToken,
} from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { doc, setDoc, getDoc, updateDoc, collection, serverTimestamp, writeBatch, FieldValue, arrayUnion, arrayRemove, query, where, getDocs, Timestamp } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';

export type PlanId = "free" | "pro" | "agribusiness";
export type SubscriptionStatus = "active" | "trialing" | "cancelled" | "past_due" | "incomplete";


interface User {
  uid: string;
  email: string | null;
  name: string | null;
  farmId?: string | null;
  farmName?: string | null;
  isFarmOwner?: boolean;
  staffMembers?: string[];
  selectedPlanId: PlanId;
  subscriptionStatus: SubscriptionStatus;
  // Potentially: subscriptionEndDate, stripeCustomerId, etc. for real billing
}

interface AuthContextType {
  user: User | null;
  firebaseUser: FirebaseUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  loginUser: (email: string, password: string) => Promise<void>;
  registerUser: (name: string, farmNameFromInput: string, email: string, password: string) => Promise<void>;
  logoutUser: () => Promise<void>;
  updateUserProfile: (name: string, newFarmName: string) => Promise<void>;
  inviteStaffMemberByEmail: (emailToInvite: string) => Promise<{success: boolean; message: string}>;
  removeStaffMember: (staffUidToRemove: string) => Promise<{success: boolean; message: string}>;
  acceptInvitation: (invitationId: string) => Promise<{success: boolean; message: string}>;
  declineInvitation: (invitationId: string) => Promise<{success: boolean; message: string}>;
  revokeInvitation: (invitationId: string) => Promise<{success: boolean; message: string}>;
  refreshUserData: () => Promise<void>;
  updateUserPlan: (planId: PlanId) => Promise<{success: boolean; message: string}>; // For simulated plan change
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
      const appUserDataFromDb = userDocSnap.data() as Partial<Omit<User, 'uid' | 'email' | 'name'>> & { name?: string, email?: string, selectedPlanId?: PlanId, subscriptionStatus?: SubscriptionStatus };
      let currentFarmName: string | null = null;
      let currentStaffMembers: string[] = [];
      let currentIsFarmOwner = appUserDataFromDb.isFarmOwner || false;
      let currentFarmId = appUserDataFromDb.farmId || null;

      if (currentFarmId) {
        const farmDocRef = doc(db, "farms", currentFarmId);
        const farmDocSnap = await getDoc(farmDocRef);
        if (farmDocSnap.exists()) {
          const farmData = farmDocSnap.data();
          currentFarmName = farmData?.farmName || null;
          currentIsFarmOwner = farmData?.ownerId === fbUser.uid;
          if (currentIsFarmOwner) {
            currentStaffMembers = farmData?.staffMembers || [];
          }
        } else {
          console.warn(`Farm document ${currentFarmId} not found for user ${fbUser.uid}.`);
          currentFarmName = "Farm data issue";
          currentIsFarmOwner = false; // User cannot be owner of a non-existent farm
        }
      }
      
      return {
        uid: fbUser.uid,
        email: fbUser.email,
        name: appUserDataFromDb.name || fbUser.displayName,
        farmId: currentFarmId,
        farmName: currentFarmName,
        isFarmOwner: currentIsFarmOwner,
        staffMembers: currentIsFarmOwner ? currentStaffMembers : [],
        selectedPlanId: appUserDataFromDb.selectedPlanId || "free",
        subscriptionStatus: appUserDataFromDb.subscriptionStatus || "active",
      };
    } else {
      // This case is usually during registration before the user doc is fully created
      // Or if there's a data inconsistency.
      console.warn(`User document for UID ${fbUser.uid} not found during fetchAppUserData.`);
      return {
        uid: fbUser.uid,
        email: fbUser.email,
        name: fbUser.displayName,
        farmId: null,
        farmName: null,
        isFarmOwner: false,
        staffMembers: [],
        selectedPlanId: "free", // Default for a new user if doc doesn't exist yet
        subscriptionStatus: "active", // Default
      };
    }
  }, []);


  const refreshUserData = useCallback(async () => {
    if (firebaseUser) {
      setIsLoading(true); // Can set to true to show loading indicators if needed
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

  const loginUser = async (email: string, password: string): Promise<void> => {
    await signInWithEmailAndPassword(auth, email, password);
    // onAuthStateChanged will handle fetching user data
  };

  const registerUser = async (name: string, farmNameFromInput: string, email: string, password: string): Promise<void> => {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const fbUser = userCredential.user;
    await firebaseUpdateProfile(fbUser, { displayName: name });

    const userDocRef = doc(db, "users", fbUser.uid);
    const newFarmId = doc(collection(db, "farms")).id; // Generate a unique ID for the new farm

    const userDataForFirestore = {
      uid: fbUser.uid,
      email: fbUser.email,
      name: name,
      farmId: newFarmId,
      isFarmOwner: true,
      createdAt: serverTimestamp(),
      selectedPlanId: "free" as PlanId,
      subscriptionStatus: "active" as SubscriptionStatus,
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

    // Manually set user state immediately after registration for faster UI update
    // as onAuthStateChanged might have a slight delay in picking up the new Firestore docs.
    setUser({
      uid: fbUser.uid,
      email: fbUser.email,
      name: name,
      farmId: newFarmId,
      farmName: farmNameFromInput,
      isFarmOwner: true,
      staffMembers: [],
      selectedPlanId: "free",
      subscriptionStatus: "active",
    });
    // onAuthStateChanged will also run and re-fetch, ensuring consistency.
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
    const userUpdateData: { name?: string, farmName?: string, updatedAt?: FieldValue } = {}; // farmName here is for user's view if they are not owner

    if (name !== user.name && name) userUpdateData.name = name;

    let updatedLocalFarmName = user.farmName;
    if (user.isFarmOwner && user.farmId && newFarmName !== user.farmName && newFarmName) { 
      const farmDocRef = doc(db, "farms", user.farmId);
      batch.update(farmDocRef, { farmName: newFarmName, updatedAt: serverTimestamp() }); 
      updatedLocalFarmName = newFarmName;
    } else if (!user.isFarmOwner && newFarmName !== user.farmName && newFarmName){
      // This case is tricky. A staff member cannot rename the farm.
      // If farmName on user doc is just a denormalized copy, it might get updated
      // when owner changes it. For now, user profile update won't change farmName if not owner.
    }


    if (Object.keys(userUpdateData).length > 0 || (user.isFarmOwner && newFarmName !== user.farmName)) {
        userUpdateData.updatedAt = serverTimestamp(); // Add timestamp if any user data or owned farm name changes
        if (Object.keys(userUpdateData).length > 0) batch.update(userDocRef, userUpdateData); 
    }

    await batch.commit();
    // Refresh user data to get all latest, including potentially updated staff list on farm if owner role changed
    await refreshUserData(); 
  };
  
  const makeApiRequest = async (endpoint: string, body: any) => {
    if (!firebaseUser) throw new Error("User not authenticated for API request.");
    const idToken = await firebaseUser.getIdToken();
    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify(body),
    });
    return response.json();
  };

  const inviteStaffMemberByEmail = async (emailToInvite: string): Promise<{success: boolean; message: string}> => {
    if (!user || !user.isFarmOwner || !user.farmId) {
      return { success: false, message: "Only authenticated farm owners can invite staff." };
    }
    return makeApiRequest('/api/farm/invite-staff', { invitedEmail: emailToInvite });
  };
  
  const removeStaffMember = async (staffUidToRemove: string): Promise<{success: boolean; message: string}> => {
    if (!user || !user.isFarmOwner || !user.farmId) {
      return { success: false, message: "Only authenticated farm owners can remove staff." };
    }
    if (user.uid === staffUidToRemove) {
         return { success: false, message: "Owner cannot remove themselves as staff." };
    }
    const result = await makeApiRequest('/api/farm/remove-staff', { staffUidToRemove });
    if (result.success) await refreshUserData();
    return result;
  };

  const acceptInvitation = async (invitationId: string): Promise<{success: boolean; message: string}> => {
    if (!firebaseUser) return { success: false, message: "You must be logged in to accept an invitation." };
    const result = await makeApiRequest('/api/farm/invitations/accept', { invitationId });
    if (result.success) await refreshUserData();
    return result;
  };

  const declineInvitation = async (invitationId: string): Promise<{success: boolean; message: string}> => {
    if (!firebaseUser) return { success: false, message: "You must be logged in to decline an invitation." };
    return makeApiRequest('/api/farm/invitations/decline', { invitationId });
  };

  const revokeInvitation = async (invitationId: string): Promise<{success: boolean; message: string}> => {
    if (!firebaseUser || !user?.isFarmOwner) return { success: false, message: "Only farm owners can revoke invitations." };
    return makeApiRequest('/api/farm/invitations/revoke', { invitationId });
  };

  const updateUserPlan = async (planId: PlanId): Promise<{ success: boolean; message: string }> => {
    if (!user || !firebaseUser) {
      return { success: false, message: "User not authenticated." };
    }
    try {
      const userDocRef = doc(db, "users", firebaseUser.uid);
      await updateDoc(userDocRef, {
        selectedPlanId: planId,
        subscriptionStatus: "active", // Simulate successful "upgrade"
        updatedAt: serverTimestamp(),
      });
      await refreshUserData(); // Refresh local user state
      toast({ title: "Plan Updated (Simulated)", description: `Your plan has been set to ${planId}. In a real app, payment would be processed.` });
      return { success: true, message: `Plan updated to ${planId}.` };
    } catch (error) {
      console.error("Error updating user plan (simulated):", error);
      toast({ title: "Error", description: "Could not update your plan.", variant: "destructive" });
      return { success: false, message: "Failed to update plan." };
    }
  };

  const logoutUser = async () => {
    await firebaseSignOut(auth);
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
        refreshUserData,
        updateUserPlan,
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
