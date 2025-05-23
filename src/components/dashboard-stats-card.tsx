
import type { LucideIcon } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

interface DashboardStatsCardProps {
  title: string;
  value: string | number | undefined; // Allow undefined for loading
  icon: LucideIcon;
  unit?: string;
  isLoading?: boolean;
  trend?: string; 
  trendColor?: 'text-green-600' | 'text-red-600' | 'text-muted-foreground'; 
}

export function DashboardStatsCard({
  title,
  value,
  icon: Icon,
  unit,
  isLoading = false,
  trend,
  trendColor = 'text-muted-foreground',
}: DashboardStatsCardProps) {
  return (
    <Card className="shadow-lg hover:shadow-xl transition-shadow duration-300">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <Icon className="h-5 w-5 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <>
            <Skeleton className="h-8 w-3/4 mb-2" />
            <Skeleton className="h-4 w-1/2" />
          </>
        ) : (
          <>
            <div className="text-3xl font-bold text-foreground">
              {value !== undefined ? value : <Skeleton className="h-8 w-1/2 inline-block" />}
              {unit && value !== undefined && <span className="text-xl font-normal ml-1">{unit}</span>}
            </div>
            {trend && (
              <p className={`text-xs ${trendColor} mt-1`}>
                {trend}
              </p>
            )}
            {value === undefined && !isLoading && <p className="text-xs text-muted-foreground mt-1">No data available.</p>}
          </>
        )}
      </CardContent>
    </Card>
  );
}
