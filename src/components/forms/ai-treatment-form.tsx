"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { recommendTreatmentPlan, type RecommendTreatmentPlanOutput } from "@/ai/flows/recommend-treatment-plan";
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Icons } from "@/components/icons";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";

const formSchema = z.object({
  cropType: z.string().min(3, { message: "Crop type must be at least 3 characters." }).max(50, {message: "Crop type must be 50 characters or less."}),
  symptoms: z.string().min(10, { message: "Symptoms description must be at least 10 characters." }).max(1000, {message: "Symptoms must be 1000 characters or less."}),
});

export function AiTreatmentForm() {
  const [result, setResult] = useState<RecommendTreatmentPlanOutput | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { cropType: "", symptoms: "" },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setIsLoading(true);
    setResult(null);
    try {
      const output = await recommendTreatmentPlan(values);
      setResult(output);
      toast({
        title: "Treatment Plan Recommended",
        description: "AI has provided a diagnosis and treatment plan.",
      });
    } catch (error) {
      console.error("Error recommending treatment plan:", error);
      toast({
        title: "Error",
        description: "Could not get a treatment plan. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="cropType"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-base">Crop Type</FormLabel>
                <FormControl>
                  <Input placeholder="e.g., Tomatoes, Corn, Wheat" {...field} className="text-base"/>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="symptoms"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-base">Observed Symptoms</FormLabel>
                <FormControl>
                  <Textarea 
                    placeholder="e.g., Yellowing leaves with brown spots, wilting stems, presence of small white insects..." 
                    {...field} 
                    className="min-h-[120px] text-base"
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
                Analyzing Symptoms...
              </>
            ) : (
              <>
                <Icons.Planting className="mr-2 h-4 w-4" />
                Get Treatment Plan
              </>
            )}
          </Button>
        </form>
      </Form>

      {isLoading && !result && (
         <Card className="mt-6 shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Icons.BrainCircuit className="h-5 w-5 text-primary"/> AI Analyzing Symptoms...</CardTitle>
            <CardDescription>Please wait while we generate a treatment plan.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Separator className="my-2"/>
             <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
          </CardContent>
        </Card>
      )}

      {result && (
        <Card className="mt-6 shadow-md animate-in fade-in-50 duration-500">
          <CardHeader>
             <CardTitle className="flex items-center gap-2"><Icons.CheckCircle2 className="h-5 w-5 text-green-500"/>AI-Recommended Plan</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-1">Diagnosis:</h3>
              <p className="text-foreground/90 whitespace-pre-wrap leading-relaxed">{result.diagnosis}</p>
            </div>
            <Separator />
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-1">Treatment Plan:</h3>
              <p className="text-foreground/90 whitespace-pre-wrap leading-relaxed">{result.treatmentPlan}</p>
            </div>
            <Separator />
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-1">Prevention Tips:</h3>
              <p className="text-foreground/90 whitespace-pre-wrap leading-relaxed">{result.preventionTips}</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
