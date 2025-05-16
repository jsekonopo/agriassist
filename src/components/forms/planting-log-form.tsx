
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
import { useState } from "react";
import { Icons } from "../icons";

// Mock service for saving planting logs
// In a real app, this would interact with a backend API
const mockPlantingLogService = {
  save: async (logData: Omit<PlantingLogData, 'id' | 'submittedAt'>): Promise<PlantingLogData> => {
    console.log("Mock service: Attempting to save planting log:", logData);
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        try {
          const existingLogsString = localStorage.getItem('plantingLogs');
          const existingLogs: PlantingLogData[] = existingLogsString ? JSON.parse(existingLogsString) : [];
          
          const newLog: PlantingLogData = { 
            ...logData, 
            id: new Date().toISOString() + '_' + Math.random().toString(36).substring(2, 9),
            submittedAt: new Date().toISOString(),
            plantingDate: format(logData.plantingDate, "yyyy-MM-dd"), // Ensure date is stored as string
          };
          existingLogs.push(newLog);
          localStorage.setItem('plantingLogs', JSON.stringify(existingLogs));
          console.log("Mock service: Planting log saved to localStorage:", newLog);
          resolve(newLog);
        } catch (error) {
          console.error("Mock service: Error saving planting log to localStorage:", error);
          reject(error);
        }
      }, 500); // Simulate network delay
    });
  }
};

interface PlantingLogData {
  id: string;
  cropName: string;
  plantingDate: string; // Will be YYYY-MM-DD string after processing
  fieldId: string;
  seedsUsed?: string;
  notes?: string;
  submittedAt: string;
}


const plantingLogSchema = z.object({
  cropName: z.string().min(1, "Crop name is required."),
  plantingDate: z.date({ required_error: "Planting date is required." }),
  fieldId: z.string().min(1, "Field ID or name is required."),
  seedsUsed: z.string().optional(),
  notes: z.string().optional(),
});

export function PlantingLogForm() {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const form = useForm<z.infer<typeof plantingLogSchema>>({
    resolver: zodResolver(plantingLogSchema),
    defaultValues: {
      cropName: "",
      fieldId: "",
      seedsUsed: "",
      notes: "",
    },
  });

  async function onSubmit(values: z.infer<typeof plantingLogSchema>) {
    setIsSubmitting(true);
    try {
      // The service expects plantingDate as a Date object, it will handle formatting.
      await mockPlantingLogService.save(values);

      toast({
        title: "Planting Log Saved",
        description: `Crop: ${values.cropName} on ${format(values.plantingDate, "PPP")} has been saved.`,
      });
      form.reset(); 
      // Potentially trigger a refresh of the log table if it's visible
      // This might involve a shared state or a callback prop if the table is in the same component tree.
      // For now, users will see new data on next table load/refresh.
      
    } catch (error) {
      console.error("Error saving planting log:", error);
      let message = "Could not save the planting log.";
      if (error instanceof Error) {
        message = `Could not save the planting log: ${error.message}. Please check console for details.`;
      }
      toast({
        title: "Error Saving Log",
        description: message,
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
            name="plantingDate"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>Planting Date</FormLabel>
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
          <FormField
            control={form.control}
            name="seedsUsed"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Seeds Used (Optional)</FormLabel>
                <FormControl>
                  <Input placeholder="e.g., 50kg, Brand X Hybrid" {...field} />
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
                  placeholder="Any additional notes about planting conditions, methods, etc."
                  className="resize-y min-h-[100px]"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Icons.User className="mr-2 h-4 w-4 animate-spin" /> {/* Using User as a placeholder spinner */}
              Saving...
            </>
          ) : (
            "Save Planting Log"
          )}
        </Button>
      </form>
    </Form>
  );
}
