
"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect, useMemo } from "react";
import { Icons } from "../icons";
import { useAuth, type PreferredAreaUnit } from "@/contexts/auth-context";
import { db } from "@/lib/firebase";
import { collection, addDoc, updateDoc, doc, serverTimestamp, getDoc } from "firebase/firestore";
import { MapContainer, TileLayer, GeoJSON } from 'react-leaflet';
import { MapDrawControl } from '@/components/map/map-draw-control';
import type { GeoJsonObject, Feature, Geometry } from 'geojson';
import L from 'leaflet'; 

const areaUnits: PreferredAreaUnit[] = ["acres", "hectares"];

const isValidGeoJsonBoundary = (data: string): boolean => {
  if (!data || data.trim() === "") return true; 
  try {
    const parsed = JSON.parse(data);
    if (typeof parsed !== 'object' || parsed === null) return false;

    const checkGeometry = (geom: Geometry | null | undefined): geom is Geometry => {
      if (!geom || !geom.type || !geom.coordinates) return false;
      return (geom.type === "Polygon" || geom.type === "MultiPolygon") && Array.isArray(geom.coordinates);
    };

    if (parsed.type === "Feature") {
      return checkGeometry(parsed.geometry);
    } else if (parsed.type === "Polygon" || parsed.type === "MultiPolygon") {
      return checkGeometry(parsed);
    } else if (parsed.type === "FeatureCollection" && Array.isArray(parsed.features)) {
      return parsed.features.some((feature: Feature) => checkGeometry(feature.geometry));
    }
    return false;
  } catch (e) {
    return false;
  }
};

const fieldDefinitionSchema = z.object({
  fieldName: z.string().min(1, "Field name is required."),
  fieldSize: z.preprocess(
    (val) => (val === "" || val === undefined || val === null ? undefined : Number(val)),
    z.number({invalid_type_error: "Field size must be a number"}).positive("Field size must be positive.").optional()
  ),
  fieldSizeUnit: z.enum(areaUnits).optional(),
  geojsonBoundary: z.string().optional().refine(isValidGeoJsonBoundary, { 
    message: "Invalid GeoJSON. Must be a valid Polygon, MultiPolygon, Feature or FeatureCollection containing them. Please draw or ensure valid GeoJSON." 
  }),
  notes: z.string().optional(),
}).refine(data => (data.fieldSize !== undefined && data.fieldSize !== null) ? data.fieldSizeUnit !== undefined : true, {
  message: "Unit is required if field size is provided.",
  path: ["fieldSizeUnit"],
});

interface FieldDefinitionFormProps {
  onLogSaved?: () => void; // Kept for consistency, can be part of onFormActionComplete
  editingFieldId?: string | null;
  onFormActionComplete?: () => void;
}

export function FieldDefinitionForm({ onLogSaved, editingFieldId, onFormActionComplete }: FieldDefinitionFormProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { user } = useAuth();
  const preferredAreaUnit = user?.settings?.preferredAreaUnit || "acres";
  
  const [mapCenter, setMapCenter] = useState<[number, number]>([
    user?.farmLatitude ?? 45.4215, 
    user?.farmLongitude ?? -75.6972
  ]); 
  const [mapZoom, setMapZoom] = useState(user?.farmLatitude && user?.farmLongitude ? 13 : 10);

  const form = useForm<z.infer<typeof fieldDefinitionSchema>>({
    resolver: zodResolver(fieldDefinitionSchema),
    defaultValues: {
      fieldName: "",
      notes: "",
      fieldSize: undefined,
      fieldSizeUnit: preferredAreaUnit,
      geojsonBoundary: "",
    },
  });
  
  useEffect(() => {
    if (user?.farmLatitude && user?.farmLongitude) {
      setMapCenter([user.farmLatitude, user.farmLongitude]);
      setMapZoom(13);
    }
  }, [user?.farmLatitude, user?.farmLongitude]);

  useEffect(() => {
    // Set default unit based on user preference when form initializes or editingFieldId changes
    if (!editingFieldId && !form.formState.isDirty) { // Only on initial load for new form
        form.setValue("fieldSizeUnit", preferredAreaUnit, { shouldValidate: true });
    }
  }, [preferredAreaUnit, form, editingFieldId]);


  useEffect(() => {
    const loadFieldForEditing = async () => {
      if (editingFieldId && user?.farmId) {
        setIsSubmitting(true); // Use isSubmitting to indicate loading field data
        try {
          const fieldDocRef = doc(db, "fields", editingFieldId);
          const fieldDocSnap = await getDoc(fieldDocRef);
          if (fieldDocSnap.exists() && fieldDocSnap.data().farmId === user.farmId) {
            const fieldData = fieldDocSnap.data();
            form.reset({
              fieldName: fieldData.fieldName || "",
              fieldSize: fieldData.fieldSize !== undefined ? Number(fieldData.fieldSize) : undefined,
              fieldSizeUnit: fieldData.fieldSizeUnit || preferredAreaUnit,
              geojsonBoundary: fieldData.geojsonBoundary || "",
              notes: fieldData.notes || "",
            });
            // If GeoJSON exists, try to center map on it
            if (fieldData.geojsonBoundary) {
                try {
                    const parsedGeoJson = JSON.parse(fieldData.geojsonBoundary);
                    const gjLayer = L.geoJSON(parsedGeoJson);
                    setMapCenter(gjLayer.getBounds().getCenter().lat, gjLayer.getBounds().getCenter().lng);
                    setMapZoom(15); // Zoom in a bit
                } catch (e) { /* stay with default farm center */ }
            }

          } else {
            toast({ title: "Error", description: "Field not found or not accessible.", variant: "destructive" });
            if (onFormActionComplete) onFormActionComplete(); // Reset editing mode
          }
        } catch (error) {
          console.error("Error fetching field for editing:", error);
          toast({ title: "Error", description: "Could not load field data for editing.", variant: "destructive" });
          if (onFormActionComplete) onFormActionComplete();
        } finally {
          setIsSubmitting(false);
        }
      } else if (!editingFieldId) {
        // Reset form to default for new entry if editingFieldId is cleared
        form.reset({
          fieldName: "",
          notes: "",
          fieldSize: undefined,
          fieldSizeUnit: preferredAreaUnit,
          geojsonBoundary: "",
        });
        // Reset map center to farm default or general default
         setMapCenter([ user?.farmLatitude ?? 45.4215, user?.farmLongitude ?? -75.6972 ]);
         setMapZoom(user?.farmLatitude && user?.farmLongitude ? 13 : 10);
      }
    };
    loadFieldForEditing();
  }, [editingFieldId, user?.farmId, form, toast, onFormActionComplete, preferredAreaUnit, user?.farmLatitude, user?.farmLongitude]);


  const handleShapeDrawn = (geojson: GeoJsonObject | null) => {
    if (geojson) {
      form.setValue("geojsonBoundary", JSON.stringify(geojson, null, 2), { shouldValidate: true });
    } else {
      form.setValue("geojsonBoundary", "", { shouldValidate: true }); 
    }
  };
  
  const currentGeoJsonString = form.watch("geojsonBoundary");
  const initialGeoJsonForMap = useMemo(() => {
    if (currentGeoJsonString) {
      try {
        return JSON.parse(currentGeoJsonString) as GeoJsonObject;
      } catch (e) {
        return null;
      }
    }
    return null;
  }, [currentGeoJsonString]);


  async function onSubmit(values: z.infer<typeof fieldDefinitionSchema>) {
    if (!user || !user.farmId) { 
      toast({ title: "Authentication Error", description: "You must be logged in and associated with a farm.", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);
    try {
      const fieldDataPayload: any = { 
        fieldName: values.fieldName,
        farmId: user.farmId, 
        userId: user.uid, // Keep track of who created/last modified if needed at field level
        updatedAt: serverTimestamp(),
      };

      if (values.fieldSize !== undefined && values.fieldSize !== null && values.fieldSizeUnit) {
        fieldDataPayload.fieldSize = values.fieldSize;
        fieldDataPayload.fieldSizeUnit = values.fieldSizeUnit;
      } else {
        fieldDataPayload.fieldSize = null; // Or FieldValue.delete() if you want to remove them
        fieldDataPayload.fieldSizeUnit = null;
      }

      if (values.geojsonBoundary && values.geojsonBoundary.trim() !== "") {
        fieldDataPayload.geojsonBoundary = values.geojsonBoundary; 
      } else {
        fieldDataPayload.geojsonBoundary = null; 
      }
      if (values.notes && values.notes.trim() !== "") {
        fieldDataPayload.notes = values.notes;
      } else {
        fieldDataPayload.notes = null;
      }

      if (editingFieldId) {
        // Update existing document
        const fieldDocRef = doc(db, "fields", editingFieldId);
        await updateDoc(fieldDocRef, fieldDataPayload);
        toast({ title: "Field Updated", description: `Field: ${values.fieldName} has been updated.` });
      } else {
        // Add new document
        fieldDataPayload.createdAt = serverTimestamp();
        await addDoc(collection(db, "fields"), fieldDataPayload);
        toast({ title: "Field Definition Saved", description: `Field: ${values.fieldName} has been saved.` });
      }
      
      form.reset({ fieldName: "", fieldSize: undefined, fieldSizeUnit: preferredAreaUnit, geojsonBoundary: "", notes: "" });
      if (onFormActionComplete) { // Call this to reset parent state and trigger table refresh
        onFormActionComplete();
      } else if (onLogSaved) { // Fallback if only onLogSaved is provided (for new entries)
        onLogSaved();
      }

    } catch (error) {
      console.error("Error saving field definition to Firestore:", error);
      toast({ title: "Error Saving Field", description: "Could not save the field definition.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="fieldName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Field Name</FormLabel>
              <FormControl>
                <Input placeholder="e.g., North Pasture, Back Forty" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr] gap-4">
            <FormField
              control={form.control}
              name="fieldSize"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Size (Optional)</FormLabel>
                  <FormControl>
                    <Input type="number" step="any" placeholder="e.g., 100" {...field} value={field.value ?? ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="fieldSizeUnit"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Unit</FormLabel>
                  <Select 
                    onValueChange={field.onChange} 
                    value={field.value || preferredAreaUnit} // Default to preferredAreaUnit if field.value is undefined
                  >
                     <FormControl>
                        <SelectTrigger>
                            <SelectValue placeholder="Select unit"/>
                        </SelectTrigger>
                     </FormControl>
                     <SelectContent>
                        {areaUnits.map(unit => <SelectItem key={unit} value={unit}>{unit.charAt(0).toUpperCase() + unit.slice(1)}</SelectItem>)}
                     </SelectContent>
                  </Select>
                  <FormDescription>Required if size is entered.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
        </div>
        
        <FormItem>
          <FormLabel>Field Boundary (Draw on Map)</FormLabel>
          <FormDescription>
            Use the map tools (top-left) to draw your field boundary. You can edit or delete the drawn shape.
          </FormDescription>
          <div className="h-[400px] w-full rounded-md border shadow-sm overflow-hidden mt-2 bg-muted">
            <MapContainer 
                center={mapCenter} 
                zoom={mapZoom} 
                scrollWheelZoom={true} 
                style={{ height: '100%', width: '100%' }} 
                key={`${mapCenter.join('-')}-${mapZoom}-${editingFieldId || 'new'}`} // Force re-render on key change
            >
               <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &amp; Satellite: &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
                url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
              />
               <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                pane="tilePane" 
              />
              <MapDrawControl 
                onShapeDrawn={handleShapeDrawn} 
                initialGeoJson={initialGeoJsonForMap} 
              />
            </MapContainer>
          </div>
          <FormField
            control={form.control}
            name="geojsonBoundary"
            render={({ field }) => ( 
              <FormItem className="mt-2">
                <FormLabel className="sr-only">GeoJSON Boundary Data (Hidden)</FormLabel>
                <FormControl>
                   <Textarea {...field} className="hidden" readOnly placeholder="GeoJSON data will appear here after drawing..."/>
                </FormControl>
                <FormDescription>GeoJSON data is automatically populated by drawing on the map. Clear by deleting shape on map.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </FormItem>


        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Notes (Optional)</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Soil type, irrigation setup, common issues, etc."
                  className="resize-y min-h-[100px]"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex items-center gap-2">
            <Button type="submit" disabled={isSubmitting || !user || !user.farmId}>
              {isSubmitting ? <><Icons.Search className="mr-2 h-4 w-4 animate-spin" /> Saving...</>
                : editingFieldId ? "Update Field" : "Save New Field"
              }
            </Button>
            {editingFieldId && (
                <Button type="button" variant="outline" onClick={() => {
                    if(onFormActionComplete) onFormActionComplete();
                    // form.reset() will be handled by useEffect when editingFieldId becomes null
                }} disabled={isSubmitting}>
                    Cancel Edit
                </Button>
            )}
        </div>
        {(!user || !user.farmId) && <p className="text-sm text-destructive mt-2">You must be associated with a farm to save field definitions.</p>}
      </form>
    </Form>
  );
}
