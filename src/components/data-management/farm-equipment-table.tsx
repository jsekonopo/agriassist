
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

interface FarmEquipmentLog {
  id: string; // Firestore document ID
  equipmentName: string;
  equipmentType: string;
  manufacturer?: string;
  model?: string;
  serialNumber?: string;
  purchaseDate?: string | null; // Stored as YYYY-MM-DD string or null
  purchaseCost?: number;
  lastMaintenanceDate?: string | null; // Stored as YYYY-MM-DD string or null
  nextMaintenanceDate?: string | null; // Stored as YYYY-MM-DD string or null
  maintenanceDetails?: string;
  notes?: string;
  createdAt?: Timestamp | Date;
  farmId: string;
  userId: string;
}

interface FarmEquipmentTableProps {
  refreshTrigger: number;
  onLogDeleted: () => void;
}

export function FarmEquipmentTable({ refreshTrigger, onLogDeleted }: FarmEquipmentTableProps) {
  const [logs, setLogs] = useState<FarmEquipmentLog[]>([]);
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
          collection(db, "farmEquipment"),
          where("farmId", "==", user.farmId),
          orderBy("createdAt", "desc")
        );
        const querySnapshot = await getDocs(q);
        const fetchedLogs: FarmEquipmentLog[] = querySnapshot.docs.map((docSnapshot) => {
          const data = docSnapshot.data();
          return {
            id: docSnapshot.id,
            ...data,
            createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : undefined,
          } as FarmEquipmentLog;
        });
        setLogs(fetchedLogs);
      } catch (e) {
        console.error("Failed to load farm equipment logs:", e);
        setError("Could not load farm equipment logs. Please try again.");
        toast({
          title: "Error Loading Equipment",
          description: "Failed to load farm equipment logs.",
          variant: "destructive"
        });
      } finally {
        setIsLoading(false);
      }
    };
    fetchLogs();
  }, [user?.farmId, refreshTrigger, toast]);

  const handleDeleteLog = async (logId: string) => {
    if (!user || !user.farmId) {
      toast({ title: "Not Authenticated", description: "You must be logged in.", variant: "destructive" });
      return;
    }
    if (window.confirm("Are you sure you want to delete this equipment log? This action cannot be undone.")) {
      try {
        await deleteDoc(doc(db, "farmEquipment", logId));
        toast({
          title: "Equipment Log Deleted",
          description: "The equipment record has been removed.",
        });
        onLogDeleted(); 
      } catch (e) {
        console.error("Failed to delete farm equipment log:", e);
        setError("Could not delete the equipment log.");
        toast({
          title: "Error Deleting Equipment",
          description: "Failed to delete the equipment log.",
          variant: "destructive"
        });
      }
    }
  };

  const formatDate = (dateString?: string | null) => {
    if (!dateString) return "N/A";
    try {
      return format(parseISO(dateString), "MMM dd, yyyy");
    } catch (e) {
      return "Invalid Date";
    }
  };

  if (isLoading) {
    return <p className="text-center text-muted-foreground py-4">Loading farm equipment...</p>;
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
          Log in and ensure you are associated with a farm to view equipment logs.
        </AlertDescription>
      </Alert>
    );
  }

  if (logs.length === 0 && user?.farmId) {
    return (
      <Alert className="mt-4">
        <Icons.Info className="h-4 w-4" />
        <AlertTitle>No Equipment Logged</AlertTitle>
        <AlertDescription>
          No farm equipment found for this farm. Add new equipment using the form.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="mt-8 border rounded-lg shadow-sm overflow-x-auto">
      <Table>
        <TableCaption>A list of your farm's equipment.</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-[180px]">Name</TableHead>
            <TableHead className="min-w-[120px]">Type</TableHead>
            <TableHead className="min-w-[120px]">Manufacturer</TableHead>
            <TableHead className="min-w-[100px]">Model</TableHead>
            <TableHead className="min-w-[120px]">Purchase Date</TableHead>
            <TableHead className="min-w-[150px]">Last Maintenance</TableHead>
            <TableHead className="min-w-[150px]">Next Maintenance</TableHead>
            <TableHead className="min-w-[200px]">Maint. Details</TableHead>
            <TableHead className="text-right w-[100px]">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {logs.map((log) => (
            <TableRow key={log.id}>
              <TableCell className="font-medium">{log.equipmentName}</TableCell>
              <TableCell>{log.equipmentType}</TableCell>
              <TableCell>{log.manufacturer || "N/A"}</TableCell>
              <TableCell>{log.model || "N/A"}</TableCell>
              <TableCell>{formatDate(log.purchaseDate)}</TableCell>
              <TableCell>{formatDate(log.lastMaintenanceDate)}</TableCell>
              <TableCell>{formatDate(log.nextMaintenanceDate)}</TableCell>
              <TableCell className="max-w-xs truncate whitespace-nowrap overflow-hidden text-ellipsis" title={log.maintenanceDetails}>{log.maintenanceDetails || "N/A"}</TableCell>
              <TableCell className="text-right">
                <Button variant="ghost" size="icon" onClick={() => handleDeleteLog(log.id)} aria-label="Delete equipment log">
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
