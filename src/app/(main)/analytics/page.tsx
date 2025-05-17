
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
import { format, parseISO } from 'date-fns';
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
  [cropNameAndUnit: string]: number | string; // e.g., "Corn (kg)": 5000
}

interface MonthlyUsageData {
  month: string; // e.g., "Jan"
  usage: number;
}

interface FertilizerLog {
  id: string;
  dateApplied: string; // YYYY-MM-DD
  amountApplied: number; 
  // fertilizerType: string;
  // amountUnit: string; // Assuming this unit is for the amountApplied
  farmId: string;
}

interface IrrigationLog {
  id: string;
  irrigationDate: string; // YYYY-MM-DD
  amountApplied: number; 
  // waterSource: string;
  // amountUnit: string; // Assuming this unit is for the amountApplied
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
  const [uniqueCropUnitKeysForChart, setUniqueCropUnitKeysForChart] = useState<string[]>([]); // Stores keys like "Corn (kg)"
  const [isLoadingYieldData, setIsLoadingYieldData] = useState(true);

  const [fertilizerChartData, setFertilizerChartData] = useState<MonthlyUsageData[]>([]);
  const [isLoadingFertilizerData, setIsLoadingFertilizerData] = useState(true);
  const [waterChartData, setWaterChartData] = useState<MonthlyUsageData[]>([]);
  const [isLoadingWaterData, setIsLoadingWaterData] = useState(true);

  useEffect(() => {
    if (!user || !user.farmId) {
      setIsLoadingYieldData(false);
      setDynamicYieldData([]);
      setUniqueCropUnitKeysForChart([]);
      setIsLoadingFertilizerData(false);
      setFertilizerChartData(monthNames.map(month => ({ month, usage: 0 })));
      setIsLoadingWaterData(false);
      setWaterChartData(monthNames.map(month => ({ month, usage: 0 })));
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
            const yieldsByYearAndCropUnit: { [year: string]: { [cropUnitKey: string]: number } } = {};
            const allCropUnitKeys = new Set<string>();

            yieldLogs.forEach(log => {
              if (log.harvestDate && typeof log.yieldAmount === 'number' && log.yieldUnit) {
                const year = format(parseISO(log.harvestDate), 'yyyy');
                const cropUnitKey = `${log.cropName} (${log.yieldUnit})`;
                allCropUnitKeys.add(cropUnitKey);

                if (!yieldsByYearAndCropUnit[year]) yieldsByYearAndCropUnit[year] = {};
                if (!yieldsByYearAndCropUnit[year][cropUnitKey]) yieldsByYearAndCropUnit[year][cropUnitKey] = 0;
                yieldsByYearAndCropUnit[year][cropUnitKey] += log.yieldAmount;
              }
            });
            
            const uniqueKeysArray = Array.from(allCropUnitKeys).sort();
            setUniqueCropUnitKeysForChart(uniqueKeysArray);

            const chartData: DynamicYieldData[] = Object.entries(yieldsByYearAndCropUnit).map(([year, cropUnits]) => {
              const yearData: DynamicYieldData = { year };
              uniqueKeysArray.forEach(key => {
                yearData[key] = cropUnits[key] || 0;
              });
              return yearData;
            }).sort((a, b) => parseInt(a.year) - parseInt(b.year)); // Ensure years are sorted
            setDynamicYieldData(chartData);
        } else {
            setDynamicYieldData([]);
            setUniqueCropUnitKeysForChart([]);
        }
      } catch (error) {
        console.error("Error fetching yield data for analytics:", error);
        setDynamicYieldData([]);
        setUniqueCropUnitKeysForChart([]);
      } finally {
        setIsLoadingYieldData(false);
      }

      // Fetch Fertilizer Data
      setIsLoadingFertilizerData(true);
      try {
        const fertilizerQuery = query(collection(db, "fertilizerLogs"), where("farmId", "==", user.farmId), orderBy("dateApplied", "asc"));
        const fertilizerSnapshot = await getDocs(fertilizerQuery);
        const fertilizerLogs = fertilizerSnapshot.docs.map(doc => doc.data() as FertilizerLog);
        
        const usageByMonth: { [month: string]: number } = {};
        monthNames.forEach(m => usageByMonth[m] = 0); 

        if (fertilizerLogs.length > 0) {
            fertilizerLogs.forEach(log => {
                if (log.dateApplied && typeof log.amountApplied === 'number') {
                    const monthName = format(parseISO(log.dateApplied), 'MMM');
                    usageByMonth[monthName] += log.amountApplied;
                }
            });
        }
        setFertilizerChartData(monthNames.map(month => ({ month, usage: usageByMonth[month] || 0 })));
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

        const usageByMonth: { [month: string]: number } = {};
        monthNames.forEach(m => usageByMonth[m] = 0);

        if (waterLogs.length > 0) {
            waterLogs.forEach(log => {
                if (log.irrigationDate && typeof log.amountApplied === 'number') {
                    const monthName = format(parseISO(log.irrigationDate), 'MMM');
                    usageByMonth[monthName] += log.amountApplied;
                }
            });
        }
        setWaterChartData(monthNames.map(month => ({ month, usage: usageByMonth[month] || 0 })));
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
          Charts below are generated from your farm's logged data in Firestore. Ensure you have logged sufficient data (including units) for meaningful trends. Units for fertilizer and water usage are summed directly from logged amounts.
        </AlertDescription>
      </Alert>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>Fertilizer Usage Trend</CardTitle>
            <CardDescription>Monthly fertilizer application overview (sum of amounts logged). Units are as logged.</CardDescription>
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
                  <Bar dataKey="usage" fill="hsl(var(--chart-1))" name="Fertilizer Amount (mixed units)" radius={[4, 4, 0, 0]} />
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
            <CardDescription>Monthly water consumption overview (sum of amounts logged). Units are as logged.</CardDescription>
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
                  <Line type="monotone" dataKey="usage" stroke="hsl(var(--chart-2))" name="Water Amount (mixed units)" strokeWidth={2} dot={{ r: 4, fill: "hsl(var(--chart-2))" }} activeDot={{ r: 6 }} />
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
          <CardDescription>Year-over-year yield trends. Different units for the same crop are shown as separate series.</CardDescription>
        </CardHeader>
        <CardContent className="h-[350px]">
          {isLoadingYieldData ? (
            <div className="flex items-center justify-center h-full">
              <Skeleton className="w-full h-[300px]" />
            </div>
          ) : dynamicYieldData.length > 0 && uniqueCropUnitKeysForChart.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dynamicYieldData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="year" stroke="hsl(var(--foreground))" fontSize={12} />
                <YAxis stroke="hsl(var(--foreground))" fontSize={12} label={{ value: 'Yield Amount (Unit as per Legend)', angle: -90, position: 'insideLeft', style: {textAnchor: 'middle', fill: 'hsl(var(--muted-foreground))'}, dy: 40 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))' }}
                  labelStyle={{ color: 'hsl(var(--foreground))' }}
                />
                <Legend wrapperStyle={{fontSize: "12px"}}/>
                {uniqueCropUnitKeysForChart.map((cropUnitKey, index) => (
                  <Bar
                    key={cropUnitKey}
                    dataKey={cropUnitKey}
                    fill={chartColors[index % chartColors.length]}
                    name={cropUnitKey}
                    radius={[4, 4, 0, 0]}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-full">
              <p className="text-muted-foreground">No harvesting data with yields and units recorded to display historical trends.</p>
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
