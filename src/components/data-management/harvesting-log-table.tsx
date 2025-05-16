
"use client";

import { useEffect, useState } from "react";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Icons } from "@/components/icons";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { format, parseISO } from "date-fns";
import { useToast } from "@/hooks/use-toast";

interface HarvestingLog {
  id: string;
  cropName: string;
  harvestDate: string; // Stored as YYYY-MM-DD string
  fieldId: string;
  yieldAmount?: number;
  yieldUnit?: string;
  notes?: string;
  submittedAt: string; // ISO string
}

interface HarvestingLogTableProps {
  refreshTrigger: number; // Used to trigger re-fetch
  onLogDeleted: () => void; // Callback to trigger refresh from parent
}

export function HarvestingLogTable({ refreshTrigger, onLogDeleted }: HarvestingLogTableProps) {
  const [logs, setLogs] = useState<HarvestingLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    setIsLoading(true);
    setError(null);
    try {
      const storedLogs = localStorage.getItem("harvestingLogs");
      if (storedLogs) {
        const parsedLogs = JSON.parse(storedLogs) as HarvestingLog[];
        parsedLogs.sort((a, b) => parseISO(b.submittedAt).getTime() - parseISO(a.submittedAt).getTime());
        setLogs(parsedLogs);
      } else {
        setLogs([]);
      }
    } catch (e) {
      console.error("Failed to load harvesting logs:", e);
      setError("Could not load harvesting logs. Data might be corrupted.");
      toast({
        title: "Error Loading Logs",
        description: "Failed to load harvesting logs from local storage.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  }, [refreshTrigger, toast]);

  const handleDeleteLog = (logId: string) => {
    if (window.confirm("Are you sure you want to delete this log? This action cannot be undone.")) {
      try {
        const updatedLogs = logs.filter(log => log.id !== logId);
        localStorage.setItem("harvestingLogs", JSON.stringify(updatedLogs));
        setLogs(updatedLogs); // Optimistic update
        toast({
          title: "Log Deleted",
          description: "The harvesting log has been removed.",
        });
        onLogDeleted(); // Trigger refresh in parent
      } catch (e) {
        console.error("Failed to delete log:", e);
        setError("Could not delete the log.");
        toast({
          title: "Error Deleting Log",
          description: "Failed to delete the harvesting log.",
          variant: "destructive"
        });
      }
    }
  };
  
  if (isLoading) {
    return <p className="text-center text-muted-foreground py-4">Loading harvesting logs...</p>;
  }

  if (error) {
    return (
      <Alert variant="destructive" className="mt-4">
        <Icons.AlertCircle className="h-4 w-4" />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (logs.length === 0) {
    return (
      <Alert className="mt-4">
        <Icons.Info className="h-4 w-4" />
        <AlertTitle>No Harvesting Logs Found</AlertTitle>
        <AlertDescription>
          You haven&apos;t recorded any harvesting activities yet. Add a new log using the form.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="mt-8 border rounded-lg shadow-sm overflow-x-auto">
      <Table>
        <TableCaption>A list of your recent harvesting logs. Data is stored locally in your browser.</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-[150px]">Crop Name</TableHead>
            <TableHead className="min-w-[150px]">Harvest Date</TableHead>
            <TableHead className="min-w-[120px]">Field ID</TableHead>
            <TableHead className="min-w-[120px]">Yield</TableHead>
            <TableHead className="min-w-[200px]">Notes</TableHead>
            <TableHead className="text-right w-[100px]">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {logs.map((log) => (
            <TableRow key={log.id}>
              <TableCell className="font-medium">{log.cropName}</TableCell>
              <TableCell>{format(parseISO(log.harvestDate), "MMM dd, yyyy")}</TableCell>
              <TableCell>{log.fieldId}</TableCell>
              <TableCell>{log.yieldAmount !== undefined ? `${log.yieldAmount} ${log.yieldUnit || ''}`.trim() : "N/A"}</TableCell>
              <TableCell className="max-w-xs truncate whitespace-nowrap overflow-hidden text-ellipsis">{log.notes || "N/A"}</TableCell>
              <TableCell className="text-right">
                <Button variant="ghost" size="icon" onClick={() => handleDeleteLog(log.id)} aria-label="Delete log">
                  <Icons.Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
