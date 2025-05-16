"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { interpretSoilHealth, type InterpretSoilHealthOutput } from "@/ai/flows/interpret-soil-health";
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Icons } from "@/components/icons";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";

const numberPositive = (name: string) => z.preprocess(
    (val) => Number(val), 
    z.number({required_error: `${name} is required.`, invalid_type_error: `${name} must be a number.`}).positive(`${name} must be positive.`)
);

const formSchema = z.object({
  phLevel: numberPositive("pH Level"),
  organicMatterPercent: numberPositive("Organic Matter %"),
  nitrogenPPM: numberPositive("Nitrogen PPM"),
  phosphorusPPM: numberPositive("Phosphorus PPM"),
  potassiumPPM: numberPositive("Potassium PPM"),
  cropType: z.string().max(100).optional(),
  soilTexture: z.string().max(100).optional(),
});

export function AiSoilInterpretationForm() {
  const [result, setResult] = useState<InterpretSoilHealthOutput | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { 
        cropType: "",
        soilTexture: ""
    },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setIsLoading(true);
    setResult(null);
    try {
      const output = await interpretSoilHealth(values);
      setResult(output);
      toast({
        title: "Soil Health Interpretation Complete",
        description: "AI has analyzed your soil test results.",
      });
    } catch (error) {
      console.error("Error interpreting soil health:", error);
      toast({
        title: "Error",
        description: "Could not get soil health interpretation. Please try again.",
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <FormField
              control={form.control}
              name="phLevel"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-base">pH Level</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.1" placeholder="e.g., 6.5" {...field} className="text-base"/>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="organicMatterPercent"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-base">Organic Matter (%)</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.1" placeholder="e.g., 3.5" {...field} className="text-base"/>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
             <FormField
              control={form.control}
              name="nitrogenPPM"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-base">Nitrogen (N) PPM</FormLabel>
                  <FormControl>
                    <Input type="number" placeholder="e.g., 120" {...field} className="text-base"/>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="phosphorusPPM"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-base">Phosphorus (P) PPM</FormLabel>
                  <FormControl>
                    <Input type="number" placeholder="e.g., 50" {...field} className="text-base"/>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="potassiumPPM"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-base">Potassium (K) PPM</FormLabel>
                  <FormControl>
                    <Input type="number" placeholder="e.g., 150" {...field} className="text-base"/>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <FormField
                control={form.control}
                name="cropType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-base">Intended Crop (Optional)</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Corn, Alfalfa" {...field} className="text-base"/>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="soilTexture"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-base">Soil Texture (Optional)</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Sandy Loam, Clay" {...field} className="text-base"/>
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
                Interpreting Results...
              </>
            ) : (
              <>
                <Icons.FlaskConical className="mr-2 h-4 w-4" />
                Interpret Soil Health Results
              </>
            )}
          </Button>
        </form>
      </Form>

      {isLoading && !result && (
         <Card className="mt-6 shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Icons.BrainCircuit className="h-5 w-5 text-primary"/> AI Analyzing Soil Data...</CardTitle>
            <CardDescription>Please wait while we interpret your soil test results.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Separator className="my-2"/>
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </CardContent>
        </Card>
      )}

      {result && (
        <Card className="mt-6 shadow-md animate-in fade-in-50 duration-500">
          <CardHeader>
             <CardTitle className="flex items-center gap-2"><Icons.CheckCircle2 className="h-5 w-5 text-green-500"/>Soil Health Interpretation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-1">Overall Assessment:</h3>
              <p className="text-foreground/90 whitespace-pre-wrap leading-relaxed">{result.overallAssessment}</p>
            </div>
            <Separator />
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-1">pH Level Interpretation:</h3>
              <p className="text-foreground/90 whitespace-pre-wrap leading-relaxed">{result.phInterpretation}</p>
            </div>
             <Separator />
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-1">Organic Matter Interpretation:</h3>
              <p className="text-foreground/90 whitespace-pre-wrap leading-relaxed">{result.organicMatterInterpretation}</p>
            </div>
             <Separator />
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-1">Nutrient (N, P, K) Interpretation:</h3>
              <p className="text-foreground/90 whitespace-pre-wrap leading-relaxed">{result.nutrientInterpretation}</p>
            </div>
            <Separator />
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-1">Recommendations:</h3>
              <p className="text-foreground/90 whitespace-pre-wrap leading-relaxed">{result.recommendations}</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
