
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
import { useToast } from "@/hooks/use-toast";
import { useAuth, type UserRole } from "@/contexts/auth-context"; 
import { db } from "@/lib/firebase";
import { collection, query, where, getDocs, deleteDoc, doc, orderBy, Timestamp } from "firebase/firestore";
import { PreferredAreaUnit } from "@/contexts/auth-context";

interface FieldDefinitionLog {
  id: string; 
  fieldName: string;
  fieldSize?: number;
  fieldSizeUnit?: string; // Unit as stored in DB, e.g., 'acres', 'hectares'
  notes?: string;
  createdAt?: Timestamp | Date; 
  farmId: string;
  userId: string;
}

interface FieldDefinitionTableProps {
  refreshTrigger: number;
  onLogDeleted: () => void;
}

const ACRES_TO_HECTARES = 0.404686;
const HECTARES_TO_ACRES = 1 / ACRES_TO_HECTARES;

const ownerRoles: UserRole[] = ['free', 'pro', 'agribusiness'];
const rolesThatCanDelete: UserRole[] = [...ownerRoles, 'admin'];

export function FieldDefinitionTable({ refreshTrigger, onLogDeleted }: FieldDefinitionTableProps) {
  const [logs, setLogs] = useState<FieldDefinitionLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const { user } = useAuth();
  const preferredAreaUnit = user?.settings?.preferredAreaUnit || "acres";

  useEffect(() => {
    if (!user || !user.farmId) { 
      setIsLoading(false);
      setLogs([]); 
      return;
    }

    setIsLoading(true);
    setError(null);
    const fetchFieldDefinitions = async () => {
      try {
        const q = query(
          collection(db, "fields"),
          where("farmId", "==", user.farmId), 
          orderBy("createdAt", "desc")
        );
        const querySnapshot = await getDocs(q);
        const fetchedLogs: FieldDefinitionLog[] = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          createdAt: doc.data().createdAt?.toDate ? doc.data().createdAt.toDate() : undefined,
        } as FieldDefinitionLog));
        setLogs(fetchedLogs);
      } catch (e) {
        console.error("Failed to load field definitions from Firestore:", e);
        setError("Could not load field definitions. Please try again.");
        toast({
          title: "Error Loading Fields",
          description: "Failed to load field definitions from Firestore.",
          variant: "destructive"
        });
      } finally {
        setIsLoading(false);
      }
    };
    fetchFieldDefinitions();
  }, [user?.farmId, refreshTrigger, toast]);

  const canUserDelete = user?.roleOnCurrentFarm && rolesThatCanDelete.includes(user.roleOnCurrentFarm);

  const handleDeleteLog = async (logId: string) => {
    if (!canUserDelete) {
        toast({ title: "Permission Denied", description: "You do not have permission to delete fields.", variant: "destructive" });
        return;
    }
    if (window.confirm("Are you sure you want to delete this field definition? This action cannot be undone.")) {
      try {
        await deleteDoc(doc(db, "fields", logId));
        toast({
          title: "Field Deleted",
          description: "The field definition has been removed from Firestore.",
        });
        onLogDeleted(); 
      } catch (e) {
        console.error("Failed to delete field definition from Firestore:", e);
        setError("Could not delete the field definition.");
        toast({
          title: "Error Deleting Field",
          description: "Failed to delete the field definition from Firestore.",
          variant: "destructive"
        });
      }
    }
  };

  const formatFieldSize = (size?: number, unit?: string, targetUnit?: PreferredAreaUnit): string => {
    if (size === undefined || size === null) return "N/A";
    
    const originalUnit = unit?.toLowerCase() || "acres"; // Assume acres if not specified
    const displayUnit = targetUnit || "acres";

    if (originalUnit === displayUnit) {
      return `${size.toFixed(1)} ${displayUnit}`;
    }

    let sizeInAcres: number;
    if (originalUnit.includes("hectare")) {
      sizeInAcres = size * HECTARES_TO_ACRES;
    } else { // Assume acres
      sizeInAcres = size;
    }

    if (displayUnit === "hectares") {
      return `${(sizeInAcres * ACRES_TO_HECTARES).toFixed(2)} ${displayUnit}`;
    }
    // Default to acres if targetUnit is acres or unknown
    return `${sizeInAcres.toFixed(1)} ${displayUnit}`;
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

  if ((!user || !user.farmId) && !isLoading) {
     return (
      <Alert className="mt-4">
        <Icons.Info className="h-4 w-4" />
        <AlertTitle>Farm Association Required</AlertTitle>
        <AlertDescription>
          Please ensure you are logged in and associated with a farm to view and manage field definitions.
        </AlertDescription>
      </Alert>
    );
  }

  if (logs.length === 0 && user && user.farmId) {
    return (
      <Alert className="mt-4">
        <Icons.Info className="h-4 w-4" />
        <AlertTitle>No Fields Defined for this Farm</AlertTitle>
        <AlertDescription>
          You haven&apos;t defined any farm fields yet. Add a new field using the form.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="mt-8 border rounded-lg shadow-sm overflow-x-auto">
      <Table>
        <TableCaption>A list of your farm fields. Data is stored in Firestore.</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-[200px]">Field Name</TableHead>
            <TableHead className="min-w-[150px]">Size ({preferredAreaUnit})</TableHead>
            <TableHead className="min-w-[250px]">Notes</TableHead>
            {canUserDelete && <TableHead className="text-right w-[100px]">Actions</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {logs.map((log) => (
            <TableRow key={log.id}>
              <TableCell className="font-medium">{log.fieldName}</TableCell>
              <TableCell>{formatFieldSize(log.fieldSize, log.fieldSizeUnit, preferredAreaUnit)}</TableCell>
              <TableCell className="max-w-sm truncate whitespace-nowrap overflow-hidden text-ellipsis">{log.notes || "N/A"}</TableCell>
              {canUserDelete && (
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" onClick={() => handleDeleteLog(log.id)} aria-label="Delete field">
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
