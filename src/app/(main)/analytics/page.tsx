
"use client";

import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/layout/page-header';
import { Icons } from '@/components/icons';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from 'recharts';
import { useAuth } from '@/contexts/auth-context';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { format, parseISO, getMonth, getYear } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';

interface HarvestingLog {
  id: string;
  cropName: string;
  harvestDate: string; // YYYY-MM-DD
  yieldAmount?: number;
  yieldUnit?: string;
  farmId: string;
  userId: string;
}

interface DynamicYieldData {
  year: string;
  [cropName: string]: number | string;
}

interface MonthlyUsageData {
  month: string; // e.g., "Jan"
  usage: number;
}

interface FertilizerLog {
  id: string;
  dateApplied: string; // YYYY-MM-DD
  amountApplied: number;
  farmId: string;
}

interface IrrigationLog {
  id: string;
  irrigationDate: string; // YYYY-MM-DD
  amountApplied: number;
  farmId: string;
}

const chartColors = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
];

const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default function AnalyticsPage() {
  const { user } = useAuth();
  const [dynamicYieldData, setDynamicYieldData] = useState<DynamicYieldData[]>([]);
  const [uniqueCropsForChart, setUniqueCropsForChart] = useState<string[]>([]);
  const [isLoadingYieldData, setIsLoadingYieldData] = useState(true);

  const [fertilizerChartData, setFertilizerChartData] = useState<MonthlyUsageData[]>([]);
  const [isLoadingFertilizerData, setIsLoadingFertilizerData] = useState(true);
  const [waterChartData, setWaterChartData] = useState<MonthlyUsageData[]>([]);
  const [isLoadingWaterData, setIsLoadingWaterData] = useState(true);

  useEffect(() => {
    if (!user || !user.farmId) {
      setIsLoadingYieldData(false);
      setDynamicYieldData([]);
      setUniqueCropsForChart([]);
      setIsLoadingFertilizerData(false);
      setFertilizerChartData([]);
      setIsLoadingWaterData(false);
      setWaterChartData([]);
      return;
    }

    const fetchAllAnalyticsData = async () => {
      // Fetch Yield Data
      setIsLoadingYieldData(true);
      try {
        const yieldQuery = query(collection(db, "harvestingLogs"), where("farmId", "==", user.farmId), orderBy("harvestDate", "asc"));
        const yieldSnapshot = await getDocs(yieldQuery);
        const yieldLogs = yieldSnapshot.docs.map(doc => doc.data() as HarvestingLog);

        if (yieldLogs.length > 0) {
            const yieldsByYearAndCrop: { [year: string]: { [crop: string]: number } } = {};
            const allCrops = new Set<string>();

            yieldLogs.forEach(log => {
              if (log.harvestDate && typeof log.yieldAmount === 'number') {
                const year = format(parseISO(log.harvestDate), 'yyyy');
                allCrops.add(log.cropName);
                if (!yieldsByYearAndCrop[year]) yieldsByYearAndCrop[year] = {};
                if (!yieldsByYearAndCrop[year][log.cropName]) yieldsByYearAndCrop[year][log.cropName] = 0;
                yieldsByYearAndCrop[year][log.cropName] += log.yieldAmount;
              }
            });
            const uniqueCropsArray = Array.from(allCrops);
            setUniqueCropsForChart(uniqueCropsArray);
            const chartData: DynamicYieldData[] = Object.entries(yieldsByYearAndCrop).map(([year, crops]) => {
              const yearData: DynamicYieldData = { year };
              uniqueCropsArray.forEach(cropName => {
                yearData[cropName] = crops[cropName] || 0;
              });
              return yearData;
            });
            setDynamicYieldData(chartData);
        } else {
            setDynamicYieldData([]);
            setUniqueCropsForChart([]);
        }
      } catch (error) {
        console.error("Error fetching yield data for analytics:", error);
        setDynamicYieldData([]);
        setUniqueCropsForChart([]);
      } finally {
        setIsLoadingYieldData(false);
      }

      // Fetch Fertilizer Data
      setIsLoadingFertilizerData(true);
      try {
        const fertilizerQuery = query(collection(db, "fertilizerLogs"), where("farmId", "==", user.farmId), orderBy("dateApplied", "asc"));
        const fertilizerSnapshot = await getDocs(fertilizerQuery);
        const fertilizerLogs = fertilizerSnapshot.docs.map(doc => doc.data() as FertilizerLog);
        
        if (fertilizerLogs.length > 0) {
            const usageByMonth: { [month: string]: number } = {};
            monthNames.forEach(m => usageByMonth[m] = 0); // Initialize all months to 0

            fertilizerLogs.forEach(log => {
                if (log.dateApplied && typeof log.amountApplied === 'number') {
                    const monthName = format(parseISO(log.dateApplied), 'MMM');
                    usageByMonth[monthName] += log.amountApplied;
                }
            });
            setFertilizerChartData(monthNames.map(month => ({ month, usage: usageByMonth[month] || 0 })));
        } else {
            setFertilizerChartData(monthNames.map(month => ({ month, usage: 0 })));
        }
      } catch (error) {
        console.error("Error fetching fertilizer data:", error);
        setFertilizerChartData(monthNames.map(month => ({ month, usage: 0 })));
      } finally {
        setIsLoadingFertilizerData(false);
      }

      // Fetch Water Data
      setIsLoadingWaterData(true);
      try {
        const waterQuery = query(collection(db, "irrigationLogs"), where("farmId", "==", user.farmId), orderBy("irrigationDate", "asc"));
        const waterSnapshot = await getDocs(waterQuery);
        const waterLogs = waterSnapshot.docs.map(doc => doc.data() as IrrigationLog);

        if (waterLogs.length > 0) {
            const usageByMonth: { [month: string]: number } = {};
            monthNames.forEach(m => usageByMonth[m] = 0);

            waterLogs.forEach(log => {
                if (log.irrigationDate && typeof log.amountApplied === 'number') {
                    const monthName = format(parseISO(log.irrigationDate), 'MMM');
                    usageByMonth[monthName] += log.amountApplied;
                }
            });
            setWaterChartData(monthNames.map(month => ({ month, usage: usageByMonth[month] || 0 })));
        } else {
            setWaterChartData(monthNames.map(month => ({ month, usage: 0 })));
        }
      } catch (error) {
        console.error("Error fetching water usage data:", error);
        setWaterChartData(monthNames.map(month => ({ month, usage: 0 })));
      } finally {
        setIsLoadingWaterData(false);
      }
    };

    fetchAllAnalyticsData();
  }, [user]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Farm Analytics"
        description="Insights into your resource usage and crop yields for your farm."
        icon={Icons.Analytics}
      />

      <Alert>
        <Icons.Info className="h-4 w-4" />
        <AlertTitle>Data Source Information</AlertTitle>
        <AlertDescription>
          Charts below are generated from your farm's logged data in Firestore. Ensure you have logged sufficient data for meaningful trends.
        </AlertDescription>
      </Alert>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>Fertilizer Usage Trend</CardTitle>
            <CardDescription>Monthly fertilizer application overview (sum of amounts logged).</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            {isLoadingFertilizerData ? (
                <div className="flex items-center justify-center h-full">
                    <Skeleton className="w-full h-[280px]" />
                </div>
            ) : fertilizerChartData.some(d => d.usage > 0) ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={fertilizerChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" stroke="hsl(var(--foreground))" fontSize={12} />
                  <YAxis stroke="hsl(var(--foreground))" fontSize={12}/>
                  <Tooltip
                      contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))' }}
                      labelStyle={{ color: 'hsl(var(--foreground))' }}
                  />
                  <Legend wrapperStyle={{fontSize: "12px"}}/>
                  <Bar dataKey="usage" fill="hsl(var(--chart-1))" name="Fertilizer Amount" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
                <div className="flex items-center justify-center h-full">
                    <p className="text-muted-foreground">No fertilizer data logged for this farm.</p>
                </div>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>Water Usage Trend</CardTitle>
            <CardDescription>Monthly water consumption overview (sum of amounts logged).</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
             {isLoadingWaterData ? (
                <div className="flex items-center justify-center h-full">
                    <Skeleton className="w-full h-[280px]" />
                </div>
            ) : waterChartData.some(d => d.usage > 0) ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={waterChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" stroke="hsl(var(--foreground))" fontSize={12} />
                  <YAxis stroke="hsl(var(--foreground))" fontSize={12}/>
                  <Tooltip
                      contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))' }}
                      labelStyle={{ color: 'hsl(var(--foreground))' }}
                  />
                  <Legend wrapperStyle={{fontSize: "12px"}}/>
                  <Line type="monotone" dataKey="usage" stroke="hsl(var(--chart-2))" name="Water Amount" strokeWidth={2} dot={{ r: 4, fill: "hsl(var(--chart-2))" }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
                <div className="flex items-center justify-center h-full">
                    <p className="text-muted-foreground">No irrigation data logged for this farm.</p>
                </div>
            )}
          </CardContent>
        </Card>
      </div>

       <Card className="shadow-lg">
        <CardHeader>
          <CardTitle>Historical Yield Comparison</CardTitle>
          <CardDescription>Year-over-year yield trends for your farm's logged crops (total yield amount per year).</CardDescription>
        </CardHeader>
        <CardContent className="h-[350px]">
          {isLoadingYieldData ? (
            <div className="flex items-center justify-center h-full">
              <Skeleton className="w-full h-[300px]" />
            </div>
          ) : dynamicYieldData.length > 0 && uniqueCropsForChart.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dynamicYieldData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="year" stroke="hsl(var(--foreground))" fontSize={12} />
                <YAxis stroke="hsl(var(--foreground))" fontSize={12} />
                <Tooltip
                  contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))' }}
                  labelStyle={{ color: 'hsl(var(--foreground))' }}
                />
                <Legend wrapperStyle={{fontSize: "12px"}}/>
                {uniqueCropsForChart.map((cropName, index) => (
                  <Bar
                    key={cropName}
                    dataKey={cropName}
                    fill={chartColors[index % chartColors.length]}
                    name={cropName}
                    radius={[4, 4, 0, 0]}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-full">
              <p className="text-muted-foreground">No harvesting data with yields recorded for this farm to display historical trends.</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle>Resource Optimization Tips</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
            <div className="flex items-start gap-3 p-3 bg-secondary/50 rounded-md">
                <Icons.Water className="w-5 h-5 text-primary flex-shrink-0 mt-1"/>
                <p className="text-sm text-muted-foreground">Consider drip irrigation for vegetable plots to reduce water usage and improve application efficiency.</p>
            </div>
            <div className="flex items-start gap-3 p-3 bg-secondary/50 rounded-md">
                <Icons.Soil className="w-5 h-5 text-primary flex-shrink-0 mt-1"/>
                <p className="text-sm text-muted-foreground">Regular soil testing can help optimize fertilizer application, saving costs and improving soil health for better yields.</p>
            </div>
             <div className="flex items-start gap-3 p-3 bg-secondary/50 rounded-md">
                <Icons.Recycle className="w-5 h-5 text-primary flex-shrink-0 mt-1"/>
                <p className="text-sm text-muted-foreground">Explore cover cropping and no-till practices to enhance soil organic matter and reduce erosion. Ask the AI Expert for sustainability advice tailored to your farm!</p>
            </div>
        </CardContent>
      </Card>

    </div>
  );
}
