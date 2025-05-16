
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

interface SoilLog {
  id: string;
  fieldId: string;
  sampleDate: string; // Stored as YYYY-MM-DD string
  phLevel?: number;
  organicMatter?: string;
  nutrients?: {
    nitrogen?: string;
    phosphorus?: string;
    potassium?: string;
  };
  treatmentsApplied?: string;
  notes?: string;
  submittedAt: string; // ISO string
}

interface SoilDataLogTableProps {
  refreshTrigger: number;
  onLogDeleted: () => void;
}

export function SoilDataLogTable({ refreshTrigger, onLogDeleted }: SoilDataLogTableProps) {
  const [logs, setLogs] = useState<SoilLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    setIsLoading(true);
    setError(null);
    try {
      const storedLogs = localStorage.getItem("soilDataLogs");
      if (storedLogs) {
        const parsedLogs = JSON.parse(storedLogs) as SoilLog[];
        parsedLogs.sort((a, b) => parseISO(b.submittedAt).getTime() - parseISO(a.submittedAt).getTime());
        setLogs(parsedLogs);
      } else {
        setLogs([]);
      }
    } catch (e) {
      console.error("Failed to load soil data logs:", e);
      setError("Could not load soil data logs. Data might be corrupted.");
      toast({
        title: "Error Loading Logs",
        description: "Failed to load soil data logs from local storage.",
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
        localStorage.setItem("soilDataLogs", JSON.stringify(updatedLogs));
        setLogs(updatedLogs);
        toast({
          title: "Log Deleted",
          description: "The soil data log has been removed.",
        });
        onLogDeleted();
      } catch (e) {
        console.error("Failed to delete log:", e);
        setError("Could not delete the log.");
         toast({
          title: "Error Deleting Log",
          description: "Failed to delete the soil data log.",
          variant: "destructive"
        });
      }
    }
  };
  
  if (isLoading) {
    return <p className="text-center text-muted-foreground py-4">Loading soil data logs...</p>;
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
        <AlertTitle>No Soil Data Logs Found</AlertTitle>
        <AlertDescription>
          You haven&apos;t recorded any soil data yet. Add a new log using the form.
        </AlertDescription>
      </Alert>
    );
  }

  const displayNutrients = (nutrients?: SoilLog['nutrients']) => {
    if (!nutrients) return "N/A";
    const parts: string[] = [];
    if (nutrients.nitrogen) parts.push(`N: ${nutrients.nitrogen}`);
    if (nutrients.phosphorus) parts.push(`P: ${nutrients.phosphorus}`);
    if (nutrients.potassium) parts.push(`K: ${nutrients.potassium}`);
    return parts.length > 0 ? parts.join(", ") : "N/A";
  };

  return (
    <div className="mt-8 border rounded-lg shadow-sm overflow-x-auto">
      <Table>
        <TableCaption>A list of your recent soil data logs. Data is stored locally in your browser.</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-[120px]">Field ID</TableHead>
            <TableHead className="min-w-[150px]">Sample Date</TableHead>
            <TableHead className="min-w-[80px]">pH</TableHead>
            <TableHead className="min-w-[150px]">Organic Matter</TableHead>
            <TableHead className="min-w-[200px]">Nutrients</TableHead>
            <TableHead className="min-w-[200px]">Treatments</TableHead>
            <TableHead className="min-w-[200px]">Notes</TableHead>
            <TableHead className="text-right w-[100px]">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {logs.map((log) => (
            <TableRow key={log.id}>
              <TableCell className="font-medium">{log.fieldId}</TableCell>
              <TableCell>{format(parseISO(log.sampleDate), "MMM dd, yyyy")}</TableCell>
              <TableCell>{log.phLevel !== undefined ? log.phLevel.toFixed(1) : "N/A"}</TableCell>
              <TableCell>{log.organicMatter || "N/A"}</TableCell>
              <TableCell className="whitespace-nowrap overflow-hidden text-ellipsis">{displayNutrients(log.nutrients)}</TableCell>
              <TableCell className="max-w-xs truncate whitespace-nowrap overflow-hidden text-ellipsis">{log.treatmentsApplied || "N/A"}</TableCell>
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
