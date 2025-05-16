import Image from 'next/image';
import { PageHeader } from '@/components/layout/page-header';
import { DashboardStatsCard } from '@/components/dashboard-stats-card';
import { Icons } from '@/components/icons';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Separator } from '@/components/ui/separator';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'; // Using recharts directly

const sampleYieldData = [
  { name: 'Corn', yield: 4000, lastYearYield: 3800 },
  { name: 'Soybeans', yield: 3000, lastYearYield: 2900 },
  { name: 'Wheat', yield: 2400, lastYearYield: 2500 },
  { name: 'Canola', yield: 2000, lastYearYield: 2100 },
];

const sampleResourceData = [
  { name: 'Water', value: 65 }, // Percentage used
  { name: 'Fertilizer', value: 40 }, // Percentage used
];
const COLORS = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))'];


export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Farm Dashboard"
        description="Overview of your farm's performance and activities."
        icon={Icons.Dashboard}
      />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <DashboardStatsCard
          title="Total Acreage"
          value="150"
          unit="acres"
          icon={Icons.Location}
          trend="+10 acres from last year"
          trendColor="text-green-600"
        />
        <DashboardStatsCard
          title="Active Crops"
          value="4"
          icon={Icons.Planting}
        />
        <DashboardStatsCard
          title="Next Harvest"
          value="Corn"
          icon={Icons.Harvesting}
          trend="In 3 weeks"
        />
        <DashboardStatsCard
          title="Weather Alert"
          value="Sunny"
          icon={Icons.Weather}
          trend="No alerts"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2 shadow-lg">
          <CardHeader>
            <CardTitle>Crop Yield Overview (kg/acre)</CardTitle>
            <CardDescription>Comparison of current and last year's yield.</CardDescription>
          </CardHeader>
          <CardContent className="h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={sampleYieldData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" stroke="hsl(var(--foreground))" fontSize={12} />
                <YAxis stroke="hsl(var(--foreground))" fontSize={12} />
                <Tooltip
                  contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))' }}
                  labelStyle={{ color: 'hsl(var(--foreground))' }}
                />
                <Legend wrapperStyle={{fontSize: "12px"}}/>
                <Bar dataKey="yield" fill="hsl(var(--primary))" name="Current Yield" radius={[4, 4, 0, 0]} />
                <Bar dataKey="lastYearYield" fill="hsl(var(--secondary))" name="Last Year Yield" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>Resource Usage</CardTitle>
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
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle>Upcoming Tasks</CardTitle>
          <CardDescription>Key activities for the upcoming week.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-3">
            <li className="flex items-center justify-between p-3 bg-muted/50 rounded-md">
              <div>
                <p className="font-medium">Soil Testing - Field A</p>
                <p className="text-sm text-muted-foreground">Scheduled for: Tomorrow</p>
              </div>
              <Button variant="outline" size="sm">View Details</Button>
            </li>
            <li className="flex items-center justify-between p-3 bg-muted/50 rounded-md">
              <div>
                <p className="font-medium">Fertilizer Application - Corn Fields</p>
                <p className="text-sm text-muted-foreground">Scheduled for: In 3 days</p>
              </div>
              <Button variant="outline" size="sm">View Details</Button>
            </li>
             <li className="flex items-center justify-between p-3 bg-muted/50 rounded-md">
              <div>
                <p className="font-medium">Irrigation Check - All Fields</p>
                <p className="text-sm text-muted-foreground">Scheduled for: This Friday</p>
              </div>
              <Button variant="outline" size="sm">View Details</Button>
            </li>
          </ul>
          <Button variant="link" className="mt-4 px-0">View all tasks</Button>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="shadow-lg">
            <CardHeader>
                <CardTitle>Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
                <Button variant="outline" asChild className="h-auto py-3">
                    <Link href="/data-management" className="flex flex-col items-center gap-1">
                        <Icons.PlusCircle className="w-6 h-6"/>
                        <span>New Planting Log</span>
                    </Link>
                </Button>
                <Button variant="outline" asChild className="h-auto py-3">
                    <Link href="/data-management" className="flex flex-col items-center gap-1">
                        <Icons.PlusCircle className="w-6 h-6"/>
                        <span>New Harvest Log</span>
                    </Link>
                </Button>
                 <Button variant="outline" asChild className="h-auto py-3">
                    <Link href="/data-management" className="flex flex-col items-center gap-1">
                        <Icons.PlusCircle className="w-6 h-6"/>
                        <span>Add Soil Data</span>
                    </Link>
                </Button>
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
                <CardTitle>Farm Insights</CardTitle>
                <CardDescription>Tips and recommendations for your farm.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
                <div className="flex items-start gap-3 p-3 bg-primary/10 rounded-md">
                    <Icons.Info className="w-5 h-5 text-primary flex-shrink-0 mt-1"/>
                    <p className="text-sm">Consider crop rotation for Field B to improve soil health. <Link href="/ai-expert" className="text-primary font-medium underline">Learn more</Link></p>
                </div>
                 <div className="flex items-start gap-3 p-3 bg-primary/10 rounded-md">
                    <Icons.Dollar className="w-5 h-5 text-primary flex-shrink-0 mt-1"/>
                    <p className="text-sm">Explore sustainable practices to potentially monetize carbon credits. <Link href="/ai-expert" className="text-primary font-medium underline">Get suggestions</Link></p>
                </div>
            </CardContent>
        </Card>
      </div>
    </div>
  );
}
