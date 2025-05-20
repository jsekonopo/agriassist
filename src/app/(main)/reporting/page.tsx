
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
import { collection, query, where, getDocs, orderBy, Timestamp, QueryConstraint, doc } from 'firebase/firestore';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { CalendarIcon } from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import { format, parseISO, startOfDay, endOfDay } from 'date-fns';

interface HarvestingLog {
  id: string;
  cropName: string;
  harvestDate: string; // YYYY-MM-DD
  yieldAmount?: number;
  yieldUnit?: string;
  farmId: string;
  userId: string;
  fieldId?: string; 
}

interface Field {
  id: string;
  fieldName: string;
  farmId: string;
}

interface CropYieldSummary {
  cropName: string;
  totalYield: number;
  unit: string;
}

interface TaskLog {
  id: string;
  taskName: string;
  status: "To Do" | "In Progress" | "Done";
  dueDate?: string | null; // YYYY-MM-DD
  farmId: string;
  userId: string;
  createdAt?: Timestamp;
}

interface TaskStatusSummary {
  toDo: number;
  inProgress: number;
  done: number;
  total: number;
}

interface RevenueLog {
    id: string;
    date: string; // YYYY-MM-DD
    amount: number;
    farmId: string;
}

interface ExpenseLog {
    id: string;
    date: string; // YYYY-MM-DD
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
  const { user } = useAuth();
  // Crop Yield States
  const [allCropYields, setAllCropYields] = useState<CropYieldSummary[]>([]);
  const [filteredCropYields, setFilteredCropYields] = useState<CropYieldSummary[]>([]);
  const [uniqueCropNames, setUniqueCropNames] = useState<string[]>([]);
  const [selectedCropFilter, setSelectedCropFilter] = useState<string>("All Crops");
  const [cropYieldStartDate, setCropYieldStartDate] = useState<Date | undefined>(undefined);
  const [cropYieldEndDate, setCropYieldEndDate] = useState<Date | undefined>(undefined);
  const [farmFields, setFarmFields] = useState<Field[]>([]);
  const [selectedYieldFieldFilter, setSelectedYieldFieldFilter] = useState<string>("All Fields");
  const [isLoadingFields, setIsLoadingFields] = useState(true);


  // Task States
  const [allTasks, setAllTasks] = useState<TaskLog[]>([]);
  const [taskSummary, setTaskSummary] = useState<TaskStatusSummary | null>(null);
  const [selectedTaskStatusFilter, setSelectedTaskStatusFilter] = useState<TaskStatusFilter>("All Tasks");
  const [taskDueDateStart, setTaskDueDateStart] = useState<Date | undefined>(undefined);
  const [taskDueDateEnd, setTaskDueDateEnd] = useState<Date | undefined>(undefined);
  
  // Financial States
  const [financialSummary, setFinancialSummary] = useState<FinancialSummary | null>(null);
  const [financialStartDate, setFinancialStartDate] = useState<Date | undefined>(undefined);
  const [financialEndDate, setFinancialEndDate] = useState<Date | undefined>(undefined);
  
  // General Loading/Error States
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  

  useEffect(() => {
    if (!user || !user.farmId) {
      setIsLoading(false);
      setIsLoadingFields(false);
      setAllCropYields([]);
      setFilteredCropYields([]);
      setUniqueCropNames([]);
      setFarmFields([]);
      setAllTasks([]);
      setTaskSummary(null);
      setFinancialSummary(null);
      return;
    }

    setIsLoading(true);
    setIsLoadingFields(true);
    setError(null);

    const fetchReportData = async () => {
      try {
        // Fetch Fields for filtering
        const fieldsQueryRef = query(collection(db, "fields"), where("farmId", "==", user.farmId), orderBy("fieldName", "asc"));
        const fieldsSnapshot = await getDocs(fieldsQueryRef);
        const fetchedFields: Field[] = fieldsSnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as Field));
        setFarmFields([{ id: "All Fields", fieldName: "All Fields", farmId: user.farmId }, ...fetchedFields]);
        setIsLoadingFields(false);

        // Fetch Harvesting Logs based on date and field filters
        const harvestingQueryConstraints: QueryConstraint[] = [where("farmId", "==", user.farmId)];
        if (cropYieldStartDate) {
          harvestingQueryConstraints.push(where("harvestDate", ">=", format(startOfDay(cropYieldStartDate), "yyyy-MM-dd")));
        }
        if (cropYieldEndDate) {
          harvestingQueryConstraints.push(where("harvestDate", "<=", format(endOfDay(cropYieldEndDate), "yyyy-MM-dd")));
        }
        if (selectedYieldFieldFilter && selectedYieldFieldFilter !== "All Fields") {
            harvestingQueryConstraints.push(where("fieldId", "==", selectedYieldFieldFilter));
        }
        
        harvestingQueryConstraints.push(orderBy("harvestDate", "asc")); // Required for date range queries
        harvestingQueryConstraints.push(orderBy("cropName", "asc"));


        const harvestingQueryRef = query(collection(db, "harvestingLogs"), ...harvestingQueryConstraints);
        const harvestingSnapshot = await getDocs(harvestingQueryRef);
        const harvestingLogs: HarvestingLog[] = harvestingSnapshot.docs.map(docSnap => docSnap.data() as HarvestingLog);
        
        const yieldMap = new Map<string, { total: number; unit: string }>();
        const cropNamesSet = new Set<string>();
        harvestingLogs.forEach(log => {
          cropNamesSet.add(log.cropName);
          if (log.cropName && typeof log.yieldAmount === 'number' && log.yieldUnit) {
            const key = `${log.cropName} - ${log.yieldUnit}`; // Group by crop and unit
            const existing = yieldMap.get(key) || { total: 0, unit: log.yieldUnit };
            existing.total += log.yieldAmount;
            yieldMap.set(key, existing);
          }
        });
        const yields: CropYieldSummary[] = Array.from(yieldMap.entries()).map(([key, data]) => {
          const [cropName] = key.split(' - ');
          return { cropName, totalYield: data.total, unit: data.unit };
        });
        setAllCropYields(yields);
        // Update unique crop names only if the set of available crops changes, not just the data within them
        if (uniqueCropNames.length <=1 || cropNamesSet.size > (uniqueCropNames.length-1) || 
            !Array.from(cropNamesSet).every(name => uniqueCropNames.includes(name))) {
            setUniqueCropNames(["All Crops", ...Array.from(cropNamesSet).sort()]);
        }


        // Fetch Task Logs based on date filters for dueDate
        const tasksQueryConstraints: QueryConstraint[] = [where("farmId", "==", user.farmId)];
        if (taskDueDateStart) { // Start date only
            tasksQueryConstraints.push(where("dueDate", ">=", format(startOfDay(taskDueDateStart), "yyyy-MM-dd")));
            tasksQueryConstraints.push(orderBy("dueDate", "asc")); 
        }
        if (taskDueDateEnd) { // End date only
            tasksQueryConstraints.push(where("dueDate", "<=", format(endOfDay(taskDueDateEnd), "yyyy-MM-dd")));
            // If only end date is provided, we still need an orderBy("dueDate") for Firestore to allow the inequality.
            // If not already ordered by dueDate (e.g. if taskDueDateStart was also provided), add it.
            if (!taskDueDateStart) tasksQueryConstraints.push(orderBy("dueDate", "asc"));
        }
        if (!taskDueDateStart && !taskDueDateEnd) { // Add default sort if no date filter
            tasksQueryConstraints.push(orderBy("createdAt", "desc"));
        }
        const tasksQueryRef = query(collection(db, "taskLogs"), ...tasksQueryConstraints);
        const tasksSnapshot = await getDocs(tasksQueryRef);
        const fetchedTasks: TaskLog[] = tasksSnapshot.docs.map(docSnap => docSnap.data() as TaskLog);
        setAllTasks(fetchedTasks);
        
        // Fetch Financial Data based on date filters
        const baseFinancialQueryConstraints = [where("farmId", "==", user.farmId)];
        const financialDateConstraints: QueryConstraint[] = [];
        if (financialStartDate) financialDateConstraints.push(where("date", ">=", format(startOfDay(financialStartDate), "yyyy-MM-dd")));
        if (financialEndDate) financialDateConstraints.push(where("date", "<=", format(endOfDay(financialEndDate), "yyyy-MM-dd")));
        
        if (financialStartDate || financialEndDate) {
            // Ensure 'date' is the first orderBy if any date range filter is applied
            const existingDateOrderIndex = financialDateConstraints.findIndex(c => (c as any)._field?.segments?.join('/') === 'date');
            if (existingDateOrderIndex === -1) {
                financialDateConstraints.unshift(orderBy("date", "asc"));
            }
        }
        

        const revenueQueryRef = query(collection(db, "revenueLogs"), ...baseFinancialQueryConstraints, ...financialDateConstraints);
        const revenueSnapshot = await getDocs(revenueQueryRef);
        const revenueLogs: RevenueLog[] = revenueSnapshot.docs.map(docSnap => docSnap.data() as RevenueLog);
        const totalRevenue = revenueLogs.reduce((sum, log) => sum + (log.amount || 0), 0);

        const expenseQueryRef = query(collection(db, "expenseLogs"), ...baseFinancialQueryConstraints, ...financialDateConstraints);
        const expenseSnapshot = await getDocs(expenseQueryRef);
        const expenseLogs: ExpenseLog[] = expenseSnapshot.docs.map(docSnap => docSnap.data() as ExpenseLog);
        const totalExpenses = expenseLogs.reduce((sum, log) => sum + (log.amount || 0), 0);
        
        setFinancialSummary({ totalRevenue, totalExpenses, netProfit: totalRevenue - totalExpenses });

      } catch (e) {
        console.error("Error fetching report data from Firestore:", e);
        setError("Could not generate reports. Please ensure your Firestore indexes are set up if you see query errors in the console.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchReportData();
  }, [user, financialStartDate, financialEndDate, cropYieldStartDate, cropYieldEndDate, taskDueDateStart, taskDueDateEnd, selectedYieldFieldFilter, selectedCropFilter]); // Added selectedCropFilter dependency

  useEffect(() => {
    if (selectedCropFilter === "All Crops") {
      setFilteredCropYields(allCropYields);
    } else {
      setFilteredCropYields(allCropYields.filter(yieldData => yieldData.cropName === selectedCropFilter));
    }
  }, [selectedCropFilter, allCropYields]);

  useEffect(() => {
    const tasksToSummarize = selectedTaskStatusFilter === "All Tasks" 
      ? allTasks 
      : allTasks.filter(task => task.status === selectedTaskStatusFilter);
    
    const summary: TaskStatusSummary = { toDo: 0, inProgress: 0, done: 0, total: 0 };
    
    if (selectedTaskStatusFilter === "All Tasks") {
        summary.toDo = allTasks.filter(t => t.status === "To Do").length;
        summary.inProgress = allTasks.filter(t => t.status === "In Progress").length;
        summary.done = allTasks.filter(t => t.status === "Done").length;
        summary.total = allTasks.length;
    } else {
        tasksToSummarize.forEach(log => {
            if (log.status === "To Do") summary.toDo++;
            else if (log.status === "In Progress") summary.inProgress++;
            else if (log.status === "Done") summary.done++;
        });
        summary.total = tasksToSummarize.length;
    }
    setTaskSummary(summary);
  }, [selectedTaskStatusFilter, allTasks]);

  const clearFinancialDateFilters = () => { setFinancialStartDate(undefined); setFinancialEndDate(undefined); };
  const clearCropYieldAllFilters = () => { setCropYieldStartDate(undefined); setCropYieldEndDate(undefined); setSelectedCropFilter("All Crops"); setSelectedYieldFieldFilter("All Fields"); };
  const clearTaskAllFilters = () => { setTaskDueDateStart(undefined); setTaskDueDateEnd(undefined); setSelectedTaskStatusFilter("All Tasks"); };

  const formatCurrency = (value: number) => value.toLocaleString('en-US', { style: 'currency', currency: 'USD' }); 
  
  const getDateRangeDescription = (start?: Date, end?: Date, prefix: string = ""): string => {
    if (start && end) return `${prefix} from ${format(start, 'MMM dd, yyyy')} to ${format(end, 'MMM dd, yyyy')}`;
    if (start) return `${prefix} from ${format(start, 'MMM dd, yyyy')}`;
    if (end) return `${prefix} up to ${format(end, 'MMM dd, yyyy')}`;
    return "";
  };

  const getFieldFilterDescription = (selectedFieldFilterId: string, fieldsList: Field[]): string => {
    if (selectedFieldFilterId !== "All Fields") {
        const field = fieldsList.find(f => f.id === selectedFieldFilterId);
        return field ? ` for Field: ${field.fieldName}` : "";
    }
    return "";
  };

  if (!user && !isLoading) {
    return (
         <div className="space-y-8">
            <PageHeader title="Farm Reports" description="Summary of your farm's activities and performance." icon={Icons.Reporting} />
            <Alert> <Icons.Info className="h-4 w-4" /> <AlertTitle>Please Log In</AlertTitle> <AlertDescription> Log in to view your farm reports. </AlertDescription> </Alert>
        </div>
    );
  }
  
  if (!user?.farmId && !isLoading && user) {
    return (
         <div className="space-y-8">
            <PageHeader title="Farm Reports" description="Summary of your farm's activities and performance." icon={Icons.Reporting}/>
            <Alert> <Icons.Info className="h-4 w-4" /> <AlertTitle>Farm Association Needed</AlertTitle> <AlertDescription> Your account needs to be associated with a farm to view reports. Please check your profile or contact support. </AlertDescription> </Alert>
        </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader title="Farm Reports" description="Summary of your farm's activities and performance." icon={Icons.Reporting} />
        <Alert variant="destructive"> <Icons.AlertCircle className="h-4 w-4" /> <AlertTitle>Error Generating Reports</AlertTitle> <AlertDescription>{error}</AlertDescription> </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader title="Farm Reports" description="Summary of your farm's activities and performance based on your Firestore data." icon={Icons.Reporting} />

      <Card className="shadow-lg">
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <CardTitle>Financial Overview</CardTitle>
              <CardDescription>
                Summary of logged revenue and expenses{getDateRangeDescription(financialStartDate, financialEndDate)}.
              </CardDescription>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto items-center">
              <Popover><PopoverTrigger asChild><Button variant={"outline"} className={cn("w-full sm:w-auto justify-start text-left font-normal", !financialStartDate && "text-muted-foreground")}><CalendarIcon className="mr-2 h-4 w-4" />{financialStartDate ? format(financialStartDate, "PPP") : <span>Start Date</span>}</Button></PopoverTrigger><PopoverContent className="w-auto p-0"><Calendar mode="single" selected={financialStartDate} onSelect={setFinancialStartDate} initialFocus /></PopoverContent></Popover>
              <Popover><PopoverTrigger asChild><Button variant={"outline"} className={cn("w-full sm:w-auto justify-start text-left font-normal", !financialEndDate && "text-muted-foreground")}><CalendarIcon className="mr-2 h-4 w-4" />{financialEndDate ? format(financialEndDate, "PPP") : <span>End Date</span>}</Button></PopoverTrigger><PopoverContent className="w-auto p-0"><Calendar mode="single" selected={financialEndDate} onSelect={setFinancialEndDate} initialFocus disabled={(date) => financialStartDate ? date < financialStartDate : false} /></PopoverContent></Popover>
              {(financialStartDate || financialEndDate) && (<Button variant="ghost" onClick={clearFinancialDateFilters} size="sm" className="w-full sm:w-auto">Clear Dates</Button>)}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (<div className="space-y-2"> <Skeleton className="h-6 w-1/2" /> <Skeleton className="h-6 w-1/3" /> <Skeleton className="h-6 w-1/4" /> </div>
          ) : financialSummary ? (
            <ul className="space-y-3 text-base">
              <li className="flex justify-between items-center py-2 border-b"> <span className="text-muted-foreground">Total Revenue:</span> <span className="font-semibold text-green-600">{formatCurrency(financialSummary.totalRevenue)}</span> </li>
              <li className="flex justify-between items-center py-2 border-b"> <span className="text-muted-foreground">Total Expenses:</span> <span className="font-semibold text-red-600">{formatCurrency(financialSummary.totalExpenses)}</span> </li>
              <li className="flex justify-between items-center py-3 mt-2"> <span className="text-lg font-bold text-foreground">Net Profit / Loss:</span> <span className={cn("text-lg font-bold", financialSummary.netProfit >= 0 ? "text-green-700" : "text-red-700")}> {formatCurrency(financialSummary.netProfit)} </span> </li>
            </ul>
          ) : ( <Alert> <Icons.Info className="h-4 w-4" /> <AlertTitle>No Financial Data</AlertTitle> <AlertDescription> No revenue or expense logs found for this farm{financialStartDate || financialEndDate ? ' in the selected date range' : ''}. </AlertDescription> </Alert> )}
        </CardContent>
      </Card>

      <Card className="shadow-lg">
        <CardHeader>
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div> 
                <CardTitle>Crop Yield Summary</CardTitle> 
                <CardDescription>
                    Total harvested yield per crop.
                    {getDateRangeDescription(cropYieldStartDate, cropYieldEndDate, ' Harvests')}.
                    {selectedCropFilter !== "All Crops" ? ` Crop: ${selectedCropFilter}.` : ""}
                    {getFieldFilterDescription(selectedYieldFieldFilter, farmFields)}
                </CardDescription> 
            </div>
            <div className="flex flex-col sm:flex-row flex-wrap gap-2 w-full md:w-auto items-stretch md:items-center">
                <div className="w-full sm:w-auto md:min-w-[150px]"> <Label htmlFor="crop-filter" className="sr-only">Filter by Crop</Label> <Select value={selectedCropFilter} onValueChange={(value) => setSelectedCropFilter(value)}> <SelectTrigger id="crop-filter" aria-label="Filter by Crop"> <SelectValue placeholder="Filter by Crop" /> </SelectTrigger> <SelectContent> {uniqueCropNames.map(cropName => ( <SelectItem key={cropName} value={cropName}>{cropName}</SelectItem> ))} </SelectContent> </Select> </div>
                <div className="w-full sm:w-auto md:min-w-[150px]"> <Label htmlFor="field-yield-filter" className="sr-only">Filter by Field</Label> 
                    <Select value={selectedYieldFieldFilter} onValueChange={setSelectedYieldFieldFilter} disabled={isLoadingFields}> 
                        <SelectTrigger id="field-yield-filter" aria-label="Filter by Field"> <SelectValue placeholder={isLoadingFields ? "Loading fields..." : "Filter by Field"} /> </SelectTrigger> 
                        <SelectContent> 
                            {farmFields.map(field => ( <SelectItem key={field.id} value={field.id}>{field.fieldName}</SelectItem> ))} 
                        </SelectContent> 
                    </Select> 
                </div>
                <Popover><PopoverTrigger asChild><Button variant={"outline"} className={cn("w-full sm:w-auto justify-start text-left font-normal", !cropYieldStartDate && "text-muted-foreground")}><CalendarIcon className="mr-2 h-4 w-4" />{cropYieldStartDate ? format(cropYieldStartDate, "PPP") : <span>Harvest Start</span>}</Button></PopoverTrigger><PopoverContent className="w-auto p-0"><Calendar mode="single" selected={cropYieldStartDate} onSelect={setCropYieldStartDate} initialFocus /></PopoverContent></Popover>
                <Popover><PopoverTrigger asChild><Button variant={"outline"} className={cn("w-full sm:w-auto justify-start text-left font-normal", !cropYieldEndDate && "text-muted-foreground")}><CalendarIcon className="mr-2 h-4 w-4" />{cropYieldEndDate ? format(cropYieldEndDate, "PPP") : <span>Harvest End</span>}</Button></PopoverTrigger><PopoverContent className="w-auto p-0"><Calendar mode="single" selected={cropYieldEndDate} onSelect={setCropYieldEndDate} initialFocus disabled={(date) => cropYieldStartDate ? date < cropYieldStartDate : false} /></PopoverContent></Popover>
                {(cropYieldStartDate || cropYieldEndDate || selectedCropFilter !== "All Crops" || selectedYieldFieldFilter !== "All Fields") && (<Button variant="ghost" onClick={clearCropYieldAllFilters} size="sm" className="w-full sm:w-auto self-center">Clear Filters</Button>)}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? ( <div className="space-y-2"> <Skeleton className="h-8 w-full" /> <Skeleton className="h-8 w-full" /> <Skeleton className="h-8 w-3/4" /> </div>
          ) : filteredCropYields.length > 0 ? (
            <Table>
              <TableCaption>Data derived from your farm's harvesting logs.</TableCaption>
              <TableHeader> <TableRow> <TableHead className="w-[200px]">Crop Name</TableHead> <TableHead className="text-right">Total Yield</TableHead> <TableHead>Unit</TableHead> </TableRow> </TableHeader>
              <TableBody> {filteredCropYields.map((crop, index) => ( <TableRow key={`${crop.cropName}-${crop.unit}-${index}`}> <TableCell className="font-medium">{crop.cropName}</TableCell> <TableCell className="text-right">{crop.totalYield.toLocaleString()}</TableCell> <TableCell>{crop.unit}</TableCell> </TableRow> ))} </TableBody>
            </Table>
          ) : ( <Alert> <Icons.Info className="h-4 w-4" /> <AlertTitle>No Yield Data</AlertTitle> <AlertDescription> {`No harvesting logs found for "${selectedCropFilter === "All Crops" ? "any crop" : selectedCropFilter}"${getFieldFilterDescription(selectedYieldFieldFilter, farmFields)}${getDateRangeDescription(cropYieldStartDate, cropYieldEndDate, ' with harvest dates')}.`} </AlertDescription> </Alert> )}
        </CardContent>
      </Card>

      <Card className="shadow-lg">
        <CardHeader>
           <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div> <CardTitle>Task Status Overview</CardTitle> <CardDescription>Summary of tasks by status{getDateRangeDescription(taskDueDateStart, taskDueDateEnd, ' with due dates')}. Filtered by: {selectedTaskStatusFilter}.</CardDescription> </div>
            <div className="flex flex-col sm:flex-row flex-wrap gap-2 w-full md:w-auto items-stretch md:items-center">
                <div className="w-full sm:w-auto md:min-w-[180px]"> <Label htmlFor="task-status-filter" className="sr-only">Filter by Task Status</Label> <Select value={selectedTaskStatusFilter} onValueChange={(value) => setSelectedTaskStatusFilter(value as TaskStatusFilter)}> <SelectTrigger id="task-status-filter" aria-label="Filter by Task Status"> <SelectValue placeholder="Filter by Status" /> </SelectTrigger> <SelectContent> <SelectItem value="All Tasks">All Tasks</SelectItem> <SelectItem value="To Do">To Do</SelectItem> <SelectItem value="In Progress">In Progress</SelectItem> <SelectItem value="Done">Done</SelectItem> </SelectContent> </Select> </div>
                <Popover><PopoverTrigger asChild><Button variant={"outline"} className={cn("w-full sm:w-auto justify-start text-left font-normal", !taskDueDateStart && "text-muted-foreground")}><CalendarIcon className="mr-2 h-4 w-4" />{taskDueDateStart ? format(taskDueDateStart, "PPP") : <span>Due Start</span>}</Button></PopoverTrigger><PopoverContent className="w-auto p-0"><Calendar mode="single" selected={taskDueDateStart} onSelect={setTaskDueDateStart} initialFocus /></PopoverContent></Popover>
                <Popover><PopoverTrigger asChild><Button variant={"outline"} className={cn("w-full sm:w-auto justify-start text-left font-normal", !taskDueDateEnd && "text-muted-foreground")}><CalendarIcon className="mr-2 h-4 w-4" />{taskDueDateEnd ? format(taskDueDateEnd, "PPP") : <span>Due End</span>}</Button></PopoverTrigger><PopoverContent className="w-auto p-0"><Calendar mode="single" selected={taskDueDateEnd} onSelect={setTaskDueDateEnd} initialFocus disabled={(date) => taskDueDateStart ? date < taskDueDateStart : false} /></PopoverContent></Popover>
                {(taskDueDateStart || taskDueDateEnd || selectedTaskStatusFilter !== "All Tasks") && (<Button variant="ghost" onClick={clearTaskAllFilters} size="sm" className="w-full sm:w-auto self-center">Clear Filters</Button>)}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? ( <div className="space-y-2"> <Skeleton className="h-6 w-1/2" /> <Skeleton className="h-6 w-1/3" /> <Skeleton className="h-6 w-1/4" /> </div>
          ) : taskSummary && (taskSummary.total > 0 || selectedTaskStatusFilter !== "All Tasks" || taskDueDateStart || taskDueDateEnd) ? (
            <ul className="space-y-2 text-sm">
              {(selectedTaskStatusFilter === "All Tasks" || selectedTaskStatusFilter === "To Do") && taskSummary.toDo > 0 ? <li className="flex justify-between"><span>To Do:</span> <span className="font-medium">{taskSummary.toDo}</span></li> : null}
              {(selectedTaskStatusFilter === "All Tasks" || selectedTaskStatusFilter === "In Progress") && taskSummary.inProgress > 0 ? <li className="flex justify-between"><span>In Progress:</span> <span className="font-medium">{taskSummary.inProgress}</span></li> : null}
              {(selectedTaskStatusFilter === "All Tasks" || selectedTaskStatusFilter === "Done") && taskSummary.done > 0 ? <li className="flex justify-between"><span>Done:</span> <span className="font-medium">{taskSummary.done}</span></li> : null}
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
          ) : ( <Alert> <Icons.Info className="h-4 w-4" /> <AlertTitle>No Task Data</AlertTitle> <AlertDescription> {`No tasks found for this farm${getDateRangeDescription(taskDueDateStart, taskDueDateEnd, ' with due dates')} that match the status "${selectedTaskStatusFilter}".`} </AlertDescription> </Alert> )}
        </CardContent>
      </Card>
    </div>
  );
}
    

    

    

    
