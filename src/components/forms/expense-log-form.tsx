
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

const expenseCategories = [
  "Inputs Purchase", "Equipment Repair", "Fuel", "Labor", "Utilities", 
  "Rent/Lease", "Loan Payment", "Veterinary/Livestock", "Insurance", "Taxes", "Other"
] as const;

const expenseLogSchema = z.object({
  date: z.date({ required_error: "Expense date is required." }),
  category: z.enum(expenseCategories, { required_error: "Expense category is required." }),
  description: z.string().min(1, "Description is required.").max(200, "Description max 200 chars."),
  amount: z.preprocess(
    (val) => (val === "" || val === undefined || val === null ? undefined : Number(val)),
    z.number({required_error: "Amount is required.", invalid_type_error: "Amount must be a number."}).positive("Amount must be positive.")
  ),
  notes: z.string().max(500, "Notes max 500 chars.").optional(),
});

interface ExpenseLogFormProps {
  onLogSaved?: () => void;
}

export function ExpenseLogForm({ onLogSaved }: ExpenseLogFormProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { user } = useAuth();

  const form = useForm<z.infer<typeof expenseLogSchema>>({
    resolver: zodResolver(expenseLogSchema),
    defaultValues: {
      description: "",
      notes: "",
    },
  });

  async function onSubmit(values: z.infer<typeof expenseLogSchema>) {
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
        date: format(values.date, "yyyy-MM-dd"),
        createdAt: serverTimestamp(),
      };
      await addDoc(collection(db, "expenseLogs"), logData);
      toast({
        title: "Expense Saved",
        description: `${values.category} expense of $${values.amount.toFixed(2)} has been logged.`,
      });
      form.reset({
        date: undefined,
        category: undefined,
        description: "",
        amount: undefined,
        notes: "",
      });
      if (onLogSaved) {
        onLogSaved();
      }
    } catch (error) {
      console.error("Error saving expense log to Firestore:", error);
      toast({
        title: "Error Saving Expense",
        description: "Could not save the expense log to Firestore.",
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
            name="date"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>Date of Expense</FormLabel>
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
                    <Calendar mode="single" selected={field.value} onSelect={field.onChange} 
                              disabled={(date) => date > new Date() || date < new Date("1900-01-01")}
                              initialFocus />
                  </PopoverContent>
                </Popover>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="category"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Category</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select expense category" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {expenseCategories.map(cat => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Description</FormLabel>
                <FormControl>
                  <Input placeholder="e.g., Purchase of fertilizer for Field A" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="amount"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Amount ($)</FormLabel>
                <FormControl>
                  <Input type="number" step="0.01" placeholder="e.g., 150.75" {...field} value={field.value === undefined ? '' : field.value}/>
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
                  placeholder="e.g., Invoice #123, paid by check"
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
              Saving Expense...
            </>
          ) : (
            <>
              <Icons.Expenses className="mr-2 h-4 w-4" />
              Log Expense
            </>
          )}
        </Button>
        {(!user || !user.farmId) && <p className="text-sm text-destructive mt-2">You must be associated with a farm to log expenses.</p>}
      </form>
    </Form>
  );
}
