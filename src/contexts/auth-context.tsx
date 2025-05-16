
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
  settings?: UserSettings; // Combined settings object
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
  updateUserSettings: (newSettings: Partial<UserSettings>) => Promise<{success: boolean; message: string}>;
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
          console.warn(`Farm document ${currentFarmId} not found for user ${fbUser.uid}. Resetting to personal farm.`);
          currentFarmId = fbUser.uid; 
          currentFarmName = appUserDataFromDb.name ? `${appUserDataFromDb.name}'s Personal Farm (Auto-created)` : `${fbUser.displayName || "User"}'s Personal Farm (Auto-created)`;
          currentIsFarmOwner = true;
          currentStaffMembers = [];
          
          const batch = writeBatch(db);
          batch.update(userDocRef, { farmId: currentFarmId, farmName: currentFarmName, isFarmOwner: true });
          const personalFarmRef = doc(db, "farms", currentFarmId);
          const personalFarmSnap = await getDoc(personalFarmRef); // Check if personal farm exists
          if (!personalFarmSnap.exists()) {
              batch.set(personalFarmRef, {
                  farmId: currentFarmId,
                  farmName: currentFarmName,
                  ownerId: fbUser.uid,
                  staffMembers: [],
                  createdAt: serverTimestamp(),
              });
          }
          await batch.commit().catch(e => console.error("Error committing fallback farm creation:", e));
        }
      } else { 
         currentFarmId = fbUser.uid;
         currentFarmName = appUserDataFromDb.name ? `${appUserDataFromDb.name}'s Personal Farm` : `${fbUser.displayName || "User"}'s Personal Farm`;
         currentIsFarmOwner = true;
         currentStaffMembers = [];
         // Ensure user doc and farm doc are consistent
         const batch = writeBatch(db);
         batch.update(userDocRef, { farmId: currentFarmId, farmName: currentFarmName, isFarmOwner: true });
         const personalFarmRef = doc(db, "farms", currentFarmId);
         const personalFarmSnap = await getDoc(personalFarmRef);
         if (!personalFarmSnap.exists()) {
            batch.set(personalFarmRef, {
                farmId: currentFarmId,
                farmName: currentFarmName,
                ownerId: fbUser.uid,
                staffMembers: [],
                createdAt: serverTimestamp(),
            });
         }
         await batch.commit().catch(e => console.error("Error committing personal farm creation on null farmId:", e));
      }
      
      const defaultNotificationPreferences: NotificationPreferences = {
        taskRemindersEmail: false, weatherAlertsEmail: false, aiSuggestionsInApp: false, staffActivityEmail: false
      };
      const defaultSettings: UserSettings = {
        notificationPreferences: appUserDataFromDb.settings?.notificationPreferences || defaultNotificationPreferences,
        preferredAreaUnit: appUserDataFromDb.settings?.preferredAreaUnit || "acres",
        preferredWeightUnit: appUserDataFromDb.settings?.preferredWeightUnit || "kg",
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
        console.warn(`Firestore document for user ${fbUser.uid} not found.`);
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
        setFirebaseUser(currentFbUser); 
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
        // setFirebaseUser(fbUserInstance); // Moved setting firebaseUser into refreshUserData
        await refreshUserData();
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
    await refreshUserData();
  }, [refreshUserData]);

  const registerUser = useCallback(async (name: string, farmNameFromInput: string, email: string, password: string): Promise<void> => {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const fbUser = userCredential.user;
    await firebaseUpdateProfile(fbUser, { displayName: name });

    const batch = writeBatch(db);
    const userDocRef = doc(db, "users", fbUser.uid);
    const newFarmId = doc(collection(db, "farms")).id; 
    const actualFarmName = farmNameFromInput.trim() || `${name}'s Personal Farm`;
    
    const defaultNotificationPreferences: NotificationPreferences = {
        taskRemindersEmail: false, weatherAlertsEmail: false, aiSuggestionsInApp: false, staffActivityEmail: false
    };
    const defaultSettings : UserSettings = {
      notificationPreferences: defaultNotificationPreferences,
      preferredAreaUnit: "acres",
      preferredWeightUnit: "kg",
    };

    const userDataForFirestore: Omit<User, 'staffMembers'> & {createdAt: FieldValue} = { 
      uid: fbUser.uid,
      email: fbUser.email,
      name: name,
      farmId: newFarmId,
      farmName: actualFarmName, 
      isFarmOwner: true,
      selectedPlanId: "free",
      subscriptionStatus: "active",
      settings: defaultSettings, // Add default settings
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
    
    await refreshUserData(); 
    router.push("/dashboard");
  }, [refreshUserData, toast, router]);
  
  const updateUserProfile = useCallback(async (nameUpdate: string, newFarmName: string): Promise<void> => {
    const currentFbUser = auth.currentUser;
    if (!currentFbUser || !user) throw new Error("User not authenticated.");
    
    const updatesToFirebaseUser: { displayName?: string } = {};
    if (nameUpdate !== user.name && nameUpdate) { 
      updatesToFirebaseUser.displayName = nameUpdate;
    }
    if (Object.keys(updatesToFirebaseUser).length > 0) {
        await firebaseUpdateProfile(currentFbUser, updatesToFirebaseUser);
    }
    
    const batch = writeBatch(db);
    const userDocRef = doc(db, "users", currentFbUser.uid);
    const userUpdateData: Record<string, any> = { updatedAt: serverTimestamp() };

    if (nameUpdate !== user.name && nameUpdate) userUpdateData.name = nameUpdate;

    if (user.isFarmOwner && user.farmId && newFarmName && newFarmName !== user.farmName) { 
      const farmDocRef = doc(db, "farms", user.farmId);
      batch.update(farmDocRef, { farmName: newFarmName, updatedAt: serverTimestamp() });
      userUpdateData.farmName = newFarmName; 
    }
    
    if (Object.keys(userUpdateData).length > 1) { 
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
    const result = await makeApiRequest('/api/farm/invite-staff', { invitedEmail: emailToInvite });
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
    if (result.success) await refreshUserData();
    return result;
  }, [user, makeApiRequest, refreshUserData]);

  const acceptInvitation = useCallback(async (invitationId: string): Promise<{success: boolean; message: string}> => {
    const result = await makeApiRequest('/api/farm/invitations/accept', { invitationId });
    if (result.success) await refreshUserData();
    return result;
  }, [makeApiRequest, refreshUserData]);

  const declineInvitation = useCallback(async (invitationId: string): Promise<{success: boolean; message: string}> => {
    return makeApiRequest('/api/farm/invitations/decline', { invitationId });
  }, [makeApiRequest]);

  const revokeInvitation = useCallback(async (invitationId: string): Promise<{success: boolean; message: string}> => {
    return makeApiRequest('/api/farm/invitations/revoke', { invitationId });
  }, [makeApiRequest]);

  const cancelSubscription = useCallback(async (): Promise<{success: boolean; message: string}> => {
    if (!user || !firebaseUser) {
        return { success: false, message: "User not authenticated." };
    }
    if (!user.stripeSubscriptionId && user.selectedPlanId === 'free') {
         return { success: true, message: "You are already on the Free plan." };
    }
     if (!user.stripeSubscriptionId && user.selectedPlanId !== 'free') {
        const userDocRef = doc(db, "users", user.uid);
        try {
            await updateDoc(userDocRef, {
                selectedPlanId: 'free' as PlanId,
                subscriptionStatus: 'active' as SubscriptionStatus,
                stripeSubscriptionId: null,
                subscriptionCurrentPeriodEnd: null,
                updatedAt: serverTimestamp(),
            });
            await refreshUserData();
            toast({ title: "Subscription Downgraded", description: "You have been moved to the Free plan." });
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

  const updateUserPlan = useCallback(async (planId: PlanId): Promise<{success: boolean; message: string; sessionId?: string; error?: string}> => {
    if (!user) {
      return { success: false, message: "User not authenticated." };
    }
    if (planId === 'free') { 
      if (user.selectedPlanId !== 'free') {
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
  }, [user, makeApiRequest, cancelSubscription]);

  const updateUserSettings = useCallback(async (newSettings: Partial<UserSettings>): Promise<{success: boolean; message: string}> => {
    if (!user || !firebaseUser) {
      return { success: false, message: "User not authenticated." };
    }
    try {
      const userDocRef = doc(db, "users", user.uid);
      // Merge new settings with existing settings to preserve other preferences
      const updatedSettings = {
        ...user.settings, // Spread existing settings
        ...newSettings, // Override with new settings
        notificationPreferences: { // Deep merge notification preferences
            ...(user.settings?.notificationPreferences || {}),
            ...(newSettings.notificationPreferences || {}),
        }
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
  }, [router, pathname]);

  const isAuthenticated = !!user && !!firebaseUser;

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
    refreshUserData,
    updateUserPlan,
    updateUserSettings, // Added
    cancelSubscription,
  }), [
    user, firebaseUser, isAuthenticated, isLoading,
    loginUser, registerUser, logoutUser, updateUserProfile, changeUserPassword,
    inviteStaffMemberByEmail, removeStaffMember, acceptInvitation, declineInvitation, revokeInvitation,
    refreshUserData, updateUserPlan, updateUserSettings, cancelSubscription // Added updateUserSettings
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

    