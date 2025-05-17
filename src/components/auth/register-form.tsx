
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
import { useState } from "react";
import { Icons } from "@/components/icons";
import { useAuth, type PlanId } from "@/contexts/auth-context";
import { FirebaseError } from "firebase/app";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { auth } from "@/lib/firebase"; // Import Firebase auth instance
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

const plans: { id: PlanId; name: string; price: string; description: string }[] = [
  { id: "free", name: "Hobbyist Farmer", price: "Free", description: "Basic features for small operations." },
  { id: "pro", name: "Pro Farmer", price: "$29/mo", description: "More capacity and features for growing farms." },
  { id: "agribusiness", name: "AgriBusiness", price: "$79/mo", description: "Comprehensive solution for larger operations." },
];

export function RegisterForm() {
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isLoading, setIsLoading] = useState(false);
  const { registerUser } = useAuth(); // registerUser now handles free plan path

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

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setIsLoading(true);
    try {
      if (values.selectedPlanId === "free") {
        const potentialRedirectPathFromRegisterUser = await registerUser(values.name, values.farmName, values.email, values.password);
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
        toast({ title: "Registration Successful", description: "Your account has been created. Welcome!" });

      } else { // Paid plan selected
        if (!process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY) {
          toast({ title: "Stripe Not Configured", description: "Stripe is not configured for paid plans.", variant: "destructive" });
          setIsLoading(false);
          return;
        }
        
        // 1. Create Firebase Auth user first to get UID
        const userCredential = await createUserWithEmailAndPassword(auth, values.email, values.password);
        const firebaseUser = userCredential.user;
        const idToken = await firebaseUser.getIdToken();

        // 2. Call API to initiate paid registration & get Stripe session
        const response = await fetch('/api/auth/initiate-paid-registration', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${idToken}`,
          },
          body: JSON.stringify({
            planId: values.selectedPlanId,
            name: values.name, // Pass name and farmName to create minimal user doc
            farmName: values.farmName
          }),
        });

        const data = await response.json();

        if (!response.ok || !data.success || !data.sessionId) {
          toast({ title: "Registration Error", description: data.message || "Could not initiate paid registration.", variant: "destructive" });
          // Potentially delete the Firebase Auth user if payment initiation fails severely
          // await firebaseUser.delete(); // Requires recent login for user.delete()
          setIsLoading(false);
          return;
        }

        // 3. Redirect to Stripe Checkout
        const stripe = await stripePromise;
        if (stripe) {
          const { error: stripeError } = await stripe.redirectToCheckout({ sessionId: data.sessionId });
          if (stripeError) {
            console.error("Stripe redirectToCheckout error:", stripeError);
            toast({ title: "Checkout Error", description: stripeError.message || "Could not redirect to Stripe Checkout.", variant: "destructive" });
            // Again, consider deleting the Firebase Auth user here
          }
          // If successful, Stripe redirects, no further client action here until user returns.
        } else {
          toast({ title: "Stripe Error", description: "Stripe.js failed to load.", variant: "destructive" });
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
    } finally {
      if (values.selectedPlanId === "free") setIsLoading(false); // Only reset loading for free plan here, paid plan redirects or shows error
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
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

        <FormField
          control={form.control}
          name="selectedPlanId"
          render={({ field }) => (
            <FormItem className="space-y-3">
              <FormLabel className="text-base font-semibold">Choose Your Plan</FormLabel>
              <FormControl>
                <RadioGroup
                  onValueChange={field.onChange}
                  defaultValue={field.value}
                  className="flex flex-col space-y-1"
                >
                  {plans.map(plan => (
                    <FormItem key={plan.id} className="flex items-center space-x-3 space-y-0 p-3 border rounded-md hover:bg-accent/50 has-[:checked]:bg-primary/10 has-[:checked]:border-primary">
                      <FormControl>
                        <RadioGroupItem value={plan.id} />
                      </FormControl>
                      <FormLabel className="font-normal cursor-pointer w-full">
                        <div className="flex justify-between items-center">
                          <span className="font-semibold">{plan.name}</span>
                          <span className="text-sm font-bold text-primary">{plan.price}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">{plan.description}</p>
                      </FormLabel>
                    </FormItem>
                  ))}
                </RadioGroup>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading ? (
            <>
              <Icons.User className="mr-2 h-4 w-4 animate-spin" />
              Processing...
            </>
          ) : (
            "Sign Up"
          )}
        </Button>
      </form>
    </Form>
  );
}

    