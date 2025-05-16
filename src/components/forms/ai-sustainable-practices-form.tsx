
"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { adviseSustainablePractices, type AdviseSustainablePracticesOutput } from "@/ai/flows/advise-sustainable-practices";
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Icons } from "@/components/icons";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/contexts/auth-context";
import { Alert, AlertTitle } from "@/components/ui/alert";


const formSchema = z.object({
  sustainabilityGoals: z.string().min(10, {message: "Please describe your key sustainability goals."}).max(1000),
  cropTypes: z.string().max(200).optional(),
  farmSizeAcres: z.preprocess(
    (val) => (val === "" || val === undefined || val === null ? undefined : Number(val)),
    z.number({invalid_type_error: "Farm size must be a number."}).positive("Farm size must be positive.").optional()
  ),
  currentPractices: z.string().max(500).optional(),
  locationContext: z.string().max(200).optional(),
});

export function AiSustainablePracticesForm() {
  const [result, setResult] = useState<AdviseSustainablePracticesOutput | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { 
      sustainabilityGoals: "",
      cropTypes: "", 
      currentPractices: "", 
      locationContext: "" 
    },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    if (!user || !user.farmId) {
      toast({
        title: "Farm ID Missing",
        description: "You must be associated with a farm to get personalized advice.",
        variant: "destructive",
      });
      return;
    }
    setIsLoading(true);
    setResult(null);
    try {
      const inputForAI = {
        ...values,
        farmId: user.farmId,
      };
      const output = await adviseSustainablePractices(inputForAI);
      setResult(output);
      toast({
        title: "Sustainable Practices Advised",
        description: "AI has provided recommendations for your farm.",
      });
    } catch (error) {
      console.error("Error advising sustainable practices:", error);
      toast({
        title: "Error",
        description: "Could not get sustainable practice advice. Please try again.",
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
          <FormField
            control={form.control}
            name="sustainabilityGoals"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-base">Your Key Sustainability Goals</FormLabel>
                <FormControl>
                  <Textarea 
                    placeholder="e.g., Improve soil health and water retention, reduce reliance on chemical inputs, enhance biodiversity, explore carbon farming opportunities." 
                    {...field} 
                    className="min-h-[100px] text-base"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <Alert variant="default" className="mt-4">
            <Icons.Info className="h-4 w-4" />
            <AlertTitle>Optional Details for More Specific Advice</AlertTitle>
            <FormDescription>
              Providing the information below can help the AI give more tailored recommendations. 
              If left blank, the AI will attempt to use data logged for your farm.
            </FormDescription>
          </Alert>

          <FormField
            control={form.control}
            name="cropTypes"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-base">Main Crop Types (Optional)</FormLabel>
                <FormControl>
                  <Input placeholder="e.g., Corn, Soybeans, Wheat, Vegetables" {...field} className="text-base"/>
                </FormControl>
                <FormDescription>If blank, AI will use recent crops from your planting logs.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <FormField
              control={form.control}
              name="farmSizeAcres"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-base">Farm Size (acres, Optional)</FormLabel>
                  <FormControl>
                    <Input type="number" placeholder="e.g., 150" {...field} value={field.value ?? ''} className="text-base"/>
                  </FormControl>
                  <FormDescription>If blank, AI may estimate from field data.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="locationContext"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-base">Location/Climate Context (Optional)</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Sandy soil, drought-prone area, heavy spring rains" {...field} className="text-base"/>
                  </FormControl>
                  <FormDescription>Helps tailor advice to local conditions.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <FormField
            control={form.control}
            name="currentPractices"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-base">Current Farming Practices (Optional)</FormLabel>
                <FormControl>
                  <Textarea 
                    placeholder="e.g., Conventional tillage, uses NPK fertilizers, some cover cropping, no-till on certain fields for 3 years." 
                    {...field} 
                    className="min-h-[100px] text-base"
                  />
                </FormControl>
                 <FormDescription>If blank, AI may infer some aspects from recent farm logs.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button type="submit" disabled={isLoading || !user?.farmId} size="lg">
            {isLoading ? (
              <>
                <Icons.Search className="mr-2 h-4 w-4 animate-spin" />
                Generating Advice...
              </>
            ) : (
              <>
                <Icons.Recycle className="mr-2 h-4 w-4" />
                Get Sustainable Practices Advice
              </>
            )}
          </Button>
           {!user?.farmId && (
            <p className="text-sm text-destructive">You need to be associated with a farm to get personalized advice. Please check your profile.</p>
          )}
        </form>
      </Form>

      {isLoading && !result && (
         <Card className="mt-6 shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Icons.BrainCircuit className="h-5 w-5 text-primary"/> AI Compiling Practices...</CardTitle>
            <CardDescription>Please wait while we generate sustainable practice recommendations based on your goals and farm data.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Separator className="my-2"/>
            <Skeleton className="h-4 w-full" />
          </CardContent>
        </Card>
      )}

      {result && (
        <Card className="mt-6 shadow-md animate-in fade-in-50 duration-500">
          <CardHeader>
             <CardTitle className="flex items-center gap-2"><Icons.CheckCircle2 className="h-5 w-5 text-green-500"/>Sustainable Practices Advice</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {result.dataSummary && (
              <>
                <div>
                  <h3 className="text-md font-semibold text-muted-foreground mb-1">Based on Farm Data:</h3>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed_">{result.dataSummary}</p>
                </div>
                <Separator />
              </>
            )}
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-1">Recommended Practices:</h3>
              <div className="text-foreground/90 whitespace-pre-wrap leading-relaxed prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: result.recommendedPractices.replace(/\n- /g, '<br />- ').replace(/\n\*/g, '<br />*') }} />
            </div>
            <Separator />
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-1">Implementation Tips:</h3>
              <p className="text-foreground/90 whitespace-pre-wrap leading-relaxed">{result.implementationTips}</p>
            </div>
            {result.potentialCarbonCreditInfo && (
              <>
                <Separator />
                <div>
                  <h3 className="text-lg font-semibold text-foreground mb-1">Carbon Credit Information:</h3>
                  <p className="text-foreground/90 whitespace-pre-wrap leading-relaxed">{result.potentialCarbonCreditInfo}</p>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
