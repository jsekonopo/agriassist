
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { Icons } from "@/components/icons";
import { useAuth } from "@/contexts/auth-context";
import { FirebaseError } from "firebase/app";

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, { message: "Current password is required." }),
  newPassword: z.string().min(6, { message: "New password must be at least 6 characters." }),
  confirmNewPassword: z.string(),
}).refine(data => data.newPassword === data.confirmNewPassword, {
  message: "New passwords do not match.",
  path: ["confirmNewPassword"], // Point error to the confirm password field
});

export function ChangePasswordForm() {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { changeUserPassword, firebaseUser } = useAuth(); // Assuming firebaseUser is available for email

  const form = useForm<z.infer<typeof changePasswordSchema>>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmNewPassword: "",
    },
  });

  async function onSubmit(values: z.infer<typeof changePasswordSchema>) {
    if (!firebaseUser || !firebaseUser.email) {
      toast({ title: "Error", description: "User not authenticated properly.", variant: "destructive" });
      return;
    }

    setIsSubmitting(true);
    try {
      await changeUserPassword(values.currentPassword, values.newPassword);
      toast({
        title: "Password Updated",
        description: "Your password has been successfully changed.",
      });
      form.reset();
    } catch (error: any) {
      console.error("Change password error:", error);
      let description = "An unexpected error occurred. Please try again.";
      if (error instanceof FirebaseError) {
        switch (error.code) {
          case "auth/wrong-password":
            description = "Incorrect current password. Please try again.";
            form.setError("currentPassword", { type: "manual", message: description });
            break;
          case "auth/weak-password":
            description = "The new password is too weak.";
            form.setError("newPassword", { type: "manual", message: description });
            break;
          case "auth/requires-recent-login":
             description = "This operation is sensitive and requires recent authentication. Please log out and log back in before changing your password.";
             break;
          default:
            description = error.message || "Failed to change password.";
        }
      } else if (error.message) {
        description = error.message;
      }
      toast({
        title: "Password Change Failed",
        description: description,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 max-w-md">
        <FormField
          control={form.control}
          name="currentPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Current Password</FormLabel>
              <FormControl>
                <Input type="password" placeholder="Enter your current password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="newPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>New Password</FormLabel>
              <FormControl>
                <Input type="password" placeholder="Enter your new password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="confirmNewPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Confirm New Password</FormLabel>
              <FormControl>
                <Input type="password" placeholder="Confirm your new password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Icons.Search className="mr-2 h-4 w-4 animate-spin" />
              Updating Password...
            </>
          ) : (
            <>
             <Icons.Settings className="mr-2 h-4 w-4" />
              Change Password
            </>
          )}
        </Button>
      </form>
    </Form>
  );
}
