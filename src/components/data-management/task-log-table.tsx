
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

interface TaskLog {
  id: string;
  taskName: string;
  description?: string;
  dueDate?: string; // YYYY-MM-DD
  assignedTo?: string;
  status: "To Do" | "In Progress" | "Done";
  submittedAt: string; // ISO string
}

interface TaskLogTableProps {
  refreshTrigger: number;
  onLogDeleted: () => void;
}

export function TaskLogTable({ refreshTrigger, onLogDeleted }: TaskLogTableProps) {
  const [logs, setLogs] = useState<TaskLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    setIsLoading(true);
    setError(null);
    try {
      const storedLogs = localStorage.getItem("taskLogs");
      if (storedLogs) {
        const parsedLogs = JSON.parse(storedLogs) as TaskLog[];
        // Sort by due date (earliest first, undefined last), then by submittedAt
        parsedLogs.sort((a, b) => {
            if (a.dueDate && b.dueDate) {
                const dateA = parseISO(a.dueDate).getTime();
                const dateB = parseISO(b.dueDate).getTime();
                if (dateA !== dateB) return dateA - dateB;
            } else if (a.dueDate) {
                return -1; // a has due date, b doesn't, so a comes first
            } else if (b.dueDate) {
                return 1;  // b has due date, a doesn't, so b comes first
            }
            return parseISO(b.submittedAt).getTime() - parseISO(a.submittedAt).getTime();
        });
        setLogs(parsedLogs);
      } else {
        setLogs([]);
      }
    } catch (e) {
      console.error("Failed to load tasks:", e);
      setError("Could not load tasks. Data might be corrupted.");
      toast({
        title: "Error Loading Tasks",
        description: "Failed to load tasks from local storage.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  }, [refreshTrigger, toast]);

  const handleDeleteLog = (logId: string) => {
    if (window.confirm("Are you sure you want to delete this task? This action cannot be undone.")) {
      try {
        const updatedLogs = logs.filter(log => log.id !== logId);
        localStorage.setItem("taskLogs", JSON.stringify(updatedLogs));
        setLogs(updatedLogs);
        toast({
          title: "Task Deleted",
          description: "The task has been removed.",
        });
        onLogDeleted();
      } catch (e) {
        console.error("Failed to delete task:", e);
        setError("Could not delete the task.");
        toast({
          title: "Error Deleting Task",
          description: "Failed to delete the task.",
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

  if (logs.length === 0) {
    return (
      <Alert className="mt-4">
        <Icons.Info className="h-4 w-4" />
        <AlertTitle>No Tasks Found</AlertTitle>
        <AlertDescription>
          You haven&apos;t created any tasks yet. Add a new task using the form.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="mt-8 border rounded-lg shadow-sm overflow-x-auto">
      <Table>
        <TableCaption>A list of your farm tasks. Data is stored locally in your browser.</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-[200px]">Task Name</TableHead>
            <TableHead className="min-w-[120px]">Status</TableHead>
            <TableHead className="min-w-[150px]">Due Date</TableHead>
            <TableHead className="min-w-[150px]">Assigned To</TableHead>
            <TableHead className="min-w-[250px]">Description</TableHead>
            <TableHead className="text-right w-[100px]">Actions</TableHead>
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
              <TableCell className="max-w-sm truncate whitespace-nowrap overflow-hidden text-ellipsis" title={log.description}>
                {log.description || "N/A"}
              </TableCell>
              <TableCell className="text-right">
                <Button variant="ghost" size="icon" onClick={() => handleDeleteLog(log.id)} aria-label="Delete task">
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
