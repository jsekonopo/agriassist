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
  
  const [localNotificationPrefs, setLocalNotificationPrefs] = useState<NotificationPreferences>({
    taskRemindersEmail: true,
    weatherAlertsEmail: false,
    aiInsightsEmail: true,
    staffActivityEmail: false,
  });
  const [localAreaUnit, setLocalAreaUnit] = useState<PreferredAreaUnit>("acres");
  const [localWeightUnit, setLocalWeightUnit] = useState<PreferredWeightUnit>("kg");
  const [localTheme, setLocalTheme] = useState<ThemePreference>("system");

  const [isSavingPrefs, setIsSavingPrefs] = useState(false);

  useEffect(() => {
    if (user?.settings) {
      // Ensure all keys are present with defaults before merging
      const defaultPrefs: NotificationPreferences = {
        taskRemindersEmail: true,
        weatherAlertsEmail: false,
        aiInsightsEmail: true,
        staffActivityEmail: false,
      };
      setLocalNotificationPrefs({ ...defaultPrefs, ...(user.settings.notificationPreferences || {}) });
      setLocalAreaUnit(user.settings.preferredAreaUnit || "acres");
      setLocalWeightUnit(user.settings.preferredWeightUnit || "kg");
      setLocalTheme(user.settings.theme || "system");
    }
  }, [user?.settings]);

  const handleNotificationPrefChange = async (key: NotificationPreferenceKey, value: boolean) => {
    const updatedPrefs = { ...localNotificationPrefs, [key]: value };
    setLocalNotificationPrefs(updatedPrefs); 
    
    setIsSavingPrefs(true);
    // Pass only the notificationPreferences part of UserSettings
    const result = await updateUserSettings({ notificationPreferences: updatedPrefs });
    if (result.success) {
      toast({ title: "Notification Preference Updated", description: result.message });
    } else {
      toast({ title: "Update Failed", description: result.message, variant: "destructive" });
      if(user?.settings?.notificationPreferences) {
         const defaultPrefs: NotificationPreferences = {
            taskRemindersEmail: true, weatherAlertsEmail: false, aiInsightsEmail: true, staffActivityEmail: false
         };
         setLocalNotificationPrefs({ ...defaultPrefs, ...(user.settings.notificationPreferences) });
      }
    }
    setIsSavingPrefs(false);
  };

  const handleUnitChange = async (type: 'area' | 'weight', value: PreferredAreaUnit | PreferredWeightUnit) => {
    let settingsToUpdate: Partial<UserSettings> = {};
    if (type === 'area') {
      setLocalAreaUnit(value as PreferredAreaUnit);
      settingsToUpdate.preferredAreaUnit = value as PreferredAreaUnit;
    } else {
      setLocalWeightUnit(value as PreferredWeightUnit);
      settingsToUpdate.preferredWeightUnit = value as PreferredWeightUnit;
    }
    
    setIsSavingPrefs(true);
    const result = await updateUserSettings(settingsToUpdate);
    if (result.success) {
      toast({ title: "Unit Preference Updated", description: result.message });
    } else {
      toast({ title: "Update Failed", description: result.message, variant: "destructive" });
      if (type === 'area' && user?.settings?.preferredAreaUnit) setLocalAreaUnit(user.settings.preferredAreaUnit);
      if (type === 'weight' && user?.settings?.preferredWeightUnit) setLocalWeightUnit(user.settings.preferredWeightUnit);
    }
    setIsSavingPrefs(false);
  };
  
  const handleThemeChange = async (value: ThemePreference) => {
    setLocalTheme(value);
    setIsSavingPrefs(true);
    const result = await updateUserSettings({ theme: value });
    if (result.success) {
      toast({ title: "Theme Preference Updated", description: result.message });
    } else {
      toast({ title: "Update Failed", description: result.message, variant: "destructive" });
      if (user?.settings?.theme) setLocalTheme(user.settings.theme);
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
  
  if (!user && !authLoading) {
    return (
      <div className="text-center p-8">Please log in to view settings.</div>
    )
  }


  const notificationItems: { id: NotificationPreferenceKey; label: string; description: string; ownerOnly?: boolean }[] = [
    { id: "taskRemindersEmail", label: "Email for Task Reminders", description: "Receive email notifications for upcoming or overdue tasks." },
    { id: "weatherAlertsEmail", label: "Email for Critical Weather Alerts", description: "Get notified about important weather events for your farm." },
    { id: "aiInsightsEmail", label: "Email for AI Insights & Suggestions", description: "Receive emails when new AI-driven insights or suggestions are available for your farm." },
    { id: "staffActivityEmail", label: "Staff Activity Summaries (Email)", description: "Receive periodic summaries of staff activity on your farm.", ownerOnly: true },
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
          <CardDescription>Manage how you receive notifications from AgriAssist. Emails are sent if enabled here.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <Alert variant="default">
            <Icons.Info className="h-4 w-4" />
            <AlertTitle>Notification Delivery</AlertTitle>
            <AlertDescription>
              Your preferences are saved to Firestore. Email notifications will be sent based on these settings when relevant events occur.
            </AlertDescription>
          </Alert>
          <div className="space-y-4">
            {notificationItems.map(item => {
              if (item.ownerOnly && !user?.isFarmOwner) {
                return null;
              }
              return (
                <div key={item.id} className="flex items-center justify-between space-x-2 p-4 border rounded-md shadow-sm bg-muted/50">
                  <Label htmlFor={item.id} className="flex flex-col space-y-1 cursor-pointer">
                    <span>{item.label}</span>
                    <span className="font-normal leading-snug text-muted-foreground">
                      {item.description}
                    </span>
                  </Label>
                  <Switch 
                    id={item.id} 
                    checked={localNotificationPrefs?.[item.id] || false}
                    onCheckedChange={(value) => handleNotificationPrefChange(item.id, value)}
                    disabled={isSavingPrefs || authLoading}
                    aria-label={item.label}
                  />
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Separator />

      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle>Measurement Units</CardTitle>
          <CardDescription>Choose your preferred default units for display and input.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <Alert variant="default">
            <Icons.Info className="h-4 w-4" />
            <AlertTitle>Unit Display & Input</AlertTitle>
            <AlertDescription>
              These preferences set default units in some forms and affect how data is displayed.
            </AlertDescription>
          </Alert>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="areaUnit">Preferred Area Unit</Label>
              <Select
                value={localAreaUnit}
                onValueChange={(value) => handleUnitChange('area', value as PreferredAreaUnit)}
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
                value={localWeightUnit}
                onValueChange={(value) => handleUnitChange('weight', value as PreferredWeightUnit)}
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
                value={localTheme}
                onValueChange={(value) => handleThemeChange(value as ThemePreference)}
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

