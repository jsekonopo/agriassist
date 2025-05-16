
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
  // getIdToken, // No longer directly used client-side for API calls in this manner
} from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { doc, setDoc, getDoc, updateDoc, collection, serverTimestamp, writeBatch, FieldValue, arrayUnion, arrayRemove, query, where, getDocs, Timestamp, limit } from 'firebase/firestore';
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
  staffMembers?: string[]; 
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
      const appUserDataFromDb = userDocSnap.data() as Partial<User>;
      let currentFarmName = null;
      let currentStaffMembers: string[] = [];
      let currentIsFarmOwner = appUserDataFromDb.isFarmOwner || false;
      let currentFarmId = appUserDataFromDb.farmId || null;

      if (currentFarmId) {
        const farmDocRef = doc(db, "farms", currentFarmId);
        const farmDocSnap = await getDoc(farmDocRef);
        if (farmDocSnap.exists()) {
          const farmData = farmDocSnap.data();
          currentFarmName = farmData?.farmName;
          // Ensure ownerId matches for isFarmOwner, important if farmId was changed via invite
          currentIsFarmOwner = farmData?.ownerId === fbUser.uid; 
          if (currentIsFarmOwner) {
            currentStaffMembers = farmData?.staffMembers || [];
          }
        } else {
          console.warn(`Farm document ${currentFarmId} not found for user ${fbUser.uid}. This might occur if a farm was deleted or if the user was removed from a farm and reassigned.`);
          // If farm doc not found, user cannot be owner of it or have staff.
          // Their user doc farmId might be stale.
          // A more robust solution might try to re-assign them to a personal farm or clear their farmId here.
          // For now, we reflect that they are not associated with a valid, accessible farm.
          currentIsFarmOwner = false; 
          // currentFarmId = null; // Keep farmId from user doc for now, might be a personal farm.
          currentFarmName = appUserDataFromDb.isFarmOwner ? `${appUserDataFromDb.name}'s Personal Farm (Default)` : null; // Default if owner but farm doc missing.
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
      // This case should ideally not happen for an authenticated Firebase user if registration completes.
      // It might indicate a Firestore document was deleted or never created.
      console.warn(`User document for UID ${fbUser.uid} not found in Firestore. Creating a default profile.`);
      // Fallback: Create a default user structure, assuming they are a new owner of a personal farm.
      const newFarmId = fbUser.uid; // Their personal farm ID
      const defaultUserData: User = {
        uid: fbUser.uid,
        email: fbUser.email,
        name: fbUser.displayName || "New User",
        farmId: newFarmId,
        farmName: `${fbUser.displayName || "New User"}'s Personal Farm`,
        isFarmOwner: true,
        staffMembers: [],
        selectedPlanId: "free",
        subscriptionStatus: "active",
      };
       // Attempt to create their user and farm docs if missing
      const batch = writeBatch(db);
      batch.set(doc(db, "users", fbUser.uid), { ...defaultUserData, createdAt: serverTimestamp() });
      batch.set(doc(db, "farms", newFarmId), {
        farmId: newFarmId,
        farmName: defaultUserData.farmName,
        ownerId: fbUser.uid,
        staffMembers: [],
        createdAt: serverTimestamp(),
      });
      await batch.commit();
      return defaultUserData;
    }
  }, []);

  const refreshUserData = useCallback(async () => {
    const currentFbUser = auth.currentUser; 
    if (currentFbUser) {
      // setIsLoading(true); // Can cause quick flashes, might be better to manage loading state more granularly if needed
      const appUser = await fetchAppUserData(currentFbUser);
      setUser(appUser);
      setFirebaseUser(currentFbUser);
      // setIsLoading(false);
    } else {
      setUser(null);
      setFirebaseUser(null);
      // setIsLoading(false); // Ensure loading is false if no user
    }
  }, [fetchAppUserData]);


  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUserInstance) => {
      setIsLoading(true);
      if (fbUserInstance) {
        setFirebaseUser(fbUserInstance); 
        const appUser = await fetchAppUserData(fbUserInstance);
        setUser(appUser);
      } else {
        setUser(null);
        setFirebaseUser(null);
      }
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, [fetchAppUserData]);

  const loginUser = async (email: string, password: string): Promise<void> => {
    await signInWithEmailAndPassword(auth, email, password);
    await refreshUserData(); // Explicitly refresh after successful login
  };

  const registerUser = async (name: string, farmNameFromInput: string, email: string, password: string): Promise<void> => {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const fbUser = userCredential.user;
    await firebaseUpdateProfile(fbUser, { displayName: name });

    const batch = writeBatch(db);
    const userDocRef = doc(db, "users", fbUser.uid);
    const newFarmId = fbUser.uid; // User's own UID as their initial personal farm ID

    const userDataForFirestore: Omit<User, 'farmName' | 'staffMembers'> = { // farmName and staffMembers are on farm doc
      uid: fbUser.uid,
      email: fbUser.email,
      name: name,
      farmId: newFarmId,
      isFarmOwner: true,
      selectedPlanId: "free",
      subscriptionStatus: "active",
    };
    batch.set(userDocRef, { ...userDataForFirestore, createdAt: serverTimestamp()});

    const farmDocRef = doc(db, "farms", newFarmId);
    const farmDataForFirestore = {
      farmId: newFarmId, 
      farmName: farmNameFromInput || `${name}'s Farm`, // Use input or default
      ownerId: fbUser.uid,
      staffMembers: [], 
      createdAt: serverTimestamp(),
    };
    batch.set(farmDocRef, farmDataForFirestore);
    
    await batch.commit();
    
    // Check for pending invitations for this email
    try {
      const invitesQuery = query(
        collection(db, "pendingInvitations"),
        where("invitedEmail", "==", email.toLowerCase()),
        where("status", "==", "pending"),
        limit(1)
      );
      const inviteSnapshots = await getDocs(invitesQuery);
      if (!inviteSnapshots.empty) {
        const invitationDoc = inviteSnapshots.docs[0];
        const invitationToken = invitationDoc.data().invitationToken;
        if (invitationToken) {
          toast({ title: "Invitation Found!", description: "We found a pending invitation for you. Redirecting..." });
          router.push(`/accept-invitation?token=${invitationToken}`);
          await refreshUserData(); // Refresh after potential redirect trigger
          return; // Stop further execution if redirecting
        }
      }
    } catch (error) {
        console.error("Error checking for pending invitations after registration:", error);
        // Proceed with normal dashboard redirect even if this check fails
    }
    
    await refreshUserData(); // Refresh user data to load new profile and farm
    router.push("/dashboard");
  };

  const updateUserProfile = async (nameUpdate: string, newFarmName: string): Promise<void> => {
    if (!firebaseUser || !user) throw new Error("User not authenticated.");
    
    const updatesToFirebaseUser: { displayName?: string } = {};
    if (nameUpdate !== user.name && nameUpdate) { 
      updatesToFirebaseUser.displayName = nameUpdate;
    }

    if (Object.keys(updatesToFirebaseUser).length > 0) {
        await firebaseUpdateProfile(firebaseUser, updatesToFirebaseUser);
    }
    
    const batch = writeBatch(db);
    const userDocRef = doc(db, "users", firebaseUser.uid);
    const userUpdateData: Partial<User> & {updatedAt?: FieldValue} = {};

    if (nameUpdate !== user.name && nameUpdate) userUpdateData.name = nameUpdate;

    if (user.isFarmOwner && user.farmId && newFarmName && newFarmName !== user.farmName) { 
      const farmDocRef = doc(db, "farms", user.farmId);
      batch.update(farmDocRef, { farmName: newFarmName, updatedAt: serverTimestamp() });
      // User's local farmName will update on next refreshUserData()
    }
    
    if (Object.keys(userUpdateData).length > 0 || (user.isFarmOwner && user.farmId && newFarmName && newFarmName !== user.farmName) ) {
        userUpdateData.updatedAt = serverTimestamp(); // Add updatedAt to user doc if any profile/farm change
        if (Object.keys(userUpdateData).length > 0) { // only update userDoc if there are actual user changes
            batch.update(userDocRef, userUpdateData);
        }
    }
    
    if (!batch.empty) { // Check if batch has any operations
        await batch.commit();
    }
    await refreshUserData(); 
  };
  
  const makeApiRequest = async (endpoint: string, body: any, method: 'POST' | 'GET' | 'PUT' | 'DELETE' = 'POST') => {
    if (!firebaseUser) throw new Error("User not authenticated for API request.");
    const idToken = await firebaseUser.getIdToken(true); // Force refresh token
    const response = await fetch(endpoint, {
        method: method,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${idToken}`,
        },
        body: method !== 'GET' ? JSON.stringify(body) : undefined,
    });
    return response.json();
  };

  const inviteStaffMemberByEmail = async (emailToInvite: string): Promise<{success: boolean; message: string}> => {
    if (!user || !user.isFarmOwner || !user.farmId) {
      return { success: false, message: "Only authenticated farm owners can invite staff." };
    }
    // The API route now handles owner verification based on the authenticated user's token
    return makeApiRequest('/api/farm/invite-staff', { invitedEmail: emailToInvite });
  };
  
  const removeStaffMember = async (staffUidToRemove: string): Promise<{success: boolean; message: string}> => {
    if (!user || !user.isFarmOwner || !user.farmId || !firebaseUser) {
      return { success: false, message: "Only authenticated farm owners can remove staff." };
    }
    if (user.uid === staffUidToRemove) { // Should be user.uid, not firebaseUser.uid
         return { success: false, message: "Owner cannot remove themselves as staff via this method." };
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

  const updateUserPlan = async (planId: PlanId): Promise<{success: boolean; message: string; sessionId?: string; error?: string}> => {
    if (!user || !firebaseUser) {
      return { success: false, message: "User not authenticated." };
    }
    if (planId === 'free') { 
        // If downgrading to free, it's a cancellation.
        if (user.stripeSubscriptionId) {
            return cancelSubscription();
        } else {
            // Already free or no active Stripe sub, just update DB
            const userDocRef = doc(db, "users", user.uid);
            await updateDoc(userDocRef, {
                selectedPlanId: 'free',
                subscriptionStatus: 'active',
                stripeSubscriptionId: null, // Clear any mock/old stripe sub id
                subscriptionCurrentPeriodEnd: null,
                updatedAt: serverTimestamp(),
            });
            await refreshUserData();
            return { success: true, message: "Successfully switched to the Free plan."};
        }
    }
    // For paid plans, initiate Stripe Checkout
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
    if (!user || !firebaseUser) {
        return { success: false, message: "User not authenticated." };
    }
    if (!user.stripeSubscriptionId && user.selectedPlanId !== 'free') {
        // User has a non-free plan in DB but no Stripe sub ID, likely an inconsistent state or mock setup.
        // Force them to free plan locally.
        const userDocRef = doc(db, "users", user.uid);
        await updateDoc(userDocRef, {
            selectedPlanId: 'free',
            subscriptionStatus: 'active',
            stripeSubscriptionId: null,
            subscriptionCurrentPeriodEnd: null,
            updatedAt: serverTimestamp(),
        });
        await refreshUserData();
        return { success: true, message: "Subscription status corrected to Free plan as no active Stripe subscription was found." };
    }
    if (!user.stripeSubscriptionId) {
         return { success: true, message: "No active Stripe subscription to cancel." };
    }

    try {
      const response = await makeApiRequest('/api/billing/cancel-subscription', {});
      if (response.success) {
        // Firestore update to 'cancelled' and 'free' plan will be handled by Stripe webhook.
        // For quicker UI feedback, we can optimistically set to 'cancelled' but 'free' plan change should wait for webhook
        // Or, for simulation if webhook is not set up, directly update here:
        // const userDocRef = doc(db, "users", user.uid);
        // await updateDoc(userDocRef, {
        //     subscriptionStatus: 'cancelled',
        //     // selectedPlanId: 'free', // Let webhook handle this if it's live
        //     updatedAt: serverTimestamp(),
        // });
        await refreshUserData(); // To pick up changes possibly made by webhook if it's very fast.
        toast({ title: "Subscription Cancellation Initiated", description: response.message || "Your subscription cancellation has been requested with Stripe. Your plan will update based on Stripe's confirmation via webhook." });
      } else {
        toast({ title: "Cancellation Failed", description: response.message || "Could not cancel subscription via API.", variant: "destructive" });
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
    try {
        await firebaseSignOut(auth);
    } catch (error) {
        console.error("Error signing out: ", error);
    } finally {
        setUser(null);
        setFirebaseUser(null);
        if (!['/login', '/register', '/', '/accept-invitation'].some(p => pathname.startsWith(p))) {
           router.push('/login');
        } else if (pathname === '/') {
            router.refresh(); 
        }
    }
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

