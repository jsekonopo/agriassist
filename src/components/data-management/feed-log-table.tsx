
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

interface FeedLog {
  id: string; // Firestore document ID
  animalIdTag?: string | null; // Denormalized if animalDocId is present
  animalDocId?: string | null;
  logDate: string; 
  feedType: string;
  quantityConsumed: number;
  quantityUnit: string;
  notes?: string;
  createdAt?: Timestamp | Date;
  farmId: string;
  userId: string;
}

interface FeedLogTableProps {
  refreshTrigger: number;
  onLogDeleted: () => void;
}

const ownerRoles: UserRole[] = ['free', 'pro', 'agribusiness'];
const rolesThatCanDelete: UserRole[] = [...ownerRoles, 'admin'];

export function FeedLogTable({ refreshTrigger, onLogDeleted }: FeedLogTableProps) {
  const [logs, setLogs] = useState<FeedLog[]>([]);
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
          collection(db, "livestockFeedLogs"),
          where("farmId", "==", user.farmId),
          orderBy("logDate", "desc"),
          orderBy("createdAt", "desc")
        );
        const querySnapshot = await getDocs(q);
        const fetchedLogs: FeedLog[] = querySnapshot.docs.map((docSnapshot) => {
          const data = docSnapshot.data();
          return {
            id: docSnapshot.id,
            ...data,
            createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : undefined,
          } as FeedLog;
        });
        setLogs(fetchedLogs);
      } catch (e) {
        console.error("Failed to load feed logs:", e);
        setError("Could not load feed logs. Please try again.");
        toast({
          title: "Error Loading Feed Logs",
          description: "Failed to load feed logs.",
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
        toast({ title: "Permission Denied", description: "You do not have permission to delete feed logs.", variant: "destructive" });
        return;
    }
    if (window.confirm("Are you sure you want to delete this feed log? This action cannot be undone.")) {
      try {
        await deleteDoc(doc(db, "livestockFeedLogs", logId));
        toast({
          title: "Feed Log Deleted",
          description: "The feed record has been removed.",
        });
        onLogDeleted(); 
      } catch (e) {
        console.error("Failed to delete feed log:", e);
        setError("Could not delete the feed log.");
        toast({
          title: "Error Deleting Log",
          description: "Failed to delete the feed log.",
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
    return <p className="text-center text-muted-foreground py-4">Loading feed logs...</p>;
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
          Log in and ensure you are associated with a farm to view feed logs.
        </AlertDescription>
      </Alert>
    );
  }

  if (logs.length === 0 && user?.farmId) {
    return (
      <Alert className="mt-4">
        <Icons.Info className="h-4 w-4" />
        <AlertTitle>No Feed Logs Found</AlertTitle>
        <AlertDescription>
          No feed logs found for this farm. Add new records using the form.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="mt-8 border rounded-lg shadow-sm overflow-x-auto">
      <Table>
        <TableCaption>A list of your farm's feed logs.</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-[120px]">Date</TableHead>
            <TableHead className="min-w-[150px]">Animal ID/Tag</TableHead>
            <TableHead className="min-w-[200px]">Feed Type</TableHead>
            <TableHead className="min-w-[150px]">Quantity</TableHead>
            <TableHead className="min-w-[200px]">Notes</TableHead>
            {canUserDelete && <TableHead className="text-right w-[100px]">Actions</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {logs.map((log) => (
            <TableRow key={log.id}>
              <TableCell>{formatDateSafe(log.logDate)}</TableCell>
              <TableCell>{log.animalIdTag || "Group/General"}</TableCell>
              <TableCell className="font-medium">{log.feedType}</TableCell>
              <TableCell>{log.quantityConsumed} {log.quantityUnit}</TableCell>
              <TableCell className="max-w-xs truncate whitespace-nowrap overflow-hidden text-ellipsis" title={log.notes}>{log.notes || "N/A"}</TableCell>
              {canUserDelete && (
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" onClick={() => handleDeleteLog(log.id)} aria-label="Delete feed log">
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
