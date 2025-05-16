
"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { Icons } from "../icons";
import { useAuth } from "@/contexts/auth-context";
import { db } from "@/lib/firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";

const equipmentTypes = [
  "Tractor", "Harvester", "Planter", "Tillage Tool", "Sprayer", "Baler", 
  "Utility Vehicle", "Irrigation System", "Drone", "Truck/Trailer", "Other"
] as const;

const farmEquipmentSchema = z.object({
  equipmentName: z.string().min(1, "Equipment name is required."),
  equipmentType: z.enum(equipmentTypes, { required_error: "Equipment type is required." }),
  manufacturer: z.string().optional(),
  model: z.string().optional(),
  serialNumber: z.string().optional(),
  purchaseDate: z.date().optional(),
  purchaseCost: z.preprocess(
    (val) => (val === "" || val === undefined || val === null ? undefined : Number(val)),
    z.number({invalid_type_error: "Cost must be a number"}).positive("Cost must be positive.").optional()
  ),
  lastMaintenanceDate: z.date().optional(),
  nextMaintenanceDate: z.date().optional(),
  maintenanceDetails: z.string().optional(),
  notes: z.string().optional(),
});

interface FarmEquipmentFormProps {
  onLogSaved?: () => void;
}

export function FarmEquipmentForm({ onLogSaved }: FarmEquipmentFormProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { user } = useAuth();

  const form = useForm<z.infer<typeof farmEquipmentSchema>>({
    resolver: zodResolver(farmEquipmentSchema),
    defaultValues: {
      equipmentName: "",
      manufacturer: "",
      model: "",
      serialNumber: "",
      maintenanceDetails: "",
      notes: "",
    },
  });

  async function onSubmit(values: z.infer<typeof farmEquipmentSchema>) {
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
        purchaseDate: values.purchaseDate ? format(values.purchaseDate, "yyyy-MM-dd") : null,
        lastMaintenanceDate: values.lastMaintenanceDate ? format(values.lastMaintenanceDate, "yyyy-MM-dd") : null,
        nextMaintenanceDate: values.nextMaintenanceDate ? format(values.nextMaintenanceDate, "yyyy-MM-dd") : null,
        createdAt: serverTimestamp(),
      };
      await addDoc(collection(db, "farmEquipment"), logData);
      toast({
        title: "Equipment Saved",
        description: `${values.equipmentName} has been added to your equipment list.`,
      });
      form.reset({
        equipmentName: "",
        equipmentType: undefined,
        manufacturer: "",
        model: "",
        serialNumber: "",
        purchaseDate: undefined,
        purchaseCost: undefined,
        lastMaintenanceDate: undefined,
        nextMaintenanceDate: undefined,
        maintenanceDetails: "",
        notes: "",
      });
      if (onLogSaved) {
        onLogSaved();
      }
    } catch (error) {
      console.error("Error saving equipment to Firestore:", error);
      toast({
        title: "Error Saving Equipment",
        description: "Could not save the equipment to Firestore.",
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
            name="equipmentName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Equipment Name / Identifier</FormLabel>
                <FormControl>
                  <Input placeholder="e.g., John Deere 8R 370, Main Sprayer" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="equipmentType"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Equipment Type</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select equipment type" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {equipmentTypes.map(type => (
                      <SelectItem key={type} value={type}>{type}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="manufacturer"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Manufacturer (Optional)</FormLabel>
                <FormControl>
                  <Input placeholder="e.g., John Deere, Case IH" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="model"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Model (Optional)</FormLabel>
                <FormControl>
                  <Input placeholder="e.g., 8R 370, 4440" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
           <FormField
            control={form.control}
            name="serialNumber"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Serial Number (Optional)</FormLabel>
                <FormControl>
                  <Input placeholder="e.g., 1RW8370DJLD012345" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
           <FormField
            control={form.control}
            name="purchaseDate"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>Purchase Date (Optional)</FormLabel>
                <Popover>
                  <PopoverTrigger asChild>
                    <FormControl>
                      <Button
                        variant={"outline"}
                        className={cn("w-full pl-3 text-left font-normal",!field.value && "text-muted-foreground")}
                      >
                        {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                      </Button>
                    </FormControl>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus />
                  </PopoverContent>
                </Popover>
                <FormMessage />
              </FormItem>
            )}
          />
           <FormField
            control={form.control}
            name="purchaseCost"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Purchase Cost (Optional)</FormLabel>
                <FormControl>
                  <Input type="number" step="0.01" placeholder="e.g., 150000" {...field} value={field.value === undefined ? '' : field.value}/>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <h3 className="text-lg font-medium pt-4 border-t mt-6">Maintenance (Optional)</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <FormField
            control={form.control}
            name="lastMaintenanceDate"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>Last Maintenance Date</FormLabel>
                <Popover>
                  <PopoverTrigger asChild>
                    <FormControl>
                      <Button
                        variant={"outline"}
                        className={cn("w-full pl-3 text-left font-normal", !field.value && "text-muted-foreground")}
                      >
                        {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                      </Button>
                    </FormControl>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus />
                  </PopoverContent>
                </Popover>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="nextMaintenanceDate"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>Next Scheduled Maintenance</FormLabel>
                <Popover>
                  <PopoverTrigger asChild>
                    <FormControl>
                      <Button
                        variant={"outline"}
                        className={cn("w-full pl-3 text-left font-normal", !field.value && "text-muted-foreground")}
                      >
                        {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                      </Button>
                    </FormControl>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus />
                  </PopoverContent>
                </Popover>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <FormField
          control={form.control}
          name="maintenanceDetails"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Maintenance Details/History</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="e.g., Oil change at 500hrs, Replaced hydraulic filter. Next service: Check tire pressure."
                  className="resize-y min-h-[100px]"
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
              <FormLabel>General Notes (Optional)</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="e.g., Primary tillage tractor, specific attachments, operator notes."
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
              Saving Equipment...
            </>
          ) : (
            <>
              <Icons.Tractor className="mr-2 h-4 w-4" />
              Save Equipment
            </>
          )}
        </Button>
        {(!user || !user.farmId) && <p className="text-sm text-destructive mt-2">You must be associated with a farm to save equipment.</p>}
      </form>
    </Form>
  );
}
