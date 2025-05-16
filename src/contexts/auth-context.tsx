
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
export type PreferredAreaUnit = "acres" | "hectares";
export type PreferredWeightUnit = "kg" | "lbs";
export type ThemePreference = "light" | "dark" | "system";


export interface NotificationPreferences {
  taskRemindersEmail?: boolean;
  weatherAlertsEmail?: boolean;
  aiSuggestionsInApp?: boolean;
  staffActivityEmail?: boolean;
}
export interface UserSettings {
  notificationPreferences?: NotificationPreferences;
  preferredAreaUnit?: PreferredAreaUnit;
  preferredWeightUnit?: PreferredWeightUnit;
  theme?: ThemePreference; // Added theme preference
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
  settings?: UserSettings;
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
  makeApiRequest: (endpoint: string, body: any, method?: 'POST' | 'GET' | 'PUT' | 'DELETE') => Promise<any>;
  inviteStaffMemberByEmail: (emailToInvite: string) => Promise<{success: boolean; message: string}>;
  removeStaffMember: (staffUidToRemove: string) => Promise<{success: boolean; message: string}>;
  acceptInvitation: (invitationId: string) => Promise<{success: boolean; message: string}>;
  declineInvitation: (invitationId: string) => Promise<{success: boolean; message: string}>;
  revokeInvitation: (invitationId: string) => Promise<{success: boolean; message: string}>;
  refreshUserData: () => Promise<void>;
  updateUserPlan: (planId: PlanId) => Promise<{success: boolean; message: string; sessionId?: string; error?: string}>;
  cancelSubscription: () => Promise<{success: boolean; message: string}>;
  updateUserSettings: (newSettings: Partial<UserSettings>) => Promise<{success: boolean; message: string}>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();
  const { toast } = useToast();

  // Apply theme effect
  useEffect(() => {
    const currentTheme = user?.settings?.theme || "system";
    const root = window.document.documentElement;
    root.classList.remove("light", "dark");

    if (currentTheme === "system") {
      const systemTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
      root.classList.add(systemTheme);
    } else {
      root.classList.add(currentTheme);
    }
  }, [user?.settings?.theme]);


  const makeApiRequest = useCallback(async (endpoint: string, body: any, method: 'POST' | 'GET' | 'PUT' | 'DELETE' = 'POST') => {
    const currentFbUser = auth.currentUser;
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
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: "API request failed with status: " + response.status }));
      throw new Error(errorData.message || "API request failed");
    }
    return response.json();
  }, []);

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
        try {
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
              console.warn(`Farm document ${currentFarmId} not found for user ${fbUser.uid}. User might need reassignment or this farm was deleted.`);
              // If farm doc doesn't exist, user effectively has no farm association for data.
              // A more robust system might re-assign them to a personal farm or prompt admin action.
              // For now, we might clear their farmId if the doc is missing.
              // This path should be carefully considered.
              currentFarmId = null; // Or handle as an error / prompt user
              currentFarmName = null;
              currentIsFarmOwner = false;
            }
        } catch (farmError) {
            console.error(`Error fetching farm ${currentFarmId} for user ${fbUser.uid}:`, farmError);
            // Decide how to handle this - e.g., treat as no farm access
            currentFarmId = null;
            currentFarmName = null;
            currentIsFarmOwner = false;
        }
      } else { 
         // User has no farmId, they are likely new or unassigned
         // They should operate in a "personal" space or be prompted to create/join a farm
         // For now, if no farmId, assume they can't access shared farm data
         currentIsFarmOwner = false; // Cannot be owner without a farmId
      }
      
      const defaultNotificationPreferences: NotificationPreferences = {
        taskRemindersEmail: false, weatherAlertsEmail: false, aiSuggestionsInApp: false, staffActivityEmail: false
      };
      const defaultSettings: UserSettings = {
        notificationPreferences: appUserDataFromDb.settings?.notificationPreferences || defaultNotificationPreferences,
        preferredAreaUnit: appUserDataFromDb.settings?.preferredAreaUnit || "acres",
        preferredWeightUnit: appUserDataFromDb.settings?.preferredWeightUnit || "kg",
        theme: appUserDataFromDb.settings?.theme || "system", // Default theme
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
        settings: defaultSettings,
      };
      return fetchedUser;
    } else {
        console.warn(`Firestore document for user ${fbUser.uid} not found during fetchAppUserDataFromDb.`);
        return null; 
    }
  }, []);
  
  const refreshUserData = useCallback(async () => {
    const currentFbUser = auth.currentUser; 
    if (currentFbUser) {
      try {
        await currentFbUser.getIdToken(true); 
        const appUserData = await fetchAppUserDataFromDb(currentFbUser);
        setUser(appUserData); 
        setFirebaseUser(currentFbUser); // Ensure firebaseUser state is also updated
      } catch (error) {
        console.error("Error refreshing user data:", error);
        setUser(null);
        setFirebaseUser(null);
      }
    } else {
      setUser(null);
      setFirebaseUser(null);
    }
  }, [fetchAppUserDataFromDb]); 

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUserInstance) => {
      setIsLoading(true);
      if (fbUserInstance) {
        setFirebaseUser(fbUserInstance); // Set firebaseUser immediately
        await refreshUserData(); // Then refresh all app user data
      } else {
        setUser(null);
        setFirebaseUser(null);
      }
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, [refreshUserData]);

  const loginUser = useCallback(async (email: string, password: string): Promise<void> => {
    await signInWithEmailAndPassword(auth, email, password);
    // onAuthStateChanged will trigger refreshUserData
  }, []);

  const registerUser = useCallback(async (name: string, farmNameFromInput: string, email: string, password: string): Promise<void> => {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const fbUser = userCredential.user;
    await firebaseUpdateProfile(fbUser, { displayName: name });

    const batch = writeBatch(db);
    const userDocRef = doc(db, "users", fbUser.uid);
    const newFarmId = doc(collection(db, "farms")).id; 
    const actualFarmName = farmNameFromInput.trim() || `${name}'s Personal Farm`;
    
    const defaultSettings : UserSettings = {
      notificationPreferences: { taskRemindersEmail: false, weatherAlertsEmail: false, aiSuggestionsInApp: false, staffActivityEmail: false },
      preferredAreaUnit: "acres",
      preferredWeightUnit: "kg",
      theme: "system",
    };

    const userDataForFirestore: Omit<User, 'staffMembers' | 'subscriptionCurrentPeriodEnd' | 'stripeCustomerId' | 'stripeSubscriptionId'> & {createdAt: FieldValue} = { 
      uid: fbUser.uid,
      email: fbUser.email,
      name: name,
      farmId: newFarmId,
      farmName: actualFarmName, 
      isFarmOwner: true,
      selectedPlanId: "free",
      subscriptionStatus: "active",
      settings: defaultSettings,
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
    
    // onAuthStateChanged should handle refreshing data and setting the user.
    // Then check for pending invites.
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
    
    router.push("/dashboard"); // Default redirect if no invite found
  }, [toast, router]);
  
  const updateUserProfile = useCallback(async (nameUpdate: string, newFarmName: string): Promise<void> => {
    const currentFbUser = auth.currentUser;
    if (!currentFbUser || !user) throw new Error("User not authenticated.");
    
    const updatesToFirebaseUser: { displayName?: string } = {};
    if (nameUpdate !== user.name && nameUpdate.trim() !== "") { 
      updatesToFirebaseUser.displayName = nameUpdate.trim();
    }

    if (Object.keys(updatesToFirebaseUser).length > 0) {
        await firebaseUpdateProfile(currentFbUser, updatesToFirebaseUser);
    }
    
    const batch = writeBatch(db);
    const userDocRef = doc(db, "users", currentFbUser.uid);
    const userUpdateData: Record<string, any> = { updatedAt: serverTimestamp() };

    if (nameUpdate.trim() !== "" && nameUpdate.trim() !== user.name) userUpdateData.name = nameUpdate.trim();

    if (user.isFarmOwner && user.farmId && newFarmName.trim() !== "" && newFarmName.trim() !== user.farmName) { 
      const farmDocRef = doc(db, "farms", user.farmId);
      batch.update(farmDocRef, { farmName: newFarmName.trim(), updatedAt: serverTimestamp() });
      userUpdateData.farmName = newFarmName.trim(); 
    }
    
    if (Object.keys(userUpdateData).length > 1 || updatesToFirebaseUser.displayName) { 
        batch.update(userDocRef, userUpdateData);
    }
    
    if (!batch.empty) { 
        await batch.commit();
    }
    await refreshUserData(); 
  }, [user, refreshUserData]);

  const changeUserPassword = useCallback(async (currentPassword: string, newPassword: string): Promise<void> => {
    const currentFbUser = auth.currentUser;
    if (!currentFbUser || !currentFbUser.email) {
      throw new Error("User not authenticated or email not available.");
    }
    const credential = EmailAuthProvider.credential(currentFbUser.email, currentPassword);
    await reauthenticateWithCredential(currentFbUser, credential);
    await firebaseUpdatePassword(currentFbUser, newPassword);
  }, []);
  
  const inviteStaffMemberByEmail = useCallback(async (emailToInvite: string): Promise<{success: boolean; message: string}> => {
    if (!user || !user.isFarmOwner || !user.farmId) {
      return { success: false, message: "Only authenticated farm owners can invite staff." };
    }
    const result = await makeApiRequest('/api/farm/invite-staff', { invitedEmail: emailToInvite, inviterFarmId: user.farmId, inviterName: user.name });
    if (result.success) {
      // No immediate user data refresh needed here, owner's profile page will re-fetch pending invites
    }
    return result;
  }, [user, makeApiRequest]);
  
  const removeStaffMember = useCallback(async (staffUidToRemove: string): Promise<{success: boolean; message: string}> => {
    if (!user || !user.isFarmOwner || !user.farmId) {
      return { success: false, message: "Only authenticated farm owners can remove staff." };
    }
    if (user.uid === staffUidToRemove) {
         return { success: false, message: "Owner cannot remove themselves as staff via this method." };
    }
    const result = await makeApiRequest('/api/farm/remove-staff', { staffUidToRemove, ownerUid: user.uid, ownerFarmId: user.farmId });
    if (result.success) await refreshUserData(); // Refresh owner's data (staff list might change)
    return result;
  }, [user, makeApiRequest, refreshUserData]);

  const acceptInvitation = useCallback(async (invitationId: string): Promise<{success: boolean; message: string}> => {
    const result = await makeApiRequest('/api/farm/invitations/accept', { invitationId });
    if (result.success) await refreshUserData(); // Refresh to get new farmId, etc.
    return result;
  }, [makeApiRequest, refreshUserData]);

  const declineInvitation = useCallback(async (invitationId: string): Promise<{success: boolean; message: string}> => {
    return makeApiRequest('/api/farm/invitations/decline', { invitationId });
    // No refreshUserData needed as it doesn't change the current user's farm association
  }, [makeApiRequest]);

  const revokeInvitation = useCallback(async (invitationId: string): Promise<{success: boolean; message: string}> => {
    return makeApiRequest('/api/farm/invitations/revoke', { invitationId });
    // No refreshUserData needed as it doesn't change the current user's farm association
  }, [makeApiRequest]);

  const updateUserPlan = useCallback(async (planId: PlanId): Promise<{success: boolean; message: string; sessionId?: string; error?: string}> => {
    if (!user) {
      return { success: false, message: "User not authenticated." };
    }
    if (planId === 'free') { 
      if (user.selectedPlanId !== 'free') {
        // Directly call cancelSubscription logic if downgrading to free
        return cancelSubscription();
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
  }, [user, makeApiRequest]); // Removed cancelSubscription from here as it's now a direct call

  const cancelSubscription = useCallback(async (): Promise<{success: boolean; message: string}> => {
    if (!user || !firebaseUser) { // Check firebaseUser as well for operations requiring it
        return { success: false, message: "User not authenticated." };
    }
    if (!user.stripeSubscriptionId && user.selectedPlanId === 'free') {
         return { success: true, message: "You are already on the Free plan." };
    }
     if (!user.stripeSubscriptionId && user.selectedPlanId !== 'free') {
        // This case means they are on a paid plan in our DB but Stripe ID is missing.
        // Default them to free.
        const userDocRef = doc(db, "users", user.uid);
        try {
            await updateDoc(userDocRef, {
                selectedPlanId: 'free' as PlanId,
                subscriptionStatus: 'active' as SubscriptionStatus, // Or 'cancelled' if it was a true cancel
                stripeSubscriptionId: null,
                stripeCustomerId: user.stripeCustomerId || null, // Keep customer ID if exists
                subscriptionCurrentPeriodEnd: null,
                updatedAt: serverTimestamp(),
            });
            await refreshUserData();
            toast({ title: "Subscription Corrected", description: "Your plan has been set to Free as no active Stripe subscription was found." });
            return { success: true, message: "Subscription status corrected to Free plan." };
        } catch (dbError) {
            console.error("Error updating user doc to free plan:", dbError);
            toast({ title: "Error", description: "Could not update your plan to Free in our records.", variant: "destructive"});
            return {success: false, message: "Could not update plan to Free in database."};
        }
    }
    try {
      const response = await makeApiRequest('/api/billing/cancel-subscription', {});
      if(response.success) {
        toast({ title: "Subscription Cancellation Requested", description: response.message });
        // Webhook will handle actual data update, but refresh to reflect 'cancelled' state sooner if API implies it.
        await refreshUserData();
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
  }, [user, firebaseUser, makeApiRequest, toast, refreshUserData]);

  const updateUserSettings = useCallback(async (newSettings: Partial<UserSettings>): Promise<{success: boolean; message: string}> => {
    if (!user || !firebaseUser) {
      return { success: false, message: "User not authenticated." };
    }
    try {
      const userDocRef = doc(db, "users", user.uid);
      const currentSettings = user.settings || {};
      const notificationPreferences = {
        ...(currentSettings.notificationPreferences || {}),
        ...(newSettings.notificationPreferences || {}),
      };
      const updatedSettings = {
        ...currentSettings,
        ...newSettings,
        notificationPreferences,
      };

      await updateDoc(userDocRef, {
        settings: updatedSettings,
        updatedAt: serverTimestamp(),
      });
      await refreshUserData(); 
      return { success: true, message: "Settings updated successfully." };
    } catch (error) {
      console.error("Error updating user settings:", error);
      const message = error instanceof Error ? error.message : "Could not update settings.";
      return { success: false, message };
    }
  }, [user, firebaseUser, refreshUserData]);

  const logoutUser = useCallback(async () => {
    try {
        await firebaseSignOut(auth);
    } catch (error) {
        console.error("Error signing out: ", error);
    } finally {
        setUser(null);
        setFirebaseUser(null);
        const publicPaths = ['/login', '/register', '/', '/accept-invitation', '/pricing'];
        const isPublicPath = publicPaths.some(p => pathname.startsWith(p));
        if (!isPublicPath) {
           router.push('/login');
        }
    }
  }, [router, pathname]); // Added pathname

  const contextValue = React.useMemo(() => ({
    user, 
    firebaseUser, 
    isAuthenticated: !!user && !!firebaseUser, 
    isLoading, 
    loginUser, 
    registerUser, 
    logoutUser, 
    updateUserProfile, 
    changeUserPassword,
    makeApiRequest,
    inviteStaffMemberByEmail, 
    removeStaffMember,
    acceptInvitation,
    declineInvitation,
    revokeInvitation,
    refreshUserData,
    updateUserPlan,
    cancelSubscription,
    updateUserSettings,
  }), [
    user, firebaseUser, isLoading,
    loginUser, registerUser, logoutUser, updateUserProfile, changeUserPassword,
    makeApiRequest,
    inviteStaffMemberByEmail, removeStaffMember, acceptInvitation, declineInvitation, revokeInvitation,
    refreshUserData, updateUserPlan, cancelSubscription, updateUserSettings
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

    
