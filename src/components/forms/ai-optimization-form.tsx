"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { suggestOptimizationStrategies, type SuggestOptimizationStrategiesOutput } from "@/ai/flows/suggest-optimization-strategies";
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Icons } from "@/components/icons";
import { Skeleton } from "@/components/ui/skeleton";

const formSchema = z.object({
  farmSize: z.preprocess(
    (val) => Number(val), 
    z.number({invalid_type_error: "Farm size must be a number."}).positive({ message: "Farm size must be a positive number." })
  ),
  location: z.string().min(3, { message: "Location must be at least 3 characters." }).max(100),
  crops: z.string().min(3, { message: "Crops description must be at least 3 characters." }).max(200),
  soilType: z.string().min(3, { message: "Soil type must be at least 3 characters." }).max(100),
  historicalYieldData: z.string().optional().default("Not available"),
  currentWeatherData: z.string().optional().default("Not available"),
  fertilizerUsage: z.string().optional().default("Not available"),
  waterUsage: z.string().optional().default("Not available"),
});

export function AiOptimizationForm() {
  const [result, setResult] = useState<SuggestOptimizationStrategiesOutput | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      farmSize: undefined, // or a sensible default like 100
      location: "",
      crops: "",
      soilType: "",
      historicalYieldData: "Average yields for the past 3 years.",
      currentWeatherData: "Seasonal average, currently dry.",
      fertilizerUsage: "Standard NPK application based on soil tests.",
      waterUsage: "Rain-fed with supplemental irrigation during dry spells.",
    },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setIsLoading(true);
    setResult(null);
    try {
      // Ensure all optional fields have default string values if empty, as per AI flow schema
      const filledValues = {
        ...values,
        historicalYieldData: values.historicalYieldData || "Not available",
        currentWeatherData: values.currentWeatherData || "Not available",
        fertilizerUsage: values.fertilizerUsage || "Not available",
        waterUsage: values.waterUsage || "Not available",
      };
      const output = await suggestOptimizationStrategies(filledValues);
      setResult(output);
      toast({
        title: "Optimization Strategies Suggested",
        description: "AI has provided strategies to improve your farm.",
      });
    } catch (error) {
      console.error("Error suggesting optimization strategies:", error);
      toast({
        title: "Error",
        description: "Could not get optimization strategies. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <FormField
              control={form.control}
              name="farmSize"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-base">Farm Size (acres)</FormLabel>
                  <FormControl>
                    <Input type="number" placeholder="e.g., 150" {...field} className="text-base"/>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="location"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-base">Location</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Ottawa, Ontario" {...field} className="text-base"/>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="crops"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-base">Main Crops Grown</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Corn, Soybeans, Wheat" {...field} className="text-base"/>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="soilType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-base">Dominant Soil Type</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Loamy Sand, Clay Loam" {...field} className="text-base"/>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <FormField
              control={form.control}
              name="historicalYieldData"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-base">Historical Yield Data (Optional)</FormLabel>
                  <FormControl>
                    <Textarea placeholder="e.g., Average corn yield: 150 bushels/acre" {...field} className="min-h-[80px] text-base"/>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="currentWeatherData"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-base">Current Weather Data (Optional)</FormLabel>
                  <FormControl>
                    <Textarea placeholder="e.g., Recent heavy rains, expecting dry spell" {...field} className="min-h-[80px] text-base"/>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="fertilizerUsage"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-base">Fertilizer Usage (Optional)</FormLabel>
                  <FormControl>
                    <Textarea placeholder="e.g., 100kg N/acre for corn, organic compost used" {...field} className="min-h-[80px] text-base"/>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="waterUsage"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-base">Water Usage (Optional)</FormLabel>
                  <FormControl>
                    <Textarea placeholder="e.g., Irrigated twice last month, 2 inches per irrigation" {...field} className="min-h-[80px] text-base"/>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <Button type="submit" disabled={isLoading} size="lg">
             {isLoading ? (
              <>
                <Icons.Search className="mr-2 h-4 w-4 animate-spin" />
                Generating Strategies...
              </>
            ) : (
              <>
                <Icons.Analytics className="mr-2 h-4 w-4" />
                Get Optimization Strategies
              </>
            )}
          </Button>
        </form>
      </Form>

      {isLoading && !result && (
         <Card className="mt-6 shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Icons.BrainCircuit className="h-5 w-5 text-primary"/> AI Crafting Strategies...</CardTitle>
            <CardDescription>Please wait while we generate optimization strategies for your farm.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </CardContent>
        </Card>
      )}

      {result && (
        <Card className="mt-6 shadow-md animate-in fade-in-50 duration-500">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Icons.CheckCircle2 className="h-5 w-5 text-green-500"/>Suggested Optimization Strategies</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-foreground/90 whitespace-pre-wrap leading-relaxed" dangerouslySetInnerHTML={{ __html: result.strategies.replace(/\n/g, '<br />') }} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
