
"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import { Icons } from "../icons";
import { useAuth } from "@/contexts/auth-context";
import { db } from "@/lib/firebase";
import { collection, addDoc, serverTimestamp, query, where, getDocs, orderBy } from "firebase/firestore";

interface FieldDefinitionLog {
  id: string; 
  fieldName: string;
}

const soilDataSchema = z.object({
  fieldId: z.string().min(1, "Field selection is required."),
  sampleDate: z.date({ required_error: "Sample date is required." }),
  phLevel: z.preprocess(
    (val) => (val === "" || val === undefined || val === null ? undefined : Number(val)),
    z.number({invalid_type_error: "pH must be a number"}).min(0).max(14).optional()
  ),
  organicMatter: z.string().optional(), // e.g., "3.5%"
  nutrients: z.object({
    nitrogen: z.string().optional(), // e.g., "10 ppm"
    phosphorus: z.string().optional(),
    potassium: z.string().optional(),
  }).optional(),
  treatmentsApplied: z.string().optional(),
  notes: z.string().optional(),
});

interface SoilDataFormProps {
  onLogSaved?: () => void;
}

export function SoilDataForm({ onLogSaved }: SoilDataFormProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { user } = useAuth();
  const [fields, setFields] = useState<FieldDefinitionLog[]>([]);
  const [isLoadingFields, setIsLoadingFields] = useState(true);

  const form = useForm<z.infer<typeof soilDataSchema>>({
    resolver: zodResolver(soilDataSchema),
    defaultValues: {
      fieldId: "",
      organicMatter: "",
      nutrients: { nitrogen: "", phosphorus: "", potassium: "" },
      treatmentsApplied: "",
      notes: "",
      phLevel: undefined,
    },
  });

  useEffect(() => {
    if (!user) {
      setFields([]);
      setIsLoadingFields(false);
      return;
    }
    const fetchFields = async () => {
      setIsLoadingFields(true);
      try {
        const q = query(collection(db, "fields"), where("userId", "==", user.uid), orderBy("fieldName", "asc"));
        const querySnapshot = await getDocs(q);
        const fetchedFields = querySnapshot.docs.map(doc => ({
          id: doc.id,
          fieldName: doc.data().fieldName,
        } as FieldDefinitionLog));
        setFields(fetchedFields);
      } catch (error) {
        console.error("Failed to load fields for soil data form:", error);
        toast({ title: "Error Loading Fields", description: "Could not load your defined fields.", variant: "destructive" });
      } finally {
        setIsLoadingFields(false);
      }
    };
    fetchFields();
  }, [user, toast]);

  async function onSubmit(values: z.infer<typeof soilDataSchema>) {
    if (!user) {
      toast({ title: "Authentication Error", description: "You must be logged in.", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);
    try {
      const logData = {
        ...values,
        userId: user.uid,
        sampleDate: format(values.sampleDate, "yyyy-MM-dd"),
        createdAt: serverTimestamp(),
      };
      await addDoc(collection(db, "soilDataLogs"), logData);
      toast({
        title: "Soil Data Saved",
        description: `Soil data for the selected field has been saved to Firestore.`,
      });
      form.reset({
        fieldId: "",
        sampleDate: undefined,
        phLevel: undefined,
        organicMatter: "",
        nutrients: { nitrogen: "", phosphorus: "", potassium: "" },
        treatmentsApplied: "",
        notes: "",
      });
      if (onLogSaved) {
        onLogSaved();
      }
    } catch (error) {
      console.error("Error saving soil data to Firestore:", error);
      toast({
        title: "Error Saving Log",
        description: "Could not save the soil data to Firestore.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <FormField
            control={form.control}
            name="fieldId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Field</FormLabel>
                 <Select 
                    onValueChange={field.onChange} 
                    defaultValue={field.value}
                    disabled={isLoadingFields || fields.length === 0}
                  >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder={isLoadingFields ? "Loading fields..." : (fields.length === 0 ? "No fields defined" : "Select a field")} />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {!isLoadingFields && fields.length > 0 ? (
                      fields.map((f) => (
                        <SelectItem key={f.id} value={f.id}>
                          {f.fieldName}
                        </SelectItem>
                      ))
                    ) : (
                       !isLoadingFields && <div className="p-2 text-sm text-muted-foreground">No fields defined. Please add fields first.</div>
                    )}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="sampleDate"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>Sample Date</FormLabel>
                <Popover>
                  <PopoverTrigger asChild>
                    <FormControl>
                      <Button
                        variant={"outline"}
                        className={cn(
                          "w-full pl-3 text-left font-normal",
                          !field.value && "text-muted-foreground"
                        )}
                      >
                        {field.value ? (
                          format(field.value, "PPP")
                        ) : (
                          <span>Pick a date</span>
                        )}
                        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                      </Button>
                    </FormControl>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={field.value}
                      onSelect={field.onChange}
                      disabled={(date) =>
                        date > new Date() || date < new Date("1900-01-01")
                      }
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="phLevel"
            render={({ field }) => (
              <FormItem>
                <FormLabel>pH Level (Optional)</FormLabel>
                <FormControl>
                  <Input type="number" step="0.1" placeholder="e.g., 6.5" {...field} value={field.value === undefined ? '' : field.value} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="organicMatter"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Organic Matter (%) (Optional)</FormLabel>
                <FormControl>
                  <Input placeholder="e.g., 3.5%" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        
        <h3 className="text-lg font-medium pt-4 border-t mt-6">Nutrient Levels (Optional)</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <FormField
            control={form.control}
            name="nutrients.nitrogen"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nitrogen (N)</FormLabel>
                <FormControl>
                  <Input placeholder="e.g., 120 ppm or High" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="nutrients.phosphorus"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Phosphorus (P)</FormLabel>
                <FormControl>
                  <Input placeholder="e.g., 50 ppm or Medium" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="nutrients.potassium"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Potassium (K)</FormLabel>
                <FormControl>
                  <Input placeholder="e.g., 150 ppm or Sufficient" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
            control={form.control}
            name="treatmentsApplied"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Treatments Applied (Optional)</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="e.g., Lime application, Compost added"
                    className="resize-y min-h-[80px]"
                    {...field}
                  />
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
              <FormLabel>Additional Notes (Optional)</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Lab name, sample depth, soil texture observations, etc."
                  className="resize-y min-h-[100px]"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" disabled={isSubmitting || !user || isLoadingFields}>
          {isSubmitting ? (
            <>
              <Icons.User className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            "Save Soil Data"
          )}
        </Button>
        {!user && <p className="text-sm text-destructive">Please log in to save soil data.</p>}
      </form>
    </Form>
  );
}

    