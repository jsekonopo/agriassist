
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
import { collection, addDoc, serverTimestamp } from "firebase/firestore";

import { MapContainer, TileLayer } from 'react-leaflet';
import { MapDrawControl } from '@/components/map/map-draw-control';
import type { GeoJsonObject, Feature, Geometry } from 'geojson';
import L from 'leaflet'; 

const areaUnits: PreferredAreaUnit[] = ["acres", "hectares"];

// Helper to check for valid GeoJSON structure for Polygons or Features containing Polygons
const isValidGeoJsonBoundary = (data: string): boolean => {
  if (!data || data.trim() === "") return true; // Empty is allowed
  try {
    const parsed = JSON.parse(data);
    if (typeof parsed !== 'object' || parsed === null) return false;

    const checkGeometry = (geom: Geometry) => {
      if (!geom || !geom.type || !geom.coordinates) return false;
      return (geom.type === "Polygon" || geom.type === "MultiPolygon") && Array.isArray(geom.coordinates);
    };

    if (parsed.type === "Feature") {
      return parsed.geometry && checkGeometry(parsed.geometry);
    } else if (parsed.type === "Polygon" || parsed.type === "MultiPolygon") {
      return checkGeometry(parsed);
    } else if (parsed.type === "FeatureCollection" && Array.isArray(parsed.features)) {
      // Allow FeatureCollection if it contains at least one valid Polygon/MultiPolygon feature
      return parsed.features.some((feature: Feature) => feature.geometry && checkGeometry(feature.geometry));
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
    message: "Invalid GeoJSON. Must be a valid Polygon, MultiPolygon, or a Feature/FeatureCollection containing them. Please draw or paste valid GeoJSON." 
  }),
  notes: z.string().optional(),
}).refine(data => (data.fieldSize !== undefined && data.fieldSize !== null) ? data.fieldSizeUnit !== undefined : true, {
  message: "Unit is required if field size is provided.",
  path: ["fieldSizeUnit"],
});

interface FieldDefinitionFormProps {
  onLogSaved?: () => void;
}

export function FieldDefinitionForm({ onLogSaved }: FieldDefinitionFormProps) {
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
    if (user?.settings?.preferredAreaUnit && !form.formState.dirtyFields.fieldSizeUnit) {
      form.setValue("fieldSizeUnit", user.settings.preferredAreaUnit, { shouldValidate: false });
    }
  }, [user?.settings?.preferredAreaUnit, form, form.formState.dirtyFields.fieldSizeUnit]);

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
      toast({
        title: "Authentication Error",
        description: "You must be logged in and associated with a farm to save a field definition.",
        variant: "destructive",
      });
      return;
    }
    setIsSubmitting(true);
    try {
      const fieldData: any = { 
        fieldName: values.fieldName,
        userId: user.uid, 
        farmId: user.farmId, 
        createdAt: serverTimestamp(),
        // Remove deprecated individual lat/lon if using GeoJSON
        latitude: null, 
        longitude: null,
      };

      if (values.fieldSize !== undefined && values.fieldSize !== null && values.fieldSizeUnit) {
        fieldData.fieldSize = values.fieldSize;
        fieldData.fieldSizeUnit = values.fieldSizeUnit;
      }
       if (values.geojsonBoundary && values.geojsonBoundary.trim() !== "") {
        fieldData.geojsonBoundary = values.geojsonBoundary; 
      } else {
        fieldData.geojsonBoundary = null; 
      }
       if (values.notes && values.notes.trim() !== "") {
        fieldData.notes = values.notes;
      }

      await addDoc(collection(db, "fields"), fieldData);
      toast({
        title: "Field Definition Saved",
        description: `Field: ${values.fieldName} has been saved.`,
      });
      form.reset({ 
        fieldName: "", 
        fieldSize: undefined, 
        fieldSizeUnit: preferredAreaUnit, 
        geojsonBoundary: "", 
        notes: "" 
      });
      // Reset the MapDrawControl's internal state if possible (by changing key or initialGeoJson)
      // For now, relying on form.reset which clears currentGeoJsonString -> initialGeoJsonForMap becomes null
      if (onLogSaved) {
        onLogSaved();
      }
    } catch (error) {
      console.error("Error saving field definition to Firestore:", error);
      toast({
        title: "Error Saving Field",
        description: "Could not save the field definition. Ensure GeoJSON is valid if provided.",
        variant: "destructive",
      });
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
          <FormLabel>Field Boundary (Draw on Map)</FormLabel>
          <FormDescription>
            Use the map tools (top-left) to draw your field boundary (polygon or rectangle). 
            You can edit or delete the drawn shape using the tools.
          </FormDescription>
          <div className="h-[400px] w-full rounded-md border shadow-sm overflow-hidden mt-2 bg-muted">
            <MapContainer 
                center={mapCenter} 
                zoom={mapZoom} 
                scrollWheelZoom={true} 
                style={{ height: '100%', width: '100%' }} 
                key={mapCenter.join('-') + mapZoom + (initialGeoJsonForMap ? 'map-with-geojson' : 'map-no-geojson')} // Key to force re-render if needed
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
                <FormDescription>GeoJSON data is automatically populated by drawing on the map.</FormDescription>
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
        <Button type="submit" disabled={isSubmitting || !user || !user.farmId}>
          {isSubmitting ? (
            <>
              <Icons.Search className="mr-2 h-4 w-4 animate-spin" />
              Saving Field...
            </>
          ) : (
            "Save Field Definition"
          )}
        </Button>
        {(!user || !user.farmId) && <p className="text-sm text-destructive mt-2">You must be associated with a farm to save field definitions.</p>}
      </form>
    </Form>
  );
}
