
"use client";

import { useAuth } from '@/contexts/auth-context';
import { PageHeader } from '@/components/layout/page-header';
import { Icons } from '@/components/icons';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { useState, useEffect } from 'react';
import { Separator } from '@/components/ui/separator';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
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

export default function ProfilePage() {
  const { user, isLoading, updateUserProfile, firebaseUser, inviteStaffMemberByEmail, removeStaffMember } = useAuth();
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [isSubmittingProfile, setIsSubmittingProfile] = useState(false);
  const [isInvitingStaff, setIsInvitingStaff] = useState(false);
  const [staffDetails, setStaffDetails] = useState<StaffMemberDisplay[]>([]);
  const [isLoadingStaffDetails, setIsLoadingStaffDetails] = useState(false);

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
  }, [user, profileForm, isEditing]); // Reset form when user data changes or editing toggles

  useEffect(() => {
    const fetchStaffDetails = async () => {
      if (user?.isFarmOwner && user.staffMembers && user.staffMembers.length > 0) {
        setIsLoadingStaffDetails(true);
        const detailsPromises = user.staffMembers.map(async (staffUid) => {
          const userDocRef = doc(db, "users", staffUid);
          const userDocSnap = await getDoc(userDocRef);
          if (userDocSnap.exists()) {
            const staffData = userDocSnap.data();
            return { uid: staffUid, name: staffData.name || 'N/A', email: staffData.email || 'N/A' };
          }
          return { uid: staffUid, name: 'Unknown User', email: 'N/A' };
        });
        const resolvedDetails = await Promise.all(detailsPromises);
        setStaffDetails(resolvedDetails.filter(detail => detail.uid !== user.uid)); // Filter out owner if somehow listed as staff
        setIsLoadingStaffDetails(false);
      } else {
        setStaffDetails([]);
      }
    };

    fetchStaffDetails();
  }, [user?.staffMembers, user?.isFarmOwner, user?.uid]);

  async function onProfileSubmit(values: z.infer<typeof profileFormSchema>) {
    if (!user) return;
    setIsSubmittingProfile(true);
    try {
      await updateUserProfile(values.name, values.farmName);
      toast({
        title: "Profile Updated",
        description: "Your profile information has been successfully updated.",
      });
      setIsEditing(false);
    } catch (error) {
      console.error("Profile update error:", error);
      toast({
        title: "Update Failed",
        description: (error as Error).message || "Could not update your profile. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmittingProfile(false);
    }
  }

  async function onInviteStaffSubmit(values: z.infer<typeof inviteStaffFormSchema>) {
    setIsInvitingStaff(true);
    const result = await inviteStaffMemberByEmail(values.staffEmail);
    toast({
      title: result.success ? "Invitation Logged" : "Invitation Failed",
      description: result.message,
      variant: result.success ? "default" : "destructive",
    });
    if (result.success) {
      inviteStaffForm.reset();
    }
    setIsInvitingStaff(false);
    // Note: UI for pending invitations would require fetching from a 'pendingInvitations' collection.
  }
  
  async function handleRemoveStaff(staffUid: string) {
    const result = await removeStaffMember(staffUid);
     toast({
      title: result.success ? "Staff Member Removed" : "Removal Failed",
      description: result.message,
      variant: result.success ? "default" : "destructive",
    });
    // The staffDetails list will update via useEffect hook reacting to change in user.staffMembers
  }


  if (isLoading) {
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
            <div className="space-y-1">
              <Skeleton className="h-4 w-1/4" />
              <Skeleton className="h-6 w-3/4" />
            </div>
            <Skeleton className="h-10 w-32 mt-4" />
          </CardContent>
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
        description="Manage your account details and preferences."
        icon={Icons.UserCircle}
      />
      <Card className="shadow-lg">
        <CardHeader>
          <div className="flex justify-between items-start">
            <div>
              <CardTitle>{profileForm.getValues('name') || user.name || 'N/A'}</CardTitle>
              <CardDescription>{user.email || 'No email provided'}</CardDescription>
               {(user.farmName || (user.isFarmOwner && profileForm.getValues('farmName'))) && 
                <p className="text-sm text-muted-foreground mt-1">
                  Farm: {user.isFarmOwner ? profileForm.getValues('farmName') : user.farmName}
                </p>
               }
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
                        <FormLabel>Farm Name</FormLabel>
                        <FormControl>
                          <Input placeholder="Your farm's name" {...field} />
                        </FormControl>
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
                <h3 className="text-sm font-medium text-muted-foreground">Full Name</h3>
                <p className="text-lg text-foreground">{user.name || 'Not set'}</p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">Email Address</h3>
                <p className="text-lg text-foreground">{user.email || 'Not set'}</p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">Farm Name</h3>
                <p className="text-lg text-foreground">{user.farmName || 'Not set'}</p>
              </div>
              {user.farmId && (
                 <div>
                    <h3 className="text-sm font-medium text-muted-foreground">Farm ID</h3>
                    <p className="text-xs text-foreground">{user.farmId}</p>
                </div>
              )}
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">Role</h3>
                <p className="text-lg text-foreground">{user.isFarmOwner ? 'Farm Owner' : 'Staff Member'}</p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {user.isFarmOwner && (
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>Farm Management</CardTitle>
            <CardDescription>Manage your farm staff and settings. Ensure your Firestore Security Rules are correctly configured for these operations.</CardDescription>
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
                            <>
                              <Icons.Search className="mr-2 h-4 w-4 animate-spin" /> Logging Invite...
                            </>
                          ) : (
                            "Log Invitation Request"
                          )}
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
                      This action logs an invitation request. A backend process (e.g., Firebase Cloud Function, not yet implemented) would be needed to send an actual email and handle the invitation acceptance flow.
                      The invited user must already have an AgriAssist account or create one with the invited email.
                    </AlertDescription>
                  </Alert>
              </form>
            </Form>
            
            <Separator />

            <div>
              <h3 className="text-md font-medium mb-2">Current Staff Members</h3>
              {isLoadingStaffDetails ? (
                <Skeleton className="h-10 w-full" />
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
                            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This action will remove {staff.name} from your farm staff. They will be reassigned to a new personal farm. This cannot be undone.
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
                <p className="text-sm text-muted-foreground">No staff members have been added or accepted invitations yet.</p>
              )}
            </div>
             <Separator />
             <div>
                <h3 className="text-md font-medium mb-2">Pending Invitations (Placeholder)</h3>
                <Alert>
                    <Icons.Info className="h-4 w-4" />
                    <AlertTitle>Displaying Pending Invitations</AlertTitle>
                    <AlertDescription>
                    This section is a placeholder. A full implementation would query a 'pendingInvitations' collection in Firestore and display users who have been invited but haven't yet accepted. Functionality to resend or revoke pending invitations would also be added here.
                    </AlertDescription>
                </Alert>
             </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

```