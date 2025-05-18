
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
import { doc, setDoc, getDoc, updateDoc, collection, serverTimestamp, writeBatch, FieldValue, query, where, getDocs, Timestamp, limit, orderBy, deleteDoc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import type { PlanId, SubscriptionStatus, PreferredAreaUnit, PreferredWeightUnit, ThemePreference, NotificationPreferences } from '@/contexts/auth-context'; // Ensure these types are exported or defined here

// Define types if not already imported (assuming they might be in a central types file)
export type { PlanId, SubscriptionStatus, PreferredAreaUnit, PreferredWeightUnit, ThemePreference, NotificationPreferences };

export type StaffRole = 'admin' | 'editor' | 'viewer';
export type UserRoleOnFarm = PlanId | StaffRole | null; // Owner uses PlanId, staff uses StaffRole

export interface UserSettings {
  notificationPreferences?: NotificationPreferences;
  preferredAreaUnit?: PreferredAreaUnit;
  preferredWeightUnit?: PreferredWeightUnit;
  theme?: ThemePreference;
}

export interface StaffMemberInFarmDoc { // Stored in farms/{farmId}.staff array
  uid: string;
  role: StaffRole;
}

export interface StaffMemberWithDetails { // Used in AuthContext user object for owners to see staff
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
  staffMembers?: StaffMemberWithDetails[]; // Populated for farm owner
  roleOnCurrentFarm?: UserRoleOnFarm;
  selectedPlanId: PlanId;
  subscriptionStatus: SubscriptionStatus;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  subscriptionCurrentPeriodEnd?: Timestamp | null;
  settings?: UserSettings;
  onboardingCompleted?: boolean;
}

export interface PendingInvitation {
  id: string; // Firestore document ID
  inviterFarmId: string;
  inviterUid: string;
  inviterName?: string; // Denormalized inviter's name
  farmName?: string;    // Denormalized farm name
  invitedEmail: string;
  invitedUserUid: string | null; // UID of the user if they exist, null otherwise
  invitedRole: StaffRole;
  status: 'pending' | 'accepted' | 'declined' | 'expired' | 'revoked' | 'error_farm_not_found';
  invitationToken?: string; // Only present for 'pending' status
  tokenExpiresAt?: Timestamp; // Only present for 'pending' status
  createdAt: Timestamp;
  updatedAt?: Timestamp;
  acceptedAt?: Timestamp;
  declinedAt?: Timestamp;
  revokedAt?: Timestamp;
  acceptedByUid?: string;
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
  registerUser: (name: string, farmNameFromInput: string, email: string, password: string, selectedPlanId: PlanId) => Promise<string | void>;
  logoutUser: () => Promise<void>;
  updateUserProfile: (nameUpdate: string, newFarmName?: string | null, farmLatInput?: number | null, farmLngInput?: number | null) => Promise<void>;
  changeUserPassword: (currentPassword: string, newPassword: string) => Promise<void>;
  makeApiRequest: (endpoint: string, body: any, method?: 'POST' | 'GET' | 'PUT' | 'DELETE') => Promise<any>;
  inviteStaffMemberByEmail: (emailToInvite: string, role: StaffRole) => Promise<{success: boolean; message: string; invitationId?: string}>;
  removeStaffMember: (staffUidToRemove: string) => Promise<{success: boolean; message: string}>;
  updateStaffRole: (staffUid: string, newRole: StaffRole) => Promise<{success: boolean; message: string}>;
  acceptInvitation: (invitationId: string) => Promise<{success: boolean; message: string}>; // Used by user for their own invites
  declineInvitation: (invitationId: string) => Promise<{success: boolean; message: string}>; // Used by user for their own invites
  revokeInvitation: (invitationId: string) => Promise<{success: boolean; message: string}>;  // Used by owner for farm's invites
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
      let currentFarmNameFromFarmDoc: string | null = null;
      let currentFarmLatitude: number | null = null;
      let currentFarmLongitude: number | null = null;
      let staffDetailsForOwner: StaffMemberWithDetails[] = [];
      let derivedRoleOnCurrentFarm: UserRoleOnFarm = appUserDataFromDb.roleOnCurrentFarm || null; // Start with what's on user doc

      if (appUserDataFromDb.farmId) {
        try {
            const farmDocRef = doc(db, "farms", appUserDataFromDb.farmId);
            const farmDocSnap = await getDoc(farmDocRef);
            if (farmDocSnap.exists()) {
              const farmData = farmDocSnap.data();
              currentFarmNameFromFarmDoc = farmData?.farmName || 'Unnamed Farm';
              currentFarmLatitude = typeof farmData?.latitude === 'number' ? farmData.latitude : null;
              currentFarmLongitude = typeof farmData?.longitude === 'number' ? farmData.longitude : null;

              if (appUserDataFromDb.isFarmOwner && farmData?.ownerId === fbUser.uid) {
                derivedRoleOnCurrentFarm = appUserDataFromDb.selectedPlanId || 'free'; // Owner's role is their plan

                if (farmData?.staff && Array.isArray(farmData.staff)) {
                  const staffPromises = (farmData.staff as StaffMemberInFarmDoc[]).map(async (staffMember) => {
                    const staffUserDoc = await getDoc(doc(db, "users", staffMember.uid));
                    const staffUserData = staffUserDoc.exists() ? staffUserDoc.data() : null;
                    return {
                      uid: staffMember.uid,
                      name: staffUserData?.name || staffMember.uid,
                      email: staffUserData?.email || 'N/A',
                      role: staffMember.role // Role from farm.staff array
                    };
                  });
                  staffDetailsForOwner = await Promise.all(staffPromises);
                }
              } else if (!appUserDataFromDb.isFarmOwner) {
                const farmStaffArray = (farmData?.staff || []) as StaffMemberInFarmDoc[];
                const staffEntry = farmStaffArray.find(s => s.uid === fbUser.uid);
                derivedRoleOnCurrentFarm = staffEntry ? staffEntry.role : null;
              }
            } else {
              console.warn(`Farm document ${appUserDataFromDb.farmId} not found for user ${fbUser.uid}. User might be orphaned from farm.`);
              // Consider resetting farmId and isFarmOwner if farm doesn't exist
            }
        } catch (farmError) {
            console.error(`Error fetching farm ${appUserDataFromDb.farmId} for user ${fbUser.uid}:`, farmError);
        }
      }
      
      const defaultNotificationPreferences: NotificationPreferences = {
        taskRemindersEmail: true, weatherAlertsEmail: false, aiInsightsEmail: true, staffActivityEmail: false,
      };

      const finalSettings: UserSettings = {
        notificationPreferences: {
          ...defaultNotificationPreferences,
          ...(appUserDataFromDb.settings?.notificationPreferences || {}),
        },
        preferredAreaUnit: appUserDataFromDb.settings?.preferredAreaUnit || "acres",
        preferredWeightUnit: appUserDataFromDb.settings?.preferredWeightUnit || "kg",
        theme: appUserDataFromDb.settings?.theme || "system",
      };

      return {
        uid: fbUser.uid,
        email: fbUser.email?.toLowerCase() || null,
        name: appUserDataFromDb.name || fbUser.displayName,
        farmId: appUserDataFromDb.farmId || null,
        farmName: currentFarmNameFromFarmDoc || appUserDataFromDb.farmName, // Prefer name from farm doc if available
        farmLatitude: currentFarmLatitude,
        farmLongitude: currentFarmLongitude,
        isFarmOwner: appUserDataFromDb.isFarmOwner || false,
        staffMembers: staffDetailsForOwner,
        roleOnCurrentFarm: derivedRoleOnCurrentFarm,
        selectedPlanId: appUserDataFromDb.selectedPlanId || "free",
        subscriptionStatus: appUserDataFromDb.subscriptionStatus || (appUserDataFromDb.selectedPlanId === "free" ? "active" : "pending_payment"),
        stripeCustomerId: appUserDataFromDb.stripeCustomerId || null,
        stripeSubscriptionId: appUserDataFromDb.stripeSubscriptionId || null,
        subscriptionCurrentPeriodEnd: appUserDataFromDb.subscriptionCurrentPeriodEnd || null,
        settings: finalSettings,
        onboardingCompleted: typeof appUserDataFromDb.onboardingCompleted === 'boolean' ? appUserDataFromDb.onboardingCompleted : false,
      };
    } else {
        console.warn(`User document not found in Firestore for UID: ${fbUser.uid} during fetchAppUserDataFromDb.`);
        return null; // Should be handled by calling functions (e.g., during registration this is expected briefly)
    }
  }, []);

  const refreshUserData = useCallback(async () => {
    const currentFbUser = auth.currentUser; // Get fresh instance
    if (currentFbUser) {
      setIsLoading(true); // Set loading true at the start of refresh
      try {
        const appUserData = await fetchAppUserDataFromDb(currentFbUser);
        setUser(appUserData);
        setFirebaseUser(currentFbUser); // ensure firebaseUser state is also in sync
      } catch (error) {
        console.error("Error refreshing user data:", error);
        setUser(null); 
        setFirebaseUser(null);
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
    // onAuthStateChanged will trigger refreshUserData
  }, []);

  const registerUser = useCallback(async (name: string, farmNameFromInput: string, email: string, password: string, selectedPlanId: PlanId): Promise<string | void> => {
    if (selectedPlanId === "free") {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const fbUser = userCredential.user;
      await firebaseUpdateProfile(fbUser, { displayName: name });

      const batch = writeBatch(db);
      const userDocRef = doc(db, "users", fbUser.uid);
      
      // For free plan, user's UID is their farmId
      const newFarmId = fbUser.uid; 
      const newFarmDocRef = doc(db, "farms", newFarmId);

      const actualFarmName = farmNameFromInput.trim() || `${name}'s Farm`;
      const defaultSettings : UserSettings = {
        notificationPreferences: { taskRemindersEmail: true, weatherAlertsEmail: false, aiInsightsEmail: true, staffActivityEmail: false },
        preferredAreaUnit: "acres", preferredWeightUnit: "kg", theme: "system",
      };

      batch.set(userDocRef, {
        uid: fbUser.uid, email: fbUser.email?.toLowerCase(), name: name,
        farmId: newFarmId,
        farmName: actualFarmName, // Store it on user doc too for convenience during initial load
        isFarmOwner: true,
        roleOnCurrentFarm: selectedPlanId as UserRoleOnFarm, // 'free' plan is owner role
        selectedPlanId: selectedPlanId,
        subscriptionStatus: "active" as SubscriptionStatus,
        settings: defaultSettings,
        onboardingCompleted: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      batch.set(newFarmDocRef, {
        farmId: newFarmId, // Store farmId on farm doc as well
        farmName: actualFarmName,
        ownerId: fbUser.uid,
        staff: [], // Empty staff array for new farm
        latitude: null,
        longitude: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
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
            return `/accept-invitation?token=${invitationToken}`; // Return path for form to redirect
          }
        }
      } catch (error) {
          console.error("Error checking for pending invitations after registration:", error);
      }
      // No await refreshUserData() here, onAuthStateChanged will handle it.
      // The form will handle router.push to dashboard if no invite path returned
    } else {
      // Paid plan registration is initiated via API from RegisterForm directly after Firebase Auth user creation
      // This part of registerUser is now primarily for the 'free' plan path.
      throw new Error("Paid plan registration should be handled by the form calling the API.");
    }
  }, [toast]);

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
    const currentAppContextUser = user; // Use user from state which should be up-to-date
    if (!currentFbUser || !currentAppContextUser) throw new Error("User not authenticated.");

    const batch = writeBatch(db);
    const userDocRef = doc(db, "users", currentFbUser.uid);
    const userUpdateData: any = { updatedAt: serverTimestamp() };
    let userProfileNeedsUpdate = false;

    if (nameUpdate.trim() && nameUpdate.trim() !== (currentAppContextUser.name || "")) {
      userUpdateData.name = nameUpdate.trim();
      await firebaseUpdateProfile(currentFbUser, { displayName: nameUpdate.trim() }); // Firebase Auth profile
      userProfileNeedsUpdate = true;
    }

    if (currentAppContextUser.isFarmOwner && newFarmName !== undefined) {
      // If newFarmName is an empty string, it implies clearing; store null or empty string based on preference.
      // Let's treat empty string from form as wanting to clear, so save null.
      const farmNameToSave = newFarmName === "" ? null : newFarmName;
      if (farmNameToSave !== (currentAppContextUser.farmName || null)) {
        userUpdateData.farmName = farmNameToSave; // Update user's copy of farmName
        userProfileNeedsUpdate = true;
      }
    }
    if(userProfileNeedsUpdate) {
        batch.update(userDocRef, userUpdateData);
    }
    
    if (currentAppContextUser.isFarmOwner && currentAppContextUser.farmId) {
      const farmDocRef = doc(db, "farms", currentAppContextUser.farmId);
      const farmUpdates: any = { updatedAt: serverTimestamp() };
      let farmDocNeedsUpdate = false;

      const farmNameToSaveOnFarmDoc = newFarmName === "" ? null : newFarmName;
      if (newFarmName !== undefined && farmNameToSaveOnFarmDoc !== (currentAppContextUser.farmName || null) ) {
        farmUpdates.farmName = farmNameToSaveOnFarmDoc;
        farmDocNeedsUpdate = true;
      }
      
      const latToSave = (farmLatInput === null || farmLatInput === undefined || isNaN(farmLatInput)) ? null : Number(farmLatInput);
      const lonToSave = (farmLngInput === null || farmLngInput === undefined || isNaN(farmLngInput)) ? null : Number(farmLngInput);

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

  const inviteStaffMemberByEmail = useCallback(async (emailToInvite: string, role: StaffRole): Promise<{success: boolean; message: string; invitationId?: string}> => {
    try {
      const result = await makeApiRequest('/api/farm/invite-staff', { invitedEmail: emailToInvite, role: role });
      // No refreshUserData here; profile page will re-fetch its own lists.
      return result;
    } catch(error: any) { return { success: false, message: error.message || "Failed to log invitation request."}; }
  }, [makeApiRequest]);

  const removeStaffMember = useCallback(async (staffUidToRemove: string): Promise<{success: boolean; message: string}> => {
    try {
        const result = await makeApiRequest('/api/farm/remove-staff', { staffUidToRemove });
        if (result.success) await refreshUserData(); // Refresh to update owner's staffMembers list & staff user's farmId
        return result;
    } catch (error: any) { return { success: false, message: error.message || "Failed to remove staff member."}; }
  }, [makeApiRequest, refreshUserData]);

  const updateStaffRole = useCallback(async (staffUid: string, newRole: StaffRole): Promise<{success: boolean; message: string}> => {
    try {
      const result = await makeApiRequest('/api/farm/update-staff-role', { staffUidToUpdate: staffUid, newRole: newRole });
      if (result.success) await refreshUserData(); // Refresh to update owner's staffMembers list & staff user's roleOnCurrentFarm
      return result;
    } catch (error: any) {
      return { success: false, message: error.message || "Failed to update staff role."};
    }
  }, [makeApiRequest, refreshUserData]);

  const acceptInvitation = useCallback(async (invitationId: string): Promise<{success: boolean; message: string}> => {
    try {
        const result = await makeApiRequest('/api/farm/invitations/accept', { invitationId }); // This was the old direct client-side one, now unused
        if (result.success) {
          await refreshUserData(); // Crucial: user's farmId, roleOnCurrentFarm changes
        }
        return result;
    } catch (error: any) { return { success: false, message: error.message || "Failed to accept invitation."}; }
  }, [makeApiRequest, refreshUserData]);

  const declineInvitation = useCallback(async (invitationId: string): Promise<{success: boolean; message: string}> => {
    if (!firebaseUser) return { success: false, message: "User not authenticated."}; // firebaseUser might be null briefly
    try {
      return await makeApiRequest('/api/farm/invitations/decline', { invitationId });
    }
    catch(error: any) { return { success: false, message: error.message || "Failed to decline invitation."}; }
  }, [firebaseUser, makeApiRequest]);

  const revokeInvitation = useCallback(async (invitationId: string): Promise<{success: boolean; message: string}> => {
    try {
      return await makeApiRequest('/api/farm/invitations/revoke', { invitationId });
    }
    catch(error: any) { return { success: false, message: error.message || "Failed to revoke invitation."}; }
  }, [makeApiRequest]);

  const cancelSubscription = useCallback(async (): Promise<{success: boolean; message: string}> => {
    if (!user || !firebaseUser) { // Check against user from state as well
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
        return cancelSubscription(); 
      } else if (user.selectedPlanId === 'free') {
        return { success: true, message: "You are already on the Free plan." };
      } else { // e.g. pending_payment for a paid plan, now wants free
         await updateDoc(doc(db, "users", user.uid), { selectedPlanId: 'free', subscriptionStatus: 'active', stripeSubscriptionId: null, stripeCustomerId: null, updatedAt: serverTimestamp() });
         await refreshUserData();
         return { success: true, message: "Switched to Free plan."};
      }
    }
    // For paid plans, initiate checkout
    try {
      const response = await makeApiRequest('/api/billing/create-checkout-session', { planId });
      if (response.success && response.sessionId) {
        // refreshUserData will be called if payment is successful via webhook, or if user returns to pricing page with session_id
        return { success: true, message: 'Checkout session created.', sessionId: response.sessionId };
      } else {
        return { success: false, message: response.message || 'Failed to create session.', error: response.message };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not initiate plan change.";
      return { success: false, message, error: message };
    }
  }, [user, firebaseUser, makeApiRequest, cancelSubscription, refreshUserData]);


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
            userId: data.userId, // ensure all fields are explicitly mapped
            farmId: data.farmId || null,
            type: data.type || 'general',
            title: data.title,
            message: data.message,
            link: data.link || null,
            isRead: data.isRead || false,
            createdAt: data.createdAt instanceof Timestamp ? data.createdAt : Timestamp.now(), // Ensure createdAt is Timestamp
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
      await fetchNotifications(); // Re-fetch to update count and list
    } catch (error) {
      console.error("Error marking notification as read:", error);
    }
  }, [fetchNotifications]);

  const markAllNotificationsAsRead = useCallback(async () => {
    const currentFbUser = auth.currentUser;
    if (!currentFbUser || unreadNotificationCount === 0) return;
    try {
      const batchCommits = writeBatch(db);
      const unreadNotifsOnClient = notifications.filter(n => !n.isRead);
      if (unreadNotifsOnClient.length > 0) {
        unreadNotifsOnClient.forEach(notif => {
          const notifRef = doc(db, "notifications", notif.id);
          batchCommits.update(notifRef, { isRead: true, readAt: serverTimestamp() });
        });
        await batchCommits.commit();
      }
      await fetchNotifications(); // Re-fetch
    } catch (error) {
      console.error("Error marking all notifications as read:", error);
    }
  }, [notifications, unreadNotificationCount, fetchNotifications]);

  const markOnboardingComplete = useCallback(async () => {
    if (!user || !auth.currentUser) return;
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
      if (fbUserInstance) {
        setFirebaseUser(fbUserInstance); // Set FirebaseUser first
        await refreshUserData();    // Then refresh all app user data
        await fetchNotifications();
      } else {
        setUser(null);
        setFirebaseUser(null);
        setNotifications([]);
        setUnreadNotificationCount(0);
      }
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, [refreshUserData, fetchNotifications]); // refreshUserData & fetchNotifications are stable

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
