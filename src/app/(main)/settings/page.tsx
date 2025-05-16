
"use client";

import { PageHeader } from '@/components/layout/page-header';
import { Icons } from '@/components/icons';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChangePasswordForm } from '@/components/forms/change-password-form';
import { Separator } from '@/components/ui/separator';
// Future: Import UserPreferencesForm, NotificationSettingsForm, etc.

export default function SettingsPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Settings"
        description="Manage your account settings, preferences, and security."
        icon={Icons.Settings}
      />

      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle>Account Security</CardTitle>
          <CardDescription>Update your password to keep your account secure.</CardDescription>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm />
        </CardContent>
      </Card>

      {/* Placeholder for future settings sections */}
      {/* 
      <Separator />

      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle>Preferences</CardTitle>
          <CardDescription>Customize your application experience (e.g., units, theme).</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">User preferences form will be here.</p>
          {/* <UserPreferencesForm /> */}
        </CardContent>
      </Card>

      <Separator />

      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle>Notification Settings</CardTitle>
          <CardDescription>Manage how you receive notifications from AgriAssist.</CardDescription>
        </CardHeader>
        <CardContent>
           <p className="text-muted-foreground">Notification settings form will be here.</p>
          {/* <NotificationSettingsForm /> */}
        </CardContent>
      </Card>
      */}
    </div>
  );
}
