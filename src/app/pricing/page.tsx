
"use client";

import { PageHeader } from '@/components/layout/page-header';
import { Icons } from '@/components/icons';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle2 } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { useRouter } from 'next/navigation';
import type { PlanId } from '@/contexts/auth-context';
import { useToast } from '@/hooks/use-toast';
import { useState } from 'react';

interface PricingPlan {
  id: PlanId;
  name: string;
  price: string;
  priceFrequency: string;
  description: string;
  features: string[];
  actionLabel: string;
  isCurrentPlan?: boolean; // To be determined dynamically
}

const plans: Omit<PricingPlan, 'isCurrentPlan' | 'actionLabel'>[] = [
  {
    id: "free",
    name: "Hobbyist Farmer",
    price: "Free",
    priceFrequency: "",
    description: "Get started with the basics for small-scale farming.",
    features: [
      "Up to 2 Fields",
      "Max 50 Logs/month (conceptual)",
      "Basic AI Expert Access",
      "No Staff Accounts",
      "Community Support",
    ],
  },
  {
    id: "pro",
    name: "Pro Farmer",
    price: "$29",
    priceFrequency: "/ month",
    description: "For growing farms needing more features and capacity.",
    features: [
      "Up to 10 Fields",
      "Unlimited Logs",
      "Full AI Expert Access",
      "Up to 2 Staff Accounts",
      "Basic Reporting Tools",
      "Email Support",
    ],
  },
  {
    id: "agribusiness",
    name: "AgriBusiness",
    price: "$79",
    priceFrequency: "/ month",
    description: "Comprehensive solution for larger agricultural operations.",
    features: [
      "Unlimited Fields",
      "Unlimited Logs",
      "Priority AI Expert Access (Conceptual)",
      "Up to 10 Staff Accounts",
      "Advanced Reporting & Data Export (Conceptual)",
      "Dedicated Support (Conceptual)",
    ],
  },
];

export default function PricingPage() {
  const { user, isAuthenticated, updateUserPlan } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [isLoadingPlanChange, setIsLoadingPlanChange] = useState<PlanId | null>(null);

  const handleSelectPlan = async (planId: PlanId) => {
    if (!isAuthenticated) {
      // Redirect to login, potentially with a redirect back to pricing
      // For now, just prompt to log in.
      toast({ title: "Login Required", description: "Please log in or register to select a plan.", variant: "default" });
      router.push(`/login?redirect=/pricing`);
      return;
    }
    if (user?.selectedPlanId === planId) {
      toast({ title: "Already on this Plan", description: "You are currently on this plan.", variant: "default" });
      return;
    }

    setIsLoadingPlanChange(planId);
    // Simulate payment and subscription update
    // In a real app, this would redirect to a payment gateway (e.g., Stripe Checkout)
    // and then handle the webhook/callback to update the user's subscription.
    toast({
      title: "Simulating Plan Change...",
      description: `Attempting to switch to ${planId} plan. No payment will be processed.`,
    });

    // Simulate a delay for API call
    await new Promise(resolve => setTimeout(resolve, 1500));

    const result = await updateUserPlan(planId);
    if (result.success) {
        // Toast is handled within updateUserPlan
    } else {
        // Toast is handled within updateUserPlan
    }
    setIsLoadingPlanChange(null);
  };

  const displayPlans: PricingPlan[] = plans.map(p => ({
    ...p,
    isCurrentPlan: user?.selectedPlanId === p.id,
    actionLabel: user?.selectedPlanId === p.id ? "Current Plan" : (p.id === "free" && user?.selectedPlanId !== "free" ? "Downgrade to Free (Simulated)" : "Select Plan (Simulated)"),
  }));

  return (
    <div className="space-y-8 py-12 md:py-16">
      <PageHeader
        title="Choose Your AgriAssist Plan"
        description="Flexible plans designed to fit the needs of every farm, from hobbyist to agribusiness."
        icon={Icons.Dollar}
      />

      <section className="container mx-auto px-4 md:px-6">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
          {displayPlans.map((plan) => (
            <Card key={plan.id} className={`flex flex-col shadow-lg hover:shadow-xl transition-shadow duration-300 ${plan.isCurrentPlan ? 'border-2 border-primary ring-2 ring-primary/50' : 'border'}`}>
              <CardHeader className="pb-4">
                <CardTitle className="text-2xl font-bold text-foreground">{plan.name}</CardTitle>
                <div className="flex items-baseline">
                  <span className="text-4xl font-extrabold text-primary">{plan.price}</span>
                  {plan.priceFrequency && <span className="ml-1 text-xl font-medium text-muted-foreground">{plan.priceFrequency}</span>}
                </div>
                <CardDescription className="pt-2 min-h-[40px]">{plan.description}</CardDescription>
              </CardHeader>
              <CardContent className="flex-grow space-y-4">
                <ul className="space-y-2">
                  {plan.features.map((feature, index) => (
                    <li key={index} className="flex items-start">
                      <CheckCircle2 className="h-5 w-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" />
                      <span className="text-muted-foreground">{feature}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
              <div className="p-6 pt-4 mt-auto">
                <Button
                  size="lg"
                  className="w-full"
                  onClick={() => handleSelectPlan(plan.id)}
                  disabled={plan.isCurrentPlan || isLoadingPlanChange === plan.id}
                  variant={plan.isCurrentPlan ? "outline" : "default"}
                >
                  {isLoadingPlanChange === plan.id ? (
                    <> <Icons.Search className="mr-2 h-4 w-4 animate-spin" /> Processing... </>
                   ) : (
                    plan.actionLabel
                   )}
                </Button>
                {plan.id !== "free" && (
                  <p className="text-xs text-center text-muted-foreground mt-3">
                    This is a simulated upgrade. No real payment will be processed.
                  </p>
                )}
              </div>
            </Card>
          ))}
        </div>
        <div className="mt-12 text-center">
          <p className="text-muted-foreground">
            All prices are in USD. For custom enterprise solutions or questions, please contact us.
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            Note: This pricing page and plan selection are for demonstration purposes. Actual billing integration requires a payment provider.
          </p>
        </div>
      </section>
    </div>
  );
}
