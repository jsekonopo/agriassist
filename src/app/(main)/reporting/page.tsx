
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
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from '@/components/ui/label';

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

type TaskStatusFilter = "All Tasks" | "To Do" | "In Progress" | "Done";

export default function ReportingPage() {
  const [allCropYields, setAllCropYields] = useState<CropYieldSummary[]>([]);
  const [filteredCropYields, setFilteredCropYields] = useState<CropYieldSummary[]>([]);
  const [uniqueCropNames, setUniqueCropNames] = useState<string[]>([]);
  const [selectedCropFilter, setSelectedCropFilter] = useState<string>("All Crops");

  const [allTasks, setAllTasks] = useState<TaskLog[]>([]);
  const [taskSummary, setTaskSummary] = useState<TaskStatusSummary | null>(null);
  const [selectedTaskStatusFilter, setSelectedTaskStatusFilter] = useState<TaskStatusFilter>("All Tasks");
  
  const [financialSummary, setFinancialSummary] = useState<FinancialSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();

  useEffect(() => {
    if (!user || !user.farmId) {
      setIsLoading(false);
      setAllCropYields([]);
      setFilteredCropYields([]);
      setUniqueCropNames([]);
      setAllTasks([]);
      setTaskSummary(null);
      setFinancialSummary(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    const fetchReportData = async () => {
      try {
        // Fetch Harvesting Logs
        const harvestingQuery = query(collection(db, "harvestingLogs"), where("farmId", "==", user.farmId), orderBy("cropName", "asc"));
        const harvestingSnapshot = await getDocs(harvestingQuery);
        const harvestingLogs: HarvestingLog[] = harvestingSnapshot.docs.map(doc => doc.data() as HarvestingLog);

        const yieldMap = new Map<string, { total: number; unit: string; count: number }>();
        const cropNames = new Set<string>();
        harvestingLogs.forEach(log => {
          cropNames.add(log.cropName);
          if (log.cropName && typeof log.yieldAmount === 'number') {
            const existing = yieldMap.get(log.cropName) || { total: 0, unit: log.yieldUnit || 'units', count: 0 };
            existing.total += log.yieldAmount;
            if (!existing.unit && log.yieldUnit) existing.unit = log.yieldUnit; // Prefer first unit found for a crop
            existing.count++;
            yieldMap.set(log.cropName, existing);
          }
        });
        const yields: CropYieldSummary[] = Array.from(yieldMap.entries()).map(([cropName, data]) => ({
          cropName,
          totalYield: data.total,
          unit: data.unit,
        }));
        setAllCropYields(yields);
        setFilteredCropYields(yields); // Initially show all
        setUniqueCropNames(["All Crops", ...Array.from(cropNames).sort()]);

        // Fetch Task Logs
        const tasksQuery = query(collection(db, "taskLogs"), where("farmId", "==", user.farmId));
        const tasksSnapshot = await getDocs(tasksQuery);
        const fetchedTasks: TaskLog[] = tasksSnapshot.docs.map(doc => doc.data() as TaskLog);
        setAllTasks(fetchedTasks);

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

  // Effect to filter crop yields
  useEffect(() => {
    if (selectedCropFilter === "All Crops") {
      setFilteredCropYields(allCropYields);
    } else {
      setFilteredCropYields(allCropYields.filter(yieldData => yieldData.cropName === selectedCropFilter));
    }
  }, [selectedCropFilter, allCropYields]);

  // Effect to calculate task summary based on filter
  useEffect(() => {
    const filteredTasks = selectedTaskStatusFilter === "All Tasks" 
      ? allTasks 
      : allTasks.filter(task => task.status === selectedTaskStatusFilter);
    
    const summary: TaskStatusSummary = { toDo: 0, inProgress: 0, done: 0, total: 0 };
    filteredTasks.forEach(log => {
      if (log.status === "To Do") summary.toDo++;
      else if (log.status === "In Progress") summary.inProgress++;
      else if (log.status === "Done") summary.done++;
    });
    summary.total = filteredTasks.length; // Total of filtered tasks
    if (selectedTaskStatusFilter !== "All Tasks") { // Adjust counts if specific status is filtered
        if (selectedTaskStatusFilter === "To Do") { summary.inProgress = 0; summary.done = 0; }
        else if (selectedTaskStatusFilter === "In Progress") { summary.toDo = 0; summary.done = 0; }
        else if (selectedTaskStatusFilter === "Done") { summary.toDo = 0; summary.inProgress = 0; }
    } else { // Recalculate all for "All Tasks"
        summary.toDo = allTasks.filter(t => t.status === "To Do").length;
        summary.inProgress = allTasks.filter(t => t.status === "In Progress").length;
        summary.done = allTasks.filter(t => t.status === "Done").length;
        summary.total = allTasks.length;
    }
    setTaskSummary(summary);
  }, [selectedTaskStatusFilter, allTasks]);


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
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <CardTitle>Crop Yield Summary</CardTitle>
              <CardDescription>Total harvested yield per crop for your farm.</CardDescription>
            </div>
            <div className="w-full sm:w-auto sm:min-w-[200px]">
              <Label htmlFor="crop-filter" className="sr-only">Filter by Crop</Label>
              <Select value={selectedCropFilter} onValueChange={(value) => setSelectedCropFilter(value)}>
                <SelectTrigger id="crop-filter" aria-label="Filter by Crop">
                  <SelectValue placeholder="Filter by Crop" />
                </SelectTrigger>
                <SelectContent>
                  {uniqueCropNames.map(cropName => (
                    <SelectItem key={cropName} value={cropName}>{cropName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-3/4" />
            </div>
          ) : filteredCropYields.length > 0 ? (
            <Table>
              <TableCaption>Data derived from your farm's harvesting logs. Filtered by: {selectedCropFilter}.</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[200px]">Crop Name</TableHead>
                  <TableHead className="text-right">Total Yield</TableHead>
                  <TableHead>Unit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCropYields.map((crop) => (
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
                {selectedCropFilter === "All Crops" 
                  ? "No harvesting logs with yield information found in Firestore for this farm."
                  : `No harvesting logs with yield information found for "${selectedCropFilter}".`}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <Card className="shadow-lg">
        <CardHeader>
           <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <CardTitle>Task Status Overview</CardTitle>
              <CardDescription>Summary of your farm's tasks by their current status.</CardDescription>
            </div>
            <div className="w-full sm:w-auto sm:min-w-[200px]">
              <Label htmlFor="task-status-filter" className="sr-only">Filter by Task Status</Label>
              <Select value={selectedTaskStatusFilter} onValueChange={(value) => setSelectedTaskStatusFilter(value as TaskStatusFilter)}>
                <SelectTrigger id="task-status-filter" aria-label="Filter by Task Status">
                  <SelectValue placeholder="Filter by Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All Tasks">All Tasks</SelectItem>
                  <SelectItem value="To Do">To Do</SelectItem>
                  <SelectItem value="In Progress">In Progress</SelectItem>
                  <SelectItem value="Done">Done</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
             <div className="space-y-2">
              <Skeleton className="h-6 w-1/2" />
              <Skeleton className="h-6 w-1/3" />
              <Skeleton className="h-6 w-1/4" />
            </div>
          ) : taskSummary && (taskSummary.total > 0 || selectedTaskStatusFilter !== "All Tasks") ? (
            <ul className="space-y-2 text-sm">
              {selectedTaskStatusFilter === "All Tasks" || selectedTaskStatusFilter === "To Do" ? 
                <li className="flex justify-between"><span>To Do:</span> <span className="font-medium">{taskSummary.toDo}</span></li> : null}
              {selectedTaskStatusFilter === "All Tasks" || selectedTaskStatusFilter === "In Progress" ? 
                <li className="flex justify-between"><span>In Progress:</span> <span className="font-medium">{taskSummary.inProgress}</span></li> : null}
              {selectedTaskStatusFilter === "All Tasks" || selectedTaskStatusFilter === "Done" ? 
                <li className="flex justify-between"><span>Done:</span> <span className="font-medium">{taskSummary.done}</span></li> : null}
              <li className="flex justify-between border-t pt-2 mt-2 font-semibold">
                <span>Total {selectedTaskStatusFilter !== "All Tasks" ? selectedTaskStatusFilter : ""} Tasks:</span> 
                <span>
                    {selectedTaskStatusFilter === "To Do" ? taskSummary.toDo :
                     selectedTaskStatusFilter === "In Progress" ? taskSummary.inProgress :
                     selectedTaskStatusFilter === "Done" ? taskSummary.done :
                     taskSummary.total}
                </span>
              </li>
            </ul>
          ) : (
             <Alert>
                <Icons.Info className="h-4 w-4" />
                <AlertTitle>No Task Data</AlertTitle>
                <AlertDescription>
                  {selectedTaskStatusFilter === "All Tasks" 
                    ? "No tasks found in Firestore for this farm."
                    : `No tasks found with status "${selectedTaskStatusFilter}".`}
                </AlertDescription>
              </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

    