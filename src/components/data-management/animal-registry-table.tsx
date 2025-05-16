
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

interface AnimalRegistryLog {
  id: string; // Firestore document ID
  animalIdTag: string;
  species: string;
  breed?: string;
  birthDate?: string | null; 
  gender?: string;
  damIdTag?: string;
  sireIdTag?: string;
  notes?: string;
  createdAt?: Timestamp | Date;
  farmId: string;
  userId: string;
}

interface AnimalRegistryTableProps {
  refreshTrigger: number;
  onLogDeleted: () => void;
}

const ownerRoles: UserRole[] = ['free', 'pro', 'agribusiness'];
const rolesThatCanDelete: UserRole[] = [...ownerRoles, 'admin'];

export function AnimalRegistryTable({ refreshTrigger, onLogDeleted }: AnimalRegistryTableProps) {
  const [logs, setLogs] = useState<AnimalRegistryLog[]>([]);
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
          collection(db, "livestockAnimals"),
          where("farmId", "==", user.farmId),
          orderBy("animalIdTag", "asc"), // Or orderBy("createdAt", "desc")
        );
        const querySnapshot = await getDocs(q);
        const fetchedLogs: AnimalRegistryLog[] = querySnapshot.docs.map((docSnapshot) => {
          const data = docSnapshot.data();
          return {
            id: docSnapshot.id,
            ...data,
            createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : undefined,
          } as AnimalRegistryLog;
        });
        setLogs(fetchedLogs);
      } catch (e) {
        console.error("Failed to load animal registry:", e);
        setError("Could not load animal registry. Please try again.");
        toast({
          title: "Error Loading Animals",
          description: "Failed to load the animal registry.",
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
        toast({ title: "Permission Denied", description: "You do not have permission to delete animal records.", variant: "destructive" });
        return;
    }
    if (window.confirm("Are you sure you want to delete this animal record? This action cannot be undone.")) {
      try {
        await deleteDoc(doc(db, "livestockAnimals", logId));
        toast({
          title: "Animal Record Deleted",
          description: "The animal record has been removed.",
        });
        onLogDeleted(); 
      } catch (e) {
        console.error("Failed to delete animal record:", e);
        setError("Could not delete the animal record.");
        toast({
          title: "Error Deleting Animal",
          description: "Failed to delete the animal record.",
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
    return <p className="text-center text-muted-foreground py-4">Loading animal registry...</p>;
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
          Log in and ensure you are associated with a farm to view the animal registry.
        </AlertDescription>
      </Alert>
    );
  }

  if (logs.length === 0 && user?.farmId) {
    return (
      <Alert className="mt-4">
        <Icons.Info className="h-4 w-4" />
        <AlertTitle>No Animals Registered</AlertTitle>
        <AlertDescription>
          No animals found for this farm. Add new animals using the form.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="mt-8 border rounded-lg shadow-sm overflow-x-auto">
      <Table>
        <TableCaption>A list of your farm's registered animals.</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-[150px]">ID/Tag</TableHead>
            <TableHead className="min-w-[120px]">Species</TableHead>
            <TableHead className="min-w-[120px]">Breed</TableHead>
            <TableHead className="min-w-[120px]">Birth Date</TableHead>
            <TableHead className="min-w-[100px]">Gender</TableHead>
            <TableHead className="min-w-[120px]">Dam ID/Tag</TableHead>
            <TableHead className="min-w-[120px]">Sire ID/Tag</TableHead>
            <TableHead className="min-w-[150px]">Notes</TableHead>
            {canUserDelete && <TableHead className="text-right w-[100px]">Actions</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {logs.map((log) => (
            <TableRow key={log.id}>
              <TableCell className="font-medium">{log.animalIdTag}</TableCell>
              <TableCell>{log.species}</TableCell>
              <TableCell>{log.breed || "N/A"}</TableCell>
              <TableCell>{formatDate(log.birthDate)}</TableCell>
              <TableCell>{log.gender || "N/A"}</TableCell>
              <TableCell>{log.damIdTag || "N/A"}</TableCell>
              <TableCell>{log.sireIdTag || "N/A"}</TableCell>
              <TableCell className="max-w-xs truncate whitespace-nowrap overflow-hidden text-ellipsis" title={log.notes}>{log.notes || "N/A"}</TableCell>
              {canUserDelete && (
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" onClick={() => handleDeleteLog(log.id)} aria-label="Delete animal record">
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
