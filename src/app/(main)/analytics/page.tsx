"use client";

import Image from 'next/image';
import { PageHeader } from '@/components/layout/page-header';
import { Icons } from '@/components/icons';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from 'recharts';

const fertilizerData = [
  { month: 'Jan', usage: 50 }, { month: 'Feb', usage: 60 }, { month: 'Mar', usage: 55 },
  { month: 'Apr', usage: 70 }, { month: 'May', usage: 80 }, { month: 'Jun', usage: 75 },
];

const waterUsageData = [
  { month: 'Jan', usage: 200 }, { month: 'Feb', usage: 220 }, { month: 'Mar', usage: 210 },
  { month: 'Apr', usage: 250 }, { month: 'May', usage: 300 }, { month: 'Jun', usage: 280 },
];

const yieldTrendData = [
  { year: '2020', corn: 150, soy: 100 },
  { year: '2021', corn: 160, soy: 105 },
  { year: '2022', corn: 155, soy: 110 },
  { year: '2023', corn: 170, soy: 115 },
];


export default function AnalyticsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Farm Analytics"
        description="Insights into your resource usage and crop yields."
        icon={Icons.Analytics}
      />

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>Fertilizer Usage Trend (kg/month)</CardTitle>
            <CardDescription>Monthly fertilizer application overview.</CardDescription>
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
            <CardDescription>Monthly water consumption for irrigation.</CardDescription>
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
          <CardTitle>Historical Yield Comparison (bushels/acre)</CardTitle>
          <CardDescription>Year-over-year yield trends for major crops.</CardDescription>
        </CardHeader>
        <CardContent className="h-[350px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={yieldTrendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="year" stroke="hsl(var(--foreground))" fontSize={12} />
              <YAxis stroke="hsl(var(--foreground))" fontSize={12} />
              <Tooltip 
                contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))' }}
                labelStyle={{ color: 'hsl(var(--foreground))' }}
              />
              <Legend wrapperStyle={{fontSize: "12px"}}/>
              <Bar dataKey="corn" fill="hsl(var(--chart-4))" name="Corn Yield" radius={[4, 4, 0, 0]} />
              <Bar dataKey="soy" fill="hsl(var(--chart-5))" name="Soybean Yield" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
      
      <Alert>
        <Icons.Info className="h-4 w-4" />
        <AlertTitle>More Analytics Coming Soon!</AlertTitle>
        <AlertDescription>
          We are working on providing more detailed analytics, including planting time recommendations based on historical data and weather patterns. Stay tuned for updates.
        </AlertDescription>
      </Alert>

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
