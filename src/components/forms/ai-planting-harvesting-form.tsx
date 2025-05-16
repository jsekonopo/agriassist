"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { suggestPlantingHarvestingWindows, type SuggestPlantingHarvestingWindowsOutput } from "@/ai/flows/suggest-planting-harvesting-windows";
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Icons } from "@/components/icons";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";

const formSchema = z.object({
  location: z.string().min(3, { message: "Location must be at least 3 characters." }).max(100),
  cropType: z.string().min(3, { message: "Crop type must be at least 3 characters." }).max(50),
  activity: z.enum(["Planting", "Harvesting"], { required_error: "Activity type is required."}),
  additionalNotes: z.string().max(500, {message: "Notes must be 500 characters or less."}).optional(),
});

export function AiPlantingHarvestingForm() {
  const [result, setResult] = useState<SuggestPlantingHarvestingWindowsOutput | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { location: "", cropType: "", additionalNotes: "" },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setIsLoading(true);
    setResult(null);
    try {
      const output = await suggestPlantingHarvestingWindows(values);
      setResult(output);
      toast({
        title: "AI Suggestion Received",
        description: `Advice for ${values.activity.toLowerCase()} ${values.cropType.toLowerCase()} is ready.`,
      });
    } catch (error) {
      console.error("Error getting planting/harvesting advice:", error);
      toast({
        title: "Error",
        description: "Could not get advice from the AI Expert. Please try again.",
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
              name="location"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-base">Farm Location</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Ottawa, Ontario" {...field} className="text-base"/>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="cropType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-base">Crop Type</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Corn, Tomatoes, Wheat" {...field} className="text-base"/>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <FormField
            control={form.control}
            name="activity"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-base">Activity</FormLabel>
                 <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger className="text-base">
                      <SelectValue placeholder="Select activity (Planting or Harvesting)" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="Planting">Planting</SelectItem>
                    <SelectItem value="Harvesting">Harvesting</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="additionalNotes"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-base">Additional Notes (Optional)</FormLabel>
                <FormControl>
                  <Textarea 
                    placeholder="e.g., Using specific variety, concerns about early frost, aiming for staggered harvest." 
                    {...field} 
                    className="min-h-[100px] text-base"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button type="submit" disabled={isLoading} size="lg">
            {isLoading ? (
              <>
                <Icons.Search className="mr-2 h-4 w-4 animate-spin" />
                Getting Advice...
              </>
            ) : (
              <>
                <Icons.Calendar className="mr-2 h-4 w-4" />
                Get Planting/Harvesting Advice
              </>
            )}
          </Button>
        </form>
      </Form>
      
      {isLoading && !result && (
        <Card className="mt-6 shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Icons.BrainCircuit className="h-5 w-5 text-primary"/> AI Calculating Optimal Times...</CardTitle>
            <CardDescription>Please wait while we fetch the suggestions.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </CardContent>
        </Card>
      )}

      {result && (
        <Card className="mt-6 shadow-md animate-in fade-in-50 duration-500">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Icons.CheckCircle2 className="h-5 w-5 text-green-500"/>AI Planting/Harvesting Advice</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-1">Suggested Window:</h3>
              <p className="text-foreground/90 whitespace-pre-wrap leading-relaxed">{result.suggestedWindow}</p>
            </div>
            <Separator />
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-1">Detailed Advice:</h3>
              <p className="text-foreground/90 whitespace-pre-wrap leading-relaxed">{result.detailedAdvice}</p>
            </div>
            {result.confidence && (
              <>
                <Separator />
                <div>
                  <h3 className="text-lg font-semibold text-foreground mb-1">Confidence:</h3>
                  <p className="text-foreground/90 whitespace-pre-wrap leading-relaxed">{result.confidence}</p>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
