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
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const harvestingLogSchema = z.object({
  cropName: z.string().min(1, "Crop name is required."),
  harvestDate: z.date({ required_error: "Harvest date is required." }),
  fieldId: z.string().min(1, "Field ID or name is required."),
  yieldAmount: z.preprocess(
    (val) => (val === "" ? undefined : Number(val)),
    z.number({invalid_type_error: "Yield must be a number"}).positive("Yield must be positive.").optional()
  ),
  yieldUnit: z.string().optional(),
  notes: z.string().optional(),
});

export function HarvestingLogForm() {
  const { toast } = useToast();
  const form = useForm<z.infer<typeof harvestingLogSchema>>({
    resolver: zodResolver(harvestingLogSchema),
    defaultValues: {
      cropName: "",
      fieldId: "",
      yieldUnit: "kg",
      notes: "",
    },
  });

  function onSubmit(values: z.infer<typeof harvestingLogSchema>) {
    console.log("Harvesting Log Data:", values);
    toast({
      title: "Harvesting Log Submitted (Simulated)",
      description: `Crop: ${values.cropName}, Yield: ${values.yieldAmount || 'N/A'} ${values.yieldUnit || ''}`,
    });
    form.reset();
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
                <FormLabel>Field ID / Name</FormLabel>
                <FormControl>
                  <Input placeholder="e.g., Field A, North Plot" {...field} />
                </FormControl>
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
                    <Input type="number" placeholder="e.g., 5000" {...field} />
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
        <Button type="submit">Save Harvesting Log</Button>
      </form>
    </Form>
  );
}
