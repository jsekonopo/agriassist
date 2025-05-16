
// src/ai/flows/ai-farm-expert.ts
'use server';

/**
 * @fileOverview This file defines the AI Farm Expert flow, allowing farmers to ask simple 'how to' questions related to farming.
 *
 * - askAIFarmExpert - A function that takes a question as input and returns an answer from the AI Farm Expert.
 * - AskAIFarmExpertInput - The input type for the askAIFarmExpert function.
 * - AskAIFarmExpertOutput - The return type for the askAIFarmExpert function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';
import { adminDb } from '@/lib/firebase-admin';
import { collection, query, where, getDocs, limit, orderBy } from 'firebase/firestore';

const AskAIFarmExpertInputSchema = z.object({
  question: z.string().describe('The question to ask the AI Farm Expert.'),
  farmId: z.string().optional().describe("The ID of the farm, if context is to be used."),
});
export type AskAIFarmExpertInput = z.infer<typeof AskAIFarmExpertInputSchema>;

const AskAIFarmExpertOutputSchema = z.object({
  answer: z.string().describe('The answer from the AI Farm Expert.'),
  farmContextUsed: z.string().optional().describe("A brief summary of the farm context used by the AI, if any."),
});
export type AskAIFarmExpertOutput = z.infer<typeof AskAIFarmExpertOutputSchema>;

export async function askAIFarmExpert(input: AskAIFarmExpertInput): Promise<AskAIFarmExpertOutput> {
  return askAIFarmExpertFlow(input);
}

const prompt = ai.definePrompt({
  name: 'askAIFarmExpertPrompt',
  input: {schema: AskAIFarmExpertInputSchema.extend({ farmSummary: z.string().optional() })},
  output: {schema: AskAIFarmExpertOutputSchema.omit({ farmContextUsed: true }) }, // AI doesn't generate this, flow adds it
  prompt: `You are an AI Farm Expert, providing simple and concise answers to farmers' questions about common farming tasks.
{{#if farmSummary}}
Consider the following context about the farmer's setup:
{{{farmSummary}}}
{{/if}}

Question: {{{question}}}

Answer: `,
});

const askAIFarmExpertFlow = ai.defineFlow(
  {
    name: 'askAIFarmExpertFlow',
    inputSchema: AskAIFarmExpertInputSchema,
    outputSchema: AskAIFarmExpertOutputSchema,
  },
  async (input) => {
    let farmSummaryForPrompt: string | undefined = undefined;
    let farmContextUsedForOutput: string | undefined = undefined;

    if (input.farmId) {
      try {
        const summaryLines: string[] = [];
        
        // Fetch farm name
        const farmDocRef = adminDb.collection('farms').doc(input.farmId);
        const farmDocSnap = await farmDocRef.get();
        if (farmDocSnap.exists()) {
          summaryLines.push(`- Farm Name: ${farmDocSnap.data()?.farmName || 'Unnamed Farm'}.`);
        }

        // Fetch recent crops
        const plantingLogsQuery = query(
          collection(adminDb, "plantingLogs"),
          where("farmId", "==", input.farmId),
          orderBy("plantingDate", "desc"),
          limit(5)
        );
        const plantingLogsSnapshot = await getDocs(plantingLogsQuery);
        const crops = new Set<string>();
        plantingLogsSnapshot.forEach(doc => crops.add(doc.data().cropName));
        if (crops.size > 0) {
          summaryLines.push(`- Recently logged crops include: ${Array.from(crops).join(', ')}.`);
        }

        // Fetch total acreage (approx)
        const fieldsQuery = query(collection(adminDb, "fields"), where("farmId", "==", input.farmId));
        const fieldsSnapshot = await getDocs(fieldsQuery);
        let totalAcres = 0;
        fieldsSnapshot.forEach(doc => {
            const fieldData = doc.data();
            if (fieldData.fieldSize && typeof fieldData.fieldSize === 'number') {
                if (!fieldData.fieldSizeUnit || fieldData.fieldSizeUnit.toLowerCase().includes('acre')) {
                    totalAcres += fieldData.fieldSize;
                } else if (fieldData.fieldSizeUnit.toLowerCase().includes('hectare')) {
                    totalAcres += fieldData.fieldSize * 2.47105; // Convert hectares to acres
                }
            }
        });
        if (totalAcres > 0) {
            summaryLines.push(`- Approximate total field area: ${totalAcres.toFixed(1)} acres.`);
        }

        if (summaryLines.length > 0) {
          farmSummaryForPrompt = summaryLines.join("\n");
          farmContextUsedForOutput = "AI considered the following farm context: " + summaryLines.map(line => line.replace(/^- /, "")).join(" ");
        }
      } catch (e) {
        console.error("Error fetching farm context for AI Farm Expert:", e);
        farmSummaryForPrompt = "Note: Could not fetch detailed farm context due to an error.";
        farmContextUsedForOutput = "Attempted to fetch farm context but encountered an error.";
      }
    }

    const promptInput = {
      question: input.question,
      farmSummary: farmSummaryForPrompt,
    };

    const {output} = await prompt(promptInput);
    
    return {
        ...output!,
        farmContextUsed: farmContextUsedForOutput,
    };
  }
);
