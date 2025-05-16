
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
// Owner's role is their PlanId. Staff roles are distinct.
export type UserRole = PlanId | 'admin' | 'editor' | 'viewer' | null;


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
  role: Exclude<UserRole, PlanId | null >; // Staff roles cannot be plan IDs
}
export interface StaffMemberWithDetails {
  uid: string;
  name: string | null;
  email: string | null;
  role: Exclude<UserRole, PlanId | null >;
}

export interface User {
  uid: string;
  email: string | null;
  name: string | null;
  farmId?: string | null;
  farmName?: string | null; // Name of the farm the user is associated with
  isFarmOwner?: boolean;
  staff?: StaffMemberWithDetails[]; // Populated if user isFarmOwner
  roleOnCurrentFarm?: UserRole;
  selectedPlanId: PlanId;
  subscriptionStatus: SubscriptionStatus;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  subscriptionCurrentPeriodEnd?: Timestamp | null;
  settings?: UserSettings;
  // For farm location, to be used by dashboard weather
  farmLatitude?: number | null;
  farmLongitude?: number | null;
}

interface AuthContextType {
  user: User | null;
  firebaseUser: FirebaseUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  loginUser: (email: string, password: string) => Promise<void>;
  registerUser: (name: string, farmNameFromInput: string, email: string, password: string) => Promise<string | void>;
  logoutUser: () => Promise<void>;
  updateUserProfile: (nameUpdate: string, newFarmName: string, farmLat?: number | null, farmLng?: number | null) => Promise<void>;
  changeUserPassword: (currentPassword: string, newPassword: string) => Promise<void>;
  makeApiRequest: (endpoint: string, body: any, method?: 'POST' | 'GET' | 'PUT' | 'DELETE') => Promise<any>;
  inviteStaffMemberByEmail: (emailToInvite: string, role: Exclude<UserRole, PlanId | null>) => Promise<{success: boolean; message: string}>;
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
      let userRoleOnCurrentFarm: UserRole = appUserDataFromDb.roleOnCurrentFarm || null;
      let staffDetailsForOwner: StaffMemberWithDetails[] = [];
      let farmLat: number | null = null;
      let farmLng: number | null = null;

      if (currentFarmId) {
        try {
            const farmDocRef = doc(db, "farms", currentFarmId);
            const farmDocSnap = await getDoc(farmDocRef);
            if (farmDocSnap.exists()) {
              const farmData = farmDocSnap.data();
              currentFarmName = farmData?.farmName || currentFarmName; 
              farmLat = typeof farmData?.latitude === 'number' ? farmData.latitude : null;
              farmLng = typeof farmData?.longitude === 'number' ? farmData.longitude : null;

              if (farmData?.ownerId === fbUser.uid) {
                currentIsFarmOwner = true;
                userRoleOnCurrentFarm = appUserDataFromDb.selectedPlanId || 'free'; 
                
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
                const staffEntry = (farmData?.staff as StaffMemberInFarmDoc[])?.find(s => s.uid === fbUser.uid);
                userRoleOnCurrentFarm = staffEntry ? staffEntry.role : null;
              }
            } else {
              currentFarmId = null; currentFarmName = null; currentIsFarmOwner = false; userRoleOnCurrentFarm = null; farmLat = null; farmLng = null;
            }
        } catch (farmError) {
            console.error(`Error fetching farm ${currentFarmId} for user ${fbUser.uid}:`, farmError);
            currentFarmId = null; currentFarmName = null; currentIsFarmOwner = false; userRoleOnCurrentFarm = null; farmLat = null; farmLng = null;
        }
      } else { 
         currentIsFarmOwner = false; userRoleOnCurrentFarm = null;
      }
      
      const defaultNotificationPreferences: NotificationPreferences = {
        taskRemindersEmail: false, weatherAlertsEmail: false, aiSuggestionsInApp: false, staffActivityEmail: false
      };
      const defaultSettings: UserSettings = {
        notificationPreferences: appUserDataFromDb.settings?.notificationPreferences || defaultNotificationPreferences,
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
        isFarmOwner: currentIsFarmOwner,
        staff: currentIsFarmOwner ? staffDetailsForOwner : [],
        roleOnCurrentFarm: userRoleOnCurrentFarm,
        selectedPlanId: appUserDataFromDb.selectedPlanId || "free",
        subscriptionStatus: appUserDataFromDb.subscriptionStatus || (appUserDataFromDb.selectedPlanId === "free" ? "active" : "incomplete"),
        stripeCustomerId: appUserDataFromDb.stripeCustomerId || null,
        stripeSubscriptionId: appUserDataFromDb.stripeSubscriptionId || null,
        subscriptionCurrentPeriodEnd: appUserDataFromDb.subscriptionCurrentPeriodEnd || null,
        settings: defaultSettings,
        farmLatitude: farmLat,
        farmLongitude: farmLng,
      };
      return fetchedUser;
    } else {
        return null; 
    }
  }, []);

  const refreshUserData = useCallback(async () => {
    const currentFbUser = auth.currentUser; 
    if (currentFbUser) {
      try {
        // setIsLoading(true); // Removed setIsLoading from here to avoid loops if called from useEffect dependent on user
        const appUserData = await fetchAppUserDataFromDb(currentFbUser);
        setUser(appUserData); 
        setFirebaseUser(currentFbUser); // ensure firebaseUser is also in sync
      } catch (error) {
        console.error("Error refreshing user data:", error);
        setUser(null);
        setFirebaseUser(null);
      } finally {
        // setIsLoading(false); // Removed setIsLoading from here
      }
    } else {
      setUser(null);
      setFirebaseUser(null);
      // setIsLoading(false); // Removed setIsLoading from here
    }
  }, [fetchAppUserDataFromDb]); // Dependencies: fetchAppUserDataFromDb

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUserInstance) => {
      setIsLoading(true); // Set loading true at the start of auth state change
      if (fbUserInstance) {
        setFirebaseUser(fbUserInstance); // Set FirebaseUser immediately
        await refreshUserData(); // Then refresh app-specific user data
      } else {
        setUser(null);
        setFirebaseUser(null);
      }
      setIsLoading(false); // Set loading false after all operations
    });
    return () => unsubscribe();
  }, [refreshUserData]); // refreshUserData is now stable
  
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
    const newFarmGeneratedId = doc(collection(db, "farms")).id; 
    const actualFarmName = farmNameFromInput.trim() || `${name}'s Farm`;
    const initialPlanId: PlanId = 'free';
    const defaultSettings : UserSettings = {
      notificationPreferences: { taskRemindersEmail: false, weatherAlertsEmail: false, aiSuggestionsInApp: false, staffActivityEmail: false },
      preferredAreaUnit: "acres", preferredWeightUnit: "kg", theme: "system",
    };

    batch.set(userDocRef, { 
      uid: fbUser.uid, email: fbUser.email, name: name,
      farmId: newFarmGeneratedId, farmName: actualFarmName, isFarmOwner: true,
      roleOnCurrentFarm: initialPlanId, selectedPlanId: initialPlanId,
      subscriptionStatus: "active" as SubscriptionStatus, settings: defaultSettings,
      createdAt: serverTimestamp(), staff: [],
    });
    batch.set(doc(db, "farms", newFarmGeneratedId), {
      farmId: newFarmGeneratedId, farmName: actualFarmName, ownerId: fbUser.uid,
      staff: [], createdAt: serverTimestamp(), latitude: null, longitude: null,
    });
    await batch.commit();
    
    try {
      const invitesQuery = query( collection(db, "pendingInvitations"), where("invitedEmail", "==", email.toLowerCase()), where("status", "==", "pending"), limit(1));
      const inviteSnapshots = await getDocs(invitesQuery);
      if (!inviteSnapshots.empty) {
        const invitationToken = inviteSnapshots.docs[0].data().invitationToken;
        if (invitationToken) {
          toast({ title: "Invitation Found!", description: "Redirecting to accept..." });
          router.push(`/accept-invitation?token=${invitationToken}`);
          return `/accept-invitation?token=${invitationToken}`;
        }
      }
    } catch (error) { console.error("Error checking pending invites post-reg:", error); }
    
    await refreshUserData(); 
    // Default to dashboard if no specific redirect happened
  }, [toast, router, refreshUserData]); 
  
  const logoutUser = useCallback(async () => {
    try { await firebaseSignOut(auth); } catch (error) { console.error("Error signing out: ", error); }
    finally {
        setUser(null); setFirebaseUser(null);
        const publicPaths = ['/login', '/register', '/', '/accept-invitation', '/pricing', '/settings'];
        const isPublic = publicPaths.some(p => pathname.startsWith(p));
        if (!isPublic) router.push('/login');
    }
  }, [router, pathname]); 

  const updateUserProfile = useCallback(async (nameUpdate: string, newFarmName: string, farmLat?: number | null, farmLng?: number | null): Promise<void> => {
    const currentFbUser = auth.currentUser;
    if (!currentFbUser || !user) throw new Error("User not authenticated.");
    
    if (nameUpdate.trim() !== "" && nameUpdate.trim() !== user.name) { 
      await firebaseUpdateProfile(currentFbUser, { displayName: nameUpdate.trim() });
    }
    
    const batch = writeBatch(db);
    const userDocRef = doc(db, "users", currentFbUser.uid);
    const userUpdateData: { name?: string; farmName?: string; updatedAt: FieldValue } = { updatedAt: serverTimestamp() };
    if (nameUpdate.trim() !== "" && nameUpdate.trim() !== user.name) userUpdateData.name = nameUpdate.trim();

    if (user.isFarmOwner && user.farmId) {
      const farmDocRef = doc(db, "farms", user.farmId);
      const farmUpdates: {updatedAt: FieldValue, farmName?: string, latitude?: number | null, longitude?: number | null} = { updatedAt: serverTimestamp() };
      if (newFarmName.trim() !== "" && newFarmName.trim() !== user.farmName) {
        farmUpdates.farmName = newFarmName.trim();
        userUpdateData.farmName = newFarmName.trim(); 
      }
      if (farmLat !== undefined && farmLng !== undefined) { // Check if they are passed
        farmUpdates.latitude = farmLat;
        farmUpdates.longitude = farmLng;
      }
      batch.update(farmDocRef, farmUpdates);
    }
    batch.update(userDocRef, userUpdateData);
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
  
  const inviteStaffMemberByEmail = useCallback(async (emailToInvite: string, role: Exclude<UserRole, PlanId | null>): Promise<{success: boolean; message: string}> => {
    if (!user || !(user.isFarmOwner || user.roleOnCurrentFarm === 'admin') || !user.farmId) {
      return { success: false, message: "Only farm owners or admins can invite staff." };
    }
    try { return await makeApiRequest('/api/farm/invite-staff', { invitedEmail: emailToInvite, role }); }
    catch(error: any) { return { success: false, message: error.message || "Failed to send invitation."}; }
  }, [user, makeApiRequest]);
  
  const removeStaffMember = useCallback(async (staffUidToRemove: string): Promise<{success: boolean; message: string}> => {
    if (!user || !(user.isFarmOwner || user.roleOnCurrentFarm === 'admin') || !user.farmId) {
      return { success: false, message: "Only farm owners or admins can remove staff." };
    }
    try {
        const result = await makeApiRequest('/api/farm/remove-staff', { staffUidToRemove }); 
        if (result.success) await refreshUserData(); 
        return result;
    } catch (error: any) { return { success: false, message: error.message || "Failed to remove staff member."}; }
  }, [user, makeApiRequest, refreshUserData]);

  const acceptInvitation = useCallback(async (invitationId: string): Promise<{success: boolean; message: string}> => {
    try {
        const result = await makeApiRequest('/api/farm/invitations/accept', { invitationId });
        if (result.success) await refreshUserData(); 
        return result;
    } catch (error: any) { return { success: false, message: error.message || "Failed to accept invitation."}; }
  }, [makeApiRequest, refreshUserData]);

  const declineInvitation = useCallback(async (invitationId: string): Promise<{success: boolean; message: string}> => {
    try { return await makeApiRequest('/api/farm/invitations/decline', { invitationId }); }
    catch (error: any) { return { success: false, message: error.message || "Failed to decline invitation."}; }
  }, [makeApiRequest]);

  const revokeInvitation = useCallback(async (invitationId: string): Promise<{success: boolean; message: string}> => {
    try { return await makeApiRequest('/api/farm/invitations/revoke', { invitationId }); }
    catch (error: any) { return { success: false, message: error.message || "Failed to revoke invitation."}; }
  }, [makeApiRequest]);

  const cancelSubscription = useCallback(async (): Promise<{success: boolean; message: string}> => {
    if (!user || !firebaseUser) return { success: false, message: "User not authenticated." };
    if (!user.stripeSubscriptionId && user.selectedPlanId === 'free') return { success: true, message: "You are already on the Free plan." };
    if (!user.stripeSubscriptionId && user.selectedPlanId !== 'free') {
        try {
            await updateDoc(doc(db, "users", user.uid), {
                selectedPlanId: 'free' as PlanId, subscriptionStatus: 'active' as SubscriptionStatus,
                roleOnCurrentFarm: 'free' as UserRole, stripeSubscriptionId: null, subscriptionCurrentPeriodEnd: null, updatedAt: serverTimestamp(),
            });
            await refreshUserData();
            toast({ title: "Plan Updated", description: "Your plan has been set to Free." });
            return { success: true, message: "Subscription plan updated to Free." };
        } catch (dbError) {
            console.error("Error updating user doc to free plan:", dbError);
            toast({ title: "Error", description: "Could not update your plan.", variant: "destructive"});
            return {success: false, message: "Could not update plan."};
        }
    }
    try {
      const response = await makeApiRequest('/api/billing/cancel-subscription', {});
      if(response.success) { await refreshUserData(); toast({ title: "Sub Cancellation Requested", description: response.message }); }
      else { toast({ title: "Cancellation Failed", description: response.message, variant: "destructive" }); }
      return response;
    } catch (error) {
        const message = error instanceof Error ? error.message : "Could not initiate cancellation.";
        toast({ title: "Error", description: message, variant: "destructive"});
        return { success: false, message };
    }
  }, [user, firebaseUser, makeApiRequest, toast, refreshUserData]);

  const updateUserPlan = useCallback(async (planId: PlanId): Promise<{success: boolean; message: string; sessionId?: string; error?: string}> => {
    if (!user) return { success: false, message: "User not authenticated." };
    if (planId === 'free') { 
      return user.selectedPlanId !== 'free' ? cancelSubscription() : { success: true, message: "You are already on the Free plan." };
    }
    try {
      const response = await makeApiRequest('/api/billing/create-checkout-session', { planId });
      return response.success && response.sessionId ? 
        { success: true, message: 'Checkout session created.', sessionId: response.sessionId } :
        { success: false, message: response.message || 'Failed to create session.', error: response.message };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not initiate plan change.";
      return { success: false, message, error: message };
    }
  }, [user, makeApiRequest, cancelSubscription]); 

  const updateUserSettings = useCallback(async (newSettings: Partial<UserSettings>): Promise<{success: boolean; message: string}> => {
    if (!user || !firebaseUser) return { success: false, message: "User not authenticated." };
    try {
      const userDocRef = doc(db, "users", user.uid);
      const currentDbSettings = (await getDoc(userDocRef)).data()?.settings || {};
      const mergedSettings = { ...currentDbSettings, ...newSettings,
        notificationPreferences: { ...(currentDbSettings.notificationPreferences || {}), ...(newSettings.notificationPreferences || {}) }
      };
      await updateDoc(userDocRef, { settings: mergedSettings, updatedAt: serverTimestamp() });
      await refreshUserData(); 
      return { success: true, message: "Settings updated." };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not update settings.";
      return { success: false, message };
    }
  }, [user, firebaseUser, refreshUserData]);

  useEffect(() => {
    const currentTheme = user?.settings?.theme;
    const root = window.document.documentElement;
    root.classList.remove("light", "dark");
    if (currentTheme === "system" || !currentTheme) {
      const systemTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
      root.classList.add(systemTheme);
    } else {
      root.classList.add(currentTheme);
    }
  }, [user?.settings?.theme]);

  const contextValue = React.useMemo(() => ({
    user, firebaseUser, isAuthenticated: !!user && !!firebaseUser, isLoading, 
    loginUser, registerUser, logoutUser, updateUserProfile, changeUserPassword,
    makeApiRequest, inviteStaffMemberByEmail, removeStaffMember, acceptInvitation,
    declineInvitation, revokeInvitation, refreshUserData, updateUserPlan,
    cancelSubscription, updateUserSettings,
  }), [
    user, firebaseUser, isLoading, loginUser, registerUser, logoutUser, updateUserProfile,
    changeUserPassword, makeApiRequest, inviteStaffMemberByEmail, removeStaffMember,
    acceptInvitation, declineInvitation, revokeInvitation, refreshUserData,
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
