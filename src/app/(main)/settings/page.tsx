"use client";

import { PageHeader } from '@/components/layout/page-header';
import { Icons } from '@/components/icons';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChangePasswordForm } from '@/components/forms/change-password-form';
import { Separator } from '@/components/ui/separator';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useAuth, type UserSettings, type NotificationPreferences, type PreferredAreaUnit, type PreferredWeightUnit, type ThemePreference } from '@/contexts/auth-context';
import { useToast } from '@/hooks/use-toast';
import { useEffect, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type NotificationPreferenceKey = keyof NotificationPreferences;

export default function SettingsPage() {
  const { user, updateUserSettings, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  
  const [currentSettings, setCurrentSettings] = useState<UserSettings | undefined>(undefined);
  const [isSavingPrefs, setIsSavingPrefs] = useState(false);

  useEffect(() => {
    if (user?.settings) {
      setCurrentSettings(user.settings);
    } else if (user && !user.settings) { // User loaded but has no settings object yet
      const defaultPrefs: UserSettings = {
        notificationPreferences: {
          taskRemindersEmail: false, weatherAlertsEmail: false, aiSuggestionsInApp: false, staffActivityEmail: false,
        },
        preferredAreaUnit: "acres",
        preferredWeightUnit: "kg",
        theme: "system",
      };
      setCurrentSettings(defaultPrefs);
    }
  }, [user]);

  const handleSettingChange = async (updatedPart: Partial<UserSettings>) => {
    if (!user || !currentSettings) return; // Ensure user and currentSettings are available

    // Create a new settings object by merging
    const newSettings = { 
        ...currentSettings, // Start with existing settings
        ...updatedPart, // Apply the specific change
        // Deep merge notificationPreferences if that's what changed
        ...(updatedPart.notificationPreferences && {
            notificationPreferences: {
                ...(currentSettings.notificationPreferences || {}),
                ...updatedPart.notificationPreferences,
            }
        })
    };
    
    setCurrentSettings(newSettings); // Optimistic UI update
    setIsSavingPrefs(true);
    const result = await updateUserSettings(newSettings); 
    
    if (result.success) {
      toast({ title: "Preferences Updated", description: result.message });
    } else {
      toast({ title: "Update Failed", description: result.message, variant: "destructive" });
      // Revert optimistic update by re-setting from the source of truth (user context)
      // This ensures UI consistency if save fails.
      if (user?.settings) setCurrentSettings(user.settings);
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
  
  if (!currentSettings && !authLoading) { // Handle case where user is loaded but currentSettings is not yet initialized
     return (
      <div className="space-y-8">
        <PageHeader
          title="Settings"
          description="Manage your account settings, preferences, and security."
          icon={Icons.Settings}
        />
        <Card className="shadow-lg">
          <CardHeader><CardTitle>Loading Settings...</CardTitle></CardHeader>
          <CardContent><Skeleton className="h-40 w-full" /></CardContent>
        </Card>
      </div>
    );
  }
  // Ensure currentSettings is defined before trying to access its properties
  if (!currentSettings) {
      return <div className="text-center p-8">Loading settings...</div>; // Or a more sophisticated loader
  }


  const notificationItems: { id: NotificationPreferenceKey; label: string; description: string }[] = [
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
              Your preferences are saved to Firestore. Actual notification delivery (emails, in-app messages) requires further backend service implementation.
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
                  checked={currentSettings.notificationPreferences?.[item.id] || false}
                  onCheckedChange={(value) => handleSettingChange({ notificationPreferences: { ...currentSettings.notificationPreferences, [item.id]: value } })}
                  disabled={isSavingPrefs || authLoading}
                  aria-label={item.label}
                />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Separator />

      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle>Measurement Units</CardTitle>
          <CardDescription>Choose your preferred default units for display and input. (Note: Display conversion is not yet implemented app-wide)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <Alert variant="default">
            <Icons.Info className="h-4 w-4" />
            <AlertTitle>Unit Display</AlertTitle>
            <AlertDescription>
              These preferences are saved to Firestore. Implementing unit conversion and consistent display logic throughout the app based on these settings is a future enhancement.
            </AlertDescription>
          </Alert>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="areaUnit">Preferred Area Unit</Label>
              <Select
                value={currentSettings.preferredAreaUnit || "acres"}
                onValueChange={(value) => handleSettingChange({ preferredAreaUnit: value as PreferredAreaUnit })}
                disabled={isSavingPrefs || authLoading}
              >
                <SelectTrigger id="areaUnit">
                  <SelectValue placeholder="Select area unit" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="acres">Acres</SelectItem>
                  <SelectItem value="hectares">Hectares</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="weightUnit">Preferred Weight Unit</Label>
              <Select
                value={currentSettings.preferredWeightUnit || "kg"}
                onValueChange={(value) => handleSettingChange({ preferredWeightUnit: value as PreferredWeightUnit })}
                disabled={isSavingPrefs || authLoading}
              >
                <SelectTrigger id="weightUnit">
                  <SelectValue placeholder="Select weight unit" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="kg">Kilograms (kg)</SelectItem>
                  <SelectItem value="lbs">Pounds (lbs)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

       <Separator />

      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle>Theme Preferences</CardTitle>
          <CardDescription>Choose your preferred application theme.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
           <div className="space-y-2">
              <Label htmlFor="themePreference">Application Theme</Label>
              <Select
                value={currentSettings.theme || "system"}
                onValueChange={(value) => handleSettingChange({ theme: value as ThemePreference })}
                disabled={isSavingPrefs || authLoading}
              >
                <SelectTrigger id="themePreference">
                  <SelectValue placeholder="Select theme" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="light">Light</SelectItem>
                  <SelectItem value="dark">Dark</SelectItem>
                  <SelectItem value="system">System Default</SelectItem>
                </SelectContent>
              </Select>
            </div>
        </CardContent>
      </Card>

    </div>
  );
}