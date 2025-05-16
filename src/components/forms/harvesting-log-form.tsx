
"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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

const harvestingLogSchema = z.object({
  cropName: z.string().min(1, "Crop name is required."),
  harvestDate: z.date({ required_error: "Harvest date is required." }),
  fieldId: z.string().min(1, "Field selection is required."),
  yieldAmount: z.preprocess(
    (val) => (val === "" || val === undefined || val === null ? undefined : Number(val)),
    z.number({invalid_type_error: "Yield must be a number"}).positive("Yield must be positive.").optional()
  ),
  yieldUnit: z.string().optional(),
  notes: z.string().optional(),
});

interface HarvestingLogFormProps {
  onLogSaved?: () => void;
}

export function HarvestingLogForm({ onLogSaved }: HarvestingLogFormProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { user } = useAuth();
  const [fields, setFields] = useState<FieldDefinitionLog[]>([]);
  const [isLoadingFields, setIsLoadingFields] = useState(true);

  const form = useForm<z.infer<typeof harvestingLogSchema>>({
    resolver: zodResolver(harvestingLogSchema),
    defaultValues: {
      cropName: "",
      fieldId: "",
      yieldUnit: "kg",
      notes: "",
      yieldAmount: undefined,
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
        console.error("Failed to load fields for harvesting log form:", error);
        toast({ title: "Error Loading Fields", description: "Could not load your defined fields.", variant: "destructive" });
      } finally {
        setIsLoadingFields(false);
      }
    };
    fetchFields();
  }, [user, toast]);

  async function onSubmit(values: z.infer<typeof harvestingLogSchema>) {
    if (!user) {
      toast({ title: "Authentication Error", description: "You must be logged in.", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);
    try {
      const logData = {
        ...values,
        userId: user.uid,
        harvestDate: format(values.harvestDate, "yyyy-MM-dd"),
        createdAt: serverTimestamp(),
      };
      await addDoc(collection(db, "harvestingLogs"), logData);
      toast({
        title: "Harvesting Log Saved",
        description: `Crop: ${values.cropName}, Yield: ${values.yieldAmount || 'N/A'} ${values.yieldUnit || ''} has been saved to Firestore.`,
      });
      form.reset({ cropName: "", fieldId: "", yieldUnit: "kg", notes: "", yieldAmount: undefined, harvestDate: undefined});
      if (onLogSaved) {
        onLogSaved();
      }
    } catch (error) {
      console.error("Error saving harvesting log to Firestore:", error);
      toast({
        title: "Error Saving Log",
        description: "Could not save the harvesting log to Firestore.",
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
            name="cropName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Crop Name</FormLabel>
                <FormControl>
                  <Input placeholder="e.g., Corn, Soybeans" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="harvestDate"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>Harvest Date</FormLabel>
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
          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="yieldAmount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Yield Amount (Optional)</FormLabel>
                  <FormControl>
                    <Input type="number" placeholder="e.g., 5000" {...field} value={field.value === undefined ? '' : field.value} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="yieldUnit"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Yield Unit (Optional)</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., kg, tonnes, bushels" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>
        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Notes (Optional)</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Quality, storage, market observations, etc."
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
            "Save Harvesting Log"
          )}
        </Button>
        {!user && <p className="text-sm text-destructive">Please log in to save harvesting logs.</p>}
      </form>
    </Form>
  );
}
