
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
import { doc, setDoc, getDoc, updateDoc, collection, serverTimestamp, writeBatch, FieldValue, arrayUnion, arrayRemove, query, where, getDocs, Timestamp, limit, orderBy, deleteDoc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';

export type PlanId = "free" | "pro" | "agribusiness";
export type SubscriptionStatus = "active" | "trialing" | "cancelled" | "past_due" | "incomplete" | "pending_payment";
export type PreferredAreaUnit = "acres" | "hectares";
export type PreferredWeightUnit = "kg" | "lbs";
export type ThemePreference = "light" | "dark" | "system";
export type StaffRole = 'admin' | 'editor' | 'viewer';
export type UserRoleOnFarm = PlanId | StaffRole | null;


export interface NotificationPreferences {
  taskRemindersEmail?: boolean;
  weatherAlertsEmail?: boolean;
  aiInsightsEmail?: boolean;
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
  staffMembers?: StaffMemberWithDetails[];
  roleOnCurrentFarm?: UserRoleOnFarm; // This will store 'free'/'pro'/'agribusiness' for owners, or 'admin'/'editor'/'viewer' for staff
  selectedPlanId: PlanId;
  subscriptionStatus: SubscriptionStatus;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  subscriptionCurrentPeriodEnd?: Timestamp | null;
  settings?: UserSettings;
  onboardingCompleted?: boolean;
}

export interface AppNotification {
  id: string;
  userId: string;
  farmId?: string | null;
  type: string;
  title: string;
  message: string;
  link?: string;
  isRead: boolean;
  createdAt: Timestamp;
  readAt?: Timestamp | null;
}

interface AuthContextType {
  user: User | null;
  firebaseUser: FirebaseUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  notifications: AppNotification[];
  unreadNotificationCount: number;
  loginUser: (email: string, password: string) => Promise<void>;
  registerUser: (name: string, farmNameFromInput: string, email: string, password: string, selectedPlanId: PlanId) => Promise<void | string>;
  logoutUser: () => Promise<void>;
  updateUserProfile: (nameUpdate: string, newFarmName?: string | null, farmLatInput?: number | null, farmLngInput?: number | null) => Promise<void>;
  changeUserPassword: (currentPassword: string, newPassword: string) => Promise<void>;
  makeApiRequest: (endpoint: string, body: any, method?: 'POST' | 'GET' | 'PUT' | 'DELETE') => Promise<any>;
  inviteStaffMemberByEmail: (emailToInvite: string, role: StaffRole) => Promise<{success: boolean; message: string}>;
  removeStaffMember: (staffUidToRemove: string) => Promise<{success: boolean; message: string}>;
  updateStaffRole: (staffUid: string, newRole: StaffRole) => Promise<{success: boolean; message: string}>;
  acceptInvitation: (invitationToken: string) => Promise<{success: boolean; message: string}>;
  declineInvitation: (invitationId: string) => Promise<{success: boolean; message: string}>;
  revokeInvitation: (invitationId: string) => Promise<{success: boolean; message: string}>;
  refreshUserData: () => Promise<void>;
  updateUserPlan: (planId: PlanId) => Promise<{success: boolean; message: string; sessionId?: string; error?: string}>;
  cancelSubscription: () => Promise<{success: boolean; message: string}>;
  updateUserSettings: (newSettings: Partial<UserSettings>) => Promise<{success: boolean; message: string}>;
  fetchNotifications: () => Promise<void>;
  markNotificationAsRead: (notificationId: string) => Promise<void>;
  markAllNotificationsAsRead: () => Promise<void>;
  markOnboardingComplete: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);

  const router = useRouter();
  const pathname = usePathname();
  const { toast } = useToast();

  const makeApiRequest = useCallback(async (endpoint: string, body: any, method: 'POST' | 'GET' | 'PUT' | 'DELETE' = 'POST') => {
    const currentFbUser = auth.currentUser;
    if (!currentFbUser) {
      toast({ title: "Authentication Error", description: "User not authenticated for API request.", variant: "destructive"});
      throw new Error("User not authenticated for API request.");
    }
    const idToken = await currentFbUser.getIdToken(true);
    const response = await fetch(endpoint, {
        method: method,
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
        body: method !== 'GET' ? JSON.stringify(body) : undefined,
    });
    const responseData = await response.json();
    if (!response.ok) {
      toast({ title: "API Error", description: responseData.message || `Request failed: ${response.status}`, variant: "destructive"});
      throw new Error(responseData.message || "API request failed with status: " + response.status);
    }
    return responseData;
  }, [toast]);

  const fetchAppUserDataFromDb = useCallback(async (fbUser: FirebaseUser): Promise<User | null> => {
    const userDocRef = doc(db, "users", fbUser.uid);
    const userDocSnap = await getDoc(userDocRef);

    if (userDocSnap.exists()) {
      const appUserDataFromDb = userDocSnap.data() as Partial<User>;
      let currentFarmName: string | null = appUserDataFromDb.farmName || null;
      let currentIsFarmOwner = appUserDataFromDb.isFarmOwner || false;
      let currentFarmId: string | null = appUserDataFromDb.farmId || null;
      let userRoleOnFarm: UserRoleOnFarm = null;
      let staffDetailsForOwnerOrAdmin: StaffMemberWithDetails[] = [];
      let currentFarmLatitude: number | null = appUserDataFromDb.farmLatitude ?? null; // Use ?? for direct properties on user doc
      let currentFarmLongitude: number | null = appUserDataFromDb.farmLongitude ?? null;

      if (currentFarmId) {
        try {
            const farmDocRef = doc(db, "farms", currentFarmId);
            const farmDocSnap = await getDoc(farmDocRef);
            if (farmDocSnap.exists()) {
              const farmData = farmDocSnap.data();
              currentFarmName = farmData?.farmName || currentFarmName || 'Unnamed Farm';
              currentFarmLatitude = typeof farmData?.latitude === 'number' ? farmData.latitude : currentFarmLatitude;
              currentFarmLongitude = typeof farmData?.longitude === 'number' ? farmData.longitude : currentFarmLongitude;

              if (farmData?.ownerId === fbUser.uid) {
                currentIsFarmOwner = true;
                userRoleOnFarm = appUserDataFromDb.selectedPlanId || 'free'; // Owner's role is their plan

                if (farmData?.staff && Array.isArray(farmData.staff)) {
                  const staffPromises = (farmData.staff as StaffMemberInFarmDoc[]).map(async (staffMember) => {
                    const staffUserDoc = await getDoc(doc(db, "users", staffMember.uid));
                    const staffUserData = staffUserDoc.exists() ? staffUserDoc.data() : null;
                    return {
                      uid: staffMember.uid,
                      name: staffUserData?.name || staffMember.uid,
                      email: staffUserData?.email || 'N/A',
                      role: staffMember.role
                    };
                  });
                  staffDetailsForOwnerOrAdmin = await Promise.all(staffPromises);
                }
              } else {
                currentIsFarmOwner = false;
                const farmStaffArray = (farmData?.staff || []) as StaffMemberInFarmDoc[];
                const staffEntry = farmStaffArray.find(s => s.uid === fbUser.uid);
                userRoleOnFarm = staffEntry ? staffEntry.role : null;
                // If admin, they might also need to see staff list (though typically owner manages)
                if (userRoleOnFarm === 'admin' && farmData?.staff && Array.isArray(farmData.staff)){
                    const staffPromises = (farmData.staff as StaffMemberInFarmDoc[]).filter(s => s.uid !== fbUser.uid) // Admins see other staff, not themselves
                    .map(async (staffMember) => {
                      const staffUserDoc = await getDoc(doc(db, "users", staffMember.uid));
                      const staffUserData = staffUserDoc.exists() ? staffUserDoc.data() : null;
                      return {
                        uid: staffMember.uid,
                        name: staffUserData?.name || staffMember.uid,
                        email: staffUserData?.email || 'N/A',
                        role: staffMember.role
                      };
                    });
                    staffDetailsForOwnerOrAdmin = await Promise.all(staffPromises);
                }
              }
            } else {
              console.warn(`Farm document ${appUserDataFromDb.farmId} not found for user ${fbUser.uid}.`);
              currentFarmId = null; currentFarmName = null; currentIsFarmOwner = false; userRoleOnFarm = null;
            }
        } catch (farmError) {
            console.error(`Error fetching farm ${appUserDataFromDb.farmId} for user ${fbUser.uid}:`, farmError);
            currentFarmId = null; currentFarmName = null; currentIsFarmOwner = false; userRoleOnFarm = null;
        }
      }

      const defaultNotificationPreferences: NotificationPreferences = {
        taskRemindersEmail: true, weatherAlertsEmail: false, aiInsightsEmail: true, staffActivityEmail: false,
      };
      const defaultSettings: UserSettings = {
        notificationPreferences: { ...defaultNotificationPreferences, ...(appUserDataFromDb.settings?.notificationPreferences || {}) },
        preferredAreaUnit: appUserDataFromDb.settings?.preferredAreaUnit || "acres",
        preferredWeightUnit: appUserDataFromDb.settings?.preferredWeightUnit || "kg",
        theme: appUserDataFromDb.settings?.theme || "system",
      };

      return {
        uid: fbUser.uid,
        email: fbUser.email,
        name: appUserDataFromDb.name || fbUser.displayName,
        farmId: currentFarmId,
        farmName: currentFarmName,
        farmLatitude: currentFarmLatitude,
        farmLongitude: currentFarmLongitude,
        isFarmOwner: currentIsFarmOwner,
        staffMembers: staffDetailsForOwnerOrAdmin,
        roleOnCurrentFarm: userRoleOnFarm,
        selectedPlanId: appUserDataFromDb.selectedPlanId || "free",
        subscriptionStatus: appUserDataFromDb.subscriptionStatus || (appUserDataFromDb.selectedPlanId === "free" ? "active" : "pending_payment"),
        stripeCustomerId: appUserDataFromDb.stripeCustomerId || null,
        stripeSubscriptionId: appUserDataFromDb.stripeSubscriptionId || null,
        subscriptionCurrentPeriodEnd: appUserDataFromDb.subscriptionCurrentPeriodEnd || null,
        settings: defaultSettings,
        onboardingCompleted: typeof appUserDataFromDb.onboardingCompleted === 'boolean' ? appUserDataFromDb.onboardingCompleted : false,
      };
    } else {
        // This case should only happen during the brief moment of registration before the user doc is created by an API route.
        // If it happens for an already "logged in" user, it indicates a data inconsistency.
        console.warn(`User document not found in Firestore for UID: ${fbUser.uid}. This is unexpected for an authenticated user post-registration.`);
        return null;
    }
  }, []);

  const refreshUserData = useCallback(async () => {
    const currentFbUser = auth.currentUser;
    if (currentFbUser) {
      setIsLoading(true);
      try {
        const appUserData = await fetchAppUserDataFromDb(currentFbUser);
        setUser(appUserData);
      } catch (error) {
        console.error("Error refreshing user data:", error);
        setUser(null);
        toast({ title: "Error", description: "Could not refresh user data.", variant: "destructive" });
      } finally {
        setIsLoading(false);
      }
    } else {
      setUser(null);
      setFirebaseUser(null);
      setIsLoading(false);
    }
  }, [fetchAppUserDataFromDb, toast]);

  const loginUser = useCallback(async (email: string, password: string): Promise<void> => {
    await signInWithEmailAndPassword(auth, email, password);
    // onAuthStateChanged will call refreshUserData
  }, []);

  const registerUser = useCallback(async (name: string, farmNameFromInput: string, email: string, password: string, selectedPlanId: PlanId): Promise<void | string> => {
    if (selectedPlanId === "free") {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const fbUser = userCredential.user;
      await firebaseUpdateProfile(fbUser, { displayName: name });

      const batch = writeBatch(db);
      const userDocRef = doc(db, "users", fbUser.uid);
      const newFarmDocRef = doc(db, "farms", fbUser.uid); // Owner's farmId is their UID for free plan simplicity
      const newFarmId = fbUser.uid;

      const actualFarmName = farmNameFromInput.trim() || `${name}'s Farm`;
      const defaultSettings : UserSettings = {
        notificationPreferences: { taskRemindersEmail: true, weatherAlertsEmail: false, aiInsightsEmail: true, staffActivityEmail: false },
        preferredAreaUnit: "acres", preferredWeightUnit: "kg", theme: "system",
      };

      batch.set(userDocRef, {
        uid: fbUser.uid, email: fbUser.email?.toLowerCase(), name: name,
        farmId: newFarmId,
        farmName: actualFarmName,
        isFarmOwner: true,
        roleOnCurrentFarm: selectedPlanId,
        selectedPlanId: selectedPlanId,
        subscriptionStatus: "active" as SubscriptionStatus,
        settings: defaultSettings,
        onboardingCompleted: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      batch.set(newFarmDocRef, {
        farmId: newFarmId,
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
            router.push(`/accept-invitation?token=${invitationToken}`); // router.push is fine here
            return; // Explicitly return to prevent dashboard redirect
          }
        }
      } catch (error) {
          console.error("Error checking for pending invitations after registration:", error);
      }
      await refreshUserData(); // Call after user and farm docs are created
      router.push("/dashboard"); // Default redirect if no invite found
    } else {
      // Paid plan registration is handled by RegisterForm calling API
      // This part of registerUser is mainly for free plan now.
      throw new Error("Paid plan registration should be initiated via API.");
    }
  }, [toast, router, refreshUserData]);

  const logoutUser = useCallback(async () => {
    try { await firebaseSignOut(auth); } catch (error) { console.error("Error signing out: ", error); }
    finally {
        setUser(null); setFirebaseUser(null); setNotifications([]); setUnreadNotificationCount(0);
        const publicPaths = ['/login', '/register', '/', '/accept-invitation', '/pricing', '/settings', '/about', '/contact', '/features', '/help'];
        const isPublicPath = publicPaths.some(p => pathname === p || pathname.startsWith(p + '/'));
        if (!isPublicPath && pathname !== "/login") {
          router.push('/login');
        }
    }
  }, [pathname, router]);

  const updateUserProfile = useCallback(async (nameUpdate: string, newFarmName?: string | null, farmLatInput?: number | null, farmLngInput?: number | null): Promise<void> => {
    const currentFbUser = auth.currentUser;
    const currentAppContextUser = user;
    if (!currentFbUser || !currentAppContextUser) throw new Error("User not authenticated.");

    const batch = writeBatch(db);
    const userDocRef = doc(db, "users", currentFbUser.uid);
    const userUpdateData: any = { updatedAt: serverTimestamp() };

    if (nameUpdate.trim() && nameUpdate.trim() !== (currentAppContextUser.name || "")) {
      userUpdateData.name = nameUpdate.trim();
      await firebaseUpdateProfile(currentFbUser, { displayName: nameUpdate.trim() });
    }

    if (currentAppContextUser.isFarmOwner && newFarmName !== undefined) {
        if (newFarmName.trim() && newFarmName.trim() !== (currentAppContextUser.farmName || "")) {
            userUpdateData.farmName = newFarmName.trim();
        }
    }
    if (Object.keys(userUpdateData).length > 1) { // If only updatedAt, no need to batch.update userDoc just yet
        batch.update(userDocRef, userUpdateData);
    }

    if (currentAppContextUser.isFarmOwner && currentAppContextUser.farmId) {
      const farmDocRef = doc(db, "farms", currentAppContextUser.farmId);
      const farmUpdates: any = { updatedAt: serverTimestamp() };
      let farmDocNeedsUpdate = false;

      if (newFarmName !== undefined && newFarmName.trim() && newFarmName.trim() !== (currentAppContextUser.farmName || "")) {
        farmUpdates.farmName = newFarmName.trim();
        farmDocNeedsUpdate = true;
      }
      const latToSave = farmLatInput === undefined || farmLatInput === null || isNaN(farmLatInput) ? null : farmLatInput;
      const lonToSave = farmLngInput === undefined || farmLngInput === null || isNaN(farmLngInput) ? null : farmLngInput;

      if (latToSave !== currentAppContextUser.farmLatitude || lonToSave !== currentAppContextUser.farmLongitude) {
        farmUpdates.latitude = latToSave;
        farmUpdates.longitude = lonToSave;
        farmDocNeedsUpdate = true;
      }

      if (farmDocNeedsUpdate) {
        batch.update(farmDocRef, farmUpdates);
      }
    }
    await batch.commit();
    await refreshUserData();
  }, [user, refreshUserData]);

  const changeUserPassword = useCallback(async (currentPassword: string, newPassword: string): Promise<void> => {
    const currentFbUser = auth.currentUser;
    if (!currentFbUser || !currentFbUser.email) throw new Error("User not authenticated or email not available.");
    const credential = EmailAuthProvider.credential(currentFbUser.email, currentPassword);
    await reauthenticateWithCredential(currentFbUser, credential);
    await firebaseUpdatePassword(currentFbUser, newPassword);
  }, []);

  const inviteStaffMemberByEmail = useCallback(async (emailToInvite: string, role: StaffRole): Promise<{success: boolean; message: string}> => {
    if (!user || !user.farmId || (!user.isFarmOwner && user.roleOnCurrentFarm !== 'admin')) {
      return { success: false, message: "Unauthorized to invite staff." };
    }
    try {
      const result = await makeApiRequest('/api/farm/invite-staff', { invitedEmail: emailToInvite, role: role });
      return result;
    } catch(error: any) { return { success: false, message: error.message || "Failed to log invitation request."}; }
  }, [user, makeApiRequest]);

  const removeStaffMember = useCallback(async (staffUidToRemove: string): Promise<{success: boolean; message: string}> => {
    if (!user || !user.farmId || (!user.isFarmOwner && user.roleOnCurrentFarm !== 'admin')) {
      return { success: false, message: "Unauthorized to remove staff." };
    }
    try {
        const result = await makeApiRequest('/api/farm/remove-staff', { staffUidToRemove });
        if (result.success) await refreshUserData();
        return result;
    } catch (error: any) { return { success: false, message: error.message || "Failed to remove staff member."}; }
  }, [user, makeApiRequest, refreshUserData]);

  const updateStaffRole = useCallback(async (staffUid: string, newRole: StaffRole): Promise<{success: boolean; message: string}> => {
    if (!user || !user.farmId || (!user.isFarmOwner && user.roleOnCurrentFarm !== 'admin')) {
      return { success: false, message: "Unauthorized to update staff roles." };
    }
    try {
      const result = await makeApiRequest('/api/farm/update-staff-role', { staffUidToUpdate: staffUid, newRole: newRole });
      if (result.success) await refreshUserData();
      return result;
    } catch (error: any) {
      return { success: false, message: error.message || "Failed to update staff role."};
    }
  }, [user, makeApiRequest, refreshUserData]);

  const acceptInvitation = useCallback(async (invitationToken: string): Promise<{success: boolean; message: string}> => {
    try {
        const result = await makeApiRequest('/api/farm/invitations/process-token', { invitationToken });
        if (result.success) {
          await refreshUserData();
        }
        return result;
    } catch (error: any) { return { success: false, message: error.message || "Failed to accept invitation."}; }
  }, [makeApiRequest, refreshUserData]);

  const declineInvitation = useCallback(async (invitationId: string): Promise<{success: boolean; message: string}> => {
    if (!firebaseUser) return { success: false, message: "User not authenticated."};
    try {
      return await makeApiRequest('/api/farm/invitations/decline', { invitationId });
    }
    catch(error: any) { return { success: false, message: error.message || "Failed to decline invitation."}; }
  }, [firebaseUser, makeApiRequest]);

  const revokeInvitation = useCallback(async (invitationId: string): Promise<{success: boolean; message: string}> => {
    if (!user || !user.farmId || (!user.isFarmOwner && user.roleOnCurrentFarm !== 'admin')) {
      return { success: false, message: "Unauthorized to revoke invitation." };
    }
    try {
      return await makeApiRequest('/api/farm/invitations/revoke', { invitationId });
    }
    catch(error: any) { return { success: false, message: error.message || "Failed to revoke invitation."}; }
  }, [user, makeApiRequest]);

  const cancelSubscription = useCallback(async (): Promise<{success: boolean; message: string}> => {
    if (!user || !firebaseUser) {
      return { success: false, message: "User not authenticated." };
    }
    try {
      const response = await makeApiRequest('/api/billing/cancel-subscription', {});
      if(response.success) {
        await refreshUserData();
      }
      return response;
    } catch (error) {
        const message = error instanceof Error ? error.message : "Could not initiate cancellation.";
        return { success: false, message };
    }
  }, [user, firebaseUser, makeApiRequest, refreshUserData]);

  const updateUserPlan = useCallback(async (planId: PlanId): Promise<{success: boolean; message: string; sessionId?: string; error?: string}> => {
    if (!user || !firebaseUser) return { success: false, message: "User not authenticated." };

    if (planId === 'free') {
      if (user.selectedPlanId !== 'free' && user.subscriptionStatus === 'active') {
        return cancelSubscription(); // Call the stable cancelSubscription
      } else if (user.selectedPlanId === 'free') {
        return { success: true, message: "You are already on the Free plan." };
      } else {
         await updateDoc(doc(db, "users", user.uid), { selectedPlanId: 'free', subscriptionStatus: 'active', stripeSubscriptionId: null, updatedAt: serverTimestamp() });
         await refreshUserData();
         return { success: true, message: "Switched to Free plan."};
      }
    }
    try {
      const response = await makeApiRequest('/api/billing/create-checkout-session', { planId });
      if (response.success && response.sessionId) {
        return { success: true, message: 'Checkout session created.', sessionId: response.sessionId };
      } else {
        return { success: false, message: response.message || 'Failed to create session.', error: response.message };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not initiate plan change.";
      return { success: false, message, error: message };
    }
  }, [user, firebaseUser, makeApiRequest, refreshUserData, cancelSubscription]);


  const updateUserSettings = useCallback(async (newSettings: Partial<UserSettings>): Promise<{success: boolean; message: string}> => {
    if (!user || !auth.currentUser) return { success: false, message: "User not authenticated." };
    try {
      const userDocRef = doc(db, "users", user.uid);
      const currentDbSettings = user.settings || {};
      const defaultPrefs: NotificationPreferences = {
        taskRemindersEmail: true, weatherAlertsEmail: false, aiInsightsEmail: true, staffActivityEmail: false,
      };
      const mergedSettings: UserSettings = {
          preferredAreaUnit: newSettings.preferredAreaUnit ?? currentDbSettings.preferredAreaUnit ?? "acres",
          preferredWeightUnit: newSettings.preferredWeightUnit ?? currentDbSettings.preferredWeightUnit ?? "kg",
          theme: newSettings.theme ?? currentDbSettings.theme ?? "system",
          notificationPreferences: {
            ...defaultPrefs,
            ...(currentDbSettings.notificationPreferences || {}),
            ...(newSettings.notificationPreferences || {}),
          }
      };
      await updateDoc(userDocRef, { settings: mergedSettings, updatedAt: serverTimestamp() });
      await refreshUserData();
      return { success: true, message: "Settings updated." };
    } catch (error: any) {
      const message = error.message || "Could not update settings.";
      return { success: false, message };
    }
  }, [user, refreshUserData]);

  const fetchNotifications = useCallback(async () => {
    const currentFbUser = auth.currentUser;
    if (!currentFbUser) {
      setNotifications([]);
      setUnreadNotificationCount(0);
      return;
    }
    try {
      const q = query(
        collection(db, "notifications"),
        where("userId", "==", currentFbUser.uid),
        orderBy("createdAt", "desc"),
        limit(20)
      );
      const querySnapshot = await getDocs(q);
      const fetchedNotifs: AppNotification[] = [];
      let unreadCount = 0;
      querySnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const notif = {
            id: docSnap.id,
            ...data,
            type: data.type || 'general',
            createdAt: data.createdAt instanceof Timestamp ? data.createdAt : Timestamp.now(),
            readAt: data.readAt instanceof Timestamp ? data.readAt : undefined,
        } as AppNotification;
        fetchedNotifs.push(notif);
        if (!notif.isRead) {
          unreadCount++;
        }
      });
      setNotifications(fetchedNotifs);
      setUnreadNotificationCount(unreadCount);
    } catch (error) {
      console.error("Error fetching notifications:", error);
    }
  }, []);

  const markNotificationAsRead = useCallback(async (notificationId: string) => {
    const currentFbUser = auth.currentUser;
    if (!currentFbUser) return;
    try {
      const notifRef = doc(db, "notifications", notificationId);
      await updateDoc(notifRef, { isRead: true, readAt: serverTimestamp() });
      await fetchNotifications();
    } catch (error) {
      console.error("Error marking notification as read:", error);
    }
  }, [fetchNotifications]);

  const markAllNotificationsAsRead = useCallback(async () => {
    const currentFbUser = auth.currentUser;
    if (!currentFbUser || unreadNotificationCount === 0) return;
    try {
      const batch = writeBatch(db);
      const unreadNotifsOnClient = notifications.filter(n => !n.isRead);
      if (unreadNotifsOnClient.length > 0) {
        unreadNotifsOnClient.forEach(notif => {
          const notifRef = doc(db, "notifications", notif.id);
          batch.update(notifRef, { isRead: true, readAt: serverTimestamp() });
        });
        await batch.commit();
      }
      await fetchNotifications();
    } catch (error) {
      console.error("Error marking all notifications as read:", error);
    }
  }, [notifications, unreadNotificationCount, fetchNotifications]);

  const markOnboardingComplete = useCallback(async () => {
    const currentFbUser = auth.currentUser;
    if (!user || !currentFbUser) {
      return;
    }
    try {
      const userDocRef = doc(db, "users", user.uid);
      await updateDoc(userDocRef, { onboardingCompleted: true, updatedAt: serverTimestamp() });
      await refreshUserData();
    } catch (error: any) {
      console.error("Error marking onboarding complete:", error);
    }
  }, [user, refreshUserData]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUserInstance) => {
      setIsLoading(true);
      setFirebaseUser(fbUserInstance);
      if (fbUserInstance) {
        await refreshUserData(); // This fetches full user data
        await fetchNotifications();
      } else {
        setUser(null);
        setNotifications([]);
        setUnreadNotificationCount(0);
      }
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, [refreshUserData, fetchNotifications]); // refreshUserData is stable

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
    notifications, unreadNotificationCount,
    loginUser, registerUser, logoutUser, updateUserProfile, changeUserPassword,
    makeApiRequest, inviteStaffMemberByEmail, removeStaffMember, acceptInvitation,
    declineInvitation, revokeInvitation, updateStaffRole, refreshUserData, updateUserPlan,
    cancelSubscription, updateUserSettings,
    fetchNotifications, markNotificationAsRead, markAllNotificationsAsRead,
    markOnboardingComplete,
  }), [
    user, firebaseUser, isLoading, notifications, unreadNotificationCount,
    loginUser, registerUser, logoutUser, updateUserProfile, changeUserPassword,
    makeApiRequest, inviteStaffMemberByEmail, removeStaffMember, acceptInvitation,
    declineInvitation, revokeInvitation, updateStaffRole, refreshUserData, updateUserPlan,
    cancelSubscription, updateUserSettings,
    fetchNotifications, markNotificationAsRead, markAllNotificationsAsRead,
    markOnboardingComplete,
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
