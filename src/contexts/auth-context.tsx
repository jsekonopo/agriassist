
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
import { doc, setDoc, getDoc, updateDoc, collection, serverTimestamp, writeBatch, FieldValue, arrayUnion, arrayRemove, query, where, getDocs, Timestamp, limit, orderBy } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';

export type PlanId = "free" | "pro" | "agribusiness";
export type SubscriptionStatus = "active" | "trialing" | "cancelled" | "past_due" | "incomplete";
export type PreferredAreaUnit = "acres" | "hectares";
export type PreferredWeightUnit = "kg" | "lbs";
export type ThemePreference = "light" | "dark" | "system";
export type StaffRole = 'admin' | 'editor' | 'viewer'; // Explicitly define staff roles
export type UserRoleOnFarm = PlanId | StaffRole | null;


export interface NotificationPreferences {
  taskRemindersEmail?: boolean; // Added
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
  staffMembers?: StaffMemberWithDetails[]; // For owners, list of staff details
  roleOnCurrentFarm?: UserRoleOnFarm; // Actual role on the current farm
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
  registerUser: (name: string, farmNameFromInput: string, email: string, password: string) => Promise<string | void>;
  logoutUser: () => Promise<void>;
  updateUserProfile: (nameUpdate: string, newFarmName: string, farmLatInput?: number | null, farmLngInput?: number | null) => Promise<void>;
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
    if (!currentFbUser) throw new Error("User not authenticated for API request.");
    const idToken = await currentFbUser.getIdToken(true); // Force refresh of the token
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
      let currentFarmName: string | null = null;
      let currentIsFarmOwner = appUserDataFromDb.isFarmOwner || false;
      let currentFarmId: string | null = appUserDataFromDb.farmId || null;
      let userRoleOnFarm: UserRoleOnFarm = null;
      let staffDetailsForOwner: StaffMemberWithDetails[] = [];
      let currentFarmLatitude: number | null = appUserDataFromDb.farmLatitude ?? null;
      let currentFarmLongitude: number | null = appUserDataFromDb.farmLongitude ?? null;

      if (currentFarmId) {
        try {
            const farmDocRef = doc(db, "farms", currentFarmId);
            const farmDocSnap = await getDoc(farmDocRef);
            if (farmDocSnap.exists()) {
              const farmData = farmDocSnap.data();
              currentFarmName = farmData?.farmName || 'Unnamed Farm';
              currentFarmLatitude = typeof farmData?.latitude === 'number' ? farmData.latitude : (appUserDataFromDb.farmLatitude ?? null);
              currentFarmLongitude = typeof farmData?.longitude === 'number' ? farmData.longitude : (appUserDataFromDb.farmLongitude ?? null);

              if (farmData?.ownerId === fbUser.uid) {
                currentIsFarmOwner = true; 
                userRoleOnFarm = appUserDataFromDb.selectedPlanId || 'free'; 

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
                  staffDetailsForOwner = await Promise.all(staffPromises);
                }
              } else { 
                currentIsFarmOwner = false; 
                const farmStaffArray = (farmData?.staff || []) as StaffMemberInFarmDoc[];
                const staffEntry = farmStaffArray.find(s => s.uid === fbUser.uid);
                userRoleOnFarm = staffEntry ? staffEntry.role : null;
                 if (!staffEntry && farmData?.ownerId !== fbUser.uid) { 
                    console.warn(`User ${fbUser.uid} associated with farm ${currentFarmId} but not in its staff list nor owner. Resetting their farm association.`);
                    await updateDoc(userDocRef, { farmId: null, isFarmOwner: false, roleOnCurrentFarm: null, farmName: null });
                    currentFarmId = null; currentFarmName = null; userRoleOnFarm = null;
                }
              }
            } else { 
              console.warn(`Farm document ${appUserDataFromDb.farmId} not found for user ${fbUser.uid}. Resetting their farm association.`);
              await updateDoc(userDocRef, { farmId: null, isFarmOwner: false, roleOnCurrentFarm: null, farmName: null });
              currentFarmId = null; currentFarmName = null; currentIsFarmOwner = false; userRoleOnFarm = null;
            }
        } catch (farmError) {
            console.error(`Error fetching farm ${appUserDataFromDb.farmId} for user ${fbUser.uid}:`, farmError);
            currentFarmId = null; currentFarmName = null; currentIsFarmOwner = false; userRoleOnFarm = null;
        }
      }
      
      const defaultNotificationPreferences: NotificationPreferences = {
        taskRemindersEmail: true, // Default task reminders to true
        weatherAlertsEmail: false, 
        aiInsightsEmail: true, 
        staffActivityEmail: false,
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
        farmName: currentFarmName, // This will be the farm's name from the 'farms' collection
        farmLatitude: currentFarmLatitude,
        farmLongitude: currentFarmLongitude,
        isFarmOwner: currentIsFarmOwner,
        staffMembers: staffDetailsForOwner, 
        roleOnCurrentFarm: userRoleOnFarm,
        selectedPlanId: appUserDataFromDb.selectedPlanId || "free",
        subscriptionStatus: appUserDataFromDb.subscriptionStatus || (appUserDataFromDb.selectedPlanId === "free" ? "active" : "incomplete"),
        stripeCustomerId: appUserDataFromDb.stripeCustomerId || null,
        stripeSubscriptionId: appUserDataFromDb.stripeSubscriptionId || null,
        subscriptionCurrentPeriodEnd: appUserDataFromDb.subscriptionCurrentPeriodEnd || null,
        settings: defaultSettings,
        onboardingCompleted: typeof appUserDataFromDb.onboardingCompleted === 'boolean' ? appUserDataFromDb.onboardingCompleted : false,
      };
    } else { 
        console.warn(`User document not found in Firestore for UID: ${fbUser.uid}. Cannot build full app user context.`);
        return null; 
    }
  }, []);

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
  
  const loginUser = useCallback(async (email: string, password: string): Promise<void> => {
    await signInWithEmailAndPassword(auth, email, password);
    // onAuthStateChanged will handle fetching user data and redirecting via refreshUserData
  }, []);

  const registerUser = useCallback(async (name: string, farmNameFromInput: string, email: string, password: string): Promise<string | void> => {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const fbUser = userCredential.user;
    await firebaseUpdateProfile(fbUser, { displayName: name });

    const batch = writeBatch(db);
    const userDocRef = doc(db, "users", fbUser.uid);
    const newFarmId = doc(collection(db, "farms")).id; // Generate a new unique ID for the farm
    const farmDocRef = doc(db, "farms", newFarmId);

    const actualFarmName = farmNameFromInput.trim() || `${name}'s Farm`;
    const initialPlanId: PlanId = 'free';
    const defaultSettings : UserSettings = {
      notificationPreferences: { taskRemindersEmail: true, weatherAlertsEmail: false, aiInsightsEmail: true, staffActivityEmail: false },
      preferredAreaUnit: "acres", preferredWeightUnit: "kg", theme: "system",
    };

    batch.set(userDocRef, {
      uid: fbUser.uid, email: fbUser.email?.toLowerCase(), name: name,
      farmId: newFarmId, 
      farmName: actualFarmName, // Store farmName here for convenience, true source is farms collection
      isFarmOwner: true,
      roleOnCurrentFarm: initialPlanId, 
      selectedPlanId: initialPlanId,
      subscriptionStatus: "active" as SubscriptionStatus,
      settings: defaultSettings,
      onboardingCompleted: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    batch.set(farmDocRef, {
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
          // No router.push here; return the path to let the form component handle navigation
          return `/accept-invitation?token=${invitationToken}`; 
        }
      }
    } catch (error) {
        console.error("Error checking for pending invitations after registration:", error);
    }
    await refreshUserData(); // Ensure local state is updated after registration
    // Default redirect will be handled by the form if no invite is found
  }, [toast, refreshUserData]); 

  const logoutUser = useCallback(async () => {
    try { await firebaseSignOut(auth); } catch (error) { console.error("Error signing out: ", error); }
    finally {
        setUser(null); setFirebaseUser(null); setNotifications([]); setUnreadNotificationCount(0);
        const publicPaths = ['/login', '/register', '/', '/accept-invitation', '/pricing', '/settings', '/about', '/contact', '/features'];
        const isPublicPath = publicPaths.some(p => pathname === p || pathname.startsWith(p + '/'));
        if (!isPublicPath) {
          router.push('/login');
        } else if (pathname !== '/') { 
          // Stay on public page if already there, otherwise go to home
          // router.push('/'); // This could be too aggressive, let them stay on /pricing etc.
        }
    }
  }, [pathname, router]);

  const updateUserProfile = useCallback(async (nameUpdate: string, newFarmName: string, farmLatInput?: number | null, farmLngInput?: number | null): Promise<void> => {
    const currentFbUser = auth.currentUser;
    const currentAppContextUser = user; 
    if (!currentFbUser || !currentAppContextUser) throw new Error("User not authenticated.");

    const batch = writeBatch(db);
    const userDocRef = doc(db, "users", currentFbUser.uid);
    const userUpdateData: any = { updatedAt: serverTimestamp() }; 
    
    let profileNeedsUpdateInAuth = false;
    if (nameUpdate.trim() && nameUpdate.trim() !== (currentAppContextUser.name || "")) {
      userUpdateData.name = nameUpdate.trim();
      profileNeedsUpdateInAuth = true; 
    }
    
    if (currentAppContextUser.isFarmOwner && newFarmName.trim() && newFarmName.trim() !== (currentAppContextUser.farmName || "")) {
       userUpdateData.farmName = newFarmName.trim(); // Update convenience field on user doc
    }
    
    if (Object.keys(userUpdateData).length > 1 || profileNeedsUpdateInAuth) { // Check if there's more than just updatedAt
        batch.update(userDocRef, userUpdateData);
    }

    if (currentAppContextUser.isFarmOwner && currentAppContextUser.farmId) {
      const farmDocRef = doc(db, "farms", currentAppContextUser.farmId);
      const farmUpdates: any = { updatedAt: serverTimestamp() };
      let farmDocNeedsUpdate = false;

      if (newFarmName.trim() && newFarmName.trim() !== (currentAppContextUser.farmName || "")) {
        farmUpdates.farmName = newFarmName.trim();
        farmDocNeedsUpdate = true;
      }
      
      if (farmLatInput !== undefined ) { 
        farmUpdates.latitude = farmLatInput === null || isNaN(farmLatInput) ? null : Number(farmLatInput);
        farmDocNeedsUpdate = true;
      }
      if (farmLngInput !== undefined) {
        farmUpdates.longitude = farmLngInput === null || isNaN(farmLngInput) ? null : Number(farmLngInput);
        farmDocNeedsUpdate = true;
      }
      
      if (farmDocNeedsUpdate) {
        batch.update(farmDocRef, farmUpdates);
      }
    }
    
    if (profileNeedsUpdateInAuth && userUpdateData.name) { 
        await firebaseUpdateProfile(currentFbUser, { displayName: userUpdateData.name });
    }

    if ((batch as any)._ops && (batch as any)._ops.length > 0) { 
      await batch.commit();
    }
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
    if (!user?.farmId ) {
      return { success: false, message: "You must be associated with a farm to invite staff." };
    }
    if (!user.isFarmOwner && user.roleOnCurrentFarm !== 'admin') {
        return { success: false, message: "Only farm owners or admins can invite staff." };
    }
    try {
      const result = await makeApiRequest('/api/farm/invite-staff', { invitedEmail: emailToInvite, role: role, inviterFarmId: user.farmId, inviterUid: user.uid });
      if(result.success) await refreshUserData(); 
      return result;
    }
    catch(error: any) { return { success: false, message: error.message || "Failed to log invitation request."}; }
  }, [user, makeApiRequest, refreshUserData]);

  const removeStaffMember = useCallback(async (staffUidToRemove: string): Promise<{success: boolean; message: string}> => {
     if (!user?.farmId) {
      return { success: false, message: "You must be associated with a farm to remove staff." };
    }
    if (!user.isFarmOwner && user.roleOnCurrentFarm !== 'admin') {
        return { success: false, message: "Only farm owners or admins can remove staff." };
    }
    try {
        const result = await makeApiRequest('/api/farm/remove-staff', { staffUidToRemove, ownerFarmId: user.farmId });
        if (result.success) await refreshUserData(); 
        return result;
    } catch (error: any) { return { success: false, message: error.message || "Failed to remove staff member."}; }
  }, [user, makeApiRequest, refreshUserData]);
  
  const updateStaffRole = useCallback(async (staffUid: string, newRole: StaffRole): Promise<{success: boolean; message: string}> => {
    if (!user?.farmId) return { success: false, message: "User not associated with a farm." };
     if (!user.isFarmOwner && user.roleOnCurrentFarm !== 'admin') {
        return { success: false, message: "Only farm owners or admins can change staff roles." };
    }
    try {
      const result = await makeApiRequest('/api/farm/update-staff-role', { staffUidToUpdate: staffUid, newRole: newRole, farmId: user.farmId });
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
    try {
      // This API route currently only expects invitationId in the body
      const result = await makeApiRequest('/api/farm/invitations/decline', { invitationId });
      // No full refreshUserData needed here usually, but Profile page might re-fetch its invites
      return result;
    }
    catch(error: any) { return { success: false, message: error.message || "Failed to decline invitation."}; }
  }, [makeApiRequest]);

  const revokeInvitation = useCallback(async (invitationId: string): Promise<{success: boolean; message: string}> => {
     if (!user?.farmId ) {
      return { success: false, message: "You must be associated with a farm to revoke invitations." };
    }
    if (!user.isFarmOwner && user.roleOnCurrentFarm !== 'admin') {
      return { success: false, message: "Only farm owners or admins can revoke invitations." };
    }
    try {
      const result = await makeApiRequest('/api/farm/invitations/revoke', { invitationId, farmId: user.farmId });
      return result;
    }
    catch(error: any) { return { success: false, message: error.message || "Failed to revoke invitation."}; }
  }, [user, makeApiRequest]);
  
  const cancelSubscription = useCallback(async (): Promise<{success: boolean; message: string}> => {
    if (!user || !firebaseUser) {
      toast({ title: "Error", description: "User not authenticated.", variant: "destructive" });
      return { success: false, message: "User not authenticated." };
    }
    try {
      const response = await makeApiRequest('/api/billing/cancel-subscription', {}); // No body needed for current API
      if(response.success) {
        toast({ title: "Subscription Cancellation Requested", description: response.message });
        await refreshUserData(); // Refresh after successful API call
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
    if (!user || !firebaseUser) return { success: false, message: "User not authenticated." };

    if (planId === 'free') {
      if (user.selectedPlanId !== 'free') {
        return cancelSubscription(); // Calls the stable cancelSubscription function
      } else {
        return { success: true, message: "You are already on the Free plan." };
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
  }, [user, firebaseUser, makeApiRequest, cancelSubscription]); 

  const updateUserSettings = useCallback(async (newSettings: Partial<UserSettings>): Promise<{success: boolean; message: string}> => {
    if (!user || !auth.currentUser) return { success: false, message: "User not authenticated." };
    try {
      const userDocRef = doc(db, "users", user.uid);
      const currentDbSettings = user.settings || {}; 
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
      toast({ title: "Error", description: "Could not fetch notifications.", variant: "destructive" });
    }
  }, [toast]); 

  const markNotificationAsRead = useCallback(async (notificationId: string) => {
    const currentFbUser = auth.currentUser;
    if (!currentFbUser) return;
    try {
      const notifRef = doc(db, "notifications", notificationId);
      await updateDoc(notifRef, { isRead: true, readAt: serverTimestamp() });
      await fetchNotifications(); 
    } catch (error) {
      console.error("Error marking notification as read:", error);
      toast({ title: "Error", description: "Could not update notification status.", variant: "destructive" });
    }
  }, [fetchNotifications, toast]); 

  const markAllNotificationsAsRead = useCallback(async () => {
    const currentFbUser = auth.currentUser;
    if (!currentFbUser || unreadNotificationCount === 0) return;
    try {
      const batch = writeBatch(db);
      // Only operate on the currently loaded (and unread) notifications
      const unreadNotifsOnClient = notifications.filter(n => !n.isRead);
      if (unreadNotifsOnClient.length > 0) {
        unreadNotifsOnClient.forEach(notif => {
          const notifRef = doc(db, "notifications", notif.id);
          batch.update(notifRef, { isRead: true, readAt: serverTimestamp() });
        });
        await batch.commit();
        await fetchNotifications(); // Re-fetch to confirm and update count
      } else {
        // If no unread notifications loaded on client, but count > 0,
        // it might imply a sync issue or more unread on server.
        // For simplicity, we only mark loaded ones. A more robust solution
        // might query for all unread by UID and batch update them.
        await fetchNotifications(); // Refresh to get latest state.
      }
    } catch (error) {
      console.error("Error marking all notifications as read:", error);
      toast({ title: "Error", description: "Could not mark all notifications as read.", variant: "destructive" });
    }
  }, [notifications, unreadNotificationCount, fetchNotifications, toast]); 

  const markOnboardingComplete = useCallback(async () => { 
    const currentFbUser = auth.currentUser;
    if (!user || !currentFbUser) {
      toast({ title: "Error", description: "User not authenticated.", variant: "destructive" });
      return;
    }
    try {
      const userDocRef = doc(db, "users", user.uid);
      await updateDoc(userDocRef, { onboardingCompleted: true, updatedAt: serverTimestamp() });
      await refreshUserData();
      toast({ title: "Onboarding Complete!", description: "Welcome to AgriAssist, you're all set up." });
    } catch (error: any) {
      console.error("Error marking onboarding complete:", error);
      toast({ title: "Error", description: error.message || "Could not update onboarding status.", variant: "destructive" });
    }
  }, [user, refreshUserData, toast]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUserInstance) => {
      setIsLoading(true);
      setFirebaseUser(fbUserInstance); 
      if (fbUserInstance) {
        await refreshUserData(); 
        await fetchNotifications(); 
      } else {
        setUser(null);
        setNotifications([]);
        setUnreadNotificationCount(0);
      }
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, [refreshUserData, fetchNotifications]); 

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
