// src/components/forms/ai-plant-diagnosis-form.tsx
"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { diagnosePlantHealth, type DiagnosePlantHealthOutput } from "@/ai/flows/diagnose-plant-health-flow";
import { useState, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Icons } from "@/components/icons";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import Image from "next/image";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];

const formSchema = z.object({
  photo: z
    .any()
    .refine((files) => files?.length === 1, "Plant photo is required.")
    .refine((files) => files?.[0]?.size <= MAX_FILE_SIZE, `Max image size is 5MB.`)
    .refine(
      (files) => ACCEPTED_IMAGE_TYPES.includes(files?.[0]?.type),
      "Only .jpg, .jpeg, .png and .webp formats are supported."
    ),
  description: z.string().min(10, { message: "Description must be at least 10 characters." }).max(1000, {message: "Description must be 1000 characters or less."}),
});

export function AiPlantDiagnosisForm() {
  const [result, setResult] = useState<DiagnosePlantHealthOutput | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [previewImage, setPreviewImage] useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { photo: undefined, description: "" },
  });

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      form.setValue("photo", event.target.files); // RHF needs the FileList
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviewImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    } else {
      form.setValue("photo", undefined);
      setPreviewImage(null);
    }
  };

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setIsLoading(true);
    setResult(null);

    const file = values.photo[0];
    const reader = new FileReader();

    reader.onload = async (e) => {
      const photoDataUri = e.target?.result as string;
      try {
        const output = await diagnosePlantHealth({ photoDataUri, description: values.description });
        setResult(output);
        toast({
          title: "Plant Diagnosis Complete",
          description: "AI has analyzed the plant photo and symptoms.",
        });
      } catch (error) {
        console.error("Error diagnosing plant health:", error);
        toast({
          title: "Error",
          description: "Could not get a plant diagnosis. Please try again.",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };
    reader.onerror = () => {
      toast({
        title: "Error Reading File",
        description: "Could not read the selected image file.",
        variant: "destructive",
      });
      setIsLoading(false);
    }
    reader.readAsDataURL(file);
  }

  return (
    <div className="space-y-6">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <FormField
            control={form.control}
            name="photo"
            render={({ field }) => ( // field prop is not directly used for value/onChange here due to custom handling
              <FormItem>
                <FormLabel className="text-base">Plant Photo</FormLabel>
                <FormControl>
                  <Input 
                    type="file" 
                    accept={ACCEPTED_IMAGE_TYPES.join(",")} 
                    onChange={handleFileChange}
                    ref={fileInputRef}
                    className="text-base file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20"
                  />
                </FormControl>
                <FormMessage />
                {previewImage && (
                    <div className="mt-4 relative w-full max-w-xs h-auto aspect-square border rounded-md overflow-hidden shadow">
                        <Image src={previewImage} alt="Plant preview" layout="fill" objectFit="cover" />
                    </div>
                )}
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-base">Description of Symptoms/Conditions</FormLabel>
                <FormControl>
                  <Textarea 
                    placeholder="e.g., Leaves are yellowing from the edges, new growth appears stunted. Small black spots on the underside of leaves. Plant is in full sun." 
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
                Diagnosing Plant...
              </>
            ) : (
              <>
                <Icons.Camera className="mr-2 h-4 w-4" />
                Diagnose Plant Health
              </>
            )}
          </Button>
        </form>
      </Form>

      {isLoading && !result && (
         <Card className="mt-6 shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Icons.BrainCircuit className="h-5 w-5 text-primary"/> AI Analyzing Plant...</CardTitle>
            <CardDescription>Please wait while we process the image and description.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Separator className="my-2"/>
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-4 w-full" />
          </CardContent>
        </Card>
      )}

      {result && (
        <Card className="mt-6 shadow-md animate-in fade-in-50 duration-500">
          <CardHeader>
             <CardTitle className="flex items-center gap-2"><Icons.CheckCircle2 className="h-5 w-5 text-green-500"/>AI Plant Diagnosis Results</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-1">Plant Identification:</h3>
              <p className="text-foreground/90 whitespace-pre-wrap leading-relaxed">{result.plantIdentification}</p>
            </div>
            <Separator />
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-1">Health Assessment:</h3>
              <p className="text-foreground/90 whitespace-pre-wrap leading-relaxed">{result.healthAssessment}</p>
            </div>
            <Separator />
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-1">Diagnosis Details:</h3>
              <p className="text-foreground/90 whitespace-pre-wrap leading-relaxed">{result.diagnosisDetails}</p>
            </div>
            <Separator />
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-1">Recommended Actions:</h3>
              <p className="text-foreground/90 whitespace-pre-wrap leading-relaxed">{result.recommendedActions}</p>
            </div>
            {result.confidenceLevel && (
              <>
                <Separator />
                <div>
                  <h3 className="text-lg font-semibold text-foreground mb-1">Confidence Level:</h3>
                  <p className="text-foreground/90 whitespace-pre-wrap leading-relaxed">{result.confidenceLevel}</p>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
