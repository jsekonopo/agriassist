
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
import { useAuth, type UserRole } from "@/contexts/auth-context"; // Import UserRole
import { db } from "@/lib/firebase";
import { collection, query, where, getDocs, deleteDoc, doc, orderBy, Timestamp } from "firebase/firestore";

interface WeatherLog {
  id: string; 
  date: string; 
  location: string;
  temperatureHigh?: number;
  temperatureLow?: number;
  precipitation?: number;
  precipitationUnit?: string;
  windSpeed?: number;
  windSpeedUnit?: string;
  conditions?: string;
  notes?: string;
  submittedAt?: string; 
  createdAt?: Timestamp | Date; 
  farmId: string;
  userId: string;
}

interface WeatherDataLogTableProps {
  refreshTrigger: number;
  onLogDeleted: () => void;
}

const rolesThatCanDelete: UserRole[] = ['free', 'pro', 'agribusiness', 'admin']; // Owner roles (PlanId) and admin

export function WeatherDataLogTable({ refreshTrigger, onLogDeleted }: WeatherDataLogTableProps) {
  const [logs, setLogs] = useState<WeatherLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const { user } = useAuth();

  useEffect(() => {
    if (!user || !user.farmId) {
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
          where("farmId", "==", user.farmId), 
          orderBy("createdAt", "desc")
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
  }, [user?.farmId, refreshTrigger, toast]);

  const canUserDelete = user?.roleOnCurrentFarm && rolesThatCanDelete.includes(user.roleOnCurrentFarm);

  const handleDeleteLog = async (logId: string) => {
     if (!canUserDelete) {
        toast({ title: "Permission Denied", description: "You do not have permission to delete weather logs.", variant: "destructive" });
        return;
    }
    if (window.confirm("Are you sure you want to delete this weather log? This action cannot be undone.")) {
      try {
        await deleteDoc(doc(db, "weatherLogs", logId));
        toast({
          title: "Weather Log Deleted",
          description: "The weather log has been removed from Firestore.",
        });
        onLogDeleted(); 
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

  if (!user?.farmId && !isLoading) {
     return (
      <Alert className="mt-4">
        <Icons.Info className="h-4 w-4" />
        <AlertTitle>Farm Association Required</AlertTitle>
        <AlertDescription>
          Log in and ensure you are associated with a farm to view weather logs.
        </AlertDescription>
      </Alert>
    );
  }

  if (logs.length === 0 && user?.farmId) {
    return (
      <Alert className="mt-4">
        <Icons.Info className="h-4 w-4" />
        <AlertTitle>No Weather Logs Found for this Farm</AlertTitle>
        <AlertDescription>
          Your farm hasn&apos;t recorded any weather observations yet. Add a new log using the form.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="mt-8 border rounded-lg shadow-sm overflow-x-auto">
      <Table>
        <TableCaption>A list of your farm's recent weather logs. Data is stored in Firestore.</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-[150px]">Date</TableHead>
            <TableHead className="min-w-[150px]">Location</TableHead>
            <TableHead className="min-w-[120px]">Temp (H/L)</TableHead>
            <TableHead className="min-w-[120px]">Precipitation</TableHead>
            <TableHead className="min-w-[120px]">Wind</TableHead>
            <TableHead className="min-w-[150px]">Conditions</TableHead>
            <TableHead className="min-w-[200px]">Notes</TableHead>
            {canUserDelete && <TableHead className="text-right w-[100px]">Actions</TableHead>}
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
              {canUserDelete && (
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" onClick={() => handleDeleteLog(log.id)} aria-label="Delete log">
                    <Icons.Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
