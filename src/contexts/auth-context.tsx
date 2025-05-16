
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
export type StaffRole = 'admin' | 'editor' | 'viewer';
export type UserRole = PlanId | StaffRole | null;


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
  theme?: ThemePreference;
}

export interface StaffMemberInFarmDoc {
  uid: string;
  role: StaffRole;
}
export interface StaffMemberWithDetails {
  uid: string;
  name: string | null;
  email: string | null;
  role: StaffRole;
}

export interface User {
  uid: string;
  email: string | null;
  name: string | null;
  farmId?: string | null;
  farmName?: string | null;
  farmLatitude?: number | null;
  farmLongitude?: number | null;
  isFarmOwner?: boolean;
  staff?: StaffMemberWithDetails[];
  roleOnCurrentFarm?: UserRole;
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
  registerUser: (name: string, farmNameFromInput: string, email: string, password: string) => Promise<string | void>;
  logoutUser: () => Promise<void>;
  updateUserProfile: (nameUpdate: string, newFarmName: string, farmLatInput?: number | null, farmLngInput?: number | null) => Promise<void>;
  changeUserPassword: (currentPassword: string, newPassword: string) => Promise<void>;
  makeApiRequest: (endpoint: string, body: any, method?: 'POST' | 'GET' | 'PUT' | 'DELETE') => Promise<any>;
  inviteStaffMemberByEmail: (emailToInvite: string, role: StaffRole) => Promise<{success: boolean; message: string}>;
  removeStaffMember: (staffUidToRemove: string) => Promise<{success: boolean; message: string}>;
  acceptInvitation: (invitationId: string) => Promise<{success: boolean; message: string}>;
  declineInvitation: (invitationId: string) => Promise<{success: boolean; message: string}>;
  revokeInvitation: (invitationId: string) => Promise<{success: boolean; message: string}>;
  updateStaffRole: (staffUid: string, newRole: StaffRole) => Promise<{success: boolean; message: string}>;
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

  const makeApiRequest = useCallback(async (endpoint: string, body: any, method: 'POST' | 'GET' | 'PUT' | 'DELETE' = 'POST') => {
    const currentFbUser = auth.currentUser;
    if (!currentFbUser) throw new Error("User not authenticated for API request.");
    const idToken = await currentFbUser.getIdToken(true);
    const response = await fetch(endpoint, {
        method: method,
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
        body: method !== 'GET' ? JSON.stringify(body) : undefined,
    });
    const responseData = await response.json();
    if (!response.ok) {
      throw new Error(responseData.message || "API request failed with status: " + response.status);
    }
    return responseData;
  }, []);

  const fetchAppUserDataFromDb = useCallback(async (fbUser: FirebaseUser): Promise<User | null> => {
    const userDocRef = doc(db, "users", fbUser.uid);
    const userDocSnap = await getDoc(userDocRef);

    if (userDocSnap.exists()) {
      const appUserDataFromDb = userDocSnap.data() as Partial<User>;
      let currentFarmName = appUserDataFromDb.farmName || null;
      let currentIsFarmOwner = appUserDataFromDb.isFarmOwner || false;
      let currentFarmId = appUserDataFromDb.farmId || null;
      let userRoleOnFarm: UserRole = null;
      let staffDetailsForOwner: StaffMemberWithDetails[] = [];
      let currentFarmLatitude: number | null = null;
      let currentFarmLongitude: number | null = null;


      if (currentFarmId) {
        try {
            const farmDocRef = doc(db, "farms", currentFarmId);
            const farmDocSnap = await getDoc(farmDocRef);
            if (farmDocSnap.exists()) {
              const farmData = farmDocSnap.data();
              currentFarmName = farmData?.farmName || currentFarmName;
              currentFarmLatitude = typeof farmData?.latitude === 'number' ? farmData.latitude : null;
              currentFarmLongitude = typeof farmData?.longitude === 'number' ? farmData.longitude : null;

              if (farmData?.ownerId === fbUser.uid) {
                currentIsFarmOwner = true;
                userRoleOnFarm = appUserDataFromDb.selectedPlanId || 'free';

                if (farmData?.staff && Array.isArray(farmData.staff)) {
                  const staffPromises = (farmData.staff as StaffMemberInFarmDoc[]).map(async (staffMember) => {
                    const staffUserDoc = await getDoc(doc(db, "users", staffMember.uid));
                    const staffUserData = staffUserDoc.exists() ? staffUserDoc.data() : null;
                    return {
                      uid: staffMember.uid,
                      name: staffUserData?.name || 'Unknown User',
                      email: staffUserData?.email || 'N/A',
                      role: staffMember.role
                    };
                  });
                  staffDetailsForOwner = await Promise.all(staffPromises);
                }
              } else {
                currentIsFarmOwner = false;
                const farmStaffArray = (farmData?.staff || []) as StaffMemberInFarmDoc[];
                const staffEntry = farmStaffArray.find(s => s.uid === fbUser.uid);
                userRoleOnFarm = staffEntry ? staffEntry.role : null;
              }
            } else {
              currentFarmId = null; currentFarmName = null; currentIsFarmOwner = false; userRoleOnFarm = null;
            }
        } catch (farmError) {
            console.error(`Error fetching farm ${currentFarmId} for user ${fbUser.uid}:`, farmError);
            currentFarmId = null; currentFarmName = null; currentIsFarmOwner = false; userRoleOnFarm = null;
        }
      } else {
         currentIsFarmOwner = !!appUserDataFromDb.isFarmOwner;
         userRoleOnFarm = currentIsFarmOwner ? (appUserDataFromDb.selectedPlanId || 'free') : null;
      }
      
      const defaultNotificationPreferences: NotificationPreferences = {
        taskRemindersEmail: false, weatherAlertsEmail: false, aiSuggestionsInApp: false, staffActivityEmail: false
      };
      const defaultSettings: UserSettings = {
        notificationPreferences: { ...defaultNotificationPreferences, ...(appUserDataFromDb.settings?.notificationPreferences || {}) },
        preferredAreaUnit: appUserDataFromDb.settings?.preferredAreaUnit || "acres",
        preferredWeightUnit: appUserDataFromDb.settings?.preferredWeightUnit || "kg",
        theme: appUserDataFromDb.settings?.theme || "system",
      };

      const fetchedUser: User = {
        uid: fbUser.uid,
        email: fbUser.email,
        name: appUserDataFromDb.name || fbUser.displayName,
        farmId: currentFarmId,
        farmName: currentFarmName,
        farmLatitude: currentFarmLatitude,
        farmLongitude: currentFarmLongitude,
        isFarmOwner: currentIsFarmOwner,
        staff: currentIsFarmOwner ? staffDetailsForOwner : [],
        roleOnCurrentFarm: userRoleOnFarm,
        selectedPlanId: appUserDataFromDb.selectedPlanId || "free",
        subscriptionStatus: appUserDataFromDb.subscriptionStatus || (appUserDataFromDb.selectedPlanId === "free" ? "active" : "incomplete"),
        stripeCustomerId: appUserDataFromDb.stripeCustomerId || null,
        stripeSubscriptionId: appUserDataFromDb.stripeSubscriptionId || null,
        subscriptionCurrentPeriodEnd: appUserDataFromDb.subscriptionCurrentPeriodEnd || null,
        settings: defaultSettings,
      };
      return fetchedUser;
    } else {
        return null;
    }
  }, [toast]);

  const refreshUserData = useCallback(async () => {
    const currentFbUser = auth.currentUser;
    if (currentFbUser) {
      try {
        const appUserData = await fetchAppUserDataFromDb(currentFbUser);
        setUser(appUserData);
      } catch (error) {
        console.error("Error refreshing user data:", error);
        setUser(null);
        toast({ title: "Error", description: "Could not refresh user data. Please try logging in again.", variant: "destructive" });
      }
    } else {
      setUser(null);
    }
  }, [fetchAppUserDataFromDb, toast]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUserInstance) => {
      setIsLoading(true);
      setFirebaseUser(fbUserInstance);
      if (fbUserInstance) {
        await refreshUserData();
      } else {
        setUser(null);
      }
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, [refreshUserData]);

  const loginUser = useCallback(async (email: string, password: string): Promise<void> => {
    await signInWithEmailAndPassword(auth, email, password);
    // onAuthStateChanged will trigger refreshUserData
  }, []);

  const registerUser = useCallback(async (name: string, farmNameFromInput: string, email: string, password: string): Promise<string | void> => {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const fbUser = userCredential.user;
    await firebaseUpdateProfile(fbUser, { displayName: name });

    const batch = writeBatch(db);
    const userDocRef = doc(db, "users", fbUser.uid);
    const newFarmDocRef = doc(collection(db, "farms"));
    const actualFarmName = farmNameFromInput.trim() || `${name}'s Farm`;
    const initialPlanId: PlanId = 'free';
    const defaultSettings : UserSettings = {
      notificationPreferences: { taskRemindersEmail: false, weatherAlertsEmail: false, aiSuggestionsInApp: false, staffActivityEmail: false },
      preferredAreaUnit: "acres", preferredWeightUnit: "kg", theme: "system",
    };

    batch.set(userDocRef, {
      uid: fbUser.uid, email: fbUser.email?.toLowerCase(), name: name,
      farmId: newFarmDocRef.id,
      farmName: actualFarmName,
      isFarmOwner: true,
      roleOnCurrentFarm: initialPlanId,
      selectedPlanId: initialPlanId,
      subscriptionStatus: "active" as SubscriptionStatus,
      settings: defaultSettings,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    batch.set(newFarmDocRef, {
      farmId: newFarmDocRef.id,
      farmName: actualFarmName,
      ownerId: fbUser.uid,
      staff: [],
      latitude: null,
      longitude: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

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
          return `/accept-invitation?token=${invitationToken}`;
        }
      }
    } catch (error) {
        console.error("Error checking for pending invitations after registration:", error);
    }
    await refreshUserData();
  }, [toast, refreshUserData]);

  const logoutUser = useCallback(async () => {
    try { await firebaseSignOut(auth); } catch (error) { console.error("Error signing out: ", error); }
    finally {
        setUser(null); setFirebaseUser(null);
        const publicPaths = ['/login', '/register', '/', '/accept-invitation', '/pricing', '/settings'];
        const isPublic = publicPaths.some(p => pathname.startsWith(p));
        if (!isPublic) router.push('/login'); else router.push('/');
    }
  }, [pathname, router]);

  const updateUserProfile = useCallback(async (nameUpdate: string, newFarmName: string, farmLatInput?: number | null, farmLngInput?: number | null): Promise<void> => {
    const currentFbUser = auth.currentUser;
    const currentAppContextUser = user;
    if (!currentFbUser || !currentAppContextUser) throw new Error("User not authenticated.");

    const updates: Promise<any>[] = [];
    if (nameUpdate.trim() !== "" && nameUpdate.trim() !== (currentAppContextUser.name || "")) {
      updates.push(firebaseUpdateProfile(currentFbUser, { displayName: nameUpdate.trim() }));
    }

    const batch = writeBatch(db);
    const userDocRef = doc(db, "users", currentFbUser.uid);
    const userUpdateData: { name?: string; farmName?: string; updatedAt: FieldValue } = { updatedAt: serverTimestamp() };
    if (nameUpdate.trim() !== "" && nameUpdate.trim() !== (currentAppContextUser.name || "")) userUpdateData.name = nameUpdate.trim();

    if (currentAppContextUser.isFarmOwner && currentAppContextUser.farmId) {
      const farmDocRef = doc(db, "farms", currentAppContextUser.farmId);
      const farmUpdates: {updatedAt: FieldValue, farmName?: string, latitude?: number | null, longitude?: number | null} = { updatedAt: serverTimestamp() };

      if (newFarmName.trim() !== "" && newFarmName.trim() !== (currentAppContextUser.farmName || "")) {
        farmUpdates.farmName = newFarmName.trim();
        userUpdateData.farmName = newFarmName.trim();
      }
      
      farmUpdates.latitude = farmLatInput === undefined ? currentAppContextUser.farmLatitude : (farmLatInput === null ? null : Number(farmLatInput));
      farmUpdates.longitude = farmLngInput === undefined ? currentAppContextUser.farmLongitude : (farmLngInput === null ? null : Number(farmLngInput));
      
      batch.update(farmDocRef, farmUpdates);
    }

    const hasUserUpdates = (userUpdateData.name && userUpdateData.name !== (currentAppContextUser.name || "")) ||
                           (userUpdateData.farmName && userUpdateData.farmName !== (currentAppContextUser.farmName || ""));

    if (hasUserUpdates) {
        batch.update(userDocRef, userUpdateData);
    }

    if (updates.length > 0 || batch. γεtOperations().length > 0) {
        await Promise.all(updates);
        if (batch. γεtOperations().length > 0) await batch.commit();
        await refreshUserData();
    }
  }, [user, refreshUserData]);

  const changeUserPassword = useCallback(async (currentPassword: string, newPassword: string): Promise<void> => {
    const currentFbUser = auth.currentUser;
    if (!currentFbUser || !currentFbUser.email) throw new Error("User not authenticated or email not available.");
    const credential = EmailAuthProvider.credential(currentFbUser.email, currentPassword);
    await reauthenticateWithCredential(currentFbUser, credential);
    await firebaseUpdatePassword(currentFbUser, newPassword);
  }, []);

  const inviteStaffMemberByEmail = useCallback(async (emailToInvite: string, role: StaffRole): Promise<{success: boolean; message: string}> => {
    try {
      const result = await makeApiRequest('/api/farm/invite-staff', { invitedEmail: emailToInvite, role });
      // No direct refreshUserData here, Profile page handles re-fetching pending invites
      return result;
    }
    catch(error: any) { return { success: false, message: error.message || "Failed to log invitation request."}; }
  }, [makeApiRequest]);

  const removeStaffMember = useCallback(async (staffUidToRemove: string): Promise<{success: boolean; message: string}> => {
    try {
        const result = await makeApiRequest('/api/farm/remove-staff', { staffUidToRemove });
        if (result.success) await refreshUserData(); // Refresh as farm and user docs change
        return result;
    } catch (error: any) { return { success: false, message: error.message || "Failed to remove staff member."}; }
  }, [makeApiRequest, refreshUserData]);

  const acceptInvitation = useCallback(async (invitationId: string): Promise<{success: boolean; message: string}> => {
    try {
        const result = await makeApiRequest('/api/farm/invitations/accept', { invitationId });
        if (result.success) await refreshUserData();
        return result;
    } catch (error: any) { return { success: false, message: error.message || "Failed to accept invitation."}; }
  }, [makeApiRequest, refreshUserData]);

  const declineInvitation = useCallback(async (invitationId: string): Promise<{success: boolean; message: string}> => {
    try {
      const result = await makeApiRequest('/api/farm/invitations/decline', { invitationId });
      // No full refreshUserData needed, Profile page can re-fetch its own list of invites
      return result;
    }
    catch(error: any) { return { success: false, message: error.message || "Failed to decline invitation."}; }
  }, [makeApiRequest]);

  const revokeInvitation = useCallback(async (invitationId: string): Promise<{success: boolean; message: string}> => {
    try {
      const result = await makeApiRequest('/api/farm/invitations/revoke', { invitationId });
      // No full refreshUserData needed, Profile page can re-fetch its own list of invites
      return result;
    }
    catch(error: any) { return { success: false, message: error.message || "Failed to revoke invitation."}; }
  }, [makeApiRequest]);

  const updateStaffRole = useCallback(async (staffUid: string, newRole: StaffRole): Promise<{success: boolean; message: string}> => {
    try {
      const result = await makeApiRequest('/api/farm/update-staff-role', { staffUidToUpdate: staffUid, newRole });
      if (result.success) await refreshUserData(); // Refresh to get updated staff list and potentially target user's role
      return result;
    } catch (error: any) {
      return { success: false, message: error.message || "Failed to update staff role."};
    }
  }, [makeApiRequest, refreshUserData]);

  const cancelSubscription = useCallback(async (): Promise<{success: boolean; message: string}> => {
    const currentContextUser = user; // Capture user from the outer scope
    const currentFbUser = firebaseUser; // Capture firebaseUser from outer scope

    if (!currentContextUser || !currentFbUser) {
      toast({ title: "Error", description: "User not authenticated.", variant: "destructive" });
      return { success: false, message: "User not authenticated." };
    }
    if (!currentContextUser.stripeSubscriptionId && currentContextUser.selectedPlanId === 'free') {
      toast({ title: "Info", description: "You are already on the Free plan." });
      return { success: true, message: "You are already on the Free plan." };
    }
    try {
      const response = await makeApiRequest('/api/billing/cancel-subscription', {});
      if(response.success) {
        toast({ title: "Subscription Cancellation Requested", description: response.message });
        await refreshUserData();
      }
      else { toast({ title: "Cancellation Failed", description: response.message, variant: "destructive" }); }
      return response;
    } catch (error) {
        const message = error instanceof Error ? error.message : "Could not initiate cancellation.";
        toast({ title: "Error", description: message, variant: "destructive"});
        return { success: false, message };
    }
  }, [user, firebaseUser, makeApiRequest, toast, refreshUserData]);

  const updateUserPlan = useCallback(async (planId: PlanId): Promise<{success: boolean; message: string; sessionId?: string; error?: string}> => {
    const currentContextUser = user; // Capture user from outer scope
    if (!currentContextUser) return { success: false, message: "User not authenticated." };

    if (planId === 'free') {
      if (currentContextUser.selectedPlanId !== 'free') {
        return cancelSubscription(); // cancelSubscription will call refreshUserData
      } else {
        return { success: true, message: "You are already on the Free plan." };
      }
    }
    try {
      const response = await makeApiRequest('/api/billing/create-checkout-session', { planId });
      if (response.success && response.sessionId) {
        // Don't call refreshUserData here; Stripe webhook will handle it after successful payment
        return { success: true, message: 'Checkout session created.', sessionId: response.sessionId };
      } else {
        return { success: false, message: response.message || 'Failed to create session.', error: response.message };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not initiate plan change.";
      return { success: false, message, error: message };
    }
  }, [user, makeApiRequest, cancelSubscription]); // Added cancelSubscription

  const updateUserSettings = useCallback(async (newSettings: Partial<UserSettings>): Promise<{success: boolean; message: string}> => {
    const currentContextUser = user; // Capture user from outer scope
    if (!currentContextUser || !auth.currentUser) return { success: false, message: "User not authenticated." };
    try {
      const userDocRef = doc(db, "users", currentContextUser.uid);
      const currentDbSettings = currentContextUser.settings || {};
      const mergedSettings: UserSettings = {
          ...currentDbSettings,
          ...newSettings,
          notificationPreferences: {
              ...(currentDbSettings.notificationPreferences || {}),
              ...(newSettings.notificationPreferences || {})
          }
      };
      await updateDoc(userDocRef, { settings: mergedSettings, updatedAt: serverTimestamp() });
      await refreshUserData();
      return { success: true, message: "Settings updated." };
    } catch (error: any) {
      const message = error.message || "Could not update settings.";
      toast({ title: "Error Updating Settings", description: message, variant: "destructive" });
      return { success: false, message };
    }
  }, [user, refreshUserData, toast]);

  useEffect(() => {
    const currentTheme = user?.settings?.theme;
    if (typeof window !== "undefined") {
      const root = window.document.documentElement;
      root.classList.remove("light", "dark");
      if (currentTheme === "system" || !currentTheme) {
        const systemTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
        root.classList.add(systemTheme);
      } else {
        root.classList.add(currentTheme);
      }
    }
  }, [user?.settings?.theme]);

  const contextValue = React.useMemo(() => ({
    user, firebaseUser, isAuthenticated: !!user && !!firebaseUser, isLoading,
    loginUser, registerUser, logoutUser, updateUserProfile, changeUserPassword,
    makeApiRequest, inviteStaffMemberByEmail, removeStaffMember, acceptInvitation,
    declineInvitation, revokeInvitation, updateStaffRole, refreshUserData, updateUserPlan,
    cancelSubscription, updateUserSettings,
  }), [
    user, firebaseUser, isLoading, loginUser, registerUser, logoutUser, updateUserProfile,
    changeUserPassword, makeApiRequest, inviteStaffMemberByEmail, removeStaffMember,
    acceptInvitation, declineInvitation, revokeInvitation, updateStaffRole, refreshUserData,
    updateUserPlan, cancelSubscription, updateUserSettings
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

    