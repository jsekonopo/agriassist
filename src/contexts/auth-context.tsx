
"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
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


export interface User {
  uid: string;
  email: string | null;
  name: string | null;
  farmId?: string | null;
  farmName?: string | null;
  isFarmOwner?: boolean;
  staffMembers?: string[]; // Array of staff UIDs, only relevant if isFarmOwner is true
  selectedPlanId: PlanId;
  subscriptionStatus: SubscriptionStatus;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  subscriptionCurrentPeriodEnd?: Timestamp | null;
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
  updateUserPlan: (planId: PlanId) => Promise<{success: boolean; message: string; sessionId?: string; error?: string}>;
  cancelSubscription: () => Promise<{success: boolean; message: string}>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();
  const { toast } = useToast();

  const fetchAppUserData = useCallback(async (fbUser: FirebaseUser | null): Promise<User | null> => {
    if (!fbUser) return null;

    const userDocRef = doc(db, "users", fbUser.uid);
    const userDocSnap = await getDoc(userDocRef);

    if (userDocSnap.exists()) {
      const appUserDataFromDb = userDocSnap.data() as Partial<User>; // Use User type for easier access
      let currentFarmName = appUserDataFromDb.farmName || null; // Default from user doc if any
      let currentStaffMembers: string[] = [];
      let currentIsFarmOwner = appUserDataFromDb.isFarmOwner || false;
      let currentFarmId = appUserDataFromDb.farmId || null;

      if (currentFarmId) {
        const farmDocRef = doc(db, "farms", currentFarmId);
        const farmDocSnap = await getDoc(farmDocRef);
        if (farmDocSnap.exists()) {
          const farmData = farmDocSnap.data();
          currentFarmName = farmData?.farmName || currentFarmName; // Prioritize farm doc name
          currentIsFarmOwner = farmData?.ownerId === fbUser.uid; // Definitive check
          if (currentIsFarmOwner) {
            currentStaffMembers = farmData?.staffMembers || [];
          }
        } else {
          console.warn(`Farm document ${currentFarmId} not found for user ${fbUser.uid}. User might be orphaned or farm deleted.`);
          // If farm doc doesn't exist, user can't be owner of it. Their farmId might be stale.
          // A cleanup mechanism or re-association might be needed in a full app.
          currentIsFarmOwner = false;
          currentFarmId = null; // Clear farmId if farm doesn't exist
          currentFarmName = null;
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
        subscriptionStatus: appUserDataFromDb.subscriptionStatus || (appUserDataFromDb.selectedPlanId === "free" ? "active" : "incomplete"),
        stripeCustomerId: appUserDataFromDb.stripeCustomerId || null,
        stripeSubscriptionId: appUserDataFromDb.stripeSubscriptionId || null,
        subscriptionCurrentPeriodEnd: appUserDataFromDb.subscriptionCurrentPeriodEnd || null,
      };
    } else {
      console.warn(`User document for UID ${fbUser.uid} not found during fetchAppUserData.`);
      return { // Return a default structure for a user whose Firestore doc might not be created yet
        uid: fbUser.uid,
        email: fbUser.email,
        name: fbUser.displayName,
        farmId: null,
        farmName: null,
        isFarmOwner: false,
        staffMembers: [],
        selectedPlanId: "free",
        subscriptionStatus: "active",
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        subscriptionCurrentPeriodEnd: null,
      };
    }
  }, []);


  const refreshUserData = useCallback(async () => {
    if (firebaseUser) {
      // setIsLoading(true); // Optional: show loading indicator during refresh
      const updatedUser = await fetchAppUserData(firebaseUser);
      setUser(updatedUser);
      // setIsLoading(false);
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

    const batch = writeBatch(db);
    const userDocRef = doc(db, "users", fbUser.uid);
    const newFarmId = doc(collection(db, "farms")).id; 

    const userDataForFirestore: User = {
      uid: fbUser.uid,
      email: fbUser.email,
      name: name,
      farmId: newFarmId,
      isFarmOwner: true,
      staffMembers: [],
      selectedPlanId: "free",
      subscriptionStatus: "active",
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      subscriptionCurrentPeriodEnd: null,
      // No farmName here, it's on the farm document
    };
    batch.set(userDocRef, { ...userDataForFirestore, createdAt: serverTimestamp()});


    const farmDataForFirestore = {
      farmId: newFarmId,
      farmName: farmNameFromInput,
      ownerId: fbUser.uid,
      staffMembers: [], // Initialize as empty array
      createdAt: serverTimestamp(),
    };
    batch.set(doc(db, "farms", newFarmId), farmDataForFirestore);
    
    await batch.commit();
    await refreshUserData(); // Refresh to get combined user/farm data
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
    const userUpdateData: Partial<User> & {updatedAt?: FieldValue} = {};

    if (name !== user.name && name) userUpdateData.name = name;

    if (user.isFarmOwner && user.farmId && newFarmName !== user.farmName && newFarmName) { 
      const farmDocRef = doc(db, "farms", user.farmId);
      batch.update(farmDocRef, { farmName: newFarmName, updatedAt: serverTimestamp() }); 
    }
    
    if (Object.keys(userUpdateData).length > 0) {
        userUpdateData.updatedAt = serverTimestamp();
        batch.update(userDocRef, userUpdateData); 
    }
    
    if (batch.length > 0) { // Check if batch has any operations
        await batch.commit();
    }
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
    // The API route will handle creating the pendingInvitation document
    return makeApiRequest('/api/farm/invite-staff', { invitedEmail: emailToInvite });
  };
  
  const removeStaffMember = async (staffUidToRemove: string): Promise<{success: boolean; message: string}> => {
    if (!user || !user.isFarmOwner || !user.farmId || !firebaseUser) {
      return { success: false, message: "Only authenticated farm owners can remove staff." };
    }
    if (user.uid === staffUidToRemove) {
         return { success: false, message: "Owner cannot remove themselves as staff." };
    }
    const result = await makeApiRequest('/api/farm/remove-staff', { staffUidToRemove, ownerUid: user.uid, ownerFarmId: user.farmId });
    if (result.success) await refreshUserData(); // Refresh data for owner (staff list might change)
    return result;
  };

  const acceptInvitation = async (invitationId: string): Promise<{success: boolean; message: string}> => {
    if (!firebaseUser) return { success: false, message: "You must be logged in to accept an invitation." };
    const result = await makeApiRequest('/api/farm/invitations/accept', { invitationId });
    if (result.success) await refreshUserData(); // Refresh to get new farmId, farmName etc.
    return result;
  };

  const declineInvitation = async (invitationId: string): Promise<{success: boolean; message: string}> => {
    if (!firebaseUser) return { success: false, message: "You must be logged in to decline an invitation." };
    // No user data refresh needed typically, just affects pendingInvitations
    return makeApiRequest('/api/farm/invitations/decline', { invitationId });
  };

  const revokeInvitation = async (invitationId: string): Promise<{success: boolean; message: string}> => {
    if (!firebaseUser || !user?.isFarmOwner) return { success: false, message: "Only farm owners can revoke invitations." };
    // No user data refresh needed typically, just affects pendingInvitations
    return makeApiRequest('/api/farm/invitations/revoke', { invitationId });
  };

  const updateUserPlan = async (planId: PlanId): Promise<{success: boolean; message: string; sessionId?: string; error?: string}> => {
    if (!user || !firebaseUser) {
      return { success: false, message: "User not authenticated." };
    }
    if (planId === 'free') { // Handle downgrading to free plan directly or via cancel
        return cancelSubscription();
    }
    try {
      const response = await makeApiRequest('/api/billing/create-checkout-session', { planId });
      if (response.success && response.sessionId) {
        return { success: true, message: 'Checkout session created.', sessionId: response.sessionId };
      } else {
        return { success: false, message: response.message || 'Failed to create checkout session.', error: response.message };
      }
    } catch (error) {
      console.error("Error calling create-checkout-session API:", error);
      const message = error instanceof Error ? error.message : "Could not initiate plan change.";
      return { success: false, message, error: message };
    }
  };

  const cancelSubscription = async (): Promise<{success: boolean; message: string}> => {
    if (!user || !firebaseUser || !user.stripeSubscriptionId) {
      // If it's a free user or no subscription ID, simulate "cancellation" to free tier locally
      if (user && user.selectedPlanId !== 'free') {
        const userDocRef = doc(db, "users", user.uid);
        await updateDoc(userDocRef, {
            selectedPlanId: 'free',
            subscriptionStatus: 'active', // Free plan is always "active" in this model
            stripeSubscriptionId: null, // Clear Stripe sub ID
            updatedAt: serverTimestamp(),
        });
        await refreshUserData();
        return { success: true, message: "Moved to Free plan." };
      }
      return { success: false, message: "No active subscription to cancel or already on Free plan." };
    }
    try {
      const response = await makeApiRequest('/api/billing/cancel-subscription', {});
      if (response.success) {
        // Firestore update will be handled by webhook: customer.subscription.deleted
        toast({ title: "Subscription Cancellation Initiated", description: "Your subscription will be cancelled by Stripe. Your plan status will update shortly." });
        // Optimistically update UI or wait for webhook.
        // For now, we let webhook handle the final Firestore state.
        // You could refreshUserData() here if you want to see optimistic updates from API if any.
      } else {
        toast({ title: "Cancellation Failed", description: response.message, variant: "destructive" });
      }
      return response;
    } catch (error) {
        console.error("Error calling cancel-subscription API:", error);
        const message = error instanceof Error ? error.message : "Could not initiate subscription cancellation.";
        toast({ title: "Error", description: message, variant: "destructive"});
        return { success: false, message };
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
        cancelSubscription,
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
