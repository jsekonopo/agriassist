"use client";

import { useAuth } from '@/contexts/auth-context';
import { PageHeader } from '@/components/layout/page-header';
import { Icons } from '@/components/icons';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { useState, useEffect } from 'react';
import { Separator } from '@/components/ui/separator';

const profileFormSchema = z.object({
  name: z.string().min(2, { message: "Name must be at least 2 characters." }),
  farmName: z.string().min(2, { message: "Farm name must be at least 2 characters." }),
});

const inviteStaffFormSchema = z.object({
  staffEmail: z.string().email({ message: "Please enter a valid email address." }),
});

export default function ProfilePage() {
  const { user, isLoading, updateUserProfile, firebaseUser } = useAuth(); // Added firebaseUser
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isInvitingStaff, setIsInvitingStaff] = useState(false);

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
  }, [user, profileForm]);

  async function onProfileSubmit(values: z.infer<typeof profileFormSchema>) {
    if (!user) return;
    setIsSubmitting(true);
    try {
      // We pass user.farmId if it exists, otherwise it's handled in updateUserProfile
      await updateUserProfile(values.name, values.farmName, user.farmId || firebaseUser?.uid || "");
      toast({
        title: "Profile Updated",
        description: "Your profile information has been successfully updated.",
      });
      setIsEditing(false);
    } catch (error) {
      console.error("Profile update error:", error);
      toast({
        title: "Update Failed",
        description: "Could not update your profile. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function onInviteStaffSubmit(values: z.infer<typeof inviteStaffFormSchema>) {
    setIsInvitingStaff(true);
    // TODO: Implement actual staff invitation logic here (e.g., call a Firebase Function)
    // For now, this is a mocked action
    console.log("Attempting to invite staff:", values.staffEmail, "to farm ID:", user?.farmId);
    await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate API call
    
    toast({
      title: "Staff Invitation (Mocked)",
      description: `An invitation would be sent to ${values.staffEmail}. Backend functionality for this is pending.`,
    });
    inviteStaffForm.reset();
    setIsInvitingStaff(false);
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
            <div className="space-y-1">
              <Skeleton className="h-4 w-1/4" />
              <Skeleton className="h-6 w-3/4" />
            </div>
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
               {user.farmName && <p className="text-sm text-muted-foreground mt-1">Farm: {user.farmName}</p>}
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
                <div className="flex gap-2">
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? (
                      <>
                        <Icons.User className="mr-2 h-4 w-4 animate-spin" /> Saving...
                      </>
                    ) : (
                      "Save Changes"
                    )}
                  </Button>
                  <Button variant="ghost" onClick={() => {
                    setIsEditing(false);
                    profileForm.reset({ name: user.name || "", farmName: user.farmName || ""});
                  }} disabled={isSubmitting}>
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
            </>
          )}
        </CardContent>
      </Card>

      {user.isFarmOwner && (
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
                            <>
                              <Icons.User className="mr-2 h-4 w-4 animate-spin" /> Inviting...
                            </>
                          ) : (
                            "Send Invite (Mocked)"
                          )}
                        </Button>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                 <p className="text-xs text-muted-foreground">Note: Staff invitation currently shows a success message but does not send an actual invitation or add users. Full backend implementation for staff management is pending.</p>
              </form>
            </Form>
            
            <Separator />

            <div>
              <h3 className="text-md font-medium mb-2">Current Staff Members (Mocked)</h3>
              <ul className="space-y-2">
                <li className="flex justify-between items-center p-2 border rounded-md bg-muted/50">
                  <span>staff1@example.com (Mock)</span>
                  <Button variant="ghost" size="sm" disabled>Remove (Mock)</Button>
                </li>
                <li className="flex justify-between items-center p-2 border rounded-md bg-muted/50">
                  <span>staff2@example.com (Mock)</span>
                  <Button variant="ghost" size="sm" disabled>Remove (Mock)</Button>
                </li>
              </ul>
              <p className="text-xs text-muted-foreground mt-2">Displaying actual staff members and removal functionality requires backend implementation.</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}