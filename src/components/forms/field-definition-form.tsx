
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
import { useState, useEffect } from "react";
import { Icons } from "../icons";
import { useAuth, type PreferredAreaUnit } from "@/contexts/auth-context";
import { db } from "@/lib/firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { MapContainer, TileLayer, GeoJSON } from 'react-leaflet';
import { MapDrawControl } from '@/components/map/map-draw-control';
import type { GeoJsonObject } from 'geojson';
import L from 'leaflet'; // Import L for LatLngBounds

const areaUnits: PreferredAreaUnit[] = ["acres", "hectares"];

const fieldDefinitionSchema = z.object({
  fieldName: z.string().min(1, "Field name is required."),
  fieldSize: z.preprocess(
    (val) => (val === "" || val === undefined || val === null ? undefined : Number(val)),
    z.number({invalid_type_error: "Field size must be a number"}).positive("Field size must be positive.").optional()
  ),
  fieldSizeUnit: z.enum(areaUnits).optional(),
  geojsonBoundary: z.string().optional().refine((data) => {
    if (!data || data.trim() === "") return true; 
    try {
      const parsed = JSON.parse(data);
      if (typeof parsed !== 'object' || parsed === null) return false;
      // Basic GeoJSON type check - could be more specific (Polygon, MultiPolygon)
      if (!parsed.type || !parsed.coordinates) return false; 
    } catch (e) {
      return false;
    }
    return true;
  }, { message: "Must be valid GeoJSON string or empty. Try drawing the boundary again." }),
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
  const [mapCenter, setMapCenter] = useState<[number, number]>([45.4215, -75.6972]); // Default
  const [mapZoom, setMapZoom] = useState(10);
  const [currentDrawnGeoJson, setCurrentDrawnGeoJson] = useState<GeoJsonObject | null>(null);


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
      form.setValue("geojsonBoundary", JSON.stringify(geojson), { shouldValidate: true });
      setCurrentDrawnGeoJson(geojson); // For display on the form's map
    } else {
      form.setValue("geojsonBoundary", "", { shouldValidate: true });
      setCurrentDrawnGeoJson(null);
    }
  };
  
  const existingBoundaryToDisplay = form.watch("geojsonBoundary");
  let initialGeoJsonForMap: GeoJsonObject | undefined = undefined;
  if (existingBoundaryToDisplay) {
    try {
        initialGeoJsonForMap = JSON.parse(existingBoundaryToDisplay) as GeoJsonObject;
    } catch (e) {
        // console.warn("Could not parse existing geojsonBoundary for initial map display");
    }
  }


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
      };

      if (values.fieldSize !== undefined && values.fieldSize !== null && values.fieldSizeUnit) {
        fieldData.fieldSize = values.fieldSize;
        fieldData.fieldSizeUnit = values.fieldSizeUnit;
      }
       if (values.geojsonBoundary && values.geojsonBoundary.trim() !== "") {
        fieldData.geojsonBoundary = values.geojsonBoundary; // Store as string
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
      setCurrentDrawnGeoJson(null); // Clear drawn shape on map after save
      if (onLogSaved) {
        onLogSaved();
      }
    } catch (error) {
      console.error("Error saving field definition to Firestore:", error);
      toast({
        title: "Error Saving Field",
        description: "Could not save the field definition.",
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
        
        <FormField
          control={form.control}
          name="geojsonBoundary"
          render={({ field }) => ( // field value is the string
            <FormItem>
              <FormLabel>Field Boundary</FormLabel>
              <FormDescription>
                Use the map tools to draw your field boundary. Click save on the draw toolbar when done.
                Currently, only one polygon/rectangle can be drawn per field.
              </FormDescription>
              <div className="h-[400px] w-full rounded-md border shadow-sm overflow-hidden mt-2 bg-muted">
                <MapContainer center={mapCenter} zoom={mapZoom} scrollWheelZoom={true} style={{ height: '100%', width: '100%' }} key={`${mapCenter.join('-')}-${mapZoom}`}>
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  <MapDrawControl onShapeDrawn={handleShapeDrawn} initialGeoJson={currentDrawnGeoJson || initialGeoJsonForMap} />
                  {/* Display existing or newly drawn shape statically if needed for confirmation,
                      but MapDrawControl might already handle displaying the active drawing.
                      If currentDrawnGeoJson is used by MapDrawControl's featureGroup, this might be redundant.
                  */}
                  {currentDrawnGeoJson && <GeoJSON data={currentDrawnGeoJson} style={{ color: 'hsl(var(--primary))', fillColor: 'hsl(var(--primary) / 0.1)' }} />}

                </MapContainer>
              </div>
              {/* Hidden input to hold the GeoJSON string for form submission */}
              <FormControl>
                 <Input type="hidden" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Notes (Optional)</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Boundary details, soil type, irrigation setup, etc."
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
