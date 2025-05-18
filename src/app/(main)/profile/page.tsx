
"use client";

import { useAuth, type PlanId, type User, type StaffRole, type StaffMemberWithDetails, type PendingInvitation } from '@/contexts/auth-context';
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
import { doc, getDoc, collection, query, where, getDocs, Timestamp, orderBy } from 'firebase/firestore';
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
  farmName: z.string().optional(),
  farmLatitude: z.preprocess(
    (val) => (val === "" || val === undefined || val === null ? null : parseFloat(String(val))),
    z.number({invalid_type_error: "Latitude must be a number or empty."}).min(-90).max(90).optional().nullable()
  ),
  farmLongitude: z.preprocess(
    (val) => (val === "" || val === undefined || val === null ? null : parseFloat(String(val))),
    z.number({invalid_type_error: "Longitude must be a number or empty."}).min(-180).max(180).optional().nullable()
  ),
}).refine(data => {
  if (data.farmName !== undefined && data.farmName !== null && data.farmName.trim() !== "") { // Check for non-empty farmName
    return data.farmName.trim().length >= 2;
  }
  return true;
}, {
  message: "Farm name must be at least 2 characters if provided.",
  path: ["farmName"],
});


const staffRolesForSelection: StaffRole[] = ['admin', 'editor', 'viewer'];

const inviteStaffFormSchema = z.object({
  staffEmail: z.string().email({ message: "Please enter a valid email address." }),
  role: z.enum(staffRolesForSelection, { required_error: "Please select a role for the staff member."}),
});


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
    updateStaffRole,
    // acceptInvitation, // Not used directly on this page for user's own invites
    // declineInvitation, // Not used directly on this page for user's own invites
    revokeInvitation,
    refreshUserData,
    cancelSubscription,
    // For clarity, explicitly get these for the profile page's own "My Pending Invitations"
    acceptInvitation: acceptMyInvitation,
    declineInvitation: declineMyInvitation,

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
    if (user && (isEditing || !profileForm.formState.isDirty)) {
      profileForm.reset({
        name: user.name || "",
        farmName: user.isFarmOwner ? (user.farmName || "") : undefined, // Only show/set farmName if owner
        farmLatitude: user.isFarmOwner ? (user.farmLatitude ?? null) : null,
        farmLongitude: user.isFarmOwner ? (user.farmLongitude ?? null) : null,
      });
    }
  }, [user, profileForm, isEditing]);

  const fetchStaffDetails = useCallback(async () => {
    if (!user?.farmId || (!user.isFarmOwner && user.roleOnCurrentFarm !== 'admin')) {
      setStaffDetails([]);
      return;
    }
    setIsLoadingStaffDetails(true);
    try {
        if (user.staffMembers) { // staffMembers now includes role, name, email
             setStaffDetails(user.staffMembers.filter(staff => staff.uid !== user.uid)); // Exclude owner from staff list
        } else {
            setStaffDetails([]);
        }
    } catch (error) {
        console.error("Error setting staff details from context:", error);
        toast({ title: "Error", description: "Could not load staff details.", variant: "destructive" });
        setStaffDetails([]);
    } finally {
        setIsLoadingStaffDetails(false);
    }
  }, [user, toast]);

  useEffect(() => {
    if (user?.farmId && (user.isFarmOwner || user.roleOnCurrentFarm === 'admin')) { fetchStaffDetails(); }
    else { setStaffDetails([]); }
  }, [user?.farmId, user?.isFarmOwner, user?.roleOnCurrentFarm, user?.staffMembers, fetchStaffDetails]);


  const fetchMyPendingInvitations = useCallback(async () => {
    if (!firebaseUser?.email) { setMyPendingInvitations([]); return; }
    setIsLoadingMyInvitations(true);
    try {
      const q = query(
        collection(db, "pendingInvitations"),
        where("invitedEmail", "==", firebaseUser.email.toLowerCase()),
        where("status", "==", "pending"),
        orderBy("createdAt", "desc")
      );
      const querySnapshot = await getDocs(q);
      const invites = querySnapshot.docs
        .map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as PendingInvitation))
        .filter(invite => !invite.tokenExpiresAt || invite.tokenExpiresAt.toMillis() > Date.now()); // Filter out expired tokens client-side too
      setMyPendingInvitations(invites);
    } catch (error) {
      console.error("Error fetching user's pending invitations:", error);
      toast({ title: "Error", description: "Could not fetch your pending invitations.", variant: "destructive" });
    } finally {
      setIsLoadingMyInvitations(false);
    }
  }, [firebaseUser?.email, toast]);

  useEffect(() => { fetchMyPendingInvitations(); }, [fetchMyPendingInvitations]);


  const fetchFarmPendingInvitations = useCallback(async () => {
    if (!user?.farmId || (!user.isFarmOwner && user.roleOnCurrentFarm !== 'admin')) {
      setFarmPendingInvitations([]); return;
    }
    setIsLoadingFarmInvitations(true);
    try {
      const q = query( collection(db, "pendingInvitations"),
        where("inviterFarmId", "==", user.farmId),
        where("status", "==", "pending"),
        orderBy("createdAt", "desc")
      );
      const querySnapshot = await getDocs(q);
      const invites = querySnapshot.docs
        .map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as PendingInvitation))
        .filter(invite => !invite.tokenExpiresAt || invite.tokenExpiresAt.toMillis() > Date.now());
      setFarmPendingInvitations(invites);
    } catch (error) {
      console.error("Error fetching farm's pending invitations:", error);
      toast({ title: "Error", description: "Could not fetch farm's pending invitations.", variant: "destructive" });
    } finally {
      setIsLoadingFarmInvitations(false);
    }
  }, [user?.isFarmOwner, user?.roleOnCurrentFarm, user?.farmId, toast]);

  useEffect(() => {
    if (user?.farmId && (user.isFarmOwner || user.roleOnCurrentFarm === 'admin')) {
      fetchFarmPendingInvitations();
    } else {
      setFarmPendingInvitations([]);
    }
  }, [user?.isFarmOwner, user?.roleOnCurrentFarm, user?.farmId, fetchFarmPendingInvitations]);


  async function onProfileSubmit(values: z.infer<typeof profileFormSchema>) {
    if (!user || !firebaseUser) return;
    setIsSubmittingProfile(true);
    try {
      const nameUpdate = values.name;
      let farmNameUpdate: string | null = null;
      let latUpdate: number | null = null;
      let lonUpdate: number | null = null;

      if (user.isFarmOwner) {
        farmNameUpdate = values.farmName?.trim() ? values.farmName.trim() : null; // Send null if empty to potentially clear
        latUpdate = (values.farmLatitude === null || isNaN(values.farmLatitude as number)) ? null : Number(values.farmLatitude);
        lonUpdate = (values.farmLongitude === null || isNaN(values.farmLongitude as number)) ? null : Number(values.farmLongitude);
      }

      await updateUserProfile(
        nameUpdate,
        user.isFarmOwner ? farmNameUpdate : undefined, // Pass undefined if not owner to prevent attempt to update farm name
        user.isFarmOwner ? latUpdate : undefined,
        user.isFarmOwner ? lonUpdate : undefined
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
     if (user.roleOnCurrentFarm === 'admin' && values.role === 'admin') {
      toast({ title: "Permission Denied", description: "Admins cannot invite other users as admins.", variant: "destructive" });
      return;
    }
    setIsInvitingStaff(true);
    const result = await inviteStaffMemberByEmail(values.staffEmail, values.role);
    toast({
      title: result.success ? "Invitation Logged" : "Invitation Failed",
      description: result.message,
      variant: result.success ? "default" : "destructive",
    });
    if (result.success) {
      inviteStaffForm.reset();
      fetchFarmPendingInvitations(); // Refresh the list of farm's pending invites
    }
    setIsInvitingStaff(false);
  }

  async function handleRemoveStaff(staffUid: string) {
    if (!user || !(user.isFarmOwner || user.roleOnCurrentFarm === 'admin') || !user.farmId ) {
      toast({ title: "Permission Denied", description: "Only owners/admins can remove staff.", variant: "destructive" });
      return;
    }
    const targetStaffMember = staffDetails.find(s => s.uid === staffUid);
    if (user.roleOnCurrentFarm === 'admin' && targetStaffMember?.role === 'admin') {
        toast({ title: "Permission Denied", description: "Admins cannot remove other admins.", variant: "destructive" });
        return;
    }

    const result = await removeStaffMember(staffUid);
     toast({ title: result.success ? "Staff Removed" : "Removal Failed", description: result.message, variant: result.success ? "default" : "destructive" });
    if (result.success) {
        await refreshUserData(); // Refresh all user data, which includes staff list for owner
        fetchStaffDetails(); // Explicitly re-fetch staff details for UI update
        fetchFarmPendingInvitations(); // Also refresh pending in case related
    }
  }

  async function handleUpdateStaffRole(staffUid: string, newRole: StaffRole) {
    if (!user || !(user.isFarmOwner || user.roleOnCurrentFarm === 'admin') || !user.farmId ) {
        toast({ title: "Permission Denied", description: "Only owners/admins can change staff roles.", variant: "destructive" });
        return;
    }
    const staffToUpdate = staffDetails.find(s => s.uid === staffUid);
    if (!staffToUpdate) {
        toast({ title: "Error", description: "Staff member not found.", variant: "destructive" });
        return;
    }

    if (user.roleOnCurrentFarm === 'admin' && (staffToUpdate.role === 'admin' || newRole === 'admin')) {
        toast({ title: "Permission Denied", description: "Admins cannot modify other admin roles or promote to admin.", variant: "destructive" });
        return;
    }

    const result = await updateStaffRole(staffUid, newRole);
    toast({ title: result.success ? "Role Updated" : "Update Failed", description: result.message, variant: result.success ? "default" : "destructive"});
    if (result.success) {
        await refreshUserData(); // Refresh user data to get updated staff list with roles
        fetchStaffDetails(); // Explicitly re-fetch staff details
    }
  }

  async function handleAcceptMyInvitation(invitationId: string) {
    if (!firebaseUser) return;
    const result = await acceptMyInvitation(invitationId); 
    toast({ title: result.success ? "Invitation Accepted!" : "Acceptance Failed", description: result.message, variant: result.success ? "default" : "destructive" });
    if (result.success) {
      await refreshUserData(); // Crucial to update farmId, roleOnCurrentFarm, etc.
      fetchMyPendingInvitations(); // Refresh list of my invites
      fetchStaffDetails(); // If owner, their staff list might change if they were invited to another farm and accepted.
      fetchFarmPendingInvitations(); // If owner, their farm invites might change.
    }
  }

  async function handleDeclineMyInvitation(invitationId: string) {
    if (!firebaseUser) return;
    const result = await declineMyInvitation(invitationId);
     toast({ title: result.success ? "Invitation Declined" : "Decline Failed", description: result.message, variant: result.success ? "default" : "destructive" });
    if (result.success) { fetchMyPendingInvitations(); }
  }

  async function handleRevokeFarmInvitation(invitationId: string) {
    if (!firebaseUser || !(user?.isFarmOwner || user?.roleOnCurrentFarm === 'admin')) return;
    const result = await revokeInvitation(invitationId);
    toast({ title: result.success ? "Invitation Revoked" : "Revoke Failed", description: result.message, variant: result.success ? "default" : "destructive" });
    if (result.success) { fetchFarmPendingInvitations(); }
  }

  const userRoleDisplay = user?.roleOnCurrentFarm
    ? (planNames[user.roleOnCurrentFarm as PlanId] || (user.isFarmOwner ? planNames[user.selectedPlanId] : (user.roleOnCurrentFarm.charAt(0).toUpperCase() + user.roleOnCurrentFarm.slice(1))) )
    : 'Not associated';

  const canManageStaff = user?.isFarmOwner || user?.roleOnCurrentFarm === 'admin';
  const canManageBilling = user?.isFarmOwner;


  if (authIsLoading || (!user && !authIsLoading)) {
    return (
      <div className="space-y-6">
        <PageHeader title="User Profile" description="Manage your account, farm, staff, and subscription." icon={Icons.UserCircle}/>
        <Card><CardHeader><Skeleton className="h-8 w-1/2" /></CardHeader><CardContent><Skeleton className="h-20 w-full" /></CardContent></Card>
        <Card><CardHeader><Skeleton className="h-6 w-1/3" /></CardHeader><CardContent><Skeleton className="h-20 w-full" /></CardContent></Card>
      </div>
    );
  }
  if (!user) {
     return <div className="text-center p-8">User not found. Please log in.</div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader title="User Profile" description="Manage your account, farm, staff, and subscription." icon={Icons.UserCircle}/>
      <Card className="shadow-lg">
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center">
            <div>
              <CardTitle>{isEditing && profileForm.getValues('name') ? profileForm.getValues('name') : user.name || 'N/A'}</CardTitle>
              <CardDescription>{user.email || 'No email'}</CardDescription>
               {user.farmName && <p className="text-sm text-muted-foreground mt-1">Farm: <span className="font-medium text-foreground">{isEditing && user.isFarmOwner && profileForm.getValues('farmName') ? profileForm.getValues('farmName') : user.farmName}</span></p>}
               {user.farmId && <p className="text-xs text-muted-foreground">Farm ID: {user.farmId}</p>}
               <p className="text-sm text-muted-foreground">Role on Farm: <span className="font-medium text-foreground">{userRoleDisplay}</span></p>
            </div>
            {!isEditing && <Button variant="outline" onClick={() => setIsEditing(true)} className="mt-2 sm:mt-0"><Icons.Edit3 className="mr-2 h-4 w-4" /> Edit Profile</Button>}
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
                      <FormItem><FormLabel>Farm Name</FormLabel><FormControl><Input {...field} value={field.value || ""} /></FormControl>
                      <FormDescription>Only owners can change the farm name.</FormDescription><FormMessage /></FormItem>
                    )}/>
                    <h3 className="text-md font-medium pt-2">Farm Location (Optional)</h3>
                    <p className="text-sm text-muted-foreground">Used for localized weather on dashboard. Leave blank to clear.</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField control={profileForm.control} name="farmLatitude" render={({ field }) => (
                        <FormItem><FormLabel>Latitude</FormLabel><FormControl><Input type="number" step="any" placeholder="e.g., 45.4215" {...field} value={field.value === null ? '' : String(field.value)} /></FormControl><FormMessage /></FormItem>
                        )}/>
                        <FormField control={profileForm.control} name="farmLongitude" render={({ field }) => (
                        <FormItem><FormLabel>Longitude</FormLabel><FormControl><Input type="number" step="any" placeholder="e.g., -75.6972" {...field} value={field.value === null ? '' : String(field.value)} /></FormControl><FormMessage /></FormItem>
                        )}/>
                    </div>
                  </>
                )}
                <div className="flex gap-2">
                  <Button type="submit" disabled={isSubmittingProfile}>{isSubmittingProfile ? <><Icons.Search className="mr-2 h-4 w-4 animate-spin" /> Saving...</> : "Save Changes"}</Button>
                  <Button variant="ghost" onClick={() => {
                      setIsEditing(false);
                      profileForm.reset({
                          name: user.name || "",
                          farmName: user.isFarmOwner ? (user.farmName || "") : undefined,
                          farmLatitude: user.isFarmOwner ? (user.farmLatitude ?? null) : null,
                          farmLongitude: user.isFarmOwner ? (user.farmLongitude ?? null) : null,
                      });
                    }} disabled={isSubmittingProfile}>Cancel</Button>
                </div>
              </form>
            </Form>
          ) : (
            <div>
              {user.farmId && user.roleOnCurrentFarm ? (
                <p className="text-sm">You are currently associated with farm: <span className="font-semibold">{user.farmName || user.farmId}</span> as <span className="font-semibold capitalize">{userRoleDisplay}</span>.</p>
              ) : (
                <Alert variant="default">
                  <Icons.Info className="h-4 w-4" />
                  <AlertTitle>No Farm Association</AlertTitle>
                  <AlertDescription>You are not currently associated with a farm. If you were invited, check "My Pending Invitations" below or register your own farm.</AlertDescription>
                </Alert>
              )}
               {user.isFarmOwner && user.farmLatitude !== undefined && user.farmLatitude !== null && user.farmLongitude !== undefined && user.farmLongitude !== null && (
                <p className="text-sm mt-2">Farm Location: Lat {user.farmLatitude?.toFixed(4)}, Lon {user.farmLongitude?.toFixed(4)}</p>
              )}
            </div>
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
                          <AlertDialogHeader><AlertDialogTitle>Are you sure?</AlertDialogTitle><AlertDialogDescription>This will cancel your paid subscription. Your plan will revert to Free at the end of the current billing period.</AlertDialogDescription></AlertDialogHeader>
                          <AlertDialogFooter>
                          <AlertDialogCancel>No, Keep Plan</AlertDialogCancel>
                          <AlertDialogAction onClick={async () => { if (!firebaseUser) return; const res = await cancelSubscription(); toast({title: res.success ? "Subscription Cancellation Initiated" : "Cancellation Failed", description: res.message, variant: res.success ? "default" : "destructive"}); if (res.success) refreshUserData();}} className={buttonVariants({variant: "destructive"})}>Yes, Cancel Subscription</AlertDialogAction>
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
                  <div>
                    <p className="font-medium">To join <span className="text-primary">{invite.farmName || 'Unnamed Farm'}</span> as <span className="font-semibold capitalize">{invite.invitedRole}</span></p>
                    <p className="text-sm text-muted-foreground">Invited by: {invite.inviterName || 'Farm Owner'} (Sent: {invite.createdAt?.toDate ? format(invite.createdAt.toDate(), 'MMM dd, yyyy') : 'N/A'}) {invite.tokenExpiresAt && `Expires: ${invite.tokenExpiresAt.toDate().toLocaleDateString()}`}</p>
                  </div>
                  <div className="flex gap-2 mt-2 sm:mt-0 shrink-0">
                    <Button 
                        size="sm" 
                        onClick={() => handleAcceptMyInvitation(invite.id)} 
                        disabled={user.farmId === invite.inviterFarmId || (user.isFarmOwner && user.farmId !== null && user.farmId !== undefined && user.farmId !== invite.inviterFarmId)}
                        title={user.farmId === invite.inviterFarmId ? "You are already part of this farm." : (user.isFarmOwner && user.farmId !== null && user.farmId !== undefined && user.farmId !== invite.inviterFarmId ? "You own another farm. Leave or delete it first." : "Accept Invitation")}
                    >
                        <Icons.CheckCircle2 className="mr-2 h-4 w-4" /> Accept
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => handleDeclineMyInvitation(invite.id)}><Icons.XCircle className="mr-2 h-4 w-4" /> Decline</Button>
                  </div>
                </li>))}
            </ul>
          ) : (<Alert><Icons.Info className="h-4 w-4" /><AlertTitle>No Pending Invitations</AlertTitle><AlertDescription>You have no pending invitations to join other farms.</AlertDescription></Alert>)}
        </CardContent>
      </Card>

      {canManageStaff && user.farmId && (
        <Card className="shadow-lg">
          <CardHeader><CardTitle>Farm Staff Management</CardTitle><CardDescription>Manage staff access for farm: <span className="font-semibold">{user.farmName || user.farmId}</span></CardDescription></CardHeader>
          <CardContent className="space-y-6">
            <Form {...inviteStaffForm}>
              <form onSubmit={inviteStaffForm.handleSubmit(onInviteStaffSubmit)} className="space-y-4">
                <h3 className="text-md font-medium">Invite New Staff Member</h3>
                 <div className="grid grid-cols-1 sm:grid-cols-[2fr_1fr_auto] gap-2 items-end">
                  <FormField control={inviteStaffForm.control} name="staffEmail" render={({ field }) => (<FormItem><FormLabel>Staff Email</FormLabel><FormControl><Input type="email" {...field} /></FormControl><FormMessage /></FormItem>)}/>
                  <FormField control={inviteStaffForm.control} name="role" render={({ field }) => (<FormItem><FormLabel>Assign Role</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Select role" /></SelectTrigger></FormControl>
                        <SelectContent>
                            {staffRolesForSelection.map(rVal => (
                                <SelectItem
                                    key={rVal}
                                    value={rVal}
                                    className="capitalize"
                                    disabled={user.roleOnCurrentFarm === 'admin' && rVal === 'admin'} // Admin cannot invite another admin
                                >
                                    {rVal.charAt(0).toUpperCase() + rVal.slice(1)}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <FormMessage /></FormItem>)}/>
                  <Button type="submit" disabled={isInvitingStaff} className="self-end">{isInvitingStaff ? <><Icons.Search className="mr-2 h-4 w-4 animate-spin"/> Logging Invite...</> : "Log Invitation Request"}</Button>
                </div>
                <Alert><Icons.Info className="h-4 w-4" /><AlertTitle>Invitation Process</AlertTitle><AlertDescription>An email will be sent with an acceptance link. The user needs an AgriAssist account (or to create one) with the invited email address. The link is valid for 7 days.</AlertDescription></Alert>
              </form>
            </Form>
            <Separator />
            <div><h3 className="text-md font-medium mb-2">Current Staff ({staffDetails.length})</h3>
              {isLoadingStaffDetails ? <Skeleton className="h-20 w-full" /> : staffDetails.length > 0 ? (
                <ul className="space-y-2">{staffDetails.map(staff => (
                  <li key={staff.uid} className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-3 border rounded-md bg-muted/50 gap-2">
                    <div>
                        <p className="font-medium">{staff.name || staff.uid} <span className="text-xs text-muted-foreground capitalize">({staff.role})</span></p>
                        <p className="text-sm text-muted-foreground">{staff.email}</p>
                    </div>
                    <div className="flex items-center gap-2 mt-2 sm:mt-0">
                        <Select
                            value={staff.role}
                            onValueChange={async (newRole) => {
                                const roleToUpdate = newRole as StaffRole;
                                if (window.confirm(`Are you sure you want to change ${staff.name || staff.email}'s role to ${roleToUpdate}?`)) {
                                  handleUpdateStaffRole(staff.uid, roleToUpdate);
                                }
                            }}
                            disabled={
                                staff.uid === user.uid || // Cannot change own role
                                (user.roleOnCurrentFarm === 'admin' && staff.role === 'admin') || // Admin cannot modify another admin
                                (!user.isFarmOwner && user.roleOnCurrentFarm !== 'admin') // Editor/Viewer cannot change roles
                            }
                        >
                            <SelectTrigger className="w-[120px] h-8 text-xs">
                                <SelectValue placeholder="Change role" />
                            </SelectTrigger>
                            <SelectContent>
                                {staffRolesForSelection.map(rVal => (
                                    <SelectItem
                                        key={rVal}
                                        value={rVal}
                                        className="capitalize text-xs"
                                        disabled={
                                            (user.roleOnCurrentFarm === 'admin' && rVal === 'admin') // Admin cannot promote to admin
                                        }
                                    >
                                        {rVal.charAt(0).toUpperCase() + rVal.slice(1)}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <AlertDialog>
                          <AlertDialogTrigger asChild><Button variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10 h-8 px-2"
                            disabled={
                                staff.uid === user.uid || 
                                (user.roleOnCurrentFarm === 'admin' && staff.role === 'admin')
                            }
                          ><Icons.Trash2 className="mr-1 h-3 w-3"/>Remove</Button></AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader><AlertDialogTitle>Remove {staff.name || 'this staff member'}?</AlertDialogTitle><AlertDialogDescription>This will remove their access to this farm. They will be reassigned to their own personal farm space. This action cannot be undone.</AlertDialogDescription></AlertDialogHeader>
                            <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => handleRemoveStaff(staff.uid)} className={buttonVariants({variant: "destructive"})}>Confirm Removal</AlertDialogAction></AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                    </div>
                  </li>))}
                </ul>) : (<Alert><Icons.Info className="h-4 w-4" /><AlertTitle>No Staff Members</AlertTitle><AlertDescription>No staff members have been added to this farm yet.</AlertDescription></Alert>)}
            </div>
             <Separator />
             <div><h3 className="text-md font-medium mb-2">Farm's Pending Invites ({farmPendingInvitations.length})</h3>
                {isLoadingFarmInvitations ? <Skeleton className="h-20 w-full"/> : farmPendingInvitations.length > 0 ? (
                     <ul className="space-y-3">{farmPendingInvitations.map(invite => (
                          <li key={invite.id} className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-3 border rounded-md bg-muted/50 gap-2">
                            <div>
                                <p className="font-medium">To: <span className="text-primary">{invite.invitedEmail}</span> as <span className="font-semibold capitalize">{invite.invitedRole}</span></p>
                                <p className="text-xs text-muted-foreground">Status: {invite.status} (Sent: {invite.createdAt?.toDate ? format(invite.createdAt.toDate(), 'MMM dd, yyyy') : 'N/A'}) {invite.tokenExpiresAt && `Expires: ${format(invite.tokenExpiresAt.toDate(), 'MMM dd, yyyy')}`}</p>
                            </div>
                            <Button variant="outline" size="sm" onClick={() => handleRevokeFarmInvitation(invite.id)}><Icons.XCircle className="mr-2 h-4 w-4" /> Revoke</Button>
                          </li>))}
                      </ul>) : (<Alert><Icons.Info className="h-4 w-4" /><AlertTitle>No Pending Invites Sent</AlertTitle><AlertDescription>No pending invitations have been sent by your farm.</AlertDescription></Alert>)}
             </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
