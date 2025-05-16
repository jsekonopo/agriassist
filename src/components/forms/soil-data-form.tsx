
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

interface SoilLogData {
  id: string;
  fieldId: string;
  sampleDate: string; // Stored as YYYY-MM-DD string
  phLevel?: number;
  organicMatter?: string;
  nutrients?: {
    nitrogen?: string;
    phosphorus?: string;
    potassium?: string;
  };
  treatmentsApplied?: string;
  notes?: string;
  submittedAt: string; // ISO string
}

const mockSoilLogService = {
  save: async (logData: Omit<SoilLogData, 'id' | 'submittedAt' | 'sampleDate'> & { sampleDate: Date }): Promise<SoilLogData> => {
    console.log("Mock service: Attempting to save soil data log:", logData);
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        try {
          const existingLogsString = localStorage.getItem('soilDataLogs');
          const existingLogs: SoilLogData[] = existingLogsString ? JSON.parse(existingLogsString) : [];
          
          const newLog: SoilLogData = { 
            ...logData, 
            id: new Date().toISOString() + '_' + Math.random().toString(36).substring(2, 9),
            submittedAt: new Date().toISOString(),
            sampleDate: format(logData.sampleDate, "yyyy-MM-dd"),
          };
          existingLogs.push(newLog);
          localStorage.setItem('soilDataLogs', JSON.stringify(existingLogs));
          console.log("Mock service: Soil data log saved to localStorage:", newLog);
          resolve(newLog);
        } catch (error) {
          console.error("Mock service: Error saving soil data log to localStorage:", error);
          reject(error);
        }
      }, 500);
    });
  }
};

const soilDataSchema = z.object({
  fieldId: z.string().min(1, "Field ID or name is required."),
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

  async function onSubmit(values: z.infer<typeof soilDataSchema>) {
    setIsSubmitting(true);
    try {
      await mockSoilLogService.save(values);
      toast({
        title: "Soil Data Saved",
        description: `Soil data for Field: ${values.fieldId} has been saved.`,
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
      console.error("Error saving soil data:", error);
      toast({
        title: "Error Saving Log",
        description: "Could not save the soil data.",
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
                <FormLabel>Field ID / Name</FormLabel>
                <FormControl>
                  <Input placeholder="e.g., Field B, South Plot" {...field} />
                </FormControl>
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
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Icons.User className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            "Save Soil Data"
          )}
        </Button>
      </form>
    </Form>
  );
}
