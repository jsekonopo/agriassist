
"use client";

import { PageHeader } from '@/components/layout/page-header';
import { Icons } from '@/components/icons';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChangePasswordForm } from '@/components/forms/change-password-form';
import { Separator } from '@/components/ui/separator';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useAuth, type NotificationPreferences } from '@/contexts/auth-context';
import { useToast } from '@/hooks/use-toast';
import { useEffect, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';

type PreferenceKey = keyof NotificationPreferences;

export default function SettingsPage() {
  const { user, updateNotificationPreferences, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const [prefs, setPrefs] = useState<NotificationPreferences>({});
  const [isSavingPrefs, setIsSavingPrefs] = useState(false);

  useEffect(() => {
    if (user?.notificationPreferences) {
      setPrefs(user.notificationPreferences);
    } else if (user && !user.notificationPreferences) {
      // Initialize with defaults if not present
      const defaultPrefs: NotificationPreferences = {
        taskRemindersEmail: false,
        weatherAlertsEmail: false,
        aiSuggestionsInApp: false,
        staffActivityEmail: false,
      };
      setPrefs(defaultPrefs);
    }
  }, [user?.notificationPreferences, user]);

  const handlePreferenceChange = async (key: PreferenceKey, value: boolean) => {
    const newPrefs = { ...prefs, [key]: value };
    setPrefs(newPrefs); // Optimistic UI update

    setIsSavingPrefs(true);
    const result = await updateNotificationPreferences(newPrefs);
    if (result.success) {
      toast({ title: "Preferences Updated", description: result.message });
    } else {
      toast({ title: "Update Failed", description: result.message, variant: "destructive" });
      // Revert optimistic update on failure
      setPrefs(user?.notificationPreferences || {}); 
    }
    setIsSavingPrefs(false);
  };

  if (authLoading && !user) {
    return (
      <div className="space-y-8">
        <PageHeader
          title="Settings"
          description="Manage your account settings, preferences, and security."
          icon={Icons.Settings}
        />
         <Card className="shadow-lg">
          <CardHeader><Skeleton className="h-6 w-1/3 mb-2" /></CardHeader>
          <CardContent><Skeleton className="h-20 w-full" /></CardContent>
        </Card>
         <Card className="shadow-lg">
          <CardHeader><Skeleton className="h-6 w-1/3 mb-2" /></CardHeader>
          <CardContent><Skeleton className="h-32 w-full" /></CardContent>
        </Card>
      </div>
    );
  }


  const notificationItems: { id: PreferenceKey; label: string; description: string }[] = [
    { id: "taskRemindersEmail", label: "Email for Task Reminders", description: "Receive email notifications for upcoming or overdue tasks." },
    { id: "weatherAlertsEmail", label: "Email for Critical Weather Alerts", description: "Get notified about important weather events for your farm." },
    { id: "aiSuggestionsInApp", label: "In-App AI Suggestions", description: "Receive proactive suggestions and insights from the AI Farm Expert." },
    { id: "staffActivityEmail", label: "Staff Activity Summaries (Email)", description: "(For Farm Owners) Receive periodic summaries of staff activity." },
  ];

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
          <CardDescription>Manage how you receive notifications from AgriAssist.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <Alert variant="default">
            <Icons.Info className="h-4 w-4" />
            <AlertTitle>Notification Delivery</AlertTitle>
            <AlertDescription>
              Your preferences are saved. Actual notification delivery (emails, in-app messages) requires further backend service implementation.
            </AlertDescription>
          </Alert>
          <div className="space-y-4">
            {notificationItems.map(item => (
              <div key={item.id} className="flex items-center justify-between space-x-2 p-4 border rounded-md shadow-sm bg-muted/50">
                <Label htmlFor={item.id} className="flex flex-col space-y-1 cursor-pointer">
                  <span>{item.label}</span>
                  <span className="font-normal leading-snug text-muted-foreground">
                    {item.description}
                  </span>
                </Label>
                <Switch 
                  id={item.id} 
                  checked={prefs[item.id] || false}
                  onCheckedChange={(value) => handlePreferenceChange(item.id, value)}
                  disabled={isSavingPrefs || authLoading}
                  aria-label={item.label}
                />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
