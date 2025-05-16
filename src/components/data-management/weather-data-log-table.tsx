
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
import { useAuth } from "@/contexts/auth-context";
import { db } from "@/lib/firebase";
import { collection, query, where, getDocs, deleteDoc, doc, orderBy, Timestamp } from "firebase/firestore";

interface WeatherLog {
  id: string; // Firestore document ID
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
  submittedAt?: string; // ISO string, might be from old data or client-gen
  createdAt?: Timestamp | Date; // Firestore Timestamp or converted Date
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
  const { user } = useAuth();

  useEffect(() => {
    if (!user) {
      setIsLoading(false);
      setLogs([]);
      return;
    }

    setIsLoading(true);
    setError(null);
    const fetchWeatherLogs = async () => {
      try {
        const q = query(
          collection(db, "weatherLogs"),
          where("userId", "==", user.uid),
          orderBy("createdAt", "desc") // Order by Firestore server timestamp
        );
        const querySnapshot = await getDocs(q);
        const fetchedLogs: WeatherLog[] = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          createdAt: doc.data().createdAt?.toDate ? doc.data().createdAt.toDate() : undefined,
        } as WeatherLog));
        setLogs(fetchedLogs);
      } catch (e) {
        console.error("Failed to load weather logs from Firestore:", e);
        setError("Could not load weather logs. Please try again.");
        toast({
          title: "Error Loading Logs",
          description: "Failed to load weather logs from Firestore.",
          variant: "destructive"
        });
      } finally {
        setIsLoading(false);
      }
    };
    fetchWeatherLogs();
  }, [user, refreshTrigger, toast]);

  const handleDeleteLog = async (logId: string) => {
     if (!user) {
      toast({ title: "Not Authenticated", description: "You must be logged in.", variant: "destructive" });
      return;
    }
    if (window.confirm("Are you sure you want to delete this weather log? This action cannot be undone.")) {
      try {
        await deleteDoc(doc(db, "weatherLogs", logId));
        toast({
          title: "Weather Log Deleted",
          description: "The weather log has been removed from Firestore.",
        });
        onLogDeleted(); // Trigger refresh
      } catch (e) {
        console.error("Failed to delete weather log from Firestore:", e);
        setError("Could not delete the weather log.");
        toast({
          title: "Error Deleting Log",
          description: "Failed to delete the weather log from Firestore.",
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

  if (!user && !isLoading) {
     return (
      <Alert className="mt-4">
        <Icons.Info className="h-4 w-4" />
        <AlertTitle>Please Log In</AlertTitle>
        <AlertDescription>
          Log in to view and manage your weather logs.
        </AlertDescription>
      </Alert>
    );
  }

  if (logs.length === 0 && user) {
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
        <TableCaption>A list of your recent weather logs. Data is stored in Firestore.</TableCaption>
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
