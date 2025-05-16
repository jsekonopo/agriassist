
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
  farmName?: string | null; // This will be populated from the farm document
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
      const appUserDataFromDb = userDocSnap.data() as Partial<User>;
      let currentFarmName = null; // Default to null, fetch from farm doc
      let currentStaffMembers: string[] = [];
      let currentIsFarmOwner = appUserDataFromDb.isFarmOwner || false;
      let currentFarmId = appUserDataFromDb.farmId || null;

      if (currentFarmId) {
        const farmDocRef = doc(db, "farms", currentFarmId);
        const farmDocSnap = await getDoc(farmDocRef);
        if (farmDocSnap.exists()) {
          const farmData = farmDocSnap.data();
          currentFarmName = farmData?.farmName;
          currentIsFarmOwner = farmData?.ownerId === fbUser.uid;
          if (currentIsFarmOwner) {
            currentStaffMembers = farmData?.staffMembers || [];
          }
        } else {
          console.warn(`Farm document ${currentFarmId} not found for user ${fbUser.uid}. Resetting farm association.`);
          currentIsFarmOwner = false;
          currentFarmId = null;
          currentFarmName = null;
          // Optionally, update the user document to reflect this orphaned state
          // await updateDoc(userDocRef, { farmId: null, isFarmOwner: false, farmName: null });
        }
      }
      
      return {
        uid: fbUser.uid,
        email: fbUser.email,
        name: appUserDataFromDb.name || fbUser.displayName,
        farmId: currentFarmId,
        farmName: currentFarmName, // Populated from farm document
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
      // This case should ideally not happen post-registration
      return { 
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
    const currentFbUser = auth.currentUser; // Get the latest Firebase user instance
    if (currentFbUser) {
      setIsLoading(true); // Indicate loading during refresh
      const updatedUser = await fetchAppUserData(currentFbUser);
      setUser(updatedUser);
      setFirebaseUser(currentFbUser); // Ensure firebaseUser state is also current
      setIsLoading(false);
    } else {
      // If no firebaseUser, means they logged out or session expired
      setUser(null);
      setFirebaseUser(null);
      setIsLoading(false);
    }
  }, [fetchAppUserData]);


  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUserInstance) => {
      setIsLoading(true);
      if (fbUserInstance) {
        setFirebaseUser(fbUserInstance); // Set Firebase user first
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
    // onAuthStateChanged will handle fetching user data
  };

  const registerUser = async (name: string, farmNameFromInput: string, email: string, password: string): Promise<void> => {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const fbUser = userCredential.user;
    await firebaseUpdateProfile(fbUser, { displayName: name });

    const batch = writeBatch(db);
    const userDocRef = doc(db, "users", fbUser.uid);
    
    // Generate a new farmId for the farm document
    const newFarmRef = doc(collection(db, "farms"));
    const newFarmId = newFarmRef.id;

    const userDataForFirestore: User = {
      uid: fbUser.uid,
      email: fbUser.email,
      name: name,
      farmId: newFarmId, // Assign the new farm's ID
      isFarmOwner: true,
      // staffMembers will be on the farm document
      selectedPlanId: "free",
      subscriptionStatus: "active",
      // farmName is stored on the farm document
    };
    batch.set(userDocRef, { ...userDataForFirestore, createdAt: serverTimestamp()});

    const farmDataForFirestore = {
      farmId: newFarmId, // Store farmId on farm doc as well for consistency
      farmName: farmNameFromInput,
      ownerId: fbUser.uid,
      staffMembers: [], 
      createdAt: serverTimestamp(),
    };
    batch.set(newFarmRef, farmDataForFirestore); // Use newFarmRef to set farm document
    
    await batch.commit();
    await refreshUserData(); 
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

    // Farm name is updated on the farm document directly
    if (user.isFarmOwner && user.farmId && newFarmName !== user.farmName && newFarmName) { 
      const farmDocRef = doc(db, "farms", user.farmId);
      batch.update(farmDocRef, { farmName: newFarmName, updatedAt: serverTimestamp() }); 
      // Note: user.farmName in context will update via refreshUserData after this.
    }
    
    if (Object.keys(userUpdateData).length > 0) {
        userUpdateData.updatedAt = serverTimestamp();
        batch.update(userDocRef, userUpdateData); 
    }
    
    if (batch.length > 0) {
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
    return makeApiRequest('/api/farm/invite-staff', { 
      invitedEmail: emailToInvite,
      // inviterFarmId and inviterUid will be derived by the API from the auth token
    });
  };
  
  const removeStaffMember = async (staffUidToRemove: string): Promise<{success: boolean; message: string}> => {
    if (!user || !user.isFarmOwner || !user.farmId || !firebaseUser) {
      return { success: false, message: "Only authenticated farm owners can remove staff." };
    }
    if (user.uid === staffUidToRemove) {
         return { success: false, message: "Owner cannot remove themselves as staff." };
    }
    // The API route will handle the complex logic of updating farm and user docs
    const result = await makeApiRequest('/api/farm/remove-staff', { 
        staffUidToRemove, 
        // ownerUid and ownerFarmId will be derived from the auth token by the API
    });
    if (result.success) await refreshUserData(); // Refresh data for owner
    return result;
  };

  const acceptInvitation = async (invitationId: string): Promise<{success: boolean; message: string}> => {
    if (!firebaseUser) return { success: false, message: "You must be logged in to accept an invitation." };
    // API will use authenticated user's UID to process acceptance
    const result = await makeApiRequest('/api/farm/invitations/accept', { invitationId });
    if (result.success) await refreshUserData(); // Refresh to get new farmId, farmName etc.
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
    if (!user || !firebaseUser) {
        return { success: false, message: "User not authenticated." };
    }
    // If user is already on free plan, or has no stripeSubscriptionId (meaning they are likely on free or never subscribed)
    if (user.selectedPlanId === 'free' || !user.stripeSubscriptionId) {
        if (user.selectedPlanId !== 'free') { // If they have a paid plan in DB but no stripe ID (inconsistent state)
             const userDocRef = doc(db, "users", user.uid);
             await updateDoc(userDocRef, {
                 selectedPlanId: 'free',
                 subscriptionStatus: 'active', 
                 stripeSubscriptionId: null,
                 stripeCustomerId: user.stripeCustomerId || null, // Keep customer ID if exists
                 subscriptionCurrentPeriodEnd: null,
                 updatedAt: serverTimestamp(),
             });
             await refreshUserData();
             return { success: true, message: "Subscription status corrected to Free plan." };
        }
        return { success: true, message: "You are already on the Free plan or have no active paid subscription." };
    }

    try {
      // Call the API endpoint which will then call Stripe to cancel
      const response = await makeApiRequest('/api/billing/cancel-subscription', {});
      if (response.success) {
        // Firestore update to 'cancelled' and 'free' plan will be handled by Stripe webhook.
        // We can optimistically update the UI or wait for webhook. Let's refresh user data
        // to pick up any immediate changes if the API route does optimistic updates,
        // or to prepare for the webhook update.
        await refreshUserData(); 
        toast({ title: "Subscription Cancellation Requested", description: response.message || "Your subscription cancellation has been initiated with Stripe. Your plan will update shortly." });
      } else {
        toast({ title: "Cancellation Failed", description: response.message || "Could not cancel subscription.", variant: "destructive" });
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
        // Don't force redirect if on public pages
        if (!['/login', '/register', '/'].includes(pathname)) {
           router.push('/login');
        } else if (pathname === '/') {
            // Potentially refresh landing page to update header
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
