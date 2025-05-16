
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

const areaUnits: PreferredAreaUnit[] = ["acres", "hectares"];

const fieldDefinitionSchema = z.object({
  fieldName: z.string().min(1, "Field name is required."),
  fieldSize: z.preprocess(
    (val) => (val === "" || val === undefined || val === null ? undefined : Number(val)),
    z.number({invalid_type_error: "Field size must be a number"}).positive("Field size must be positive.").optional()
  ),
  fieldSizeUnit: z.enum(areaUnits).optional(),
  latitude: z.preprocess(
    (val) => (val === "" || val === undefined || val === null ? undefined : parseFloat(String(val))),
    z.number({invalid_type_error: "Latitude must be a number."}).min(-90, "Latitude must be between -90 and 90.").max(90, "Latitude must be between -90 and 90.").optional().nullable()
  ),
  longitude: z.preprocess(
    (val) => (val === "" || val === undefined || val === null ? undefined : parseFloat(String(val))),
    z.number({invalid_type_error: "Longitude must be a number."}).min(-180, "Longitude must be between -180 and 180.").max(180, "Longitude must be between -180 and 180.").optional().nullable()
  ),
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

  const form = useForm<z.infer<typeof fieldDefinitionSchema>>({
    resolver: zodResolver(fieldDefinitionSchema),
    defaultValues: {
      fieldName: "",
      notes: "",
      fieldSize: undefined,
      fieldSizeUnit: preferredAreaUnit, // Initialize with preferred unit
      latitude: null,
      longitude: null,
    },
  });

  useEffect(() => {
    // If the user's preferred area unit changes and the form field hasn't been touched by the user,
    // update the form's default.
    if (user?.settings?.preferredAreaUnit && !form.formState.dirtyFields.fieldSizeUnit) {
      form.setValue("fieldSizeUnit", user.settings.preferredAreaUnit, { shouldValidate: true });
    }
  }, [user?.settings?.preferredAreaUnit, form]);


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
      const fieldData = {
        fieldName: values.fieldName,
        fieldSize: values.fieldSize,
        // Ensure fieldSizeUnit is only saved if fieldSize is also provided
        fieldSizeUnit: (values.fieldSize !== undefined && values.fieldSize !== null) ? values.fieldSizeUnit : undefined,
        latitude: values.latitude !== undefined && values.latitude !== null ? values.latitude : null,
        longitude: values.longitude !== undefined && values.longitude !== null ? values.longitude : null,
        notes: values.notes,
        userId: user.uid, 
        farmId: user.farmId, 
        createdAt: serverTimestamp(),
      };
      await addDoc(collection(db, "fields"), fieldData);
      toast({
        title: "Field Definition Saved",
        description: `Field: ${values.fieldName} has been saved.`,
      });
      form.reset({ 
        fieldName: "", 
        fieldSize: undefined, 
        fieldSizeUnit: preferredAreaUnit, 
        latitude: null,
        longitude: null,
        notes: "" 
      });
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
                    // Use form.watch to ensure the Select reflects the current form value,
                    // which will be the preferredAreaUnit on initial load/reset due to defaultValues and useEffect.
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
           <FormField
            control={form.control}
            name="latitude"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Latitude (Optional)</FormLabel>
                <FormControl>
                  <Input type="number" step="any" placeholder="e.g., 45.4215" {...field} value={field.value ?? ''} />
                </FormControl>
                <FormDescription>For map marker placement.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="longitude"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Longitude (Optional)</FormLabel>
                <FormControl>
                  <Input type="number" step="any" placeholder="e.g., -75.6972" {...field} value={field.value ?? ''} />
                </FormControl>
                <FormDescription>For map marker placement.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
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
    

    