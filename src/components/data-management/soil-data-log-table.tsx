
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
import { collection, query, where, getDocs, deleteDoc, doc, orderBy, Timestamp, getDoc } from "firebase/firestore";

interface SoilLog {
  id: string; // Firestore document ID
  fieldId: string; // Firestore document ID of the field
  fieldName?: string; // To store the field name after fetching
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
  createdAt?: Timestamp | Date; // Firestore Timestamp or converted Date
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
  const { user } = useAuth();

  useEffect(() => {
    if (!user) {
      setIsLoading(false);
      setLogs([]);
      return;
    }

    setIsLoading(true);
    setError(null);
    const fetchSoilDataLogs = async () => {
      try {
        const q = query(
          collection(db, "soilDataLogs"),
          where("userId", "==", user.uid),
          orderBy("createdAt", "desc")
        );
        const querySnapshot = await getDocs(q);
        const fetchedLogsPromises = querySnapshot.docs.map(async (docSnapshot) => {
          const data = docSnapshot.data();
          let fieldName = "N/A";
          if (data.fieldId) {
            try {
              const fieldDocRef = doc(db, "fields", data.fieldId);
              const fieldDocSnap = await getDoc(fieldDocRef);
              if (fieldDocSnap.exists()) {
                fieldName = fieldDocSnap.data().fieldName || "Unknown Field";
              } else {
                fieldName = "Deleted/Unknown Field";
              }
            } catch (fieldError) {
              console.error("Error fetching field name for soil log:", docSnapshot.id, fieldError);
              fieldName = "Error fetching field";
            }
          }
          
          return {
            id: docSnapshot.id,
            ...data,
            fieldName,
            createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : undefined,
          } as SoilLog;
        });
        
        const fetchedLogs = await Promise.all(fetchedLogsPromises);
        setLogs(fetchedLogs);
      } catch (e) {
        console.error("Failed to load soil data logs from Firestore:", e);
        setError("Could not load soil data logs. Please try again.");
        toast({
          title: "Error Loading Logs",
          description: "Failed to load soil data logs from Firestore.",
          variant: "destructive"
        });
      } finally {
        setIsLoading(false);
      }
    };
    fetchSoilDataLogs();
  }, [user, refreshTrigger, toast]);

  const handleDeleteLog = async (logId: string) => {
    if (!user) {
      toast({ title: "Not Authenticated", description: "You must be logged in.", variant: "destructive" });
      return;
    }
    if (window.confirm("Are you sure you want to delete this soil data log? This action cannot be undone.")) {
      try {
        await deleteDoc(doc(db, "soilDataLogs", logId));
        toast({
          title: "Soil Data Log Deleted",
          description: "The soil data log has been removed from Firestore.",
        });
        onLogDeleted(); // Trigger refresh
      } catch (e) {
        console.error("Failed to delete soil data log from Firestore:", e);
        setError("Could not delete the soil data log.");
        toast({
          title: "Error Deleting Log",
          description: "Failed to delete the soil data log from Firestore.",
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

  if (!user && !isLoading) {
     return (
      <Alert className="mt-4">
        <Icons.Info className="h-4 w-4" />
        <AlertTitle>Please Log In</AlertTitle>
        <AlertDescription>
          Log in to view and manage your soil data logs.
        </AlertDescription>
      </Alert>
    );
  }

  if (logs.length === 0 && user) {
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
        <TableCaption>A list of your recent soil data logs. Data is stored in Firestore.</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-[150px]">Field</TableHead>
            <TableHead className="min-w-[150px]">Sample Date</TableHead>
            <TableHead className="min-w-[80px]">pH</TableHead>
            <TableHead className="min-w-[150px]">Organic Matter</TableHead>
            <TableHead className="min-w-[200px]">Nutrients (N,P,K)</TableHead>
            <TableHead className="min-w-[200px]">Treatments</TableHead>
            <TableHead className="min-w-[200px]">Notes</TableHead>
            <TableHead className="text-right w-[100px]">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {logs.map((log) => (
            <TableRow key={log.id}>
              <TableCell className="font-medium">{log.fieldName || log.fieldId}</TableCell>
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

    