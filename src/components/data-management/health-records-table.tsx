
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
import { useAuth, type UserRole } from "@/contexts/auth-context";
import { db } from "@/lib/firebase";
import { collection, query, where, getDocs, deleteDoc, doc, orderBy, Timestamp } from "firebase/firestore";

interface HealthRecordLog {
  id: string; // Firestore document ID
  animalDocId: string;
  animalIdTag: string; // Denormalized
  logDate: string; 
  eventType: string;
  details: string;
  medicationAdministered?: string;
  dosage?: string;
  administeredBy?: string;
  followUpDate?: string | null;
  notes?: string;
  createdAt?: Timestamp | Date;
  farmId: string;
  userId: string;
}

interface HealthRecordsTableProps {
  refreshTrigger: number;
  onLogDeleted: () => void;
}

const ownerRoles: UserRole[] = ['free', 'pro', 'agribusiness'];
const rolesThatCanDelete: UserRole[] = [...ownerRoles, 'admin'];

export function HealthRecordsTable({ refreshTrigger, onLogDeleted }: HealthRecordsTableProps) {
  const [logs, setLogs] = useState<HealthRecordLog[]>([]);
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
    const fetchLogs = async () => {
      try {
        const q = query(
          collection(db, "livestockHealthLogs"),
          where("farmId", "==", user.farmId),
          orderBy("logDate", "desc"),
          orderBy("createdAt", "desc")
        );
        const querySnapshot = await getDocs(q);
        const fetchedLogs: HealthRecordLog[] = querySnapshot.docs.map((docSnapshot) => {
          const data = docSnapshot.data();
          return {
            id: docSnapshot.id,
            ...data,
            createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : undefined,
          } as HealthRecordLog;
        });
        setLogs(fetchedLogs);
      } catch (e) {
        console.error("Failed to load health records:", e);
        setError("Could not load health records. Please try again.");
        toast({
          title: "Error Loading Health Records",
          description: "Failed to load health records.",
          variant: "destructive"
        });
      } finally {
        setIsLoading(false);
      }
    };
    fetchLogs();
  }, [user?.farmId, refreshTrigger, toast]);

  const canUserDelete = user?.roleOnCurrentFarm && rolesThatCanDelete.includes(user.roleOnCurrentFarm);

  const handleDeleteLog = async (logId: string) => {
    if (!canUserDelete) {
        toast({ title: "Permission Denied", description: "You do not have permission to delete health records.", variant: "destructive" });
        return;
    }
    if (window.confirm("Are you sure you want to delete this health record? This action cannot be undone.")) {
      try {
        await deleteDoc(doc(db, "livestockHealthLogs", logId));
        toast({
          title: "Health Record Deleted",
          description: "The health record has been removed.",
        });
        onLogDeleted(); 
      } catch (e) {
        console.error("Failed to delete health record:", e);
        setError("Could not delete the health record.");
        toast({
          title: "Error Deleting Record",
          description: "Failed to delete the record.",
          variant: "destructive"
        });
      }
    }
  };
  
  const formatDateSafe = (dateString?: string | null) => {
    if (!dateString) return "N/A";
    try {
      return format(parseISO(dateString), "MMM dd, yyyy");
    } catch (e) {
      return "Invalid Date";
    }
  };


  if (isLoading) {
    return <p className="text-center text-muted-foreground py-4">Loading health records...</p>;
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
          Log in and ensure you are associated with a farm to view health records.
        </AlertDescription>
      </Alert>
    );
  }

  if (logs.length === 0 && user?.farmId) {
    return (
      <Alert className="mt-4">
        <Icons.Info className="h-4 w-4" />
        <AlertTitle>No Health Records Logged</AlertTitle>
        <AlertDescription>
          No health records found for this farm. Add new records using the form.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="mt-8 border rounded-lg shadow-sm overflow-x-auto">
      <Table>
        <TableCaption>A list of your farm's animal health records.</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-[120px]">Animal ID/Tag</TableHead>
            <TableHead className="min-w-[120px]">Log Date</TableHead>
            <TableHead className="min-w-[150px]">Event Type</TableHead>
            <TableHead className="min-w-[250px]">Details</TableHead>
            <TableHead className="min-w-[150px]">Medication</TableHead>
            <TableHead className="min-w-[100px]">Dosage</TableHead>
            <TableHead className="min-w-[150px]">Follow-up</TableHead>
            {canUserDelete && <TableHead className="text-right w-[100px]">Actions</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {logs.map((log) => (
            <TableRow key={log.id}>
              <TableCell className="font-medium">{log.animalIdTag}</TableCell>
              <TableCell>{formatDateSafe(log.logDate)}</TableCell>
              <TableCell>{log.eventType}</TableCell>
              <TableCell className="max-w-md truncate whitespace-nowrap overflow-hidden text-ellipsis" title={log.details}>{log.details}</TableCell>
              <TableCell>{log.medicationAdministered || "N/A"}</TableCell>
              <TableCell>{log.dosage || "N/A"}</TableCell>
              <TableCell>{formatDateSafe(log.followUpDate)}</TableCell>
              {canUserDelete && (
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" onClick={() => handleDeleteLog(log.id)} aria-label="Delete health record">
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
