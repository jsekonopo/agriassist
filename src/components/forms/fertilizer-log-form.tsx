
"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
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

const commonFertilizerUnits = ["kg/ha", "lbs/acre", "kg", "lbs", "g", "L", "mL", "tons", "gallons/acre", "Other"] as const;

const fertilizerLogSchema = z.object({
  fieldId: z.string().min(1, "Field selection is required."),
  dateApplied: z.date({ required_error: "Application date is required." }),
  fertilizerType: z.string().min(1, "Fertilizer type is required."),
  amountApplied: z.preprocess(
    (val) => (val === "" || val === undefined || val === null ? undefined : Number(val)),
    z.number({required_error: "Amount applied is required.", invalid_type_error: "Amount must be a number"}).positive("Amount must be positive.")
  ),
  amountUnit: z.string().min(1, "Unit for amount is required."),
  applicationMethod: z.string().optional(),
  notes: z.string().optional(),
});

interface FertilizerLogFormProps {
  onLogSaved?: () => void;
}

export function FertilizerLogForm({ onLogSaved }: FertilizerLogFormProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { user } = useAuth();
  const [fields, setFields] = useState<FieldDefinitionLog[]>([]);
  const [isLoadingFields, setIsLoadingFields] = useState(true);

  const form = useForm<z.infer<typeof fertilizerLogSchema>>({
    resolver: zodResolver(fertilizerLogSchema),
    defaultValues: {
      fieldId: "",
      fertilizerType: "",
      amountUnit: "kg/ha", // Default to a common application rate unit
      applicationMethod: "",
      notes: "",
    },
  });

  useEffect(() => {
    if (!user || !user.farmId) {
      setFields([]);
      setIsLoadingFields(false);
      return;
    }
    const fetchFields = async () => {
      setIsLoadingFields(true);
      try {
        const q = query(collection(db, "fields"), where("farmId", "==", user.farmId), orderBy("fieldName", "asc"));
        const querySnapshot = await getDocs(q);
        const fetchedFields = querySnapshot.docs.map(doc => ({
          id: doc.id,
          fieldName: doc.data().fieldName,
        } as FieldDefinitionLog));
        setFields(fetchedFields);
      } catch (error) {
        console.error("Failed to load fields for fertilizer log form:", error);
        toast({ title: "Error Loading Fields", description: "Could not load your defined fields.", variant: "destructive" });
      } finally {
        setIsLoadingFields(false);
      }
    };
    fetchFields();
  }, [user?.farmId, toast]);

  async function onSubmit(values: z.infer<typeof fertilizerLogSchema>) {
    if (!user || !user.uid || !user.farmId) {
      toast({ title: "Authentication Error", description: "You must be logged in and associated with a farm.", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);
    try {
      const logData = {
        ...values,
        userId: user.uid,
        farmId: user.farmId,
        dateApplied: format(values.dateApplied, "yyyy-MM-dd"),
        createdAt: serverTimestamp(),
      };
      await addDoc(collection(db, "fertilizerLogs"), logData);
      toast({
        title: "Fertilizer Log Saved",
        description: `Fertilizer application of ${values.fertilizerType} has been saved.`,
      });
      form.reset({
        fieldId: "",
        dateApplied: undefined,
        fertilizerType: "",
        amountApplied: undefined,
        amountUnit: "kg/ha",
        applicationMethod: "",
        notes: "",
      });
      if (onLogSaved) {
        onLogSaved();
      }
    } catch (error) {
      console.error("Error saving fertilizer log to Firestore:", error);
      toast({
        title: "Error Saving Log",
        description: "Could not save the fertilizer log to Firestore.",
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
                    disabled={isLoadingFields || fields.length === 0 || !user?.farmId}
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
                       !isLoadingFields && <div className="p-2 text-sm text-muted-foreground">No fields defined for this farm. Please add fields first.</div>
                    )}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="dateApplied"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>Date Applied</FormLabel>
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
            name="fertilizerType"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Fertilizer Type/Name</FormLabel>
                <FormControl>
                  <Input placeholder="e.g., Urea, 10-10-10 NPK, Manure" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="amountApplied"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Amount Applied</FormLabel>
                  <FormControl>
                    <Input type="number" placeholder="e.g., 50" {...field} value={field.value === undefined ? '' : field.value} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="amountUnit"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Unit</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select unit" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {commonFertilizerUnits.map(unit => (
                        <SelectItem key={unit} value={unit}>{unit}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>Select 'Other' and specify in notes if needed.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
           <FormField
            control={form.control}
            name="applicationMethod"
            render={({ field }) => (
              <FormItem className="md:col-span-2">
                <FormLabel>Application Method (Optional)</FormLabel>
                <FormControl>
                  <Input placeholder="e.g., Broadcast, Banded, Spreader" {...field} />
                </FormControl>
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
                  placeholder="Weather conditions during application, equipment used, etc."
                  className="resize-y min-h-[100px]"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" disabled={isSubmitting || !user || !user.farmId || isLoadingFields}>
          {isSubmitting ? (
            <>
              <Icons.Search className="mr-2 h-4 w-4 animate-spin" />
              Saving Log...
            </>
          ) : (
            <>
              <Icons.FertilizerLog className="mr-2 h-4 w-4" />
              Save Fertilizer Log
            </>
          )}
        </Button>
        {(!user || !user.farmId) && <p className="text-sm text-destructive mt-2">You must be associated with a farm to save logs.</p>}
      </form>
    </Form>
  );
}

    