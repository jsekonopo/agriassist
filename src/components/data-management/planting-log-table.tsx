
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

interface PlantingLog {
  id: string;
  cropName: string;
  plantingDate: string; // Stored as YYYY-MM-DD string
  fieldId: string;
  seedsUsed?: string;
  notes?: string;
  submittedAt: string; // ISO string
}

export function PlantingLogTable() {
  const [logs, setLogs] = useState<PlantingLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const storedLogs = localStorage.getItem("plantingLogs");
      if (storedLogs) {
        const parsedLogs = JSON.parse(storedLogs) as PlantingLog[];
        // Sort by submittedAt descending (newest first)
        parsedLogs.sort((a, b) => parseISO(b.submittedAt).getTime() - parseISO(a.submittedAt).getTime());
        setLogs(parsedLogs);
      }
    } catch (e) {
      console.error("Failed to load planting logs:", e);
      setError("Could not load planting logs. Data might be corrupted.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleDeleteLog = (logId: string) => {
    if (window.confirm("Are you sure you want to delete this log? This action cannot be undone.")) {
      try {
        const updatedLogs = logs.filter(log => log.id !== logId);
        localStorage.setItem("plantingLogs", JSON.stringify(updatedLogs));
        setLogs(updatedLogs);
      } catch (e) {
        console.error("Failed to delete log:", e);
        setError("Could not delete the log.");
      }
    }
  };
  
  if (isLoading) {
    return <p>Loading planting logs...</p>;
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <Icons.AlertCircle className="h-4 w-4" />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (logs.length === 0) {
    return (
      <Alert>
        <Icons.Info className="h-4 w-4" />
        <AlertTitle>No Planting Logs Found</AlertTitle>
        <AlertDescription>
          You haven&apos;t recorded any planting activities yet. Add a new log using the form above.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="mt-8 border rounded-lg shadow-sm">
      <Table>
        <TableCaption>A list of your recent planting logs. Data is stored locally in your browser.</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[150px]">Crop Name</TableHead>
            <TableHead className="w-[150px]">Planting Date</TableHead>
            <TableHead>Field ID</TableHead>
            <TableHead>Seeds Used</TableHead>
            <TableHead>Notes</TableHead>
            <TableHead className="text-right w-[100px]">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {logs.map((log) => (
            <TableRow key={log.id}>
              <TableCell className="font-medium">{log.cropName}</TableCell>
              <TableCell>{format(parseISO(log.plantingDate), "MMM dd, yyyy")}</TableCell>
              <TableCell>{log.fieldId}</TableCell>
              <TableCell>{log.seedsUsed || "N/A"}</TableCell>
              <TableCell className="max-w-xs truncate">{log.notes || "N/A"}</TableCell>
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
