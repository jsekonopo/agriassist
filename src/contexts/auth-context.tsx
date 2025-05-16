
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

export interface NotificationPreferences {
  taskRemindersEmail?: boolean;
  weatherAlertsEmail?: boolean;
  aiSuggestionsInApp?: boolean;
  staffActivityEmail?: boolean;
}
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
  notificationPreferences?: NotificationPreferences;
  // Methods will be added to the context value, not directly on the User object from Firestore
}

interface FullUser extends User {
  cancelSubscription: () => Promise<{success: boolean; message: string}>;
}

interface AuthContextType {
  user: FullUser | null; // Now uses FullUser
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
  updateNotificationPreferences: (preferences: NotificationPreferences) => Promise<{success: boolean; message: string}>;
  cancelSubscription: () => Promise<{success: boolean; message: string}>; // Expose cancelSubscription directly
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<FullUser | null>(null); // Uses FullUser
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();
  const { toast } = useToast();

  const makeApiRequest = useCallback(async (endpoint: string, body: any, method: 'POST' | 'GET' | 'PUT' | 'DELETE' = 'POST') => {
    const currentFbUser = auth.currentUser; // Use auth.currentUser which is updated by onAuthStateChanged
    if (!currentFbUser) throw new Error("User not authenticated for API request.");
    const idToken = await currentFbUser.getIdToken(true); 
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

  // Core data fetching function, returns raw user data.
  const fetchAppUserDataFromDb = useCallback(async (fbUser: FirebaseUser): Promise<User | null> => {
    const userDocRef = doc(db, "users", fbUser.uid);
    const userDocSnap = await getDoc(userDocRef);

    if (userDocSnap.exists()) {
      const appUserDataFromDb = userDocSnap.data() as Partial<User>;
      let currentFarmName = appUserDataFromDb.farmName || null; 
      let currentStaffMembers: string[] = [];
      let currentIsFarmOwner = appUserDataFromDb.isFarmOwner || false;
      let currentFarmId = appUserDataFromDb.farmId || null;

      if (currentFarmId) {
        const farmDocRef = doc(db, "farms", currentFarmId);
        const farmDocSnap = await getDoc(farmDocRef);
        if (farmDocSnap.exists()) {
          const farmData = farmDocSnap.data();
          currentFarmName = farmData?.farmName || currentFarmName; 
          currentIsFarmOwner = farmData?.ownerId === fbUser.uid; 
          if (currentIsFarmOwner) {
            currentStaffMembers = farmData?.staffMembers || [];
          }
        } else {
          console.warn(`Farm document ${currentFarmId} not found for user ${fbUser.uid}. Potential data inconsistency.`);
          // Handle this case: user might be orphaned from a farm or it's a new user default setup issue.
          // For robustness, you might want to reset their farmId or log this for admin review.
          // For now, we'll proceed with potentially inconsistent data if farmDoc is missing.
        }
      } else { 
         // This case should ideally be handled during registration if a user MUST have a farm.
         // If a user somehow exists without a farmId, create a personal one.
         currentFarmId = fbUser.uid;
         currentFarmName = appUserDataFromDb.name ? `${appUserDataFromDb.name}'s Personal Farm` : `${fbUser.displayName || "User"}'s Personal Farm`;
         currentIsFarmOwner = true;
         currentStaffMembers = [];
         // Firestore update to ensure user has a farmId
         await updateDoc(userDocRef, { farmId: currentFarmId, farmName: currentFarmName, isFarmOwner: true });
         const personalFarmRef = doc(db, "farms", currentFarmId);
         const personalFarmSnap = await getDoc(personalFarmRef);
         if (!personalFarmSnap.exists()) {
            await setDoc(personalFarmRef, {
                farmId: currentFarmId,
                farmName: currentFarmName,
                ownerId: fbUser.uid,
                staffMembers: [],
                createdAt: serverTimestamp(),
            });
         }
      }
      
      const defaultNotificationPreferences: NotificationPreferences = {
        taskRemindersEmail: false, weatherAlertsEmail: false, aiSuggestionsInApp: false, staffActivityEmail: false
      };
      
      const fetchedUser: User = {
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
        notificationPreferences: appUserDataFromDb.notificationPreferences || defaultNotificationPreferences,
      };
      return fetchedUser;
    } else {
        // This case implies a Firebase Auth user exists but no Firestore user doc.
        // Should be handled by registration logic primarily.
        console.warn(`Firestore document for user ${fbUser.uid} not found. This should be created during registration.`);
        return null; 
    }
  }, []);

  // Stable cancelSubscription function
  const cancelSubscription = useCallback(async (): Promise<{success: boolean; message: string}> => {
    const currentContextUser = user; // user from AuthProvider state
    if (!currentContextUser || !auth.currentUser) { // check auth.currentUser too
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
        await refreshUserData(); // refreshUserData must be defined before this
        return { success: true, message: "Subscription status corrected to Free plan." };
    }
    if (!currentContextUser.stripeSubscriptionId) {
         return { success: true, message: "No active Stripe subscription to cancel." };
    }
    try {
      const response = await makeApiRequest('/api/billing/cancel-subscription', {});
      // refreshUserData() will be called by the webhook handler ideally,
      // or can be called here optimistically or after a delay.
      // For now, rely on webhook or manual refresh.
      toast({ title: response.success ? "Subscription Cancellation Requested" : "Cancellation Failed", description: response.message });
      if(response.success) await refreshUserData(); // Refresh after successful API call
      return response;
    } catch (error) {
        console.error("Error calling cancel-subscription API:", error);
        const message = error instanceof Error ? error.message : "Could not initiate subscription cancellation.";
        toast({ title: "Error", description: message, variant: "destructive"});
        return { success: false, message };
    }
  }, [user, makeApiRequest, toast, refreshUserData]); // refreshUserData must be defined before this

  const refreshUserData = useCallback(async () => {
    const currentFbUser = auth.currentUser; 
    if (currentFbUser) {
      await currentFbUser.getIdToken(true); // Refresh token
      const appUserData = await fetchAppUserDataFromDb(currentFbUser);
      if (appUserData) {
        setUser({ ...appUserData, cancelSubscription }); // Attach the stable cancelSubscription
      } else {
        setUser(null); // User doc might have been deleted or issue fetching
      }
      setFirebaseUser(currentFbUser);
    } else {
      setUser(null);
      setFirebaseUser(null);
    }
  }, [fetchAppUserDataFromDb, cancelSubscription]); // Add cancelSubscription here as it's part of the FullUser object

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUserInstance) => {
      setIsLoading(true);
      if (fbUserInstance) {
        setFirebaseUser(fbUserInstance); 
        const appUserData = await fetchAppUserDataFromDb(fbUserInstance);
        if (appUserData) {
          setUser({ ...appUserData, cancelSubscription }); // Attach stable cancelSubscription
        } else {
            // This could happen if Firestore doc creation failed during registration
            // or if a user was deleted from Firestore but not Auth.
            // For a robust app, might try to re-create a basic user doc or sign out.
            setUser(null); 
            console.error("Auth user exists but no Firestore data found. Logging out.");
            await firebaseSignOut(auth); // Force sign out if data is inconsistent
        }
      } else {
        setUser(null);
        setFirebaseUser(null);
      }
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, [fetchAppUserDataFromDb, cancelSubscription]); // Add cancelSubscription here


  const loginUser = async (email: string, password: string): Promise<void> => {
    await signInWithEmailAndPassword(auth, email, password);
    // onAuthStateChanged will trigger data fetching and user state update
  };

  const registerUser = async (name: string, farmNameFromInput: string, email: string, password: string): Promise<void> => {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const fbUser = userCredential.user;
    await firebaseUpdateProfile(fbUser, { displayName: name });

    const batch = writeBatch(db);
    const userDocRef = doc(db, "users", fbUser.uid);
    const newFarmId = doc(collection(db, "farms")).id; // Generate a new unique ID for the farm
    const actualFarmName = farmNameFromInput.trim() || `${name}'s Personal Farm`;
    const defaultNotificationPreferences: NotificationPreferences = {
        taskRemindersEmail: false, weatherAlertsEmail: false, aiSuggestionsInApp: false, staffActivityEmail: false
    };

    const userDataForFirestore: Omit<User, 'cancelSubscription' | 'staffMembers'> & {createdAt: FieldValue} = { 
      uid: fbUser.uid,
      email: fbUser.email,
      name: name,
      farmId: newFarmId,
      farmName: actualFarmName, 
      isFarmOwner: true,
      selectedPlanId: "free",
      subscriptionStatus: "active",
      notificationPreferences: defaultNotificationPreferences,
      createdAt: serverTimestamp(),
    };
    batch.set(userDocRef, userDataForFirestore);

    const farmDocRef = doc(db, "farms", newFarmId);
    const farmDataForFirestore = {
      farmId: newFarmId, 
      farmName: actualFarmName, 
      ownerId: fbUser.uid,
      staffMembers: [], 
      createdAt: serverTimestamp(),
    };
    batch.set(farmDocRef, farmDataForFirestore);
    await batch.commit();
    
    // Check for pending invitations after Firestore docs are committed
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
          return; 
        }
      }
    } catch (error) {
        console.error("Error checking for pending invitations after registration:", error);
    }
    
    // Manually trigger refreshUserData here to ensure state is updated with the new user and farm.
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
    const userUpdateData: Record<string, any> = { updatedAt: serverTimestamp() };

    if (nameUpdate !== user.name && nameUpdate) userUpdateData.name = nameUpdate;

    if (user.isFarmOwner && user.farmId && newFarmName && newFarmName !== user.farmName) { 
      const farmDocRef = doc(db, "farms", user.farmId);
      batch.update(farmDocRef, { farmName: newFarmName, updatedAt: serverTimestamp() });
      userUpdateData.farmName = newFarmName; 
    }
    
    if (Object.keys(userUpdateData).length > 1) { // more than just updatedAt
        batch.update(userDocRef, userUpdateData);
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
  
  const inviteStaffMemberByEmail = useCallback(async (emailToInvite: string): Promise<{success: boolean; message: string}> => {
    if (!user || !user.isFarmOwner || !user.farmId) {
      return { success: false, message: "Only authenticated farm owners can invite staff." };
    }
    return makeApiRequest('/api/farm/invite-staff', { invitedEmail: emailToInvite });
  }, [user, makeApiRequest]);
  
  const removeStaffMember = useCallback(async (staffUidToRemove: string): Promise<{success: boolean; message: string}> => {
    if (!user || !user.isFarmOwner || !user.farmId || !firebaseUser) {
      return { success: false, message: "Only authenticated farm owners can remove staff." };
    }
    if (user.uid === staffUidToRemove) {
         return { success: false, message: "Owner cannot remove themselves as staff via this method." };
    }
    const result = await makeApiRequest('/api/farm/remove-staff', { staffUidToRemove });
    if (result.success) await refreshUserData();
    return result;
  }, [user, firebaseUser, makeApiRequest, refreshUserData]);

  const acceptInvitation = useCallback(async (invitationId: string): Promise<{success: boolean; message: string}> => {
    if (!firebaseUser) return { success: false, message: "You must be logged in to accept an invitation." };
    const result = await makeApiRequest('/api/farm/invitations/accept', { invitationId });
    if (result.success) await refreshUserData();
    return result;
  }, [firebaseUser, makeApiRequest, refreshUserData]);

  const declineInvitation = useCallback(async (invitationId: string): Promise<{success: boolean; message: string}> => {
    if (!firebaseUser) return { success: false, message: "You must be logged in to decline an invitation." };
    return makeApiRequest('/api/farm/invitations/decline', { invitationId });
  }, [firebaseUser, makeApiRequest]);

  const revokeInvitation = useCallback(async (invitationId: string): Promise<{success: boolean; message: string}> => {
    if (!firebaseUser || !user?.isFarmOwner) return { success: false, message: "Only farm owners can revoke invitations." };
    return makeApiRequest('/api/farm/invitations/revoke', { invitationId });
  }, [firebaseUser, user, makeApiRequest]);

  const updateUserPlan = useCallback(async (planId: PlanId): Promise<{success: boolean; message: string; sessionId?: string; error?: string}> => {
    if (!user || !firebaseUser) {
      return { success: false, message: "User not authenticated." };
    }
    if (planId === 'free') { 
      if (user.selectedPlanId !== 'free') {
        return cancelSubscription(); // cancelSubscription must be defined before this
      } else {
        return { success: true, message: "You are already on the Free plan." };
      }
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
  }, [user, firebaseUser, makeApiRequest, cancelSubscription]); // cancelSubscription must be defined before this

  const updateNotificationPreferences = useCallback(async (preferences: NotificationPreferences): Promise<{success: boolean; message: string}> => {
    if (!user || !firebaseUser) {
      return { success: false, message: "User not authenticated." };
    }
    try {
      const userDocRef = doc(db, "users", firebaseUser.uid);
      await updateDoc(userDocRef, {
        notificationPreferences: preferences,
        updatedAt: serverTimestamp(),
      });
      await refreshUserData(); 
      return { success: true, message: "Notification preferences updated." };
    } catch (error) {
      console.error("Error updating notification preferences:", error);
      const message = error instanceof Error ? error.message : "Could not update preferences.";
      return { success: false, message };
    }
  }, [user, firebaseUser, refreshUserData]);

  const logoutUser = async () => {
    try {
        await firebaseSignOut(auth);
    } catch (error) {
        console.error("Error signing out: ", error);
    } finally {
        setUser(null);
        setFirebaseUser(null);
        const publicPaths = ['/login', '/register', '/', '/accept-invitation'];
        const isPublicPath = publicPaths.some(p => pathname.startsWith(p));
        if (!isPublicPath) {
           router.push('/login');
        }
    }
  };

  const isAuthenticated = !!user && !!firebaseUser;

  // Memoize the context value
  const contextValue = React.useMemo(() => ({
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
    refreshUserData, // This is now the correctly ordered one
    updateUserPlan,
    updateNotificationPreferences,
    cancelSubscription, // This is now the correctly ordered one
  }), [
    user, firebaseUser, isAuthenticated, isLoading,
    loginUser, registerUser, logoutUser, updateUserProfile, changeUserPassword,
    inviteStaffMemberByEmail, removeStaffMember, acceptInvitation, declineInvitation, revokeInvitation,
    refreshUserData, updateUserPlan, updateNotificationPreferences, cancelSubscription
  ]);

  return (
    <AuthContext.Provider value={contextValue}>
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

