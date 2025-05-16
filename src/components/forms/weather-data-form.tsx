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

const weatherDataSchema = z.object({
  date: z.date({ required_error: "Date is required." }),
  location: z.string().min(1, "Location is required (e.g., farm name, specific field)."),
  temperatureHigh: z.preprocess(
    (val) => (val === "" ? undefined : Number(val)),
    z.number({invalid_type_error: "Temperature must be a number"}).optional()
  ),
  temperatureLow: z.preprocess(
    (val) => (val === "" ? undefined : Number(val)),
    z.number({invalid_type_error: "Temperature must be a number"}).optional()
  ),
  precipitation: z.preprocess(
    (val) => (val === "" ? undefined : Number(val)),
    z.number({invalid_type_error: "Precipitation must be a number"}).min(0).optional()
  ),
  precipitationUnit: z.string().optional().default("mm"),
  windSpeed: z.preprocess(
    (val) => (val === "" ? undefined : Number(val)),
    z.number({invalid_type_error: "Wind speed must be a number"}).min(0).optional()
  ),
  windSpeedUnit: z.string().optional().default("km/h"),
  conditions: z.string().optional(), // e.g., Sunny, Cloudy, Rain
  notes: z.string().optional(),
});

export function WeatherDataForm() {
  const { toast } = useToast();
  const form = useForm<z.infer<typeof weatherDataSchema>>({
    resolver: zodResolver(weatherDataSchema),
    defaultValues: {
      location: "",
      precipitationUnit: "mm",
      windSpeedUnit: "km/h",
      conditions: "",
      notes: "",
    },
  });

  function onSubmit(values: z.infer<typeof weatherDataSchema>) {
    console.log("Weather Data:", values);
    toast({
      title: "Weather Data Submitted (Simulated)",
      description: `Date: ${format(values.date, "PPP")}, Temp: ${values.temperatureHigh || 'N/A'}°C`,
    });
    form.reset();
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
                <FormLabel>Date</FormLabel>
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
            name="location"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Location</FormLabel>
                <FormControl>
                  <Input placeholder="e.g., Main Farm, West Field" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="temperatureHigh"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Max Temperature (°C) (Optional)</FormLabel>
                <FormControl>
                  <Input type="number" placeholder="e.g., 25" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="temperatureLow"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Min Temperature (°C) (Optional)</FormLabel>
                <FormControl>
                  <Input type="number" placeholder="e.g., 15" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="grid grid-cols-2 gap-4">
             <FormField
              control={form.control}
              name="precipitation"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Precipitation (Optional)</FormLabel>
                  <FormControl>
                    <Input type="number" placeholder="e.g., 10" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
             <FormField
              control={form.control}
              name="precipitationUnit"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Unit (Optional)</FormLabel>
                  <FormControl>
                    <Input placeholder="mm, inches" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FormField
                control={form.control}
                name="windSpeed"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Wind Speed (Optional)</FormLabel>
                    <FormControl>
                      <Input type="number" placeholder="e.g., 15" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="windSpeedUnit"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Unit (Optional)</FormLabel>
                    <FormControl>
                      <Input placeholder="km/h, mph" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
          </div>
           <FormField
            control={form.control}
            name="conditions"
            render={({ field }) => (
              <FormItem className="md:col-span-2">
                <FormLabel>General Conditions (Optional)</FormLabel>
                <FormControl>
                  <Input placeholder="e.g., Sunny, Overcast, Light rain" {...field} />
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
                  placeholder="Unusual weather events, frost warnings, etc."
                  className="resize-y min-h-[100px]"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit">Save Weather Log</Button>
      </form>
    </Form>
  );
}
