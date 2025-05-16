
"use client";

import { useAuth, type PlanId, type User, type UserRole, type StaffMemberInFarmDoc, type StaffMemberWithDetails } from '@/contexts/auth-context';
import { PageHeader } from '@/components/layout/page-header';
import { Icons } from '@/components/icons';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button, buttonVariants } from '@/components/ui/button';
import Link from 'next/link';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useState, useEffect, useCallback } from 'react';
import { Separator } from '@/components/ui/separator';
import { db } from '@/lib/firebase';
import { doc, getDoc, collection, query, where, getDocs, Timestamp } from 'firebase/firestore';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const profileFormSchema = z.object({
  name: z.string().min(2, { message: "Name must be at least 2 characters." }),
  farmName: z.string().min(2, { message: "Farm name must be at least 2 characters." }),
  farmLatitude: z.preprocess(
    (val) => (val === "" || val === undefined || val === null ? undefined : Number(val)),
    z.number({invalid_type_error: "Latitude must be a number."}).min(-90).max(90).optional().nullable()
  ),
  farmLongitude: z.preprocess(
    (val) => (val === "" || val === undefined || val === null ? undefined : Number(val)),
    z.number({invalid_type_error: "Longitude must be a number."}).min(-180).max(180).optional().nullable()
  ),
});

const rolesForSelection: Exclude<UserRole, PlanId | null | 'owner'>[] = ['admin', 'editor', 'viewer'];

const inviteStaffFormSchema = z.object({
  staffEmail: z.string().email({ message: "Please enter a valid email address." }),
  role: z.enum(rolesForSelection, { required_error: "Please select a role for the staff member."}),
});

interface PendingInvitation {
  id: string; 
  inviterFarmId: string;
  inviterUid: string;
  inviterName?: string; 
  farmName?: string; 
  invitedEmail: string;
  invitedUserUid: string | null; 
  invitedRole: Exclude<UserRole, PlanId | null >;
  status: 'pending' | 'accepted' | 'declined' | 'revoked' | 'error_farm_not_found' | 'expired';
  createdAt: Timestamp;
  tokenExpiresAt?: Timestamp;
}

const planNames: Record<PlanId, string> = {
  free: "Hobbyist Farmer (Free)",
  pro: "Pro Farmer",
  agribusiness: "AgriBusiness",
};


export default function ProfilePage() {
  const { 
    user, 
    isLoading: authIsLoading, 
    updateUserProfile, 
    firebaseUser, 
    inviteStaffMemberByEmail, 
    removeStaffMember, 
    acceptInvitation, 
    declineInvitation, 
    revokeInvitation, 
    refreshUserData,
    cancelSubscription
  } = useAuth();
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [isSubmittingProfile, setIsSubmittingProfile] = useState(false);
  const [isInvitingStaff, setIsInvitingStaff] = useState(false);
  
  const [staffDetails, setStaffDetails] = useState<StaffMemberWithDetails[]>([]);
  const [isLoadingStaffDetails, setIsLoadingStaffDetails] = useState(false);

  const [myPendingInvitations, setMyPendingInvitations] = useState<PendingInvitation[]>([]);
  const [isLoadingMyInvitations, setIsLoadingMyInvitations] = useState(false);
  const [farmPendingInvitations, setFarmPendingInvitations] = useState<PendingInvitation[]>([]);
  const [isLoadingFarmInvitations, setIsLoadingFarmInvitations] = useState(false);

  const profileForm = useForm<z.infer<typeof profileFormSchema>>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: { name: "", farmName: "", farmLatitude: null, farmLongitude: null },
  });

  const inviteStaffForm = useForm<z.infer<typeof inviteStaffFormSchema>>({
    resolver: zodResolver(inviteStaffFormSchema),
    defaultValues: { staffEmail: "", role: 'viewer' },
  });

  useEffect(() => {
    if (user && isEditing) { // Only reset form when entering edit mode or user data changes
      profileForm.reset({
        name: user.name || "",
        farmName: user.farmName || "",
        farmLatitude: user.farmLatitude !== undefined ? user.farmLatitude : null,
        farmLongitude: user.farmLongitude !== undefined ? user.farmLongitude : null,
      });
    }
  }, [user, profileForm, isEditing]);

  const fetchStaffDetails = useCallback(async () => {
    if (!user?.isFarmOwner || !user.farmId || !user.staff || user.staff.length === 0) {
      setStaffDetails([]);
      return;
    }
    setIsLoadingStaffDetails(true);
    // user.staff already contains { uid, name, email, role } from AuthContext
    setStaffDetails(user.staff.filter(staffMember => staffMember.uid !== user.uid));
    setIsLoadingStaffDetails(false);
  }, [user]); 

  useEffect(() => {
    if (user?.isFarmOwner) { fetchStaffDetails(); } 
    else { setStaffDetails([]); }
  }, [user?.isFarmOwner, user?.staff, fetchStaffDetails]);


  const fetchMyPendingInvitations = useCallback(async () => {
    if (!user?.uid || !user.email) { setMyPendingInvitations([]); return; }
    setIsLoadingMyInvitations(true);
    try {
      const invites: PendingInvitation[] = [];
      // Query by invitedEmail first
      const qByEmail = query( collection(db, "pendingInvitations"),
        where("invitedEmail", "==", user.email.toLowerCase()),
        where("status", "==", "pending")
      );
      const emailSnapshot = await getDocs(qByEmail);
      emailSnapshot.docs.forEach(docSnap => {
        invites.push({ id: docSnap.id, ...docSnap.data() } as PendingInvitation);
      });
      // If user UID is known, also query by that (in case email changed post-invite, though less common)
      if (user.uid) {
          const qByUid = query( collection(db, "pendingInvitations"),
            where("invitedUserUid", "==", user.uid),
            where("status", "==", "pending")
          );
          const uidSnapshot = await getDocs(qByUid);
          uidSnapshot.docs.forEach(docSnap => {
            if (!invites.find(i => i.id === docSnap.id)) { // Avoid duplicates
                 invites.push({ id: docSnap.id, ...docSnap.data() } as PendingInvitation);
            }
          });
      }
      setMyPendingInvitations(invites.filter(invite => invite.tokenExpiresAt ? invite.tokenExpiresAt.toMillis() > Date.now() : true));
    } catch (error) {
      console.error("Error fetching user's pending invitations:", error);
      toast({ title: "Error", description: "Could not fetch your pending invitations.", variant: "destructive" });
    } finally {
      setIsLoadingMyInvitations(false);
    }
  }, [user?.uid, user?.email, toast]);

  useEffect(() => { fetchMyPendingInvitations(); }, [fetchMyPendingInvitations]);


  const fetchFarmPendingInvitations = useCallback(async () => {
    if (!user?.isFarmOwner || !user.farmId) { setFarmPendingInvitations([]); return; }
    setIsLoadingFarmInvitations(true);
    try {
      const q = query( collection(db, "pendingInvitations"),
        where("inviterFarmId", "==", user.farmId),
        where("status", "==", "pending")
      );
      const querySnapshot = await getDocs(q);
      const invites = querySnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as PendingInvitation))
        .filter(invite => invite.tokenExpiresAt ? invite.tokenExpiresAt.toMillis() > Date.now() : true);
      setFarmPendingInvitations(invites);
    } catch (error) {
      console.error("Error fetching farm's pending invitations:", error);
      toast({ title: "Error", description: "Could not fetch farm's pending invitations.", variant: "destructive" });
    } finally {
      setIsLoadingFarmInvitations(false);
    }
  }, [user?.isFarmOwner, user?.farmId, toast]);

  useEffect(() => { if (user?.isFarmOwner) { fetchFarmPendingInvitations(); } else { setFarmPendingInvitations([]); }
  }, [user?.isFarmOwner, user?.farmId, fetchFarmPendingInvitations]);


  async function onProfileSubmit(values: z.infer<typeof profileFormSchema>) {
    if (!user || !firebaseUser) return;
    setIsSubmittingProfile(true);
    try {
      await updateUserProfile(
        values.name, 
        values.farmName,
        values.farmLatitude,
        values.farmLongitude
      );
      toast({ title: "Profile Updated", description: "Your profile information has been successfully updated." });
      setIsEditing(false);
    } catch (error: any) {
      console.error("Profile update error:", error);
      toast({ title: "Update Failed", description: error.message || "Could not update profile.", variant: "destructive"});
    } finally {
      setIsSubmittingProfile(false);
    }
  }

  async function onInviteStaffSubmit(values: z.infer<typeof inviteStaffFormSchema>) {
    if (!user || !(user.isFarmOwner || user.roleOnCurrentFarm === 'admin') || !user.farmId) {
      toast({ title: "Permission Denied", description: "Only owners/admins can invite staff.", variant: "destructive" });
      return;
    }
    setIsInvitingStaff(true);
    const result = await inviteStaffMemberByEmail(values.staffEmail, values.role);
    toast({
      title: result.success ? "Invitation Logged" : "Invitation Failed",
      description: result.message,
      variant: result.success ? "default" : "destructive",
    });
    if (result.success) { inviteStaffForm.reset(); fetchFarmPendingInvitations(); }
    setIsInvitingStaff(false);
  }
  
  async function handleRemoveStaff(staffUid: string) {
    if (!user || !(user.isFarmOwner || user.roleOnCurrentFarm === 'admin') || !user.farmId ) {
      toast({ title: "Permission Denied", description: "Only owners/admins can remove staff.", variant: "destructive" });
      return;
    }
    const result = await removeStaffMember(staffUid);
     toast({ title: result.success ? "Staff Removed" : "Removal Failed", description: result.message, variant: result.success ? "default" : "destructive" });
    if (result.success) { await refreshUserData(); fetchStaffDetails(); fetchFarmPendingInvitations(); }
  }

  async function handleAcceptInvitation(invitationId: string) {
    if (!firebaseUser) return; 
    const result = await acceptInvitation(invitationId);
    toast({ title: result.success ? "Invitation Accepted!" : "Acceptance Failed", description: result.message, variant: result.success ? "default" : "destructive" });
    if (result.success) { await refreshUserData(); fetchMyPendingInvitations(); if (user?.isFarmOwner || user?.roleOnCurrentFarm === 'admin') fetchFarmPendingInvitations(); }
  }

  async function handleDeclineInvitation(invitationId: string) {
    if (!firebaseUser) return;
    const result = await declineInvitation(invitationId);
     toast({ title: result.success ? "Invitation Declined" : "Decline Failed", description: result.message, variant: result.success ? "default" : "destructive" });
    if (result.success) { fetchMyPendingInvitations(); }
  }

  async function handleRevokeInvitation(invitationId: string) {
    if (!firebaseUser || !(user?.isFarmOwner || user?.roleOnCurrentFarm === 'admin')) return;
    const result = await revokeInvitation(invitationId);
    toast({ title: result.success ? "Invitation Revoked" : "Revoke Failed", description: result.message, variant: result.success ? "default" : "destructive" });
    if (result.success) { fetchFarmPendingInvitations(); }
  }

  const userRoleDisplay = user?.roleOnCurrentFarm 
    ? (planNames[user.roleOnCurrentFarm as PlanId] || (user.roleOnCurrentFarm.charAt(0).toUpperCase() + user.roleOnCurrentFarm.slice(1)))
    : 'Not associated';

  const canManageStaff = user?.isFarmOwner || user?.roleOnCurrentFarm === 'admin';
  const canManageBilling = user?.isFarmOwner;

  if (authIsLoading) { /* Skeleton UI */ }
  if (!user) { /* Not found UI */ }
  
  return (
    <div className="space-y-6">
      <PageHeader title="User Profile" description="Manage your account, farm, staff, and subscription." icon={Icons.UserCircle}/>
      <Card className="shadow-lg">
        <CardHeader>
          <div className="flex justify-between items-start">
            <div>
              <CardTitle>{profileForm.getValues('name') || user.name || 'N/A'}</CardTitle>
              <CardDescription>{user.email || 'No email'}</CardDescription>
               {user.farmName && <p className="text-sm text-muted-foreground mt-1">Farm: <span className="font-medium text-foreground">{user.farmName}</span> ({userRoleDisplay})</p>}
               {user.farmId && <p className="text-xs text-muted-foreground">Farm ID: {user.farmId}</p>}
            </div>
            {!isEditing && <Button variant="outline" onClick={() => setIsEditing(true)}><Icons.Edit3 className="mr-2 h-4 w-4" /> Edit Profile</Button>}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {isEditing ? (
            <Form {...profileForm}>
              <form onSubmit={profileForm.handleSubmit(onProfileSubmit)} className="space-y-6">
                <FormField control={profileForm.control} name="name" render={({ field }) => (
                  <FormItem><FormLabel>Full Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )}/>
                {user.isFarmOwner && (
                  <>
                    <FormField control={profileForm.control} name="farmName" render={({ field }) => (
                      <FormItem><FormLabel>Farm Name (as Owner)</FormLabel><FormControl><Input {...field} /></FormControl><FormDescription>Only owners can change farm name.</FormDescription><FormMessage /></FormItem>
                    )}/>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField control={profileForm.control} name="farmLatitude" render={({ field }) => (
                          <FormItem><FormLabel>Farm Latitude (Optional)</FormLabel><FormControl><Input type="number" step="any" placeholder="e.g., 45.4215" {...field} value={field.value ?? ''} /></FormControl><FormDescription>For localized weather. Approx. center.</FormDescription><FormMessage /></FormItem>
                        )}/>
                        <FormField control={profileForm.control} name="farmLongitude" render={({ field }) => (
                          <FormItem><FormLabel>Farm Longitude (Optional)</FormLabel><FormControl><Input type="number" step="any" placeholder="e.g., -75.6972" {...field} value={field.value ?? ''} /></FormControl><FormDescription>For localized weather. Approx. center.</FormDescription><FormMessage /></FormItem>
                        )}/>
                    </div>
                  </>
                )}
                <div className="flex gap-2">
                  <Button type="submit" disabled={isSubmittingProfile}>{isSubmittingProfile ? <><Icons.Search className="mr-2 h-4 w-4 animate-spin" /> Saving...</> : "Save Changes"}</Button>
                  <Button variant="ghost" onClick={() => {setIsEditing(false); profileForm.reset({ name: user.name || "", farmName: user.farmName || "", farmLatitude: user.farmLatitude ?? null, farmLongitude: user.farmLongitude ?? null });}} disabled={isSubmittingProfile}>Cancel</Button>
                </div>
              </form>
            </Form>
          ) : (
            <div><h3 className="text-sm font-medium text-muted-foreground">Role on Farm</h3><p className="text-lg text-foreground">{userRoleDisplay}</p></div>
          )}
        </CardContent>
      </Card>

      {canManageBilling && user.selectedPlanId && (
        <Card className="shadow-lg">
          <CardHeader><CardTitle>Subscription Plan</CardTitle><CardDescription>Manage AgriAssist subscription.</CardDescription></CardHeader>
          <CardContent className="space-y-3">
              <div><h3 className="text-sm font-medium text-muted-foreground">Current Plan</h3><p className="text-lg font-semibold text-primary">{planNames[user.selectedPlanId] || 'Unknown'}</p></div>
              <div><h3 className="text-sm font-medium text-muted-foreground">Status</h3><p className="text-lg text-foreground capitalize">{user.subscriptionStatus}</p></div>
              {user.selectedPlanId !== 'free' && user.subscriptionStatus === 'active' && (
                  <AlertDialog>
                      <AlertDialogTrigger asChild><Button variant="outline"><Icons.XCircle className="mr-2 h-4 w-4"/> Cancel Subscription</Button></AlertDialogTrigger>
                      <AlertDialogContent>
                          <AlertDialogHeader><AlertDialogTitle>Are you sure?</AlertDialogTitle><AlertDialogDescription>This will cancel your paid subscription. Your plan will revert to Free.</AlertDialogDescription></AlertDialogHeader>
                          <AlertDialogFooter>
                          <AlertDialogCancel>No, Keep Plan</AlertDialogCancel>
                          <AlertDialogAction onClick={async () => { if (!firebaseUser) return; const res = await cancelSubscription(); toast({title: res.success ? "Sub Cancelled" : "Cancel Failed", description: res.message, variant: res.success ? "default" : "destructive"}); if (res.success) refreshUserData();}} className={buttonVariants({variant: "destructive"})}>Yes, Cancel</AlertDialogAction>
                          </AlertDialogFooter>
                      </AlertDialogContent>
                  </AlertDialog>
              )}
              <Button asChild><Link href="/pricing"><Icons.Dollar className="mr-2 h-4 w-4" />{user.selectedPlanId === 'free' ? 'Upgrade Plan' : 'View Plans & Manage'}</Link></Button>
          </CardContent>
        </Card>
      )}

      <Card className="shadow-lg">
        <CardHeader><CardTitle>My Pending Invitations</CardTitle><CardDescription>Invitations to join other farms.</CardDescription></CardHeader>
        <CardContent>
          {isLoadingMyInvitations ? <Skeleton className="h-20 w-full" /> : myPendingInvitations.length > 0 ? (
            <ul className="space-y-3">{myPendingInvitations.map(invite => (
                <li key={invite.id} className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-3 border rounded-md bg-muted/50 gap-2">
                  <div><p className="font-medium">To join <span className="text-primary">{invite.farmName || 'Unnamed Farm'}</span> as <span className="font-semibold capitalize">{invite.invitedRole}</span></p><p className="text-sm text-muted-foreground">Invited by: {invite.inviterName || 'Farm Owner'} (Sent: {invite.createdAt?.toDate().toLocaleDateString()})</p></div>
                  <div className="flex gap-2 mt-2 sm:mt-0 shrink-0">
                    <Button size="sm" onClick={() => handleAcceptInvitation(invite.id)} disabled={user.farmId === invite.inviterFarmId}><Icons.CheckCircle2 className="mr-2 h-4 w-4" /> Accept</Button>
                    <Button variant="outline" size="sm" onClick={() => handleDeclineInvitation(invite.id)}><Icons.XCircle className="mr-2 h-4 w-4" /> Decline</Button>
                  </div>
                </li>))}
            </ul>
          ) : (<Alert><Icons.Info className="h-4 w-4" /><AlertTitle>No Pending Invitations</AlertTitle><AlertDescription>You have no pending invitations.</AlertDescription></Alert>)}
        </CardContent>
      </Card>

      {canManageStaff && user.farmId && (
        <Card className="shadow-lg">
          <CardHeader><CardTitle>Farm Management</CardTitle><CardDescription>Manage farm staff and settings.</CardDescription></CardHeader>
          <CardContent className="space-y-6">
            <Form {...inviteStaffForm}>
              <form onSubmit={inviteStaffForm.handleSubmit(onInviteStaffSubmit)} className="space-y-4">
                <h3 className="text-md font-medium">Invite New Staff Member</h3>
                 <div className="grid grid-cols-1 sm:grid-cols-[2fr_1fr_auto] gap-2 items-end">
                  <FormField control={inviteStaffForm.control} name="staffEmail" render={({ field }) => (<FormItem><FormLabel>Staff Email</FormLabel><FormControl><Input type="email" {...field} /></FormControl><FormMessage /></FormItem>)}/>
                  <FormField control={inviteStaffForm.control} name="role" render={({ field }) => (<FormItem><FormLabel>Assign Role</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select role" /></SelectTrigger></FormControl><SelectContent>{rolesForSelection.map(rVal => (<SelectItem key={rVal} value={rVal} className="capitalize">{rVal}</SelectItem>))}</SelectContent></Select><FormMessage /></FormItem>)}/>
                  <Button type="submit" disabled={isInvitingStaff} className="self-end">{isInvitingStaff ? <><Icons.Search className="mr-2 h-4 w-4 animate-spin"/> Logging...</> : "Log Invitation"}</Button>
                </div>
                <Alert><Icons.Info className="h-4 w-4" /><AlertTitle>Invitation Process</AlertTitle><AlertDescription>An email will be sent with an acceptance link. User needs an AgriAssist account with that email.</AlertDescription></Alert>
              </form>
            </Form>
            <Separator />
            <div><h3 className="text-md font-medium mb-2">Current Staff ({staffDetails.length})</h3>
              {isLoadingStaffDetails ? <Skeleton className="h-20 w-full" /> : staffDetails.length > 0 ? (
                <ul className="space-y-2">{staffDetails.map(staff => (
                  <li key={staff.uid} className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-3 border rounded-md bg-muted/50 gap-2">
                    <div><p className="font-medium">{staff.name} <span className="text-xs text-muted-foreground capitalize">({staff.role})</span></p><p className="text-sm text-muted-foreground">{staff.email}</p></div>
                     <AlertDialog>
                      <AlertDialogTrigger asChild><Button variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10"><Icons.Trash2 className="mr-1 h-4 w-4"/>Remove</Button></AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader><AlertDialogTitle>Remove {staff.name}?</AlertDialogTitle><AlertDialogDescription>This will remove {staff.name} from staff. They'll be reassigned to personal farm space. Cannot be undone.</AlertDialogDescription></AlertDialogHeader>
                        <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => handleRemoveStaff(staff.uid)} className={buttonVariants({variant: "destructive"})}>Confirm</AlertDialogAction></AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </li>))}
                </ul>) : (<Alert><Icons.Info className="h-4 w-4" /><AlertTitle>No Staff Members</AlertTitle><AlertDescription>No staff added yet.</AlertDescription></Alert>)}
            </div>
             <Separator />
             <div><h3 className="text-md font-medium mb-2">Farm's Pending Invites ({farmPendingInvitations.length})</h3>
                {isLoadingFarmInvitations ? <Skeleton className="h-20 w-full"/> : farmPendingInvitations.length > 0 ? (
                     <ul className="space-y-3">{farmPendingInvitations.map(invite => (
                          <li key={invite.id} className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-3 border rounded-md bg-muted/50 gap-2">
                            <div><p className="font-medium">To: <span className="text-primary">{invite.invitedEmail}</span> as <span className="font-semibold capitalize">{invite.invitedRole}</span></p><p className="text-xs text-muted-foreground">Status: {invite.status} (Sent: {invite.createdAt?.toDate().toLocaleDateString()}) {invite.tokenExpiresAt && `Expires: ${invite.tokenExpiresAt.toDate().toLocaleDateString()}`}</p></div>
                            <Button variant="outline" size="sm" onClick={() => handleRevokeInvitation(invite.id)}><Icons.XCircle className="mr-2 h-4 w-4" /> Revoke</Button>
                          </li>))}
                      </ul>) : (<Alert><Icons.Info className="h-4 w-4" /><AlertTitle>No Pending Invites Sent</AlertTitle><AlertDescription>No pending invites sent by your farm.</AlertDescription></Alert>)}
             </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
