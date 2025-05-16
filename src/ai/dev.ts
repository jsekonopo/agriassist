import { config } from 'dotenv';
config();

import '@/ai/flows/ai-farm-expert.ts';
import '@/ai/flows/suggest-optimization-strategies.ts';
import '@/ai/flows/recommend-treatment-plan.ts';
import '@/ai/flows/diagnose-plant-health-flow.ts';
import '@/ai/flows/suggest-planting-harvesting-windows.ts'; 
import '@/ai/flows/advise-sustainable-practices.ts'; 
import '@/ai/flows/interpret-soil-health.ts'; 
import '@/ai/flows/proactive-farm-insights-flow.tsx'; // Added new proactive insights flow
