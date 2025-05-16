
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

const inputTypes = ["Seed", "Fertilizer", "Pesticide", "Other"] as const;

const farmInputLogSchema = z.object({
  inputName: z.string().min(1, "Input name is required."),
  inputType: z.enum(inputTypes, { required_error: "Input type is required." }),
  quantity: z.preprocess(
    (val) => (val === "" || val === undefined || val === null ? undefined : Number(val)),
    z.number({required_error: "Quantity is required.", invalid_type_error: "Quantity must be a number"}).positive("Quantity must be positive.")
  ),
  quantityUnit: z.string().min(1, "Quantity unit is required (e.g., kg, bags, liters)."),
  purchaseDate: z.date({ required_error: "Purchase date is required." }),
  purchaseCost: z.preprocess(
    (val) => (val === "" || val === undefined || val === null ? undefined : Number(val)),
    z.number({invalid_type_error: "Cost must be a number"}).positive("Cost must be positive.").optional()
  ),
  supplier: z.string().optional(),
  notes: z.string().optional(),
});

interface FarmInputLogFormProps {
  onLogSaved?: () => void;
}

export function FarmInputLogForm({ onLogSaved }: FarmInputLogFormProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { user } = useAuth();

  const form = useForm<z.infer<typeof farmInputLogSchema>>({
    resolver: zodResolver(farmInputLogSchema),
    defaultValues: {
      inputName: "",
      quantityUnit: "kg",
      supplier: "",
      notes: "",
    },
  });

  async function onSubmit(values: z.infer<typeof farmInputLogSchema>) {
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
        purchaseDate: format(values.purchaseDate, "yyyy-MM-dd"),
        createdAt: serverTimestamp(),
      };
      await addDoc(collection(db, "farmInputs"), logData);
      toast({
        title: "Farm Input Saved",
        description: `${values.inputName} has been added to your inventory.`,
      });
      form.reset({
        inputName: "",
        inputType: undefined,
        quantity: undefined,
        quantityUnit: "kg",
        purchaseDate: undefined,
        purchaseCost: undefined,
        supplier: "",
        notes: "",
      });
      if (onLogSaved) {
        onLogSaved();
      }
    } catch (error) {
      console.error("Error saving farm input to Firestore:", error);
      toast({
        title: "Error Saving Input",
        description: "Could not save the farm input to Firestore.",
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
            name="inputName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Input Name</FormLabel>
                <FormControl>
                  <Input placeholder="e.g., Corn Seed DKC50-07, Urea 46-0-0" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="inputType"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Input Type</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select input type" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {inputTypes.map(type => (
                      <SelectItem key={type} value={type}>{type}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="quantity"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Quantity</FormLabel>
                  <FormControl>
                    <Input type="number" placeholder="e.g., 50" {...field} value={field.value === undefined ? '' : field.value} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="quantityUnit"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Unit</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., kg, bags, liters" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
           <FormField
            control={form.control}
            name="purchaseDate"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>Purchase Date</FormLabel>
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
            name="purchaseCost"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Purchase Cost (Optional)</FormLabel>
                <FormControl>
                  <Input type="number" step="0.01" placeholder="e.g., 125.50" {...field} value={field.value === undefined ? '' : field.value}/>
                </FormControl>
                <FormDescription>Enter the total cost for this batch.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="supplier"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Supplier (Optional)</FormLabel>
                <FormControl>
                  <Input placeholder="e.g., Local Co-op" {...field} />
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
                  placeholder="Batch number, storage location, specific characteristics, etc."
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
              <Icons.User className="mr-2 h-4 w-4 animate-spin" />
              Saving Input...
            </>
          ) : (
            "Save Farm Input"
          )}
        </Button>
        {(!user || !user.farmId) && <p className="text-sm text-destructive mt-2">You must be associated with a farm to save inputs.</p>}
      </form>
    </Form>
  );
}
