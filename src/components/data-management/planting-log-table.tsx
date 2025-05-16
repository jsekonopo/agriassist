
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
import { useAuth } from "@/contexts/auth-context";
import { db } from "@/lib/firebase";
import { collection, query, where, getDocs, deleteDoc, doc, orderBy, Timestamp, getDoc } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";

interface PlantingLog {
  id: string; // Firestore document ID
  cropName: string;
  plantingDate: string; // Stored as YYYY-MM-DD string
  fieldId: string; // Firestore document ID of the field
  fieldName?: string; // To store the field name after fetching
  seedsUsed?: string;
  notes?: string;
  createdAt?: Timestamp | Date; // Firestore Timestamp or converted Date
  farmId: string; // Added farmId
  userId: string; // Keep for auditing if needed
}

interface PlantingLogTableProps {
  refreshTrigger: number;
  onLogDeleted: () => void;
}

export function PlantingLogTable({ refreshTrigger, onLogDeleted }: PlantingLogTableProps) {
  const [logs, setLogs] = useState<PlantingLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    if (!user || !user.farmId) { // Check for user and farmId
      setIsLoading(false);
      setLogs([]);
      return;
    }

    setIsLoading(true);
    setError(null);
    const fetchPlantingLogs = async () => {
      try {
        const q = query(
          collection(db, "plantingLogs"),
          where("farmId", "==", user.farmId), // Query by farmId
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
              // Ensure the field also belongs to the same farm for consistency
              if (fieldDocSnap.exists() && fieldDocSnap.data().farmId === user.farmId) {
                fieldName = fieldDocSnap.data().fieldName || "Unknown Field";
              } else if (fieldDocSnap.exists()) {
                fieldName = "Field (Different Farm)"; // Should not happen if form logic is correct
              }
              else {
                fieldName = "Deleted/Unknown Field";
              }
            } catch (fieldError) {
              console.error("Error fetching field name for log:", docSnapshot.id, fieldError);
              fieldName = "Error fetching field name";
            }
          }

          return {
            id: docSnapshot.id,
            ...data,
            fieldName,
            createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : undefined,
          } as PlantingLog;
        });

        const fetchedLogs = await Promise.all(fetchedLogsPromises);
        setLogs(fetchedLogs);
      } catch (e) {
        console.error("Failed to load planting logs from Firestore:", e);
        setError("Could not load planting logs. Please try again.");
        toast({
          title: "Error Loading Logs",
          description: "Failed to load planting logs from Firestore.",
          variant: "destructive"
        });
      } finally {
        setIsLoading(false);
      }
    };
    fetchPlantingLogs();
  }, [user?.farmId, refreshTrigger, toast]); // Depend on user.farmId

  const handleDeleteLog = async (logId: string) => {
    if (!user || !user.farmId) {
      toast({ title: "Not Authenticated", description: "You must be logged in and associated with a farm.", variant: "destructive" });
      return;
    }
    // Add security check here in future (e.g., Firestore rules should enforce this)
    if (window.confirm("Are you sure you want to delete this planting log? This action cannot be undone.")) {
      try {
        await deleteDoc(doc(db, "plantingLogs", logId));
        toast({
          title: "Planting Log Deleted",
          description: "The planting log has been removed from Firestore.",
        });
        onLogDeleted(); // Trigger refresh
      } catch (e) {
        console.error("Failed to delete planting log from Firestore:", e);
        setError("Could not delete the planting log.");
        toast({
          title: "Error Deleting Log",
          description: "Failed to delete the planting log from Firestore.",
          variant: "destructive"
        });
      }
    }
  };

  if (isLoading) {
    return <p className="text-center text-muted-foreground py-4">Loading planting logs...</p>;
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
          Log in and ensure you are associated with a farm to view planting logs.
        </AlertDescription>
      </Alert>
    );
  }

  if (logs.length === 0 && user?.farmId) {
    return (
      <Alert className="mt-4">
        <Icons.Info className="h-4 w-4" />
        <AlertTitle>No Planting Logs Found for this Farm</AlertTitle>
        <AlertDescription>
          Your farm hasn&apos;t recorded any planting activities yet. Add a new log using the form.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="mt-8 border rounded-lg shadow-sm overflow-x-auto">
      <Table>
        <TableCaption>A list of your farm's recent planting logs. Data is stored in Firestore.</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-[150px]">Crop Name</TableHead>
            <TableHead className="min-w-[150px]">Planting Date</TableHead>
            <TableHead className="min-w-[150px]">Field</TableHead>
            <TableHead className="min-w-[150px]">Seeds Used</TableHead>
            <TableHead className="min-w-[200px]">Notes</TableHead>
            <TableHead className="text-right w-[100px]">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {logs.map((log) => (
            <TableRow key={log.id}>
              <TableCell className="font-medium">{log.cropName}</TableCell>
              <TableCell>{format(parseISO(log.plantingDate), "MMM dd, yyyy")}</TableCell>
              <TableCell>{log.fieldName || log.fieldId}</TableCell>
              <TableCell>{log.seedsUsed || "N/A"}</TableCell>
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
