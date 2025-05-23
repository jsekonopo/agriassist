
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
import type { GeoJsonObject, Feature, Geometry, Polygon, MultiPolygon, FeatureCollection } from 'geojson';
import L from 'leaflet'; 
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";


const areaUnits: PreferredAreaUnit[] = ["acres", "hectares"];

const isValidGeoJsonGeometry = (geom: Geometry | null | undefined): geom is Polygon | MultiPolygon => {
  if (!geom || !geom.type || !geom.coordinates) return false;
  return (geom.type === "Polygon" || geom.type === "MultiPolygon") && Array.isArray(geom.coordinates) && geom.coordinates.length > 0;
};

const isValidGeoJsonBoundary = (data: string): boolean => {
  if (!data || data.trim() === "") return true; 
  try {
    const parsed = JSON.parse(data) as GeoJsonObject; 
    if (typeof parsed !== 'object' || parsed === null) return false;

    if (parsed.type === "Feature") {
      return isValidGeoJsonGeometry((parsed as Feature).geometry);
    } else if (parsed.type === "Polygon" || parsed.type === "MultiPolygon") {
      return isValidGeoJsonGeometry(parsed as Geometry);
    } else if (parsed.type === "FeatureCollection" && Array.isArray((parsed as FeatureCollection).features)) {
      return (parsed as FeatureCollection).features.some((feature: Feature) => isValidGeoJsonGeometry(feature.geometry));
    }
    if (parsed.type === "Feature" && (parsed as Feature).geometry === null) return true; 
    
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
    message: "Invalid GeoJSON structure. Please ensure it's a valid Feature (with Polygon/MultiPolygon geometry), Polygon, MultiPolygon, or FeatureCollection containing them." 
  }),
  notes: z.string().optional(),
}).refine(data => (data.fieldSize !== undefined && data.fieldSize !== null) ? data.fieldSizeUnit !== undefined : true, {
  message: "Unit is required if field size is provided.",
  path: ["fieldSizeUnit"],
});

interface FieldDefinitionFormProps {
  editingFieldId?: string | null;
  onFormActionComplete?: () => void;
}

export function FieldDefinitionForm({ editingFieldId, onFormActionComplete }: FieldDefinitionFormProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { user } = useAuth();
  const preferredAreaUnit = user?.settings?.preferredAreaUnit || "acres";
  
  const [mapCenter, setMapCenter] = useState<[number, number]>([
    user?.farmLatitude ?? 45.4215, 
    user?.farmLongitude ?? -75.6972
  ]); 
  const [mapZoom, setMapZoom] = useState(user?.farmLatitude && user?.farmLongitude ? 13 : 10);
  const [mapInstanceKey, setMapInstanceKey] = useState(Date.now()); 

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
    const loadFieldOrReset = async () => {
      if (editingFieldId && user?.farmId) {
        setIsSubmitting(true); 
        try {
          const fieldDocRef = doc(db, "fields", editingFieldId);
          const fieldDocSnap = await getDoc(fieldDocRef);
          if (fieldDocSnap.exists() && fieldDocSnap.data().farmId === user.farmId) {
            const fieldData = fieldDocSnap.data();
            const resetValues = {
              fieldName: fieldData.fieldName || "",
              fieldSize: fieldData.fieldSize !== undefined ? Number(fieldData.fieldSize) : undefined,
              fieldSizeUnit: fieldData.fieldSizeUnit || preferredAreaUnit,
              geojsonBoundary: fieldData.geojsonBoundary || "",
              notes: fieldData.notes || "",
            };
            form.reset(resetValues);
            
            let newCenter: [number, number] = [ user?.farmLatitude ?? 45.4215, user?.farmLongitude ?? -75.6972 ];
            let newZoom = user?.farmLatitude && user?.farmLongitude ? 13 : 10;

            if (fieldData.geojsonBoundary) {
              try {
                const parsedGeoJson = JSON.parse(fieldData.geojsonBoundary);
                if (parsedGeoJson) { 
                  const gjLayer = L.geoJSON(parsedGeoJson as L.GeoJSON.GeoJsonObject);
                  const bounds = gjLayer.getBounds();
                  if (bounds.isValid()) {
                    newCenter = [bounds.getCenter().lat, bounds.getCenter().lng];
                    newZoom = 16; 
                  }
                }
              } catch (e) { 
                console.warn("Could not parse existing GeoJSON for map centering:", e);
              }
            }
            setMapCenter(newCenter);
            setMapZoom(newZoom);
            setMapInstanceKey(Date.now()); 
          } else {
            toast({ title: "Error", description: "Field not found or not accessible.", variant: "destructive" });
            if (onFormActionComplete) onFormActionComplete(); 
          }
        } catch (error) {
          console.error("Error fetching field for editing:", error);
          toast({ title: "Error", description: "Could not load field data for editing.", variant: "destructive" });
          if (onFormActionComplete) onFormActionComplete();
        } finally {
          setIsSubmitting(false);
        }
      } else if (!editingFieldId) { 
        form.reset({
          fieldName: "",
          notes: "",
          fieldSize: undefined,
          fieldSizeUnit: preferredAreaUnit,
          geojsonBoundary: "",
        });
        setMapCenter([ user?.farmLatitude ?? 45.4215, user?.farmLongitude ?? -75.6972 ]);
        setMapZoom(user?.farmLatitude && user?.farmLongitude ? 13 : 10);
        setMapInstanceKey(Date.now()); 
      }
    };
    loadFieldOrReset();
  }, [editingFieldId, user?.farmId, user?.farmLatitude, user?.farmLongitude, form, preferredAreaUnit, toast, onFormActionComplete]);


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

  const mapContainerKey = useMemo(() => {
    return `field-map-${editingFieldId || 'new'}-${mapInstanceKey}`;
  }, [editingFieldId, mapInstanceKey]);


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
        userId: user.uid,
        updatedAt: serverTimestamp(),
      };

      if (values.fieldSize !== undefined && values.fieldSize !== null && values.fieldSizeUnit) {
        fieldDataPayload.fieldSize = values.fieldSize;
        fieldDataPayload.fieldSizeUnit = values.fieldSizeUnit;
      } else {
        fieldDataPayload.fieldSize = null;
        fieldDataPayload.fieldSizeUnit = null;
      }
      
      if (values.geojsonBoundary && values.geojsonBoundary.trim() !== "" && isValidGeoJsonBoundary(values.geojsonBoundary)) {
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
        const fieldDocRef = doc(db, "fields", editingFieldId);
        await updateDoc(fieldDocRef, fieldDataPayload);
        toast({ title: "Field Updated", description: `Field: ${values.fieldName} has been updated.` });
      } else {
        fieldDataPayload.createdAt = serverTimestamp();
        await addDoc(collection(db, "fields"), fieldDataPayload);
        toast({ title: "Field Definition Saved", description: `Field: ${values.fieldName} has been saved.` });
      }
      
      if (onFormActionComplete) {
        onFormActionComplete(); 
      } else { 
        form.reset({
            fieldName: "",
            notes: "",
            fieldSize: undefined,
            fieldSizeUnit: preferredAreaUnit,
            geojsonBoundary: "",
        });
        setMapInstanceKey(Date.now()); 
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
                    <Input type="number" step="any" placeholder="e.g., 100" {...field} onChange={e => field.onChange(e.target.value === '' ? undefined : parseFloat(e.target.value))} value={field.value ?? ''} />
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
                    value={form.watch('fieldSizeUnit') || preferredAreaUnit}
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
            <TooltipProvider>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <FormLabel className="flex items-center gap-1 cursor-help">
                            Field Boundary (Draw on Map) <Icons.Info className="h-3 w-3 text-muted-foreground"/>
                        </FormLabel>
                    </TooltipTrigger>
                    <TooltipContent>
                        <p>Use the map tools (top-left) to draw a Polygon or Rectangle for your field boundary. <br />Click shapes to edit or delete them. The GeoJSON data will be auto-populated.</p>
                    </TooltipContent>
                </Tooltip>
            </TooltipProvider>
          <div className="h-[400px] w-full rounded-md border shadow-sm overflow-hidden mt-2 bg-muted">
            <MapContainer 
                key={mapContainerKey} 
                center={mapCenter} 
                zoom={mapZoom} 
                scrollWheelZoom={true} 
                style={{ height: '100%', width: '100%' }} 
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
                key={`draw-control-${mapInstanceKey}-${String(initialGeoJsonForMap ? 'has-geojson' : 'no-geojson')}`}
                onShapeDrawn={handleShapeDrawn} 
                initialGeoJson={initialGeoJsonForMap} 
              />
            </MapContainer>
          </div>
          <FormField
            control={form.control}
            name="geojsonBoundary"
            render={({ field }) => ( 
              <FormItem className="sr-only"> 
                <FormLabel>GeoJSON Boundary Data (Auto-populated)</FormLabel>
                <FormControl>
                   <Textarea {...field} readOnly placeholder="GeoJSON data will appear here after drawing..."/>
                </FormControl>
                <FormDescription>This data is populated by drawing on the map.</FormDescription>
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
                : editingFieldId ? <><Icons.Edit3 className="mr-2 h-4 w-4"/> Update Field</> 
                : <><Icons.PlusCircle className="mr-2 h-4 w-4"/> Save New Field</>
              }
            </Button>
            {editingFieldId && (
                <Button type="button" variant="outline" onClick={() => {
                    if(onFormActionComplete) onFormActionComplete();
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
