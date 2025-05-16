
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
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword as firebaseUpdatePassword,
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
  cancelSubscription: () => Promise<{success: boolean; message: string}>; // Added directly to user object
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
  changeUserPassword: (currentPassword: string, newPassword: string) => Promise<void>;
  inviteStaffMemberByEmail: (emailToInvite: string) => Promise<{success: boolean; message: string}>;
  removeStaffMember: (staffUidToRemove: string) => Promise<{success: boolean; message: string}>;
  acceptInvitation: (invitationId: string) => Promise<{success: boolean; message: string}>;
  declineInvitation: (invitationId: string) => Promise<{success: boolean; message: string}>;
  revokeInvitation: (invitationId: string) => Promise<{success: boolean; message: string}>;
  refreshUserData: () => Promise<void>;
  updateUserPlan: (planId: PlanId) => Promise<{success: boolean; message: string; sessionId?: string; error?: string}>;
  // cancelSubscription is now part of the User object if needed directly from there, or can be called from context still
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();
  const { toast } = useToast();

  const makeApiRequest = useCallback(async (endpoint: string, body: any, method: 'POST' | 'GET' | 'PUT' | 'DELETE' = 'POST') => {
    const currentFbUser = auth.currentUser;
    if (!currentFbUser) throw new Error("User not authenticated for API request.");
    const idToken = await currentFbUser.getIdToken(true); // Force refresh token
    const response = await fetch(endpoint, {
        method: method,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${idToken}`,
        },
        body: method !== 'GET' ? JSON.stringify(body) : undefined,
    });
    return response.json();
  }, []);


  const cancelSubscription = useCallback(async (): Promise<{success: boolean; message: string}> => {
    const currentContextUser = user; // Use user from context state for stripeSubscriptionId
    const currentFbUser = auth.currentUser;

    if (!currentContextUser || !currentFbUser) {
        return { success: false, message: "User not authenticated." };
    }
    if (!currentContextUser.stripeSubscriptionId && currentContextUser.selectedPlanId !== 'free') {
        const userDocRef = doc(db, "users", currentContextUser.uid);
        await updateDoc(userDocRef, {
            selectedPlanId: 'free',
            subscriptionStatus: 'active',
            stripeSubscriptionId: null,
            subscriptionCurrentPeriodEnd: null,
            updatedAt: serverTimestamp(),
        });
        await refreshUserData(); // Await the refresh
        return { success: true, message: "Subscription status corrected to Free plan as no active Stripe subscription was found." };
    }
    if (!currentContextUser.stripeSubscriptionId) {
         return { success: true, message: "No active Stripe subscription to cancel." };
    }

    try {
      const response = await makeApiRequest('/api/billing/cancel-subscription', {});
      if (response.success) {
        toast({ title: "Subscription Cancellation Initiated", description: response.message || "Your subscription cancellation has been requested with Stripe. Your plan will update based on Stripe's confirmation via webhook." });
        await refreshUserData();
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
  }, [user, makeApiRequest, toast]); // refreshUserData is not directly needed here, called within the then block.

  const fetchAppUserData = useCallback(async (fbUser: FirebaseUser | null): Promise<User | null> => {
    if (!fbUser) return null;

    const userDocRef = doc(db, "users", fbUser.uid);
    const userDocSnap = await getDoc(userDocRef);

    if (userDocSnap.exists()) {
      const appUserDataFromDb = userDocSnap.data() as Partial<Omit<User, 'cancelSubscription'>>;
      let currentFarmName = appUserDataFromDb.farmName || null; // Initialize from user doc first
      let currentStaffMembers: string[] = [];
      let currentIsFarmOwner = appUserDataFromDb.isFarmOwner || false;
      let currentFarmId = appUserDataFromDb.farmId || null;

      if (currentFarmId) {
        const farmDocRef = doc(db, "farms", currentFarmId);
        const farmDocSnap = await getDoc(farmDocRef);
        if (farmDocSnap.exists()) {
          const farmData = farmDocSnap.data();
          currentFarmName = farmData?.farmName || currentFarmName; // Prefer farm doc name if exists
          currentIsFarmOwner = farmData?.ownerId === fbUser.uid; 
          if (currentIsFarmOwner) {
            currentStaffMembers = farmData?.staffMembers || [];
          }
        } else {
          console.warn(`Farm document ${currentFarmId} not found for user ${fbUser.uid}.`);
          if (currentIsFarmOwner) { // If user doc said they were owner but farm is gone
            currentFarmName = `${appUserDataFromDb.name || 'User'}'s Farm (Default)`;
          } else { // Staff member whose farm is gone
            currentFarmId = null; // Dissociate from non-existent farm
            currentFarmName = null;
          }
           currentIsFarmOwner = !currentFarmId; // If no farmId, they become owner of a new conceptual farm
        }
      } else if (currentIsFarmOwner) { // User doc says owner but no farmId: means personal farm not yet fully created or error
         currentFarmName = appUserDataFromDb.farmName || `${appUserDataFromDb.name || 'User'}'s Farm (Default)`;
      }
      
      const completeUser: User = {
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
        cancelSubscription: cancelSubscription, // Attach the method
      };
      return completeUser;

    } else {
      console.warn(`User document for UID ${fbUser.uid} not found. Creating default profile.`);
      const newFarmId = fbUser.uid; 
      const defaultFarmName = `${fbUser.displayName || "New User"}'s Farm`;
      const defaultUserData: Omit<User, 'cancelSubscription'> = {
        uid: fbUser.uid,
        email: fbUser.email,
        name: fbUser.displayName || "New User",
        farmId: newFarmId,
        farmName: defaultFarmName,
        isFarmOwner: true,
        staffMembers: [],
        selectedPlanId: "free",
        subscriptionStatus: "active",
      };
      const batch = writeBatch(db);
      batch.set(doc(db, "users", fbUser.uid), { ...defaultUserData, createdAt: serverTimestamp() });
      batch.set(doc(db, "farms", newFarmId), {
        farmId: newFarmId,
        farmName: defaultFarmName,
        ownerId: fbUser.uid,
        staffMembers: [],
        createdAt: serverTimestamp(),
      });
      await batch.commit();
      return { ...defaultUserData, cancelSubscription: cancelSubscription };
    }
  }, [cancelSubscription]); // cancelSubscription is now a dependency

  const refreshUserData = useCallback(async () => {
    const currentFbUser = auth.currentUser; 
    if (currentFbUser) {
      const appUser = await fetchAppUserData(currentFbUser);
      setUser(appUser);
      setFirebaseUser(currentFbUser);
    } else {
      setUser(null);
      setFirebaseUser(null);
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
    await refreshUserData();
  };

  const registerUser = async (name: string, farmNameFromInput: string, email: string, password: string): Promise<void> => {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const fbUser = userCredential.user;
    await firebaseUpdateProfile(fbUser, { displayName: name });

    const batch = writeBatch(db);
    const userDocRef = doc(db, "users", fbUser.uid);
    const newFarmId = fbUser.uid; 

    const userDataForFirestore: Omit<User, 'farmName' | 'staffMembers' | 'cancelSubscription'> = { 
      uid: fbUser.uid,
      email: fbUser.email,
      name: name,
      farmId: newFarmId,
      isFarmOwner: true,
      selectedPlanId: "free",
      subscriptionStatus: "active",
    };
    batch.set(userDocRef, { ...userDataForFirestore, farmName: farmNameFromInput, createdAt: serverTimestamp()}); // Store initial farmName on user too

    const farmDocRef = doc(db, "farms", newFarmId);
    const farmDataForFirestore = {
      farmId: newFarmId, 
      farmName: farmNameFromInput || `${name}'s Farm`, 
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
          toast({ title: "Invitation Found!", description: "We found a pending invitation for you. Redirecting to accept..." });
          router.push(`/accept-invitation?token=${invitationToken}`);
          // No need to call refreshUserData here as redirection will lead to new auth state handling
          return; 
        }
      }
    } catch (error) {
        console.error("Error checking for pending invitations after registration:", error);
    }
    
    await refreshUserData(); 
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
    const userUpdateData: Partial<Omit<User, 'cancelSubscription'>> & {updatedAt?: FieldValue} = {};

    if (nameUpdate !== user.name && nameUpdate) userUpdateData.name = nameUpdate;

    if (user.isFarmOwner && user.farmId && newFarmName && newFarmName !== user.farmName) { 
      const farmDocRef = doc(db, "farms", user.farmId);
      batch.update(farmDocRef, { farmName: newFarmName, updatedAt: serverTimestamp() });
      userUpdateData.farmName = newFarmName; // Also update farmName on user doc for consistency
    }
    
    let hasChanges = Object.keys(userUpdateData).length > 0;
    if (user.isFarmOwner && user.farmId && newFarmName && newFarmName !== user.farmName) {
        hasChanges = true; // If only farmName changed, it's still a change.
    }

    if (hasChanges) {
        userUpdateData.updatedAt = serverTimestamp();
        if (Object.keys(userUpdateData).length > 0) {
             batch.update(userDocRef, userUpdateData);
        }
    }
    
    if (!batch.empty) { 
        await batch.commit();
    }
    await refreshUserData(); 
  };

  const changeUserPassword = async (currentPassword: string, newPassword: string): Promise<void> => {
    if (!firebaseUser || !firebaseUser.email) {
      throw new Error("User not authenticated or email not available.");
    }
    const credential = EmailAuthProvider.credential(firebaseUser.email, currentPassword);
    await reauthenticateWithCredential(firebaseUser, credential);
    await firebaseUpdatePassword(firebaseUser, newPassword);
  };
  
  const inviteStaffMemberByEmail = async (emailToInvite: string): Promise<{success: boolean; message: string}> => {
    if (!user || !user.isFarmOwner || !user.farmId) {
      return { success: false, message: "Only authenticated farm owners can invite staff." };
    }
    return makeApiRequest('/api/farm/invite-staff', { invitedEmail: emailToInvite });
  };
  
  const removeStaffMember = async (staffUidToRemove: string): Promise<{success: boolean; message: string}> => {
    if (!user || !user.isFarmOwner || !user.farmId || !firebaseUser) {
      return { success: false, message: "Only authenticated farm owners can remove staff." };
    }
    if (user.uid === staffUidToRemove) {
         return { success: false, message: "Owner cannot remove themselves as staff via this method." };
    }
    const result = await makeApiRequest('/api/farm/remove-staff', { staffUidToRemove, ownerUid: user.uid, ownerFarmId: user.farmId });
    if (result.success) await refreshUserData();
    return result;
  };

  const acceptInvitation = async (invitationId: string): Promise<{success: boolean; message: string}> => {
    if (!firebaseUser) return { success: false, message: "You must be logged in to accept an invitation." };
    // The API route /api/farm/invitations/process-token is now preferred for token-based acceptance.
    // This direct acceptInvitation might be for profile page UI actions if we keep it.
    // For now, let's assume the token flow is primary.
    // If keeping this, it would call a different API or be merged.
    // For simplicity, this could call an API that requires the invitationId and confirms user matches invitedUserUid
    const result = await makeApiRequest('/api/farm/invitations/accept', { invitationId }); // API might need update if token is primary
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

  const logoutUser = async () => {
    try {
        await firebaseSignOut(auth);
    } catch (error) {
        console.error("Error signing out: ", error);
    } finally {
        setUser(null);
        setFirebaseUser(null);
        // Check if current path is one of the public/auth pages
        const publicPaths = ['/login', '/register', '/', '/accept-invitation'];
        const isPublicPath = publicPaths.some(p => pathname.startsWith(p));

        if (!isPublicPath) {
           router.push('/login');
        } else if (pathname === '/') {
            // router.refresh(); // If on landing, just refresh to update UI
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
        changeUserPassword,
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

