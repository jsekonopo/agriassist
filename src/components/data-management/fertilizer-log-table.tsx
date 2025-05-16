
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
import { collection, query, where, getDocs, deleteDoc, doc, orderBy, Timestamp, getDoc } from "firebase/firestore";

interface FertilizerLog {
  id: string; // Firestore document ID
  fieldId: string;
  fieldName?: string;
  dateApplied: string; 
  fertilizerType: string;
  amountApplied: number;
  amountUnit: string;
  applicationMethod?: string;
  notes?: string;
  createdAt?: Timestamp | Date;
  farmId: string;
  userId: string;
}

interface FertilizerLogTableProps {
  refreshTrigger: number;
  onLogDeleted: () => void;
}

const rolesThatCanDelete: UserRole[] = ['free', 'pro', 'agribusiness', 'admin']; // Owner roles (PlanId) and admin

export function FertilizerLogTable({ refreshTrigger, onLogDeleted }: FertilizerLogTableProps) {
  const [logs, setLogs] = useState<FertilizerLog[]>([]);
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
    const fetchFertilizerLogs = async () => {
      try {
        const q = query(
          collection(db, "fertilizerLogs"),
          where("farmId", "==", user.farmId),
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
              if (fieldDocSnap.exists() && fieldDocSnap.data().farmId === user.farmId) {
                fieldName = fieldDocSnap.data().fieldName || "Unknown Field";
              } else if (fieldDocSnap.exists()){
                 fieldName = "Field (Different Farm)";
              } else {
                 fieldName = "Deleted/Unknown Field";
              }
            } catch (fieldError) {
              console.error("Error fetching field name for fertilizer log:", docSnapshot.id, fieldError);
              fieldName = "Error fetching field";
            }
          }
          return {
            id: docSnapshot.id,
            ...data,
            fieldName,
            createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : undefined,
          } as FertilizerLog;
        });
        
        const fetchedLogs = await Promise.all(fetchedLogsPromises);
        setLogs(fetchedLogs);
      } catch (e) {
        console.error("Failed to load fertilizer logs from Firestore:", e);
        setError("Could not load fertilizer logs. Please try again.");
        toast({
          title: "Error Loading Logs",
          description: "Failed to load fertilizer logs.",
          variant: "destructive"
        });
      } finally {
        setIsLoading(false);
      }
    };
    fetchFertilizerLogs();
  }, [user?.farmId, refreshTrigger, toast]);

  const canUserDelete = user?.roleOnCurrentFarm && rolesThatCanDelete.includes(user.roleOnCurrentFarm);

  const handleDeleteLog = async (logId: string) => {
    if (!canUserDelete) {
        toast({ title: "Permission Denied", description: "You do not have permission to delete fertilizer logs.", variant: "destructive" });
        return;
    }
    if (window.confirm("Are you sure you want to delete this fertilizer log? This action cannot be undone.")) {
      try {
        await deleteDoc(doc(db, "fertilizerLogs", logId));
        toast({
          title: "Fertilizer Log Deleted",
          description: "The log has been removed from Firestore.",
        });
        onLogDeleted(); 
      } catch (e) {
        console.error("Failed to delete fertilizer log:", e);
        setError("Could not delete the log.");
        toast({
          title: "Error Deleting Log",
          description: "Failed to delete the log.",
          variant: "destructive"
        });
      }
    }
  };

  if (isLoading) {
    return <p className="text-center text-muted-foreground py-4">Loading fertilizer logs...</p>;
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
          Log in and ensure you are associated with a farm to view logs.
        </AlertDescription>
      </Alert>
    );
  }

  if (logs.length === 0 && user?.farmId) {
    return (
      <Alert className="mt-4">
        <Icons.Info className="h-4 w-4" />
        <AlertTitle>No Fertilizer Logs Found</AlertTitle>
        <AlertDescription>
          No fertilizer application logs found for this farm. Add a new log using the form.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="mt-8 border rounded-lg shadow-sm overflow-x-auto">
      <Table>
        <TableCaption>A list of your farm's recent fertilizer logs.</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-[150px]">Field</TableHead>
            <TableHead className="min-w-[120px]">Date Applied</TableHead>
            <TableHead className="min-w-[150px]">Fertilizer Type</TableHead>
            <TableHead className="min-w-[100px]">Amount</TableHead>
            <TableHead className="min-w-[120px]">Method</TableHead>
            <TableHead className="min-w-[200px]">Notes</TableHead>
            {canUserDelete && <TableHead className="text-right w-[100px]">Actions</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {logs.map((log) => (
            <TableRow key={log.id}>
              <TableCell className="font-medium">{log.fieldName || log.fieldId}</TableCell>
              <TableCell>{format(parseISO(log.dateApplied), "MMM dd, yyyy")}</TableCell>
              <TableCell>{log.fertilizerType}</TableCell>
              <TableCell>{log.amountApplied} {log.amountUnit}</TableCell>
              <TableCell>{log.applicationMethod || "N/A"}</TableCell>
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
