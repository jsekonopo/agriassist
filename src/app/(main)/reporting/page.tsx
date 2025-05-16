
"use client";

import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/layout/page-header';
import { Icons } from '@/components/icons';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableCaption } from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/contexts/auth-context';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { cn } from '@/lib/utils';

interface HarvestingLog {
  id: string;
  cropName: string;
  yieldAmount?: number;
  yieldUnit?: string;
  farmId: string;
  userId: string;
}

interface CropYieldSummary {
  cropName: string;
  totalYield: number;
  unit: string;
}

interface TaskLog {
  id: string;
  status: "To Do" | "In Progress" | "Done";
  farmId: string;
  userId: string;
}

interface TaskStatusSummary {
  toDo: number;
  inProgress: number;
  done: number;
  total: number;
}

interface RevenueLog {
    id: string;
    amount: number;
    farmId: string;
}

interface ExpenseLog {
    id: string;
    amount: number;
    farmId: string;
}

interface FinancialSummary {
    totalRevenue: number;
    totalExpenses: number;
    netProfit: number;
}

export default function ReportingPage() {
  const [cropYields, setCropYields] = useState<CropYieldSummary[]>([]);
  const [taskSummary, setTaskSummary] = useState<TaskStatusSummary | null>(null);
  const [financialSummary, setFinancialSummary] = useState<FinancialSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();

  useEffect(() => {
    if (!user || !user.farmId) {
      setIsLoading(false);
      setCropYields([]);
      setTaskSummary(null);
      setFinancialSummary(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    const fetchReportData = async () => {
      try {
        // Fetch Harvesting Logs
        const harvestingQuery = query(collection(db, "harvestingLogs"), where("farmId", "==", user.farmId));
        const harvestingSnapshot = await getDocs(harvestingQuery);
        const harvestingLogs: HarvestingLog[] = harvestingSnapshot.docs.map(doc => doc.data() as HarvestingLog);

        const yieldMap = new Map<string, { total: number; unit: string; count: number }>();
        harvestingLogs.forEach(log => {
          if (log.cropName && typeof log.yieldAmount === 'number') {
            const existing = yieldMap.get(log.cropName) || { total: 0, unit: log.yieldUnit || 'units', count: 0 };
            existing.total += log.yieldAmount;
            if (!existing.unit && log.yieldUnit) existing.unit = log.yieldUnit;
            existing.count++;
            yieldMap.set(log.cropName, existing);
          }
        });
        const yields: CropYieldSummary[] = Array.from(yieldMap.entries()).map(([cropName, data]) => ({
          cropName,
          totalYield: data.total,
          unit: data.unit,
        }));
        setCropYields(yields);

        // Fetch Task Logs
        const tasksQuery = query(collection(db, "taskLogs"), where("farmId", "==", user.farmId));
        const tasksSnapshot = await getDocs(tasksQuery);
        const taskLogs: TaskLog[] = tasksSnapshot.docs.map(doc => doc.data() as TaskLog);

        const taskStatusSummary: TaskStatusSummary = { toDo: 0, inProgress: 0, done: 0, total: taskLogs.length };
        taskLogs.forEach(log => {
          if (log.status === "To Do") taskStatusSummary.toDo++;
          else if (log.status === "In Progress") taskStatusSummary.inProgress++;
          else if (log.status === "Done") taskStatusSummary.done++;
        });
        setTaskSummary(taskStatusSummary);

        // Fetch Revenue Logs
        const revenueQuery = query(collection(db, "revenueLogs"), where("farmId", "==", user.farmId));
        const revenueSnapshot = await getDocs(revenueQuery);
        const revenueLogs: RevenueLog[] = revenueSnapshot.docs.map(doc => doc.data() as RevenueLog);
        const totalRevenue = revenueLogs.reduce((sum, log) => sum + (log.amount || 0), 0);

        // Fetch Expense Logs
        const expenseQuery = query(collection(db, "expenseLogs"), where("farmId", "==", user.farmId));
        const expenseSnapshot = await getDocs(expenseQuery);
        const expenseLogs: ExpenseLog[] = expenseSnapshot.docs.map(doc => doc.data() as ExpenseLog);
        const totalExpenses = expenseLogs.reduce((sum, log) => sum + (log.amount || 0), 0);
        
        setFinancialSummary({
            totalRevenue,
            totalExpenses,
            netProfit: totalRevenue - totalExpenses,
        });

      } catch (e) {
        console.error("Error fetching report data from Firestore:", e);
        setError("Could not generate reports. Please try again.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchReportData();
  }, [user]);

  if (!user && !isLoading) {
    return (
         <div className="space-y-8">
            <PageHeader
                title="Farm Reports"
                description="Summary of your farm's activities and performance."
                icon={Icons.Reporting}
            />
            <Alert>
                <Icons.Info className="h-4 w-4" />
                <AlertTitle>Please Log In</AlertTitle>
                <AlertDescription>
                Log in to view your farm reports.
                </AlertDescription>
            </Alert>
        </div>
    );
  }
  
  if (!user?.farmId && !isLoading && user) {
    return (
         <div className="space-y-8">
            <PageHeader
                title="Farm Reports"
                description="Summary of your farm's activities and performance."
                icon={Icons.Reporting}
            />
            <Alert>
                <Icons.Info className="h-4 w-4" />
                <AlertTitle>Farm Association Needed</AlertTitle>
                <AlertDescription>
                Your account needs to be associated with a farm to view reports. Please check your profile or contact support.
                </AlertDescription>
            </Alert>
        </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Farm Reports"
          description="Summary of your farm's activities and performance."
          icon={Icons.Reporting}
        />
        <Alert variant="destructive">
          <Icons.AlertCircle className="h-4 w-4" />
          <AlertTitle>Error Generating Reports</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  const formatCurrency = (value: number) => {
    return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' }); // Adjust currency as needed
  };

  return (
    <div className="space-y-8">
      <PageHeader
        title="Farm Reports"
        description="Summary of your farm's activities and performance based on your Firestore data."
        icon={Icons.Reporting}
      />

      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle>Financial Overview</CardTitle>
          <CardDescription>Summary of your farm's logged revenue and expenses.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-6 w-1/2" />
              <Skeleton className="h-6 w-1/3" />
              <Skeleton className="h-6 w-1/4" />
            </div>
          ) : financialSummary ? (
            <ul className="space-y-3 text-base">
              <li className="flex justify-between items-center py-2 border-b">
                <span className="text-muted-foreground">Total Revenue:</span>
                <span className="font-semibold text-green-600">{formatCurrency(financialSummary.totalRevenue)}</span>
              </li>
              <li className="flex justify-between items-center py-2 border-b">
                <span className="text-muted-foreground">Total Expenses:</span>
                <span className="font-semibold text-red-600">{formatCurrency(financialSummary.totalExpenses)}</span>
              </li>
              <li className="flex justify-between items-center py-3 mt-2">
                <span className="text-lg font-bold text-foreground">Net Profit / Loss:</span>
                <span className={cn(
                    "text-lg font-bold",
                    financialSummary.netProfit >= 0 ? "text-green-700" : "text-red-700"
                  )}
                >
                  {formatCurrency(financialSummary.netProfit)}
                </span>
              </li>
            </ul>
          ) : (
            <Alert>
              <Icons.Info className="h-4 w-4" />
              <AlertTitle>No Financial Data</AlertTitle>
              <AlertDescription>
                No revenue or expense logs found in Firestore for this farm to generate this summary.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle>Crop Yield Summary</CardTitle>
          <CardDescription>Total harvested yield per crop for your farm.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-3/4" />
            </div>
          ) : cropYields.length > 0 ? (
            <Table>
              <TableCaption>Data derived from your farm's harvesting logs.</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[200px]">Crop Name</TableHead>
                  <TableHead className="text-right">Total Yield</TableHead>
                  <TableHead>Unit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cropYields.map((crop) => (
                  <TableRow key={crop.cropName}>
                    <TableCell className="font-medium">{crop.cropName}</TableCell>
                    <TableCell className="text-right">{crop.totalYield.toLocaleString()}</TableCell>
                    <TableCell>{crop.unit}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <Alert>
              <Icons.Info className="h-4 w-4" />
              <AlertTitle>No Yield Data</AlertTitle>
              <AlertDescription>
                No harvesting logs with yield information found in Firestore for this farm to generate this report.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle>Task Status Overview</CardTitle>
          <CardDescription>Summary of your farm's tasks by their current status.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
             <div className="space-y-2">
              <Skeleton className="h-6 w-1/2" />
              <Skeleton className="h-6 w-1/3" />
              <Skeleton className="h-6 w-1/4" />
            </div>
          ) : taskSummary && taskSummary.total > 0 ? (
            <ul className="space-y-2 text-sm">
              <li className="flex justify-between"><span>To Do:</span> <span className="font-medium">{taskSummary.toDo}</span></li>
              <li className="flex justify-between"><span>In Progress:</span> <span className="font-medium">{taskSummary.inProgress}</span></li>
              <li className="flex justify-between"><span>Done:</span> <span className="font-medium">{taskSummary.done}</span></li>
              <li className="flex justify-between border-t pt-2 mt-2 font-semibold"><span>Total Tasks:</span> <span>{taskSummary.total}</span></li>
            </ul>
          ) : (
             <Alert>
                <Icons.Info className="h-4 w-4" />
                <AlertTitle>No Task Data</AlertTitle>
                <AlertDescription>
                  No tasks found in Firestore for this farm to generate this summary.
                </AlertDescription>
              </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

