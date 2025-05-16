
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

const profileFormSchema = z.object({
  name: z.string().min(2, { message: "Name must be at least 2 characters." }),
  farmName: z.string().min(2, { message: "Farm name must be at least 2 characters." }),
});

export default function ProfilePage() {
  const { user, isLoading, updateUserProfile } = useAuth();
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<z.infer<typeof profileFormSchema>>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: {
      name: user?.name || "",
      farmName: user?.farmName || "",
    },
  });

  useEffect(() => {
    if (user) {
      form.reset({
        name: user.name || "",
        farmName: user.farmName || "",
      });
    }
  }, [user, form]);

  async function onSubmit(values: z.infer<typeof profileFormSchema>) {
    setIsSubmitting(true);
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
        description: "Could not update your profile. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
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
              <CardTitle>{form.getValues('name') || user.name || 'N/A'}</CardTitle>
              <CardDescription>{user.email || 'No email provided'}</CardDescription>
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
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField
                  control={form.control}
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
                  control={form.control}
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
                    form.reset({ name: user.name || "", farmName: user.farmName || ""}); // Reset form on cancel
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
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
