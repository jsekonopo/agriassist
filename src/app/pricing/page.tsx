
"use client";

import { PageHeader } from '@/components/layout/page-header';
import { Icons } from '@/components/icons';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle2 } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { useRouter, useSearchParams } from 'next/navigation'; 
import type { PlanId } from '@/contexts/auth-context';
import { useToast } from '@/hooks/use-toast';
import { useState, useEffect } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { PublicPageLayout } from '@/components/layout/public-page-layout'; 

interface PricingPlan {
  id: PlanId;
  name: string;
  price: string;
  priceFrequency: string;
  description: string;
  features: string[];
  actionLabel: string;
  isCurrentPlan?: boolean; 
  stripePriceIdEnvVar?: 'STRIPE_PRICE_ID_PRO' | 'STRIPE_PRICE_ID_AGRIBUSINESS'; 
}

const plansData: Omit<PricingPlan, 'isCurrentPlan' | 'actionLabel'>[] = [
  {
    id: "free",
    name: "Hobbyist Farmer",
    price: "Free",
    priceFrequency: "",
    description: "Get started with the basics for small-scale farming.",
    features: [
      "Up to 2 Fields",
      "Basic AI Expert Access",
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
      "Full AI Expert Access",
      "Up to 2 Staff Accounts",
      "Basic Reporting Tools",
      "Email Support",
    ],
    stripePriceIdEnvVar: 'STRIPE_PRICE_ID_PRO',
  },
  {
    id: "agribusiness",
    name: "AgriBusiness",
    price: "$79",
    priceFrequency: "/ month",
    description: "Comprehensive solution for larger agricultural operations.",
    features: [
      "Unlimited Fields",
      "Priority AI Expert Access",
      "Up to 10 Staff Accounts",
      "Advanced Reporting & Data Export",
      "Dedicated Support",
    ],
    stripePriceIdEnvVar: 'STRIPE_PRICE_ID_AGRIBUSINESS',
  },
];

const stripePromise = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  ? loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
  : null;


export default function PricingPage() {
  const { user, isAuthenticated, updateUserPlan, refreshUserData, makeApiRequest } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [isLoadingPlanChange, setIsLoadingPlanChange] = useState<PlanId | null>(null);
  const searchParams = useSearchParams(); 

  useEffect(() => {
    const sessionId = searchParams.get("session_id");
    if (sessionId) {
      toast({
        title: "Subscription Processing",
        description: "Your subscription is being processed. Your plan details will update shortly.",
      });
      refreshUserData(); 
      router.replace('/pricing', undefined); 
    }
  }, [searchParams, toast, refreshUserData, router]);


  const handleSelectPlan = async (planId: PlanId) => {
    if (!isAuthenticated) {
      toast({ title: "Login Required", description: "Please log in or register to select a plan." });
      router.push(`/login?redirect=/pricing`);
      return;
    }
    if (user?.selectedPlanId === planId && user?.subscriptionStatus === 'active') {
      toast({ title: "Already on this Plan", description: "You are currently subscribed to this plan." });
      return;
    }
    if (!process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY && planId !== 'free') {
      toast({ title: "Stripe Not Configured", description: "Stripe is not configured. Please add your publishable key.", variant: "destructive" });
      return;
    }

    setIsLoadingPlanChange(planId);

    if (planId === 'free') {
      // If downgrading to free, call the cancel subscription API
      if (user?.stripeSubscriptionId) {
        try {
          const result = await makeApiRequest('/api/billing/cancel-subscription', {});
          if(result.success) {
            toast({ title: "Subscription Cancellation Initiated", description: result.message });
            await refreshUserData(); // This will update selectedPlanId to 'free' via webhook/direct update in API
          } else {
            toast({ title: "Cancellation Failed", description: result.message, variant: "destructive" });
          }
        } catch (error: any) {
            toast({ title: "Error Cancelling", description: error.message || "Could not initiate cancellation.", variant: "destructive" });
        }
      } else {
        // If no stripeSubscriptionId, just update plan locally (should be handled by updateUserPlan which might call cancelSubscription if needed)
        // For simplicity, if already on free or no sub id, this is a direct update to free
        const result = await updateUserPlan(planId); 
         if (result.success) { 
            toast({ title: "Plan Changed", description: result.message });
        } else if (!result.success) {
          toast({ title: "Plan Change Failed", description: result.message || result.error, variant: "destructive" });
        }
      }
    } else { // For paid plans
      try {
        const result = await updateUserPlan(planId); // updateUserPlan now calls create-checkout-session
        if (result.success && result.sessionId) {
          const stripe = await stripePromise;
          if (stripe) {
            const { error: stripeError } = await stripe.redirectToCheckout({ sessionId: result.sessionId });
            if (stripeError) {
              console.error("Stripe redirectToCheckout error:", stripeError);
              toast({ title: "Checkout Error", description: stripeError.message || "Could not redirect to Stripe Checkout.", variant: "destructive" });
            }
            // If successful, Stripe redirects, no further client action here until user returns.
          } else {
             toast({ title: "Stripe Error", description: "Stripe.js failed to load.", variant: "destructive" });
          }
        } else if (!result.success) {
          toast({ title: "Plan Upgrade Failed", description: result.message || result.error, variant: "destructive" });
        }
      } catch (error: any) {
         toast({ title: "Error", description: error.message || "Could not initiate plan upgrade.", variant: "destructive" });
      }
    }
    setIsLoadingPlanChange(null);
  };

  const displayPlans: PricingPlan[] = plansData.map(p => ({
    ...p,
    isCurrentPlan: user?.selectedPlanId === p.id && user?.subscriptionStatus === 'active',
    actionLabel: user?.selectedPlanId === p.id && user?.subscriptionStatus === 'active' 
      ? "Current Plan" 
      : (p.id === "free" && user?.selectedPlanId !== "free" ? "Downgrade to Free" : "Select Plan"),
  }));

  if (!process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY && plansData.some(p => p.id !== 'free')) {
     console.warn("Stripe Publishable Key is not set. Payment features will be affected.");
  }

  return (
    <PublicPageLayout>
      <div className="container mx-auto px-4 md:px-6 py-8 md:py-12">
        <PageHeader
          title="Choose Your AgriAssist Plan"
          description="Flexible plans designed to fit the needs of every farm, from hobbyist to agribusiness."
          icon={Icons.Dollar}
        />
        <section className="mt-8"> {/* Added mt-8 for spacing after PageHeader */}
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
                    disabled={isLoadingPlanChange === plan.id || (plan.isCurrentPlan ?? false) || (!process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY && plan.id !== 'free')}
                    variant={plan.isCurrentPlan ? "outline" : "default"}
                  >
                    {isLoadingPlanChange === plan.id ? (
                      <> <Icons.Search className="mr-2 h-4 w-4 animate-spin" /> Processing... </>
                     ) : (
                      plan.actionLabel
                     )}
                  </Button>
                  {plan.id !== "free" && !process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY &&
                      <p className="text-xs text-destructive text-center mt-2">Stripe not configured for paid plans.</p>
                  }
                </div>
              </Card>
            ))}
          </div>
          <div className="mt-12 text-center">
            <p className="text-muted-foreground">
              All prices are in USD. For custom enterprise solutions or questions, please contact us.
            </p>
             {process.env.NODE_ENV === 'development' && !process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY && (
               <p className="text-destructive text-sm mt-2">
                 Warning: Stripe Publishable Key is missing. Payment features may not work correctly.
               </p>
             )}
          </div>
        </section>
      </div>
    </PublicPageLayout>
  );
}
