
"use client";

import { PageHeader } from '@/components/layout/page-header';
import { DashboardStatsCard } from '@/components/dashboard-stats-card';
import { Icons } from '@/components/icons';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { useEffect, useState, useCallback } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth, type UserRoleOnFarm, type PreferredAreaUnit, type PlanId } from '@/contexts/auth-context'; 
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, orderBy, Timestamp, doc, getDoc } from 'firebase/firestore';
import { format, parseISO, isToday, isPast, differenceInDays, addDays, isWithinInterval } from 'date-fns';
import { proactiveFarmInsights, type ProactiveFarmInsightsOutput } from "@/ai/flows/proactive-farm-insights-flow";
import { useToast } from "@/hooks/use-toast";
import { OnboardingModal } from '@/components/onboarding/onboarding-modal'; 
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';

interface WeatherData {
  temperature: number;
  weathercode: number;
  description: string;
  windspeed: number;
}

interface Field {
  id: string;
  fieldName: string;
  fieldSize?: number;
  fieldSizeUnit?: string; 
  farmId: string;
  userId: string;
  latitude?: number | null;
  longitude?: number | null;
}

interface PlantingLog {
  id: string;
  cropName: string;
  plantingDate: string; 
  farmId: string;
  userId: string;
}

interface HarvestingLog {
  id: string;
  cropName: string;
  yieldAmount?: number;
  yieldUnit?: string;
  farmId: string;
  userId: string;
  harvestDate: string; 
}

interface TaskLog {
  id: string;
  taskName: string;
  dueDate?: string | null; 
  status: "To Do" | "In Progress" | "Done";
  farmId: string;
  userId: string;
  description?: string;
  createdAt?: Timestamp;
  fieldId?: string | null;
  fieldName?: string | null;
}

interface CropYieldData {
  name: string;
  totalYield: number;
  unit?: string;
}

const getWeatherDescription = (code: number): string => {
  const descriptions: Record<number, string> = {
    0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast', 45: 'Fog',
    48: 'Depositing rime fog', 51: 'Light drizzle', 53: 'Moderate drizzle', 55: 'Dense drizzle',
    56: 'Light freezing drizzle', 57: 'Dense freezing drizzle', 61: 'Slight rain', 63: 'Moderate rain',
    65: 'Heavy rain', 66: 'Light freezing rain', 67: 'Heavy freezing rain', 71: 'Slight snow fall',
    73: 'Moderate snow fall', 75: 'Heavy snow fall', 77: 'Snow grains', 80: 'Slight rain showers',
    81: 'Moderate rain showers', 82: 'Violent rain showers', 85: 'Slight snow showers',
    86: 'Heavy snow showers', 95: 'Thunderstorm', 96: 'Thunderstorm with slight hail',
    99: 'Thunderstorm with heavy hail',
  };
  return descriptions[code] || 'Unknown';
};

const ACRES_TO_HECTARES = 0.404686;
const HECTARES_TO_ACRES = 1 / ACRES_TO_HECTARES;

const sampleResourceData = [
  { name: 'Water (Sample)', value: 65 },
  { name: 'Fertilizer (Sample)', value: 40 },
];
const COLORS = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))'];

const ownerRoles: UserRoleOnFarm[] = ['free', 'pro', 'agribusiness'];
const rolesThatCanAddData: UserRoleOnFarm[] = [...ownerRoles, 'admin', 'editor'];

const FROST_TEMP_THRESHOLD_CELSIUS = 2; 
const STORM_WEATHER_CODES = [95, 96, 99]; 
const WEATHER_ALERT_COOLDOWN_MS = 6 * 60 * 60 * 1000; // 6 hours
const TASK_REMINDER_CHECK_COOLDOWN_MS = 4 * 60 * 60 * 1000; // 4 hours per farm check
const TASK_REMINDER_PER_TASK_COOLDOWN_MS = 6 * 60 * 60 * 1000; // 6 hours per specific task reminder

const planDisplayNames: Record<PlanId, string> = {
  free: "Hobbyist Farmer (Free)",
  pro: "Pro Farmer",
  agribusiness: "AgriBusiness",
};


export default function DashboardPage() {
  const { 
    user, 
    isLoading: authLoading, 
    makeApiRequest, 
    markOnboardingComplete, 
    refreshUserData,
    updateUserPlan 
  } = useAuth(); 
  const { toast } = useToast();
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(true);
  const [weatherError, setWeatherError] = useState<string | null>(null);
  const [weatherLocationDisplay, setWeatherLocationDisplay] = useState("Default Location");

  const [totalAcreage, setTotalAcreage] = useState<number | undefined>(undefined);
  const [activeCropsCount, setActiveCropsCount] = useState<number | undefined>(undefined);
  const [nextHarvestCrop, setNextHarvestCrop] = useState<string | undefined>(undefined);
  const [cropYieldData, setCropYieldData] = useState<CropYieldData[]>([]);
  const [upcomingTasks, setUpcomingTasks] = useState<TaskLog[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  const [proactiveInsights, setProactiveInsights] = useState<ProactiveFarmInsightsOutput | null>(null);
  const [isLoadingInsights, setIsLoadingInsights] = useState(false);
  const [showOnboardingModal, setShowOnboardingModal] = useState(false);
  const [isCheckingReminders, setIsCheckingReminders] = useState(false);
  const [isCompletingPayment, setIsCompletingPayment] = useState(false);


  const canUserAddData = user?.roleOnCurrentFarm && rolesThatCanAddData.includes(user.roleOnCurrentFarm as UserRoleOnFarm);
  const preferredAreaUnit: PreferredAreaUnit = user?.settings?.preferredAreaUnit || "acres";

  const triggerWeatherAlertNotification = useCallback(async (alertType: 'frost' | 'storm', alertData: WeatherData) => {
    if (!user || !user.farmId || !user.uid) return;

    const lastAlertKey = `lastWeatherAlert_${alertType}_${user.farmId}`;
    const lastAlertTime = localStorage.getItem(lastAlertKey);
    const now = Date.now();

    if (lastAlertTime && (now - parseInt(lastAlertTime) < WEATHER_ALERT_COOLDOWN_MS)) { 
      console.log(`Weather alert cooldown active for: ${alertType} on farm ${user.farmName || user.farmId}. Not sending new notification.`);
      return;
    }
    
    const farmDisplayNameForAlert = user?.farmName || ( (user?.farmLatitude && user?.farmLongitude) ? "Your Farm Location" : "Default Location (Ottawa)");
    let alertTitle = "";
    let alertMessage = "";

    if (alertType === 'frost') {
        alertTitle = `Weather Alert: Potential Frost at ${farmDisplayNameForAlert}!`;
        alertMessage = `Current temperature is ${alertData.temperature}°C. Take precautions for frost-sensitive crops.`;
    } else if (alertType === 'storm') {
        alertTitle = `Weather Alert: Storm Approaching ${farmDisplayNameForAlert}!`;
        alertMessage = `Current weather conditions indicate a storm: ${alertData.description}. Secure equipment and livestock.`;
    }

    try {
      await makeApiRequest('/api/notifications/create', {
        userId: user.uid,
        farmId: user.farmId,
        type: 'weather_alert', 
        title: alertTitle,
        message: alertMessage,
        link: '/dashboard' 
      });
      toast({ title: alertTitle, description: `${alertMessage} A notification has been sent.`, variant: "default" });
      localStorage.setItem(lastAlertKey, now.toString());
    } catch (error) {
      console.error("Error creating weather alert notification:", error);
      toast({ title: "Notification Error", description: "Could not send weather alert notification.", variant: "destructive"});
    }
  }, [user, makeApiRequest, toast]); // weatherLocationDisplay is derived from user, so user is enough

  useEffect(() => {
    async function fetchFarmLocationAndWeather() {
      setWeatherLoading(true);
      let lat: number | null | undefined = user?.farmLatitude; 
      let lon: number | null | undefined = user?.farmLongitude; 
      let currentFarmNameForWeather = user?.farmName || "Your Farm"; 
      let locationName = `Weather for ${currentFarmNameForWeather}`; 

      if (lat == null || lon == null) { 
         locationName = `Current Weather (Default Location: Ottawa)`;
         lat = 45.4215; lon = -75.6972; // Default to Ottawa
      } else {
         locationName = `Weather for ${currentFarmNameForWeather}`;
      }
      setWeatherLocationDisplay(locationName);

      try {
        const response = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`);
        if (!response.ok) throw new Error(`Failed to fetch weather: ${response.statusText}`);
        const data = await response.json();
        if (data.current_weather) {
          const currentWeatherData: WeatherData = {
            temperature: data.current_weather.temperature,
            weathercode: data.current_weather.weathercode,
            description: getWeatherDescription(data.current_weather.weathercode),
            windspeed: data.current_weather.windspeed,
          };
          setWeather(currentWeatherData);

          if (currentWeatherData.temperature < FROST_TEMP_THRESHOLD_CELSIUS) {
            triggerWeatherAlertNotification('frost', currentWeatherData);
          }
          if (STORM_WEATHER_CODES.includes(currentWeatherData.weathercode)) {
             triggerWeatherAlertNotification('storm', currentWeatherData);
          }

        } else throw new Error("Current weather data not available");
        setWeatherError(null);
      } catch (error) {
        console.error("Weather fetch error:", error);
        setWeatherError(error instanceof Error ? error.message : "An unknown error occurred");
        setWeather(null);
      } finally {
        setWeatherLoading(false);
      }
    }
    if (user && !authLoading && user.farmId) { 
        fetchFarmLocationAndWeather();
    } else if (!user && !authLoading) { 
        setWeatherLoading(false);
        setWeatherLocationDisplay("Weather (No Farm Set - Default Location: Ottawa)");
    }
  }, [user, authLoading, triggerWeatherAlertNotification]); 

  useEffect(() => {
    if (!user || authLoading || !user.farmId) {
      setDataLoading(true);
      if (!authLoading && user && !user.farmId) { 
        setDataLoading(false); 
        setTotalAcreage(0);
        setActiveCropsCount(0);
        setNextHarvestCrop("N/A");
        setCropYieldData([]);
        setUpcomingTasks([]);
      }
      return;
    }

    setDataLoading(true);
    const fetchData = async () => {
      try {
        const fieldsQuery = query(collection(db, "fields"), where("farmId", "==", user.farmId));
        const fieldsSnapshot = await getDocs(fieldsQuery);
        let acreageInAcres = 0;
        fieldsSnapshot.docs.forEach(docSnap => {
          const field = docSnap.data() as Field;
          if (field.fieldSize && typeof field.fieldSize === 'number' && field.fieldSize > 0) {
            const unit = field.fieldSizeUnit?.toLowerCase() || "acres";
            if (unit.includes("hectare")) {
              acreageInAcres += field.fieldSize * HECTARES_TO_ACRES;
            } else { 
              acreageInAcres += field.fieldSize;
            }
          }
        });
        if (preferredAreaUnit === "hectares") {
            setTotalAcreage(acreageInAcres > 0 ? parseFloat((acreageInAcres * ACRES_TO_HECTARES).toFixed(2)) : 0);
        } else {
            setTotalAcreage(acreageInAcres > 0 ? parseFloat(acreageInAcres.toFixed(1)) : 0);
        }

        const plantingLogsQuery = query(collection(db, "plantingLogs"), where("farmId", "==", user.farmId), orderBy("plantingDate", "desc"));
        const plantingLogsSnapshot = await getDocs(plantingLogsQuery);
        const pLogs = plantingLogsSnapshot.docs.map(docSnap => docSnap.data() as PlantingLog);
        const uniqueCrops = new Set(pLogs.map(log => log.cropName));
        setActiveCropsCount(uniqueCrops.size);
        setNextHarvestCrop(pLogs[0]?.cropName || "N/A"); 

        const harvestingLogsQuery = query(collection(db, "harvestingLogs"), where("farmId", "==", user.farmId), orderBy("harvestDate", "desc"));
        const harvestingLogsSnapshot = await getDocs(harvestingLogsQuery);
        const hLogs = harvestingLogsSnapshot.docs.map(docSnap => docSnap.data() as HarvestingLog);
        
        const yields: { [key: string]: { total: number; unit?: string } } = {};
        hLogs.forEach(log => {
          if (log.cropName && typeof log.yieldAmount === 'number' && log.yieldAmount > 0) {
            const cropKey = log.cropName; 
            if (!yields[cropKey]) yields[cropKey] = { total: 0, unit: log.yieldUnit || 'units' }; 
            yields[cropKey].total += log.yieldAmount;
            if (!yields[cropKey].unit && log.yieldUnit) yields[cropKey].unit = log.yieldUnit;
          }
        });
        setCropYieldData(Object.entries(yields).map(([name, data]) => ({ name, totalYield: data.total, unit: data.unit })));


        const tasksQuery = query(
          collection(db, "taskLogs"), 
          where("farmId", "==", user.farmId), 
          where("status", "!=", "Done"), 
          orderBy("status", "asc"), 
          orderBy("dueDate", "asc")
        );
        const tasksSnapshot = await getDocs(tasksQuery);
        setUpcomingTasks(tasksSnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data(), createdAt: docSnap.data().createdAt } as TaskLog)));


      } catch (error) {
        console.error("Error fetching dashboard data:", error);
        toast({ title: "Dashboard Error", description: "Could not load some farm data.", variant: "destructive" });
      } finally {
        setDataLoading(false);
      }
    };
    fetchData();
  }, [user, authLoading, preferredAreaUnit, toast]);

  useEffect(() => {
    if (user && !authLoading && user.onboardingCompleted === false && user.subscriptionStatus === 'active') {
      setShowOnboardingModal(true);
    }
  }, [user, authLoading]);

  const handleCompleteOnboarding = async () => {
    if (!user) return;
    await markOnboardingComplete(); 
    setShowOnboardingModal(false); 
  };

  const handleCompletePayment = async () => {
    if (!user || !user.selectedPlanId || user.selectedPlanId === 'free') {
      toast({ title: "Error", description: "No pending plan found to complete payment for.", variant: "destructive"});
      return;
    }
    setIsCompletingPayment(true);
    try {
      const result = await updateUserPlan(user.selectedPlanId); 
      if (result.success && result.sessionId) {
        // Stripe redirection is handled by updateUserPlan 
      } else {
         toast({ title: "Payment Initiation Failed", description: result.message || result.error || "Could not start payment process.", variant: "destructive"});
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Could not initiate payment.", variant: "destructive"});
    } finally {
      setIsCompletingPayment(false);
    }
  };


  const handleGetProactiveInsights = useCallback(async () => {
    if (!user?.farmId || !user.uid) { 
      toast({ title: "Error", description: "Farm ID or User ID is missing. Cannot fetch insights.", variant: "destructive" });
      return;
    }
    setIsLoadingInsights(true);
    setProactiveInsights(null);
    try {
      const insights = await proactiveFarmInsights({ farmId: user.farmId });
      setProactiveInsights(insights);
      toast({ title: "Insights Generated", description: "Proactive insights for your farm are ready." });

      if (insights && (insights.identifiedOpportunities || insights.identifiedRisks)) {
        let notificationTitle = `AI Insights for ${user.farmName || 'Your Farm'}`;
        let notificationMessage = "The AI Farm Expert has generated new insights: ";
        
        if (insights.identifiedOpportunities && insights.identifiedRisks) {
            notificationTitle = `AI Alert: Opportunities & Risks Identified!`;
            notificationMessage += `Opportunities: ${insights.identifiedOpportunities.substring(0,70)}... Risks: ${insights.identifiedRisks.substring(0,70)}... `;
        } else if (insights.identifiedOpportunities) {
            notificationTitle = `AI Alert: Farm Opportunities Found!`;
            notificationMessage += `Opportunities: ${insights.identifiedOpportunities.substring(0,140)}... `;
        } else if (insights.identifiedRisks) {
            notificationTitle = `AI Alert: Potential Farm Risks Identified!`;
             notificationMessage += `Risks: ${insights.identifiedRisks.substring(0,140)}... `;
        }
        notificationMessage += "Check your dashboard for details."
        
        await makeApiRequest('/api/notifications/create', {
            userId: user.uid, 
            farmId: user.farmId,
            type: 'ai_insight', 
            title: notificationTitle,
            message: notificationMessage.trim(),
            link: '/dashboard' 
        });
        toast({ title: "Notification Logged", description: "An in-app notification for the new insight has been created."});
      }

    } catch (error: any) {
      console.error("Error fetching proactive insights:", error);
      toast({ title: "Error", description: error.message || "Could not fetch proactive insights. Please try again.", variant: "destructive" });
    } finally {
      setIsLoadingInsights(false);
    }
  }, [user, toast, makeApiRequest]); 

  const handleCheckTaskReminders = useCallback(async () => {
    if (!user || !user.farmId || !user.uid) {
      toast({ title: "Error", description: "Cannot check reminders without user/farm context.", variant: "destructive"});
      return;
    }

    const lastFarmCheckKey = `lastTaskReminderCheck_${user.farmId}`;
    const lastFarmCheckTime = localStorage.getItem(lastFarmCheckKey);
    const now = Date.now();

    if (lastFarmCheckTime && (now - parseInt(lastFarmCheckTime) < TASK_REMINDER_CHECK_COOLDOWN_MS)) {
      const remainingTime = TASK_REMINDER_CHECK_COOLDOWN_MS - (now - parseInt(lastFarmCheckTime));
      const remainingMinutes = Math.ceil(remainingTime / (1000 * 60));
      toast({ title: "Task Reminders Recently Checked", description: `Please wait another ${remainingMinutes} minutes before checking again for the farm.`, variant: "default" });
      return;
    }
    
    setIsCheckingReminders(true);
    let remindersSentCount = 0;
    const today = new Date();

    for (const task of upcomingTasks) { 
      if (task.dueDate) {
        const dueDate = parseISO(task.dueDate);
        let notificationTitle = "";
        let notificationMessage = "";
        let shouldNotify = false;

        const lastPerTaskReminderKey = `lastPerTaskReminder_${task.id}_${user.farmId}`;
        const lastPerTaskReminderTime = localStorage.getItem(lastPerTaskReminderKey);
        

        if (lastPerTaskReminderTime && (now - parseInt(lastPerTaskReminderTime) < TASK_REMINDER_PER_TASK_COOLDOWN_MS)) {
          console.log(`Per-task reminder cooldown active for task ${task.id}. Not sending new notification.`);
          continue; 
        }

        if (isToday(dueDate) && task.status !== "Done") {
          notificationTitle = `Task Reminder: "${task.taskName}" is due today!`;
          notificationMessage = `The task "${task.taskName || 'Unnamed Task'}" for farm "${user.farmName || 'your farm'}" is due on ${format(dueDate, "MMM dd, yyyy")}. Description: ${task.description || 'No description.'}`;
          shouldNotify = true;
        } else if (isPast(dueDate) && differenceInDays(today, dueDate) <= 7 && task.status !== "Done") { 
          notificationTitle = `Task Overdue: "${task.taskName}"`;
          notificationMessage = `The task "${task.taskName || 'Unnamed Task'}" for farm "${user.farmName || 'your farm'}" was due on ${format(dueDate, "MMM dd, yyyy")} and is now overdue. Description: ${task.description || 'No description.'}`;
          shouldNotify = true;
        }
        
        if (shouldNotify && notificationTitle && notificationMessage) {
          try {
            await makeApiRequest('/api/notifications/create', {
              userId: user.uid,
              farmId: user.farmId,
              type: 'task_reminder', 
              title: notificationTitle,
              message: notificationMessage,
              link: `/data-management?tab=tasks&taskId=${task.id}` 
            });
            remindersSentCount++;
            localStorage.setItem(lastPerTaskReminderKey, now.toString()); 
          } catch (error) {
            console.error(`Failed to create reminder for task ${task.id}:`, error);
          }
        }
      }
    }
    if (remindersSentCount > 0) {
      toast({ title: "Task Reminders Processed", description: `${remindersSentCount} reminder(s) for due/overdue tasks have been generated as notifications.` });
    } else {
      toast({ title: "No New Task Reminders", description: "No tasks are currently due today or recently overdue that need new reminders." });
    }
    localStorage.setItem(lastFarmCheckKey, now.toString()); 
    setIsCheckingReminders(false);
  }, [user, upcomingTasks, makeApiRequest, toast]);


  if (authLoading && !user) { 
    return (
        <div className="space-y-6">
            <PageHeader title="Farm Dashboard" description="Loading your farm's overview..." icon={Icons.Dashboard}/>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-[120px] rounded-lg" />)}
            </div>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                <Skeleton className="lg:col-span-2 h-[350px] rounded-lg" />
                <Skeleton className="h-[350px] rounded-lg" />
            </div>
        </div>
    );
  }


  return (
    <div className="space-y-6">
      {user && user.onboardingCompleted === false && user.subscriptionStatus === 'active' && (
        <OnboardingModal 
          isOpen={showOnboardingModal} 
          onOpenChange={setShowOnboardingModal} 
          onComplete={handleCompleteOnboarding} 
        />
      )}

      {user && user.subscriptionStatus === 'pending_payment' && (
        <Card className="mb-6 border-primary shadow-lg">
          <CardHeader>
            <CardTitle className="text-primary flex items-center gap-2">
              <Icons.CreditCard className="h-6 w-6" />
              Complete Your Registration
            </CardTitle>
            <CardDescription>
              Your payment for the <strong>{user.selectedPlanId ? planDisplayNames[user.selectedPlanId] : 'selected'}</strong> plan was not completed. 
              Please complete your payment to activate your full AgriAssist features.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={handleCompletePayment} disabled={isCompletingPayment} size="lg">
              {isCompletingPayment ? (
                <><Icons.Search className="mr-2 h-4 w-4 animate-spin"/> Processing...</>
              ) : (
                "Complete Payment"
              )}
            </Button>
            <p className="text-xs text-muted-foreground mt-2">
              You will be redirected to Stripe to complete your payment.
            </p>
          </CardContent>
        </Card>
      )}


      <PageHeader
        title="Farm Dashboard"
        description="Overview of your farm's performance and activities."
        icon={Icons.Dashboard}
      />

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <DashboardStatsCard
          title="Total Acreage"
          value={dataLoading || authLoading ? undefined : (totalAcreage !== undefined ? totalAcreage : "N/A")}
          unit={totalAcreage !== undefined && totalAcreage > 0 ? preferredAreaUnit : ""}
          icon={Icons.Location}
          isLoading={dataLoading || authLoading}
        />
        <DashboardStatsCard
          title="Active Crops"
          value={dataLoading || authLoading ? undefined : (activeCropsCount !== undefined ? activeCropsCount : "N/A")}
          icon={Icons.Planting}
          isLoading={dataLoading || authLoading}
        />
        <DashboardStatsCard
          title="Next Planned Harvest" 
          value={dataLoading || authLoading ? undefined : (nextHarvestCrop || "N/A")}
          icon={Icons.Harvesting}
          isLoading={dataLoading || authLoading}
          trend={nextHarvestCrop && nextHarvestCrop !== "N/A" ? "Based on latest planting" : ""}
        />
         <Card className="shadow-lg hover:shadow-xl transition-shadow duration-300">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground truncate" title={weatherLocationDisplay}>
              {weatherLocationDisplay}
            </CardTitle>
            <Icons.Weather className="h-5 w-5 text-muted-foreground flex-shrink-0" />
          </CardHeader>
          <CardContent>
            {weatherLoading ? (
              <>
                <Skeleton className="h-8 w-3/4 mb-2" />
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-4 w-1/3 mt-1" />
              </>
            ) : weatherError ? (
              <p className="text-xs text-destructive mt-1">{weatherError}</p>
            ) : weather ? (
              <>
                <div className="text-3xl font-bold text-foreground">
                  {weather.temperature}
                  <span className="text-xl font-normal ml-1">°C</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{weather.description}</p>
                <p className="text-xs text-muted-foreground">Wind: {weather.windspeed} km/h</p>
              </>
            ) : <p className="text-xs text-muted-foreground">Weather data unavailable.</p>}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 grid-cols-1 lg:grid-cols-3">
        <Card className="lg:col-span-2 shadow-lg">
          <CardHeader>
            <CardTitle>Crop Yield Overview</CardTitle>
            <CardDescription>Total harvested yield per crop from your farm's logs.</CardDescription>
          </CardHeader>
          <CardContent className="h-[350px]">
            {dataLoading || authLoading ? <Skeleton className="w-full h-full" /> :
              cropYieldData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={cropYieldData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" stroke="hsl(var(--foreground))" fontSize={12} />
                    <YAxis stroke="hsl(var(--foreground))" fontSize={12} />
                    <Tooltip
                      contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))' }}
                      labelStyle={{ color: 'hsl(var(--foreground))' }}
                      formatter={(value, name, props) => [`${value} ${props.payload.unit || ''}`, "Total Yield"]}
                    />
                    <Legend wrapperStyle={{fontSize: "12px"}}/>
                    <Bar dataKey="totalYield" fill="hsl(var(--primary))" name="Total Yield" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full">
                  <p className="text-muted-foreground">No harvesting data for this farm to display.</p>
                </div>
              )
            }
          </CardContent>
        </Card>

        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>Resource Usage (Sample)</CardTitle>
            <CardDescription>Overview of key resource consumption.</CardDescription>
          </CardHeader>
          <CardContent className="h-[350px]">
             <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={sampleResourceData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                  outerRadius={100}
                  dataKey="value"
                  stroke="hsl(var(--border))"
                >
                  {sampleResourceData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                    contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))' }}
                    labelStyle={{ color: 'hsl(var(--foreground))' }}
                />
                <Legend wrapperStyle={{fontSize: "12px"}}/>
              </PieChart>
            </ResponsiveContainer>
             <p className="text-xs text-center text-muted-foreground mt-2">Note: Resource usage data is currently sample data. Integration with actual logs coming soon.</p>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-lg">
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
            <div>
              <CardTitle>Upcoming Tasks</CardTitle>
              <CardDescription>Key activities for your farm. Click button to generate reminders for due/overdue tasks.</CardDescription>
            </div>
            <Button onClick={handleCheckTaskReminders} disabled={isCheckingReminders || authLoading || dataLoading || upcomingTasks.length === 0} size="sm">
              {isCheckingReminders ? <><Icons.Search className="mr-2 h-4 w-4 animate-spin"/> Checking...</> : <><Icons.Bell className="mr-2 h-4 w-4" /> Check for Reminders</>}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {dataLoading || authLoading ? (
            <>
              <Skeleton className="h-10 w-full mb-2" />
              <Skeleton className="h-10 w-full mb-2" />
              <Skeleton className="h-10 w-full" />
            </>
          ) : upcomingTasks.length > 0 ? (
            <ul className="space-y-3">
              {upcomingTasks.slice(0, 5).map(task => (
                <li key={task.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-md">
                  <div>
                    <p className="font-medium">{task.taskName}</p>
                    <p className="text-sm text-muted-foreground">
                      Status: {task.status}
                      {task.dueDate && ` - Due: ${format(parseISO(task.dueDate), "MMM dd, yyyy")}`}
                      {task.fieldName && ` - Field: ${task.fieldName}`}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
             <p className="text-muted-foreground">No upcoming tasks for this farm.</p>
          )}
          {upcomingTasks.length > 5 && (
             <Button variant="link" className="mt-4 px-0" asChild>
                <Link href="/data-management?tab=tasks">View all tasks</Link>
             </Button>
          )}
           {(upcomingTasks.length === 0 && !dataLoading && !authLoading && canUserAddData) && (
             <Button variant="link" className="mt-4 px-0" asChild>
                <Link href="/data-management?tab=tasks">Add a new task</Link>
             </Button>
          )}
        </CardContent>
      </Card>
      
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Icons.BrainCircuit className="h-5 w-5 text-primary" />
            Proactive Farm Insights
          </CardTitle>
          <CardDescription>AI-powered lookahead for potential opportunities or risks on your farm. Data is based on recent logs.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={handleGetProactiveInsights} disabled={isLoadingInsights || !user?.farmId || authLoading || dataLoading} className="mb-4">
            {isLoadingInsights ? (
              <>
                <Icons.Search className="mr-2 h-4 w-4 animate-spin" />
                Generating Insights...
              </>
            ) : (
              "Get Latest Insights"
            )}
          </Button>
          {isLoadingInsights && (
            <div className="space-y-3">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          )}
          {proactiveInsights && !isLoadingInsights && (
            <div className="space-y-4 animate-in fade-in-50 duration-300 p-4 border rounded-md bg-secondary/30">
              {proactiveInsights.identifiedOpportunities && (
                <div>
                  <h4 className="font-semibold text-green-600 dark:text-green-500">Potential Opportunities:</h4>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{proactiveInsights.identifiedOpportunities}</p>
                </div>
              )}
              {proactiveInsights.identifiedRisks && (
                <div className="mt-3">
                  <h4 className="font-semibold text-red-600 dark:text-red-500">Potential Risks:</h4>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{proactiveInsights.identifiedRisks}</p>
                </div>
              )}
              {(!proactiveInsights.identifiedOpportunities && !proactiveInsights.identifiedRisks) && (
                 <p className="text-sm text-muted-foreground">No specific opportunities or risks identified by the AI based on current data snapshot.</p>
              )}
              <p className="text-xs italic text-muted-foreground/80 pt-3 mt-3 border-t border-border/50">Data considered: {proactiveInsights.dataConsideredSummary}</p>
            </div>
          )}
          {(!user?.farmId && !authLoading) && <p className="text-sm text-destructive">Please ensure you are associated with a farm to get insights.</p>}
        </CardContent>
      </Card>

      <div className="grid gap-6 grid-cols-1 md:grid-cols-2">
        <Card className="shadow-lg">
            <CardHeader>
                <CardTitle>Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {canUserAddData ? (
                <>
                  <Button variant="outline" asChild className="h-auto py-3">
                      <Link href="/data-management?tab=planting" className="flex flex-col items-center gap-1">
                          <Icons.PlusCircle className="w-6 h-6"/>
                          <span>New Planting Log</span>
                      </Link>
                  </Button>
                  <Button variant="outline" asChild className="h-auto py-3">
                      <Link href="/data-management?tab=harvesting" className="flex flex-col items-center gap-1">
                          <Icons.PlusCircle className="w-6 h-6"/>
                          <span>New Harvest Log</span>
                      </Link>
                  </Button>
                  <Button variant="outline" asChild className="h-auto py-3">
                      <Link href="/data-management?tab=soil" className="flex flex-col items-center gap-1">
                          <Icons.PlusCircle className="w-6 h-6"/>
                          <span>Add Soil Data</span>
                      </Link>
                  </Button>
                </>
              ) : (
                <p className="text-sm text-muted-foreground col-span-1 sm:col-span-2 text-center">Data entry actions are restricted for your role.</p>
              )}
               <Button variant="outline" asChild className="h-auto py-3">
                    <Link href="/ai-expert" className="flex flex-col items-center gap-1">
                        <Icons.Help className="w-6 h-6"/>
                        <span>Ask AI Expert</span>
                    </Link>
                </Button>
            </CardContent>
        </Card>
        <Card className="shadow-lg">
            <CardHeader>
                <CardTitle>Farm Insights (Sample)</CardTitle>
                <CardDescription>Tips and recommendations for your farm.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
                <div className="flex items-start gap-3 p-3 bg-primary/10 rounded-md">
                    <Icons.Info className="w-5 h-5 text-primary flex-shrink-0 mt-1"/>
                    <p className="text-sm">Consider crop rotation for Field B to improve soil health. <Link href="/ai-expert?tab=sustainable_practices" className="text-primary font-medium underline">Learn more</Link></p>
                </div>
                 <div className="flex items-start gap-3 p-3 bg-primary/10 rounded-md">
                    <Icons.Dollar className="w-5 h-5 text-primary flex-shrink-0 mt-1"/>
                    <p className="text-sm">Explore sustainable practices to potentially monetize carbon credits. <Link href="/ai-expert?tab=sustainable_practices" className="text-primary font-medium underline">Get suggestions</Link></p>
                </div>
            </CardContent>
        </Card>
      </div>
    </div>
  );
}
