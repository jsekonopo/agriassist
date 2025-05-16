"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { askAIFarmExpert, type AskAIFarmExpertOutput } from "@/ai/flows/ai-farm-expert";
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Icons } from "@/components/icons";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/auth-context"; // Import useAuth

const formSchema = z.object({
  question: z.string().min(10, { message: "Question must be at least 10 characters." }).max(500, {message: "Question must be 500 characters or less."}),
});

export function AiAskForm() {
  const [result, setResult] = useState<AskAIFarmExpertOutput | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth(); // Get user from AuthContext

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { question: "" },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setIsLoading(true);
    setResult(null);
    try {
      const inputForAI = {
        question: values.question,
        farmId: user?.farmId || undefined, // Pass farmId if available
      };
      const output = await askAIFarmExpert(inputForAI);
      setResult(output);
      toast({
        title: "AI Expert Responded",
        description: "Your question has been answered.",
        variant: "default",
      });
    } catch (error) {
      console.error("Error asking AI Farm Expert:", error);
      toast({
        title: "Error",
        description: "Could not get an answer from the AI Expert. Please try again.",
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
            name="question"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-base">Your Farming Question</FormLabel>
                <FormControl>
                  <Textarea 
                    placeholder="e.g., How do I test soil pH levels effectively? What are common signs of nitrogen deficiency in corn?" 
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
                Asking AI Expert...
              </>
            ) : (
              <>
                <Icons.Help className="mr-2 h-4 w-4" />
                Ask Your Question
              </>
            )}
          </Button>
        </form>
      </Form>
      
      {isLoading && !result && (
        <Card className="mt-6 shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Icons.BrainCircuit className="h-5 w-5 text-primary"/> AI Farm Expert is Thinking...</CardTitle>
            <CardDescription>Please wait while we fetch the answer.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </CardContent>
        </Card>
      )}

      {result && (
        <Card className="mt-6 shadow-md animate-in fade-in-50 duration-500">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Icons.CheckCircle2 className="h-5 w-5 text-green-500"/>AI Farm Expert&apos;s Answer</CardTitle>
            {result.farmContextUsed && <CardDescription className="text-xs italic">{result.farmContextUsed}</CardDescription>}
          </CardHeader>
          <CardContent>
            <p className="text-foreground/90 whitespace-pre-wrap leading-relaxed">{result.answer}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}