
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

interface FieldDefinitionLog {
  id: string;
  fieldName: string;
  fieldSize?: number;
  fieldSizeUnit?: string;
  notes?: string;
  submittedAt: string; // ISO string
}

interface FieldDefinitionTableProps {
  refreshTrigger: number;
  onLogDeleted: () => void;
}

export function FieldDefinitionTable({ refreshTrigger, onLogDeleted }: FieldDefinitionTableProps) {
  const [logs, setLogs] = useState<FieldDefinitionLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    setIsLoading(true);
    setError(null);
    try {
      const storedLogs = localStorage.getItem("fieldDefinitions");
      if (storedLogs) {
        const parsedLogs = JSON.parse(storedLogs) as FieldDefinitionLog[];
        parsedLogs.sort((a, b) => parseISO(b.submittedAt).getTime() - parseISO(a.submittedAt).getTime());
        setLogs(parsedLogs);
      } else {
        setLogs([]);
      }
    } catch (e) {
      console.error("Failed to load field definitions:", e);
      setError("Could not load field definitions. Data might be corrupted.");
      toast({
        title: "Error Loading Fields",
        description: "Failed to load field definitions from local storage.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  }, [refreshTrigger, toast]);

  const handleDeleteLog = (logId: string) => {
    if (window.confirm("Are you sure you want to delete this field definition? This action cannot be undone.")) {
      try {
        const updatedLogs = logs.filter(log => log.id !== logId);
        localStorage.setItem("fieldDefinitions", JSON.stringify(updatedLogs));
        setLogs(updatedLogs);
        toast({
          title: "Field Deleted",
          description: "The field definition has been removed.",
        });
        onLogDeleted();
      } catch (e) {
        console.error("Failed to delete field definition:", e);
        setError("Could not delete the field definition.");
        toast({
          title: "Error Deleting Field",
          description: "Failed to delete the field definition.",
          variant: "destructive"
        });
      }
    }
  };
  
  if (isLoading) {
    return <p className="text-center text-muted-foreground py-4">Loading field definitions...</p>;
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
        <AlertTitle>No Fields Defined</AlertTitle>
        <AlertDescription>
          You haven&apos;t defined any farm fields yet. Add a new field using the form.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="mt-8 border rounded-lg shadow-sm overflow-x-auto">
      <Table>
        <TableCaption>A list of your defined farm fields. Data is stored locally in your browser.</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-[200px]">Field Name</TableHead>
            <TableHead className="min-w-[100px]">Size</TableHead>
            <TableHead className="min-w-[100px]">Unit</TableHead>
            <TableHead className="min-w-[250px]">Notes</TableHead>
            <TableHead className="text-right w-[100px]">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {logs.map((log) => (
            <TableRow key={log.id}>
              <TableCell className="font-medium">{log.fieldName}</TableCell>
              <TableCell>{log.fieldSize !== undefined ? log.fieldSize : "N/A"}</TableCell>
              <TableCell>{log.fieldSizeUnit || "N/A"}</TableCell>
              <TableCell className="max-w-sm truncate whitespace-nowrap overflow-hidden text-ellipsis">{log.notes || "N/A"}</TableCell>
              <TableCell className="text-right">
                <Button variant="ghost" size="icon" onClick={() => handleDeleteLog(log.id)} aria-label="Delete field">
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
