
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
import { useAuth, type UserRole, type PreferredAreaUnit } from "@/contexts/auth-context"; 
import { db } from "@/lib/firebase";
import { collection, query, where, getDocs, deleteDoc, doc, orderBy, Timestamp } from "firebase/firestore";


interface FieldDefinitionLog {
  id: string; 
  fieldName: string;
  fieldSize?: number;
  fieldSizeUnit?: string; 
  geojsonBoundary?: string | null;
  latitude?: number | null; // Added for fields that might only have lat/lon
  longitude?: number | null; // Added for fields that might only have lat/lon
  notes?: string;
  createdAt?: Timestamp | Date; 
  farmId: string;
  userId: string;
}

interface FieldDefinitionTableProps {
  refreshTrigger: number;
  onLogDeleted: () => void;
  onEditField: (fieldId: string) => void; 
}

const ACRES_TO_HECTARES = 0.404686;
const HECTARES_TO_ACRES = 1 / ACRES_TO_HECTARES;

const ownerRoles: UserRole[] = ['free', 'pro', 'agribusiness'];
const adminRole: UserRole[] = ['admin'];
const editorRole: UserRole[] = ['editor'];

const rolesThatCanEditFields: UserRole[] = [...ownerRoles, ...adminRole, ...editorRole];
const rolesThatCanDeleteFields: UserRole[] = [...ownerRoles, ...adminRole];


export function FieldDefinitionTable({ refreshTrigger, onLogDeleted, onEditField }: FieldDefinitionTableProps) {
  const [logs, setLogs] = useState<FieldDefinitionLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const { user } = useAuth();
  const preferredAreaUnit = user?.settings?.preferredAreaUnit || "acres";

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

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
          orderBy("fieldName", "asc")
        );
        const querySnapshot = await getDocs(q);
        const fetchedLogs: FieldDefinitionLog[] = querySnapshot.docs.map(docSnap => ({
          id: docSnap.id,
          ...docSnap.data(),
          createdAt: docSnap.data().createdAt?.toDate ? docSnap.data().createdAt.toDate() : undefined,
        } as FieldDefinitionLog));
        setLogs(fetchedLogs);
        setCurrentPage(1); 
      } catch (e) {
        console.error("Failed to load field definitions from Firestore:", e);
        setError("Could not load field definitions. Please try again.");
        toast({
          title: "Error Loading Fields",
          description: "Failed to load field definitions.",
          variant: "destructive"
        });
      } finally {
        setIsLoading(false);
      }
    };
    fetchFieldDefinitions();
  }, [user?.farmId, refreshTrigger, toast]);

  const canUserDelete = user?.roleOnCurrentFarm && rolesThatCanDeleteFields.includes(user.roleOnCurrentFarm as UserRole);
  const canUserEdit = user?.roleOnCurrentFarm && rolesThatCanEditFields.includes(user.roleOnCurrentFarm as UserRole);


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

  const formatFieldSize = (size?: number, unit?: string, targetUnit?: PreferredAreaUnit): string => {
    if (size === undefined || size === null) return "N/A";
    
    const originalUnit = unit?.toLowerCase() || "acres"; 
    const displayUnit = targetUnit || "acres";

    if (originalUnit === displayUnit) {
      return `${size.toFixed(1)} ${displayUnit}`;
    }

    let sizeInAcres: number;
    if (originalUnit.includes("hectare")) {
      sizeInAcres = size * HECTARES_TO_ACRES;
    } else { 
      sizeInAcres = size;
    }

    if (displayUnit === "hectares") {
      return `${(sizeInAcres * ACRES_TO_HECTARES).toFixed(2)} ${displayUnit}`;
    }
    return `${sizeInAcres.toFixed(1)} ${displayUnit}`;
  };

  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = logs.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(logs.length / itemsPerPage);

  const handleNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
    }
  };

  const handlePreviousPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
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

  return ( // This is the return statement in question
    <div className="mt-8">
      <div className="border rounded-lg shadow-sm overflow-x-auto">
        <Table>
          <TableCaption>A list of your farm fields. Displaying area in {preferredAreaUnit}. Page {currentPage} of {totalPages}.</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[150px]">Field Name</TableHead>
              <TableHead className="min-w-[120px]">Size ({preferredAreaUnit})</TableHead>
              <TableHead className="min-w-[120px]">Boundary Data</TableHead>
              <TableHead className="min-w-[200px]">Notes</TableHead>
              {(canUserEdit || canUserDelete) && <TableHead className="text-right w-[120px]">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {currentItems.map((log) => (
              <TableRow key={log.id}>
                <TableCell className="font-medium">{log.fieldName}</TableCell>
                <TableCell>{formatFieldSize(log.fieldSize, log.fieldSizeUnit, preferredAreaUnit)}</TableCell>
                <TableCell>{log.geojsonBoundary && log.geojsonBoundary.trim() !== "" ? "Yes" : "No"}</TableCell>
                <TableCell className="max-w-sm truncate whitespace-nowrap overflow-hidden text-ellipsis" title={log.notes}>{log.notes || "N/A"}</TableCell>
                {(canUserEdit || canUserDelete) && (
                  <TableCell className="text-right space-x-1">
                    {canUserEdit && (
                      <Button variant="ghost" size="icon" onClick={() => onEditField(log.id)} aria-label="Edit field">
                        <Icons.Edit3 className="h-4 w-4 text-blue-600" />
                      </Button>
                    )}
                    {canUserDelete && (
                      <Button variant="ghost" size="icon" onClick={() => handleDeleteLog(log.id)} aria-label="Delete field">
                        <Icons.Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {logs.length > itemsPerPage && (
        <div className="flex items-center justify-end space-x-2 py-4">
          <span className="text-sm text-muted-foreground">
            Page {currentPage} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={handlePreviousPage}
            disabled={currentPage === 1}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleNextPage}
            disabled={currentPage === totalPages}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
