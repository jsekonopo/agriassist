
"use client";

import { PageHeader } from '@/components/layout/page-header';
import { Icons } from '@/components/icons';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChangePasswordForm } from '@/components/forms/change-password-form';
import { Separator } from '@/components/ui/separator';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

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

      <Separator />

      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle>Notification Preferences</CardTitle>
          <CardDescription>Manage how you receive notifications from AgriAssist. (Currently for demonstration)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <Alert variant="default">
            <Icons.Info className="h-4 w-4" />
            <AlertTitle>Demonstration Only</AlertTitle>
            <AlertDescription>
              These notification settings are for demonstration purposes. Actual notification delivery and preference saving require further backend implementation.
            </AlertDescription>
          </Alert>
          <div className="space-y-4">
            <div className="flex items-center justify-between space-x-2 p-4 border rounded-md shadow-sm bg-muted/50">
              <Label htmlFor="task-reminders-email" className="flex flex-col space-y-1">
                <span>Email for Task Reminders</span>
                <span className="font-normal leading-snug text-muted-foreground">
                  Receive email notifications for upcoming or overdue tasks.
                </span>
              </Label>
              <Switch id="task-reminders-email" disabled />
            </div>
            <div className="flex items-center justify-between space-x-2 p-4 border rounded-md shadow-sm bg-muted/50">
              <Label htmlFor="weather-alerts-email" className="flex flex-col space-y-1">
                <span>Email for Critical Weather Alerts</span>
                <span className="font-normal leading-snug text-muted-foreground">
                  Get notified about important weather events for your farm.
                </span>
              </Label>
              <Switch id="weather-alerts-email" disabled />
            </div>
            <div className="flex items-center justify-between space-x-2 p-4 border rounded-md shadow-sm bg-muted/50">
              <Label htmlFor="ai-suggestions-inapp" className="flex flex-col space-y-1">
                <span>In-App AI Suggestions</span>
                <span className="font-normal leading-snug text-muted-foreground">
                  Receive proactive suggestions and insights from the AI Farm Expert.
                </span>
              </Label>
              <Switch id="ai-suggestions-inapp" disabled />
            </div>
             <div className="flex items-center justify-between space-x-2 p-4 border rounded-md shadow-sm bg-muted/50">
              <Label htmlFor="staff-activity-email" className="flex flex-col space-y-1">
                <span>Staff Activity Summaries (Email)</span>
                <span className="font-normal leading-snug text-muted-foreground">
                  (For Farm Owners) Receive periodic summaries of staff activity.
                </span>
              </Label>
              <Switch id="staff-activity-email" disabled />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Placeholder for future settings sections like Units of Measurement or Theme */}
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
      */}
    </div>
  );
}
