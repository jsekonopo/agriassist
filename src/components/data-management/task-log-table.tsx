
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
import { Badge } from "@/components/ui/badge";
import { format, parseISO } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { useAuth, type UserRole } from "@/contexts/auth-context"; 
import { db } from "@/lib/firebase";
import { collection, query, where, getDocs, deleteDoc, doc, orderBy, Timestamp } from "firebase/firestore";

interface TaskLog {
  id: string; 
  taskName: string;
  description?: string;
  dueDate?: string | null; 
  assignedTo?: string;
  status: "To Do" | "In Progress" | "Done";
  fieldId?: string | null;
  fieldName?: string | null; // Denormalized for display
  createdAt?: Timestamp | Date; 
  farmId: string;
  userId: string;
}

interface TaskLogTableProps {
  refreshTrigger: number;
  onLogDeleted: () => void;
}

const ownerRoles: UserRole[] = ['free', 'pro', 'agribusiness'];
const adminRole: UserRole[] = ['admin'];
const rolesThatCanDelete: UserRole[] = [...ownerRoles, ...adminRole];

export function TaskLogTable({ refreshTrigger, onLogDeleted }: TaskLogTableProps) {
  const [logs, setLogs] = useState<TaskLog[]>([]);
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
    const fetchTasks = async () => {
      try {
        const q = query(
          collection(db, "taskLogs"),
          where("farmId", "==", user.farmId), 
          orderBy("createdAt", "desc")
        );
        const querySnapshot = await getDocs(q);
        const fetchedLogs: TaskLog[] = querySnapshot.docs.map(docSnapshot => ({
          id: docSnapshot.id,
          ...docSnapshot.data(),
          createdAt: docSnapshot.data().createdAt?.toDate ? docSnapshot.data().createdAt.toDate() : undefined,
        } as TaskLog));
        setLogs(fetchedLogs);
      } catch (e) {
        console.error("Failed to load tasks from Firestore:", e);
        setError("Could not load tasks. Please try again.");
        toast({
          title: "Error Loading Tasks",
          description: "Failed to load tasks from Firestore.",
          variant: "destructive"
        });
      } finally {
        setIsLoading(false);
      }
    };
    fetchTasks();
  }, [user?.farmId, refreshTrigger, toast]);

  const canUserDelete = user?.roleOnCurrentFarm && rolesThatCanDelete.includes(user.roleOnCurrentFarm);

  const handleDeleteLog = async (logId: string) => {
    if (!canUserDelete) {
        toast({ title: "Permission Denied", description: "You do not have permission to delete tasks.", variant: "destructive" });
        return;
    }
    if (window.confirm("Are you sure you want to delete this task? This action cannot be undone.")) {
      try {
        await deleteDoc(doc(db, "taskLogs", logId));
        toast({
          title: "Task Deleted",
          description: "The task has been removed from Firestore.",
        });
        onLogDeleted(); 
      } catch (e) {
        console.error("Failed to delete task from Firestore:", e);
        setError("Could not delete the task.");
        toast({
          title: "Error Deleting Task",
          description: "Failed to delete the task from Firestore.",
          variant: "destructive"
        });
      }
    }
  };

  const getStatusBadgeVariant = (status: TaskLog['status']): "default" | "secondary" | "outline" | "destructive" | null | undefined => {
    switch (status) {
      case "To Do":
        return "outline";
      case "In Progress":
        return "secondary";
      case "Done":
        return "default";
      default:
        return "secondary";
    }
  };

  if (isLoading) {
    return <p className="text-center text-muted-foreground py-4">Loading tasks...</p>;
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
          Log in and ensure you are associated with a farm to view tasks.
        </AlertDescription>
      </Alert>
    );
  }

  if (logs.length === 0 && user?.farmId) {
    return (
      <Alert className="mt-4">
        <Icons.Info className="h-4 w-4" />
        <AlertTitle>No Tasks Found for this Farm</AlertTitle>
        <AlertDescription>
          Your farm hasn&apos;t created any tasks yet. Add a new task using the form.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="mt-8 border rounded-lg shadow-sm overflow-x-auto">
      <Table>
        <TableCaption>A list of your farm tasks. Data is stored in Firestore.</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-[200px]">Task Name</TableHead>
            <TableHead className="min-w-[120px]">Status</TableHead>
            <TableHead className="min-w-[150px]">Due Date</TableHead>
            <TableHead className="min-w-[150px]">Assigned To</TableHead>
            <TableHead className="min-w-[150px]">Associated Field</TableHead>
            <TableHead className="min-w-[250px]">Description</TableHead>
            {canUserDelete && <TableHead className="text-right w-[100px]">Actions</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {logs.map((log) => (
            <TableRow key={log.id} className={log.status === "Done" ? "opacity-60" : ""}>
              <TableCell className="font-medium">{log.taskName}</TableCell>
              <TableCell>
                <Badge variant={getStatusBadgeVariant(log.status)}>{log.status}</Badge>
              </TableCell>
              <TableCell>{log.dueDate ? format(parseISO(log.dueDate), "MMM dd, yyyy") : "N/A"}</TableCell>
              <TableCell>{log.assignedTo || "N/A"}</TableCell>
              <TableCell>{log.fieldName || "N/A"}</TableCell>
              <TableCell className="max-w-sm truncate whitespace-nowrap overflow-hidden text-ellipsis" title={log.description ?? undefined}>
                {log.description || "N/A"}
              </TableCell>
              {canUserDelete && (
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" onClick={() => handleDeleteLog(log.id)} aria-label="Delete task">
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
