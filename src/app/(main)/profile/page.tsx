
"use client";

import { useAuth, type PlanId } from '@/contexts/auth-context';
import { PageHeader } from '@/components/layout/page-header';
import { Icons } from '@/components/icons';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button, buttonVariants } from '@/components/ui/button';
import Link from 'next/link';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
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
});

const inviteStaffFormSchema = z.object({
  staffEmail: z.string().email({ message: "Please enter a valid email address." }),
});

interface StaffMemberDisplay {
  uid: string;
  name: string;
  email: string;
}

interface PendingInvitation {
  id: string; 
  inviterFarmId: string;
  inviterUid: string;
  inviterName?: string; 
  farmName?: string; 
  invitedEmail: string;
  invitedUserUid: string | null; 
  status: 'pending' | 'accepted' | 'declined' | 'revoked' | 'error_farm_not_found';
  createdAt: Timestamp;
}

const planNames: Record<PlanId, string> = {
  free: "Hobbyist Farmer (Free)",
  pro: "Pro Farmer",
  agribusiness: "AgriBusiness",
};


export default function ProfilePage() {
  const { user, isLoading: authIsLoading, updateUserProfile, firebaseUser, inviteStaffMemberByEmail, removeStaffMember, acceptInvitation, declineInvitation, revokeInvitation, refreshUserData } = useAuth();
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [isSubmittingProfile, setIsSubmittingProfile] = useState(false);
  const [isInvitingStaff, setIsInvitingStaff] = useState(false);
  const [staffDetails, setStaffDetails] = useState<StaffMemberDisplay[]>([]);
  const [isLoadingStaffDetails, setIsLoadingStaffDetails] = useState(false);

  const [myPendingInvitations, setMyPendingInvitations] = useState<PendingInvitation[]>([]);
  const [isLoadingMyInvitations, setIsLoadingMyInvitations] = useState(false);
  const [farmPendingInvitations, setFarmPendingInvitations] = useState<PendingInvitation[]>([]);
  const [isLoadingFarmInvitations, setIsLoadingFarmInvitations] = useState(false);

  const profileForm = useForm<z.infer<typeof profileFormSchema>>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: {
      name: "",
      farmName: "",
    },
  });

  const inviteStaffForm = useForm<z.infer<typeof inviteStaffFormSchema>>({
    resolver: zodResolver(inviteStaffFormSchema),
    defaultValues: {
      staffEmail: "",
    },
  });

  useEffect(() => {
    if (user) {
      profileForm.reset({
        name: user.name || "",
        farmName: user.farmName || "",
      });
    }
  }, [user, profileForm, isEditing]);

  const fetchStaffDetails = useCallback(async () => {
    if (!user?.isFarmOwner || !user.staffMembers || user.staffMembers.length === 0) {
      setStaffDetails([]);
      return;
    }
    setIsLoadingStaffDetails(true);
    try {
      const detailsPromises = user.staffMembers.map(async (staffUid) => {
        if (staffUid === user.uid) return null; // Should not happen if staffMembers array is managed correctly
        const userDocRef = doc(db, "users", staffUid);
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists()) {
          const staffData = userDocSnap.data();
          return { uid: staffUid, name: staffData.name || 'N/A', email: staffData.email || 'N/A' };
        }
        return { uid: staffUid, name: 'Unknown User', email: 'N/A (User data not found)' };
      });
      const resolvedDetails = (await Promise.all(detailsPromises)).filter(Boolean) as StaffMemberDisplay[];
      setStaffDetails(resolvedDetails);
    } catch (error) {
      console.error("Error fetching staff details:", error);
      toast({ title: "Error", description: "Could not fetch staff details.", variant: "destructive" });
    } finally {
      setIsLoadingStaffDetails(false);
    }
  }, [user?.isFarmOwner, user?.staffMembers, user?.uid, toast]);

  useEffect(() => {
    if (user?.isFarmOwner) {
        fetchStaffDetails();
    } else {
        setStaffDetails([]); // Clear staff details if user is not owner or becomes staff
    }
  }, [user?.isFarmOwner, fetchStaffDetails]);


  const fetchMyPendingInvitations = useCallback(async () => {
    if (!user?.uid || !user.email) {
      setMyPendingInvitations([]);
      return;
    }
    setIsLoadingMyInvitations(true);
    try {
      // Query by UID - for users who already had an account when invited
      const qByUid = query(
        collection(db, "pendingInvitations"),
        where("invitedUserUid", "==", user.uid),
        where("status", "==", "pending")
      );
      // Query by email - for users who might not have had an account (invitedUserUid was null)
      const qByEmail = query(
        collection(db, "pendingInvitations"),
        where("invitedEmail", "==", user.email.toLowerCase()),
        where("status", "==", "pending")
      );
      
      const [uidSnapshot, emailSnapshot] = await Promise.all([getDocs(qByUid), getDocs(qByEmail)]);
      
      const invitesMap = new Map<string, PendingInvitation>();
      uidSnapshot.docs.forEach(docSnap => invitesMap.set(docSnap.id, { id: docSnap.id, ...docSnap.data() } as PendingInvitation));
      emailSnapshot.docs.forEach(docSnap => {
        // Add if not already present (e.g., if invitedUserUid was null and now matches after signup)
        if (!invitesMap.has(docSnap.id)) {
          invitesMap.set(docSnap.id, { id: docSnap.id, ...docSnap.data() } as PendingInvitation);
        }
      });

      setMyPendingInvitations(Array.from(invitesMap.values()));

    } catch (error) {
      console.error("Error fetching user's pending invitations:", error);
      toast({ title: "Error", description: "Could not fetch your pending invitations.", variant: "destructive" });
    } finally {
      setIsLoadingMyInvitations(false);
    }
  }, [user?.uid, user?.email, toast]);

  useEffect(() => {
    fetchMyPendingInvitations();
  }, [fetchMyPendingInvitations]);


  const fetchFarmPendingInvitations = useCallback(async () => {
    if (!user?.isFarmOwner || !user.farmId) {
      setFarmPendingInvitations([]);
      return;
    }
    setIsLoadingFarmInvitations(true);
    try {
      const q = query(
        collection(db, "pendingInvitations"),
        where("inviterFarmId", "==", user.farmId),
        where("status", "==", "pending")
      );
      const querySnapshot = await getDocs(q);
      const invites = querySnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as PendingInvitation));
      setFarmPendingInvitations(invites);
    } catch (error) {
      console.error("Error fetching farm's pending invitations:", error);
      toast({ title: "Error", description: "Could not fetch farm's pending invitations.", variant: "destructive" });
    } finally {
      setIsLoadingFarmInvitations(false);
    }
  }, [user?.isFarmOwner, user?.farmId, toast]);

  useEffect(() => {
    if (user?.isFarmOwner) {
        fetchFarmPendingInvitations();
    } else {
        setFarmPendingInvitations([]); // Clear farm invites if user is not owner
    }
  }, [user?.isFarmOwner, fetchFarmPendingInvitations]);


  async function onProfileSubmit(values: z.infer<typeof profileFormSchema>) {
    if (!user || !firebaseUser) return; // firebaseUser check added
    setIsSubmittingProfile(true);
    try {
      // updateUserProfile now handles updating farmName in farms collection if user is owner
      await updateUserProfile(values.name, values.farmName);
      toast({
        title: "Profile Updated",
        description: "Your profile information has been successfully updated.",
      });
      setIsEditing(false);
    } catch (error: any) {
      console.error("Profile update error:", error);
      toast({
        title: "Update Failed",
        description: error.message || "Could not update your profile. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmittingProfile(false);
    }
  }

  async function onInviteStaffSubmit(values: z.infer<typeof inviteStaffFormSchema>) {
    if (!user || !user.isFarmOwner || !user.farmId || !firebaseUser) {
      toast({ title: "Error", description: "Only farm owners can invite staff.", variant: "destructive" });
      return;
    }
    setIsInvitingStaff(true);
    const result = await inviteStaffMemberByEmail(values.staffEmail);
    toast({
      title: result.success ? "Invitation Request Logged" : "Invitation Failed",
      description: result.message,
      variant: result.success ? "default" : "destructive",
    });
    if (result.success) {
      inviteStaffForm.reset();
      fetchFarmPendingInvitations(); 
    }
    setIsInvitingStaff(false);
  }
  
  async function handleRemoveStaff(staffUid: string) {
    if (!user || !user.isFarmOwner || !user.farmId || !firebaseUser) {
      toast({ title: "Error", description: "Only farm owners can remove staff.", variant: "destructive" });
      return;
    }
    const result = await removeStaffMember(staffUid);
     toast({
      title: result.success ? "Staff Member Removed" : "Removal Failed",
      description: result.message,
      variant: result.success ? "default" : "destructive",
    });
    if (result.success) {
        await refreshUserData(); // Refresh context user which should re-trigger staff list fetch
        fetchStaffDetails(); // And explicitly refetch details
    }
  }

  async function handleAcceptInvitation(invitationId: string) {
    if (!firebaseUser) return; 
    const result = await acceptInvitation(invitationId);
    toast({
      title: result.success ? "Invitation Accepted!" : "Acceptance Failed",
      description: result.message,
      variant: result.success ? "default" : "destructive",
    });
    if (result.success) {
      await refreshUserData(); // Crucial: refresh user data in context to get new farmId, role, etc.
      fetchMyPendingInvitations(); // Refresh this user's list of pending invites
      // If user was an owner, they might need to refresh their farm's staff list view (if they had one open)
      // This is handled by AuthContext update triggering Profile Page re-render
    }
  }

  async function handleDeclineInvitation(invitationId: string) {
    if (!firebaseUser) return;
    const result = await declineInvitation(invitationId);
     toast({
      title: result.success ? "Invitation Declined" : "Decline Failed",
      description: result.message,
      variant: result.success ? "default" : "destructive",
    });
    if (result.success) {
      fetchMyPendingInvitations(); 
    }
  }

  async function handleRevokeInvitation(invitationId: string) {
    if (!firebaseUser || !user?.isFarmOwner) return;
    const result = await revokeInvitation(invitationId);
    toast({
      title: result.success ? "Invitation Revoked" : "Revoke Failed",
      description: result.message,
      variant: result.success ? "default" : "destructive",
    });
    if (result.success) {
      fetchFarmPendingInvitations(); 
    }
  }


  if (authIsLoading) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="User Profile"
          description="View and manage your account details."
          icon={Icons.UserCircle}
        />
        <Card className="shadow-lg">
          <CardHeader>
            <Skeleton className="h-7 w-1/3 mb-2" />
            <Skeleton className="h-4 w-1/2" />
          </CardHeader>
          <CardContent className="space-y-4">
            {[1,2,3].map(i => <Skeleton key={i} className="h-8 w-full mb-2" />)}
          </CardContent>
        </Card>
         <Card className="shadow-lg">
          <CardHeader><Skeleton className="h-7 w-1/4 mb-2" /></CardHeader>
          <CardContent><Skeleton className="h-10 w-full" /></CardContent>
        </Card>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="User Profile"
          description="View your account details."
          icon={Icons.UserCircle}
        />
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>Profile Not Found</CardTitle>
            <CardDescription>Please log in to view your profile.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/login">Go to Login</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="User Profile"
        description="Manage your account details, farm association, and subscription."
        icon={Icons.UserCircle}
      />
      <Card className="shadow-lg">
        <CardHeader>
          <div className="flex justify-between items-start">
            <div>
              <CardTitle>{profileForm.getValues('name') || user.name || 'N/A'}</CardTitle>
              <CardDescription>{user.email || 'No email provided'}</CardDescription>
               {user.farmName && 
                <p className="text-sm text-muted-foreground mt-1">
                  Farm: <span className="font-medium text-foreground">{user.farmName}</span>
                  {user.isFarmOwner ? ` (Owner)` : user.farmId ? ` (Staff Member)` : ''}
                </p>
               }
               {user.farmId && <p className="text-xs text-muted-foreground">Farm ID: {user.farmId}</p>}
            </div>
            {!isEditing && (
              <Button variant="outline" onClick={() => setIsEditing(true)}>
                <Icons.Edit3 className="mr-2 h-4 w-4" /> Edit Profile
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {isEditing ? (
            <Form {...profileForm}>
              <form onSubmit={profileForm.handleSubmit(onProfileSubmit)} className="space-y-6">
                <FormField
                  control={profileForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Full Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Your full name" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {user.isFarmOwner && (
                  <FormField
                    control={profileForm.control}
                    name="farmName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Farm Name (as Owner)</FormLabel>
                        <FormControl>
                          <Input placeholder="Your farm's name" {...field} />
                        </FormControl>
                        <FormDescription>Only farm owners can change the farm name.</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
                <div className="flex gap-2">
                  <Button type="submit" disabled={isSubmittingProfile}>
                    {isSubmittingProfile ? (
                      <>
                        <Icons.Search className="mr-2 h-4 w-4 animate-spin" /> Saving...
                      </>
                    ) : (
                      "Save Changes"
                    )}
                  </Button>
                  <Button variant="ghost" onClick={() => {
                    setIsEditing(false);
                    profileForm.reset({ name: user.name || "", farmName: user.farmName || ""});
                  }} disabled={isSubmittingProfile}>
                    Cancel
                  </Button>
                </div>
              </form>
            </Form>
          ) : (
            <>
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">Role</h3>
                <p className="text-lg text-foreground">{user.isFarmOwner ? 'Farm Owner' : (user.farmId ? 'Staff Member' : 'Not associated with a farm')}</p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card className="shadow-lg">
        <CardHeader>
            <CardTitle>Subscription Plan</CardTitle>
            <CardDescription>Manage your current AgriAssist subscription.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
            <div>
                <h3 className="text-sm font-medium text-muted-foreground">Current Plan</h3>
                <p className="text-lg font-semibold text-primary">{planNames[user.selectedPlanId] || 'Unknown Plan'}</p>
            </div>
             <div>
                <h3 className="text-sm font-medium text-muted-foreground">Status</h3>
                <p className="text-lg text-foreground capitalize">{user.subscriptionStatus}</p>
            </div>
            {user.selectedPlanId !== 'free' && user.subscriptionStatus === 'active' && (
                <AlertDialog>
                    <AlertDialogTrigger asChild>
                        <Button variant="outline">
                            <Icons.XCircle className="mr-2 h-4 w-4"/> Cancel Subscription (Simulated)
                        </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                        <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will cancel your current paid subscription. Your plan will revert to Free at the end of the current billing period (simulated).
                        </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                        <AlertDialogCancel>No, Keep Plan</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={async () => {
                                if (!firebaseUser) return;
                                const result = await user.cancelSubscription(); // Use cancelSubscription from user object
                                toast({
                                    title: result.success ? "Subscription Cancellation Requested" : "Cancellation Failed",
                                    description: result.message,
                                    variant: result.success ? "default" : "destructive",
                                });
                                if (result.success) {
                                    refreshUserData();
                                }
                            }}
                            className={buttonVariants({variant: "destructive"})}
                        >
                            Yes, Cancel Subscription
                        </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            )}
            <Button asChild>
                <Link href="/pricing">
                    <Icons.Dollar className="mr-2 h-4 w-4" />
                     {user.selectedPlanId === 'free' ? 'Upgrade Plan' : 'View Plans & Manage'} (Simulated)
                </Link>
            </Button>
            <Alert variant="default">
                <Icons.Info className="h-4 w-4" />
                <AlertTitle>Subscription Simulation Note</AlertTitle>
                <AlertDescription>
                    Subscription management and payments are currently simulated. Actual plan changes via Stripe are required for a live system.
                </AlertDescription>
            </Alert>
        </CardContent>
      </Card>

      {/* Section for User's Pending Invitations */}
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle>My Pending Invitations</CardTitle>
          <CardDescription>Invitations you have received to join other farms.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingMyInvitations ? (
            <Skeleton className="h-20 w-full" />
          ) : myPendingInvitations.length > 0 ? (
            <ul className="space-y-3">
              {myPendingInvitations.map(invite => (
                <li key={invite.id} className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-3 border rounded-md bg-muted/50 gap-2">
                  <div>
                    <p className="font-medium">Invitation to join <span className="text-primary">{invite.farmName || 'Unnamed Farm'}</span></p>
                    <p className="text-sm text-muted-foreground">Invited by: {invite.inviterName || 'Farm Owner'} (Farm ID: {invite.inviterFarmId})</p>
                    <p className="text-xs text-muted-foreground">Sent: {invite.createdAt?.toDate().toLocaleDateString()}</p>
                  </div>
                  <div className="flex gap-2 mt-2 sm:mt-0 flex-shrink-0">
                    <Button size="sm" onClick={() => handleAcceptInvitation(invite.id)} disabled={!user.farmId || user.farmId === invite.inviterFarmId}>
                      <Icons.CheckCircle2 className="mr-2 h-4 w-4" /> Accept
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => handleDeclineInvitation(invite.id)}>
                      <Icons.XCircle className="mr-2 h-4 w-4" /> Decline
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <Alert>
              <Icons.Info className="h-4 w-4" />
              <AlertTitle>No Pending Invitations</AlertTitle>
              <AlertDescription>You have no pending invitations to join other farms.</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {user.isFarmOwner && user.farmId && (
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>Farm Management</CardTitle>
            <CardDescription>Manage your farm staff and settings.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <Form {...inviteStaffForm}>
              <form onSubmit={inviteStaffForm.handleSubmit(onInviteStaffSubmit)} className="space-y-4">
                <h3 className="text-md font-medium">Invite New Staff Member</h3>
                <FormField
                  control={inviteStaffForm.control}
                  name="staffEmail"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Staff Email Address</FormLabel>
                      <div className="flex gap-2">
                        <FormControl>
                          <Input type="email" placeholder="staffmember@example.com" {...field} className="flex-grow" />
                        </FormControl>
                        <Button type="submit" disabled={isInvitingStaff} className="flex-shrink-0">
                          {isInvitingStaff ? (
                            <> <Icons.Search className="mr-2 h-4 w-4 animate-spin" /> Logging Invite... </>
                          ) : ( "Log Invitation Request" )}
                        </Button>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                 <Alert variant="default">
                    <Icons.Info className="h-4 w-4" />
                    <AlertTitle>Invitation Process</AlertTitle>
                    <AlertDescription>
                      This logs an invitation request to Firestore. An email is sent to the invited user if email services are configured. The user must have or create an AgriAssist account with that email and accept the invitation from their profile.
                    </AlertDescription>
                  </Alert>
              </form>
            </Form>
            
            <Separator />

            <div>
              <h3 className="text-md font-medium mb-2">Current Staff Members ({staffDetails.length})</h3>
              {isLoadingStaffDetails ? (
                <Skeleton className="h-20 w-full" />
              ) : staffDetails.length > 0 ? (
                <ul className="space-y-2">
                  {staffDetails.map(staff => (
                    <li key={staff.uid} className="flex justify-between items-center p-3 border rounded-md bg-muted/50">
                      <div>
                        <p className="font-medium">{staff.name}</p>
                        <p className="text-sm text-muted-foreground">{staff.email}</p>
                      </div>
                       <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10">
                            <Icons.Trash2 className="mr-1 h-4 w-4" /> Remove
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Are you sure you want to remove {staff.name}?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This action will remove {staff.name} from your farm staff. They will be reassigned to their own personal farm space. This cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleRemoveStaff(staff.uid)} className={buttonVariants({variant: "destructive"})}>
                              Confirm Removal
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </li>
                  ))}
                </ul>
              ) : (
                <Alert>
                    <Icons.Info className="h-4 w-4" />
                    <AlertTitle>No Staff Members</AlertTitle>
                    <AlertDescription>No staff members have been added to this farm yet.</AlertDescription>
                </Alert>
              )}
            </div>
             <Separator />
             <div>
                <h3 className="text-md font-medium mb-2">Farm's Pending Invitations ({farmPendingInvitations.length})</h3>
                {isLoadingFarmInvitations ? <Skeleton className="h-20 w-full"/> :
                  farmPendingInvitations.length > 0 ? (
                     <ul className="space-y-3">
                        {farmPendingInvitations.map(invite => (
                          <li key={invite.id} className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-3 border rounded-md bg-muted/50 gap-2">
                            <div>
                              <p className="font-medium">Invited: <span className="text-primary">{invite.invitedEmail}</span></p>
                              <p className="text-xs text-muted-foreground">Status: {invite.status} (Sent: {invite.createdAt?.toDate().toLocaleDateString()})</p>
                            </div>
                            <Button variant="outline" size="sm" onClick={() => handleRevokeInvitation(invite.id)}>
                                <Icons.XCircle className="mr-2 h-4 w-4" /> Revoke
                            </Button>
                          </li>
                        ))}
                      </ul>
                  ) : (
                    <Alert>
                        <Icons.Info className="h-4 w-4" />
                        <AlertTitle>No Pending Invitations Sent</AlertTitle>
                        <AlertDescription>
                        There are currently no pending invitations sent by your farm.
                        </AlertDescription>
                    </Alert>
                  )
                }
             </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

    