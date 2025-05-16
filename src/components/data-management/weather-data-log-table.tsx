
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

interface WeatherLog {
  id: string;
  date: string; // Stored as YYYY-MM-DD string
  location: string;
  temperatureHigh?: number;
  temperatureLow?: number;
  precipitation?: number;
  precipitationUnit?: string;
  windSpeed?: number;
  windSpeedUnit?: string;
  conditions?: string;
  notes?: string;
  submittedAt: string; // ISO string
}

interface WeatherDataLogTableProps {
  refreshTrigger: number;
  onLogDeleted: () => void;
}

export function WeatherDataLogTable({ refreshTrigger, onLogDeleted }: WeatherDataLogTableProps) {
  const [logs, setLogs] = useState<WeatherLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    setIsLoading(true);
    setError(null);
    try {
      const storedLogs = localStorage.getItem("weatherLogs");
      if (storedLogs) {
        const parsedLogs = JSON.parse(storedLogs) as WeatherLog[];
        parsedLogs.sort((a, b) => parseISO(b.submittedAt).getTime() - parseISO(a.submittedAt).getTime());
        setLogs(parsedLogs);
      } else {
        setLogs([]);
      }
    } catch (e) {
      console.error("Failed to load weather logs:", e);
      setError("Could not load weather logs. Data might be corrupted.");
      toast({
        title: "Error Loading Logs",
        description: "Failed to load weather logs from local storage.",
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
        localStorage.setItem("weatherLogs", JSON.stringify(updatedLogs));
        setLogs(updatedLogs);
        toast({
          title: "Log Deleted",
          description: "The weather log has been removed.",
        });
        onLogDeleted();
      } catch (e) {
        console.error("Failed to delete log:", e);
        setError("Could not delete the log.");
        toast({
          title: "Error Deleting Log",
          description: "Failed to delete the weather log.",
          variant: "destructive"
        });
      }
    }
  };
  
  if (isLoading) {
    return <p className="text-center text-muted-foreground py-4">Loading weather logs...</p>;
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
        <AlertTitle>No Weather Logs Found</AlertTitle>
        <AlertDescription>
          You haven&apos;t recorded any weather observations yet. Add a new log using the form.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="mt-8 border rounded-lg shadow-sm overflow-x-auto">
      <Table>
        <TableCaption>A list of your recent weather logs. Data is stored locally in your browser.</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-[150px]">Date</TableHead>
            <TableHead className="min-w-[150px]">Location</TableHead>
            <TableHead className="min-w-[120px]">Temp (H/L)</TableHead>
            <TableHead className="min-w-[120px]">Precipitation</TableHead>
            <TableHead className="min-w-[120px]">Wind</TableHead>
            <TableHead className="min-w-[150px]">Conditions</TableHead>
            <TableHead className="min-w-[200px]">Notes</TableHead>
            <TableHead className="text-right w-[100px]">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {logs.map((log) => (
            <TableRow key={log.id}>
              <TableCell>{format(parseISO(log.date), "MMM dd, yyyy")}</TableCell>
              <TableCell className="font-medium">{log.location}</TableCell>
              <TableCell>
                {log.temperatureHigh !== undefined ? `${log.temperatureHigh}°C` : "N/A"} / {log.temperatureLow !== undefined ? `${log.temperatureLow}°C` : "N/A"}
              </TableCell>
              <TableCell>
                {log.precipitation !== undefined ? `${log.precipitation} ${log.precipitationUnit || 'mm'}`.trim() : "N/A"}
              </TableCell>
              <TableCell>
                {log.windSpeed !== undefined ? `${log.windSpeed} ${log.windSpeedUnit || 'km/h'}`.trim() : "N/A"}
              </TableCell>
              <TableCell>{log.conditions || "N/A"}</TableCell>
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
