
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

interface BreedingRecordLog {
  id: string; // Firestore document ID
  damAnimalIdTag: string;
  sireAnimalIdTag?: string | null;
  breedingDate?: string | null;
  expectedDueDate?: string | null;
  actualBirthDate?: string | null;
  numberOfOffspring?: number;
  offspringIdTags?: string[];
  breedingMethod?: string;
  notes?: string;
  createdAt?: Timestamp | Date;
  farmId: string;
  userId: string;
}

interface BreedingRecordsTableProps {
  refreshTrigger: number;
  onLogDeleted: () => void;
}

const ownerRoles: UserRole[] = ['free', 'pro', 'agribusiness'];
const rolesThatCanDelete: UserRole[] = [...ownerRoles, 'admin'];

export function BreedingRecordsTable({ refreshTrigger, onLogDeleted }: BreedingRecordsTableProps) {
  const [logs, setLogs] = useState<BreedingRecordLog[]>([]);
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
          collection(db, "livestockBreedingRecords"),
          where("farmId", "==", user.farmId),
          orderBy("breedingDate", "desc"), // Or actualBirthDate or createdAt
          orderBy("createdAt", "desc")
        );
        const querySnapshot = await getDocs(q);
        const fetchedLogs: BreedingRecordLog[] = querySnapshot.docs.map((docSnapshot) => {
          const data = docSnapshot.data();
          return {
            id: docSnapshot.id,
            ...data,
            createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : undefined,
          } as BreedingRecordLog;
        });
        setLogs(fetchedLogs);
      } catch (e) {
        console.error("Failed to load breeding records:", e);
        setError("Could not load breeding records. Please try again.");
        toast({
          title: "Error Loading Records",
          description: "Failed to load breeding records.",
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
        toast({ title: "Permission Denied", description: "You do not have permission to delete breeding records.", variant: "destructive" });
        return;
    }
    if (window.confirm("Are you sure you want to delete this breeding record? This action cannot be undone.")) {
      try {
        await deleteDoc(doc(db, "livestockBreedingRecords", logId));
        toast({
          title: "Breeding Record Deleted",
          description: "The record has been removed.",
        });
        onLogDeleted(); 
      } catch (e) {
        console.error("Failed to delete breeding record:", e);
        setError("Could not delete the record.");
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
    return <p className="text-center text-muted-foreground py-4">Loading breeding records...</p>;
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
          Log in and ensure you are associated with a farm to view breeding records.
        </AlertDescription>
      </Alert>
    );
  }

  if (logs.length === 0 && user?.farmId) {
    return (
      <Alert className="mt-4">
        <Icons.Info className="h-4 w-4" />
        <AlertTitle>No Breeding Records Logged</AlertTitle>
        <AlertDescription>
          No breeding records found for this farm. Add new records using the form.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="mt-8 border rounded-lg shadow-sm overflow-x-auto">
      <Table>
        <TableCaption>A list of your farm's breeding records.</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-[120px]">Dam ID/Tag</TableHead>
            <TableHead className="min-w-[120px]">Sire ID/Tag</TableHead>
            <TableHead className="min-w-[120px]">Breeding Date</TableHead>
            <TableHead className="min-w-[120px]">Exp. Due Date</TableHead>
            <TableHead className="min-w-[120px]">Actual Birth</TableHead>
            <TableHead className="min-w-[100px]">Offspring #</TableHead>
            <TableHead className="min-w-[150px]">Method</TableHead>
            {canUserDelete && <TableHead className="text-right w-[100px]">Actions</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {logs.map((log) => (
            <TableRow key={log.id}>
              <TableCell className="font-medium">{log.damAnimalIdTag}</TableCell>
              <TableCell>{log.sireAnimalIdTag || "N/A"}</TableCell>
              <TableCell>{formatDateSafe(log.breedingDate)}</TableCell>
              <TableCell>{formatDateSafe(log.expectedDueDate)}</TableCell>
              <TableCell>{formatDateSafe(log.actualBirthDate)}</TableCell>
              <TableCell>{log.numberOfOffspring !== undefined ? log.numberOfOffspring : "N/A"}</TableCell>
              <TableCell>{log.breedingMethod || "N/A"}</TableCell>
              {canUserDelete && (
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" onClick={() => handleDeleteLog(log.id)} aria-label="Delete breeding record">
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
