
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

interface WeightLog {
  id: string; // Firestore document ID
  animalIdTag: string; // Denormalized
  animalDocId: string;
  logDate: string; 
  weight: number;
  weightUnit: string;
  notes?: string;
  createdAt?: Timestamp | Date;
  farmId: string;
  userId: string;
}

interface WeightLogTableProps {
  refreshTrigger: number;
  onLogDeleted: () => void;
}

const ownerRoles: UserRole[] = ['free', 'pro', 'agribusiness'];
const rolesThatCanDelete: UserRole[] = [...ownerRoles, 'admin'];

export function WeightLogTable({ refreshTrigger, onLogDeleted }: WeightLogTableProps) {
  const [logs, setLogs] = useState<WeightLog[]>([]);
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
          collection(db, "livestockWeightLogs"),
          where("farmId", "==", user.farmId),
          orderBy("logDate", "desc"),
          orderBy("createdAt", "desc")
        );
        const querySnapshot = await getDocs(q);
        const fetchedLogs: WeightLog[] = querySnapshot.docs.map((docSnapshot) => {
          const data = docSnapshot.data();
          return {
            id: docSnapshot.id,
            ...data,
            createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : undefined,
          } as WeightLog;
        });
        setLogs(fetchedLogs);
      } catch (e) {
        console.error("Failed to load weight logs:", e);
        setError("Could not load weight logs. Please try again.");
        toast({
          title: "Error Loading Weight Logs",
          description: "Failed to load weight logs.",
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
        toast({ title: "Permission Denied", description: "You do not have permission to delete weight logs.", variant: "destructive" });
        return;
    }
    if (window.confirm("Are you sure you want to delete this weight log? This action cannot be undone.")) {
      try {
        await deleteDoc(doc(db, "livestockWeightLogs", logId));
        toast({
          title: "Weight Log Deleted",
          description: "The weight record has been removed.",
        });
        onLogDeleted(); 
      } catch (e) {
        console.error("Failed to delete weight log:", e);
        setError("Could not delete the weight log.");
        toast({
          title: "Error Deleting Log",
          description: "Failed to delete the weight log.",
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
    return <p className="text-center text-muted-foreground py-4">Loading weight logs...</p>;
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
          Log in and ensure you are associated with a farm to view weight logs.
        </AlertDescription>
      </Alert>
    );
  }

  if (logs.length === 0 && user?.farmId) {
    return (
      <Alert className="mt-4">
        <Icons.Info className="h-4 w-4" />
        <AlertTitle>No Weight Logs Found</AlertTitle>
        <AlertDescription>
          No weight logs found for this farm. Add new records using the form.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="mt-8 border rounded-lg shadow-sm overflow-x-auto">
      <Table>
        <TableCaption>A list of your farm's animal weight logs.</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-[120px]">Date</TableHead>
            <TableHead className="min-w-[150px]">Animal ID/Tag</TableHead>
            <TableHead className="min-w-[100px] text-right">Weight</TableHead>
            <TableHead className="min-w-[200px]">Notes</TableHead>
            {canUserDelete && <TableHead className="text-right w-[100px]">Actions</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {logs.map((log) => (
            <TableRow key={log.id}>
              <TableCell>{formatDateSafe(log.logDate)}</TableCell>
              <TableCell className="font-medium">{log.animalIdTag}</TableCell>
              <TableCell className="text-right">{log.weight} {log.weightUnit.toUpperCase()}</TableCell>
              <TableCell className="max-w-xs truncate whitespace-nowrap overflow-hidden text-ellipsis" title={log.notes}>{log.notes || "N/A"}</TableCell>
              {canUserDelete && (
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" onClick={() => handleDeleteLog(log.id)} aria-label="Delete weight log">
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
