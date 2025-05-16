import { config } from 'dotenv';
config();

import '@/ai/flows/ai-farm-expert.ts';
import '@/ai/flows/suggest-optimization-strategies.ts';
import '@/ai/flows/recommend-treatment-plan.ts';
import '@/ai/flows/diagnose-plant-health-flow.ts'; // Added new flow
