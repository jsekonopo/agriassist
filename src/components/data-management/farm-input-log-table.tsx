
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

interface FarmInputLog {
  id: string; // Firestore document ID
  inputName: string;
  inputType: string;
  quantity: number;
  quantityUnit: string;
  purchaseDate: string; 
  purchaseCost?: number;
  supplier?: string;
  notes?: string;
  createdAt?: Timestamp | Date;
  farmId: string;
  userId: string;
}

interface FarmInputLogTableProps {
  refreshTrigger: number;
  onLogDeleted: () => void;
}

const rolesThatCanDelete: UserRole[] = ['free', 'pro', 'agribusiness', 'admin']; // Owner roles (PlanId) and admin

export function FarmInputLogTable({ refreshTrigger, onLogDeleted }: FarmInputLogTableProps) {
  const [logs, setLogs] = useState<FarmInputLog[]>([]);
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
          collection(db, "farmInputs"),
          where("farmId", "==", user.farmId),
          orderBy("purchaseDate", "desc"),
          orderBy("createdAt", "desc")
        );
        const querySnapshot = await getDocs(q);
        const fetchedLogs: FarmInputLog[] = querySnapshot.docs.map((docSnapshot) => {
          const data = docSnapshot.data();
          return {
            id: docSnapshot.id,
            ...data,
            createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : undefined,
          } as FarmInputLog;
        });
        setLogs(fetchedLogs);
      } catch (e) {
        console.error("Failed to load farm input logs:", e);
        setError("Could not load farm input logs. Please try again.");
        toast({
          title: "Error Loading Logs",
          description: "Failed to load farm input logs.",
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
        toast({ title: "Permission Denied", description: "You do not have permission to delete farm input logs.", variant: "destructive" });
        return;
    }
    if (window.confirm("Are you sure you want to delete this input log? This action cannot be undone.")) {
      try {
        await deleteDoc(doc(db, "farmInputs", logId));
        toast({
          title: "Farm Input Log Deleted",
          description: "The log has been removed.",
        });
        onLogDeleted(); 
      } catch (e) {
        console.error("Failed to delete farm input log:", e);
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
    return <p className="text-center text-muted-foreground py-4">Loading farm input logs...</p>;
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
        <AlertTitle>No Farm Inputs Logged</AlertTitle>
        <AlertDescription>
          No farm inputs found for this farm. Add new inputs using the form.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="mt-8 border rounded-lg shadow-sm overflow-x-auto">
      <Table>
        <TableCaption>A list of your farm's input inventory logs.</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-[180px]">Input Name</TableHead>
            <TableHead className="min-w-[100px]">Type</TableHead>
            <TableHead className="min-w-[120px]">Purchase Date</TableHead>
            <TableHead className="min-w-[100px]">Quantity</TableHead>
            <TableHead className="min-w-[100px]">Cost</TableHead>
            <TableHead className="min-w-[120px]">Supplier</TableHead>
            <TableHead className="min-w-[150px]">Notes</TableHead>
            {canUserDelete && <TableHead className="text-right w-[100px]">Actions</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {logs.map((log) => (
            <TableRow key={log.id}>
              <TableCell className="font-medium">{log.inputName}</TableCell>
              <TableCell>{log.inputType}</TableCell>
              <TableCell>{format(parseISO(log.purchaseDate), "MMM dd, yyyy")}</TableCell>
              <TableCell>{log.quantity} {log.quantityUnit}</TableCell>
              <TableCell>{log.purchaseCost !== undefined ? `$${log.purchaseCost.toFixed(2)}` : "N/A"}</TableCell>
              <TableCell>{log.supplier || "N/A"}</TableCell>
              <TableCell className="max-w-xs truncate whitespace-nowrap overflow-hidden text-ellipsis" title={log.notes}>{log.notes || "N/A"}</TableCell>
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
