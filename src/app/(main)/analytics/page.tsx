
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

// Sample data remains for charts not yet connected to dynamic data
const fertilizerData = [
  { month: 'Jan', usage: 50 }, { month: 'Feb', usage: 60 }, { month: 'Mar', usage: 55 },
  { month: 'Apr', usage: 70 }, { month: 'May', usage: 80 }, { month: 'Jun', usage: 75 },
];

const waterUsageData = [
  { month: 'Jan', usage: 200 }, { month: 'Feb', usage: 220 }, { month: 'Mar', usage: 210 },
  { month: 'Apr', usage: 250 }, { month: 'May', usage: 300 }, { month: 'Jun', usage: 280 },
];

interface HarvestingLog {
  id: string;
  cropName: string;
  harvestDate: string; // YYYY-MM-DD
  yieldAmount?: number;
  yieldUnit?: string;
  userId: string;
}

interface DynamicYieldData {
  year: string;
  [cropName: string]: number | string; // year is string, yields are numbers
}

const chartColors = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
];

export default function AnalyticsPage() {
  const { user } = useAuth();
  const [dynamicYieldData, setDynamicYieldData] = useState<DynamicYieldData[]>([]);
  const [uniqueCropsForChart, setUniqueCropsForChart] = useState<string[]>([]);
  const [isLoadingYieldData, setIsLoadingYieldData] = useState(true);

  useEffect(() => {
    if (!user) {
      setIsLoadingYieldData(false);
      setDynamicYieldData([]);
      setUniqueCropsForChart([]);
      return;
    }

    const fetchYieldData = async () => {
      setIsLoadingYieldData(true);
      try {
        const q = query(collection(db, "harvestingLogs"), where("userId", "==", user.uid), orderBy("harvestDate", "asc"));
        const querySnapshot = await getDocs(q);
        const logs = querySnapshot.docs.map(doc => doc.data() as HarvestingLog);

        if (logs.length === 0) {
          setDynamicYieldData([]);
          setUniqueCropsForChart([]);
          setIsLoadingYieldData(false);
          return;
        }

        const yieldsByYearAndCrop: { [year: string]: { [crop: string]: number } } = {};
        const allCrops = new Set<string>();

        logs.forEach(log => {
          if (log.harvestDate && typeof log.yieldAmount === 'number') {
            const year = format(parseISO(log.harvestDate), 'yyyy');
            allCrops.add(log.cropName);
            if (!yieldsByYearAndCrop[year]) {
              yieldsByYearAndCrop[year] = {};
            }
            if (!yieldsByYearAndCrop[year][log.cropName]) {
              yieldsByYearAndCrop[year][log.cropName] = 0;
            }
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

      } catch (error) {
        console.error("Error fetching yield data for analytics:", error);
        // Optionally set an error state to display to the user
      } finally {
        setIsLoadingYieldData(false);
      }
    };

    fetchYieldData();
  }, [user]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Farm Analytics"
        description="Insights into your resource usage and crop yields."
        icon={Icons.Analytics}
      />

      <Alert>
        <Icons.Info className="h-4 w-4" />
        <AlertTitle>Data Source Information</AlertTitle>
        <AlertDescription>
          The "Historical Yield Comparison" chart below is generated from your harvesting logs.
          The "Fertilizer Usage" and "Water Usage" charts currently display sample data. Future enhancements will allow for dynamic data from dedicated logging features.
        </AlertDescription>
      </Alert>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>Fertilizer Usage Trend (kg/month)</CardTitle>
            <CardDescription>Monthly fertilizer application overview. (Sample Data)</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={fertilizerData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" stroke="hsl(var(--foreground))" fontSize={12} />
                <YAxis stroke="hsl(var(--foreground))" fontSize={12}/>
                <Tooltip 
                    contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))' }}
                    labelStyle={{ color: 'hsl(var(--foreground))' }}
                />
                <Legend wrapperStyle={{fontSize: "12px"}}/>
                <Bar dataKey="usage" fill="hsl(var(--chart-1))" name="Fertilizer (kg)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>Water Usage Trend (liters/month)</CardTitle>
            <CardDescription>Monthly water consumption for irrigation. (Sample Data)</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={waterUsageData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" stroke="hsl(var(--foreground))" fontSize={12} />
                <YAxis stroke="hsl(var(--foreground))" fontSize={12}/>
                <Tooltip
                    contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))' }}
                    labelStyle={{ color: 'hsl(var(--foreground))' }}
                />
                <Legend wrapperStyle={{fontSize: "12px"}}/>
                <Line type="monotone" dataKey="usage" stroke="hsl(var(--chart-2))" name="Water (Liters)" strokeWidth={2} dot={{ r: 4, fill: "hsl(var(--chart-2))" }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

       <Card className="shadow-lg">
        <CardHeader>
          <CardTitle>Historical Yield Comparison</CardTitle>
          <CardDescription>Year-over-year yield trends for your logged crops (total yield amount per year).</CardDescription>
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
              <p className="text-muted-foreground">No harvesting data with yields recorded to display historical trends.</p>
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
                <p className="text-sm text-muted-foreground">Consider drip irrigation for vegetable plots to reduce water usage by up to 20%.</p>
            </div>
            <div className="flex items-start gap-3 p-3 bg-secondary/50 rounded-md">
                <Icons.Soil className="w-5 h-5 text-primary flex-shrink-0 mt-1"/>
                <p className="text-sm text-muted-foreground">Regular soil testing can help optimize fertilizer application, saving costs and improving soil health.</p>
            </div>
        </CardContent>
      </Card>

    </div>
  );
}
