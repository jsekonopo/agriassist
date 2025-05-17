
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect } from "react";
import { Icons } from "@/components/icons";
import { useAuth, type PlanId } from "@/contexts/auth-context";
import { FirebaseError } from "firebase/app";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { auth } from "@/lib/firebase"; 
import { loadStripe } from '@stripe/stripe-js';

const stripePromise = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  ? loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
  : null;

const formSchema = z.object({
  name: z.string().min(2, { message: "Name must be at least 2 characters." }),
  farmName: z.string().min(2, { message: "Farm name must be at least 2 characters." }),
  email: z.string().email({ message: "Please enter a valid email address." }),
  password: z.string().min(6, { message: "Password must be at least 6 characters." }),
  confirmPassword: z.string(),
  selectedPlanId: z.custom<PlanId>((val) => ["free", "pro", "agribusiness"].includes(val as string), {
    message: "Please select a valid plan.",
  }),
}).refine(data => data.password === data.confirmPassword, {
  message: "Passwords do not match.",
  path: ["confirmPassword"],
});

const plans: { id: PlanId; name: string; price: string; description: string; features: string[] }[] = [
  { id: "free", name: "Hobbyist Farmer", price: "Free", description: "Basic features for small operations.", features: ["Up to 2 Fields", "Basic AI Expert Access"] },
  { id: "pro", name: "Pro Farmer", price: "$29/mo", description: "More capacity and features for growing farms.", features: ["Up to 10 Fields", "Full AI Expert Access", "Up to 2 Staff Accounts"] },
  { id: "agribusiness", name: "AgriBusiness", price: "$79/mo", description: "Comprehensive solution for larger operations.", features: ["Unlimited Fields", "Priority AI Expert Access", "Up to 10 Staff Accounts"] },
];

export function RegisterForm() {
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isLoading, setIsLoading] = useState(false);
  const { registerUser } = useAuth(); 
  const [currentStep, setCurrentStep] = useState(1);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      farmName: "",
      email: "",
      password: "",
      confirmPassword: "",
      selectedPlanId: "free",
    },
  });

  const { makeApiRequest } = useAuth(); // Get makeApiRequest from context

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setIsLoading(true);
    try {
      if (values.selectedPlanId === "free") {
        const potentialRedirectPathFromRegisterUser = await registerUser(values.name, values.farmName, values.email, values.password, values.selectedPlanId);
        
        toast({ title: "Registration Successful", description: "Your account has been created. Welcome!" });

        if (potentialRedirectPathFromRegisterUser) {
          router.push(potentialRedirectPathFromRegisterUser);
        } else {
          const redirectUrlFromLink = searchParams.get("redirect");
          if (redirectUrlFromLink && redirectUrlFromLink.startsWith('/')) {
            router.push(redirectUrlFromLink);
          } else {
            router.push("/dashboard");
          }
        }
      } else { 
        if (!process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || !stripePromise) {
          toast({ title: "Stripe Not Configured", description: "Stripe is not configured for paid plans. Please contact support.", variant: "destructive" });
          setIsLoading(false);
          return;
        }
        
        const userCredential = await createUserWithEmailAndPassword(auth, values.email, values.password);
        const firebaseUser = userCredential.user;
        const idToken = await firebaseUser.getIdToken();

        const responseData = await makeApiRequest('/api/auth/initiate-paid-registration', {
          planId: values.selectedPlanId,
          name: values.name,
          farmName: values.farmName
        });

        if (!responseData.success || !responseData.sessionId) {
          toast({ title: "Registration Error", description: responseData.message || "Could not initiate paid registration.", variant: "destructive" });
          await firebaseUser.delete().catch(delError => console.error("Error deleting temporary Firebase user:", delError));
          setIsLoading(false);
          return;
        }

        const stripe = await stripePromise;
        if (stripe) {
          const { error: stripeError } = await stripe.redirectToCheckout({ sessionId: responseData.sessionId });
          if (stripeError) {
            console.error("Stripe redirectToCheckout error:", stripeError);
            toast({ title: "Checkout Error", description: stripeError.message || "Could not redirect to Stripe Checkout.", variant: "destructive" });
            await firebaseUser.delete().catch(delError => console.error("Error deleting temporary Firebase user after Stripe redirect error:", delError));
            setIsLoading(false); // Stop loading if redirect fails
          }
          // If successful, Stripe redirects, no further client action here until user returns.
          // setIsLoading will remain true until redirect or error.
        } else {
          toast({ title: "Stripe Error", description: "Stripe.js failed to load.", variant: "destructive" });
          await firebaseUser.delete().catch(delError => console.error("Error deleting temporary Firebase user after Stripe.js load error:", delError));
          setIsLoading(false);
        }
      }
    } catch (error) {
      console.error("Registration error:", error);
      let description = "An unexpected error occurred. Please try again.";
      if (error instanceof FirebaseError) {
        switch (error.code) {
          case "auth/email-already-in-use":
            description = "This email address is already in use.";
            break;
          case "auth/invalid-email":
            description = "The email address is not valid.";
            break;
          case "auth/weak-password":
            description = "The password is too weak.";
            break;
          default:
            description = "Registration failed. Please try again.";
        }
      }
      toast({ title: "Registration Failed", description: description, variant: "destructive" });
      setIsLoading(false); // Ensure loading is stopped on error
    }
    // Removed setIsLoading(false) from here for paid plans, as Stripe redirect should occur
  }

  const handleNextStep = () => {
    // Trigger validation for selectedPlanId before proceeding
    form.trigger("selectedPlanId").then(isValid => {
        if (isValid) {
            setCurrentStep(2);
        } else {
            // Toast or inline message could also be used here
            form.setFocus("selectedPlanId");
        }
    });
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        {currentStep === 1 && (
          <div className="space-y-6 animate-in fade-in-50 duration-300">
            <FormField
              control={form.control}
              name="selectedPlanId"
              render={({ field }) => (
                <FormItem className="space-y-3">
                  <FormLabel className="text-xl font-semibold text-foreground">Step 1: Choose Your Plan</FormLabel>
                  <FormDescription>Select the plan that best fits your farm's needs.</FormDescription>
                  <FormControl>
                    <RadioGroup
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                      className="grid grid-cols-1 gap-4 pt-2"
                    >
                      {plans.map(plan => (
                        <FormItem 
                            key={plan.id} 
                            className="rounded-lg border p-4 hover:shadow-md transition-shadow data-[state=checked]:border-primary data-[state=checked]:ring-2 data-[state=checked]:ring-primary"
                            onClick={() => form.setValue("selectedPlanId", plan.id)}
                        >
                           <label className="flex flex-col cursor-pointer">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <FormControl>
                                            <RadioGroupItem value={plan.id} />
                                        </FormControl>
                                        <span className="font-semibold text-lg text-foreground">{plan.name}</span>
                                    </div>
                                    <span className="text-md font-bold text-primary">{plan.price}</span>
                                </div>
                                <p className="text-sm text-muted-foreground mt-1 pl-8">{plan.description}</p>
                                <ul className="list-disc list-inside text-xs text-muted-foreground mt-2 pl-10 space-y-0.5">
                                    {plan.features.map(f => <li key={f}>{f}</li>)}
                                </ul>
                           </label>
                        </FormItem>
                      ))}
                    </RadioGroup>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="button" onClick={handleNextStep} className="w-full" disabled={isLoading}>
              Next: Account Details <Icons.ChevronRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        )}

        {currentStep === 2 && (
          <div className="space-y-6 animate-in fade-in-50 duration-300">
            <h2 className="text-xl font-semibold text-foreground">Step 2: Your Account Details</h2>
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Full Name</FormLabel>
                  <FormControl>
                    <Input placeholder="John Doe" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="farmName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Farm Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Sunny Acres Farm" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email Address</FormLabel>
                  <FormControl>
                    <Input type="email" placeholder="name@example.com" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Password</FormLabel>
                  <FormControl>
                    <Input type="password" placeholder="••••••••" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="confirmPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Confirm Password</FormLabel>
                  <FormControl>
                    <Input type="password" placeholder="••••••••" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex flex-col sm:flex-row gap-2">
              <Button type="button" variant="outline" onClick={() => setCurrentStep(1)} className="w-full sm:w-auto" disabled={isLoading}>
                <Icons.ChevronRight className="mr-2 h-4 w-4 rotate-180" /> Previous: Choose Plan
              </Button>
              <Button type="submit" className="w-full sm:flex-1" disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Icons.User className="mr-2 h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  "Sign Up"
                )}
              </Button>
            </div>
          </div>
        )}
      </form>
    </Form>
  );
}

    