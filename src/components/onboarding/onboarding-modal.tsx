
"use client";

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Icons } from "@/components/icons";
import Link from 'next/link';
import { Separator } from '../ui/separator';
import * as DialogPrimitive from "@radix-ui/react-dialog"; // Import DialogPrimitive

interface OnboardingModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: () => Promise<void>;
}

const onboardingSteps = [
  {
    title: "Welcome to AgriAssist!",
    icon: Icons.Logo,
    description: "We're excited to help you manage your farm more effectively. Let's get you started with a few quick steps.",
    actionText: "Next: Your Farm",
    actionLink: null,
  },
  {
    title: "Set Up Your Farm Profile",
    icon: Icons.Settings,
    description: "Your farm's name is already set from registration. Adding your farm's location (Latitude/Longitude) helps provide localized weather on your Dashboard. You can do this now or later from your Profile page.",
    actionText: "Go to Profile (Optional)",
    actionLink: "/profile",
    nextButtonText: "Next: Define Fields",
  },
  {
    title: "Define Your Fields",
    icon: Icons.Location,
    description: "Fields are the foundation of your farm records. Defining them allows you to accurately log planting, harvesting, soil data, and more. Let's add your first field!",
    actionText: "Go to Data Management (Fields)",
    actionLink: "/data-management?tab=fields",
    nextButtonText: "Next: Explore AI Expert",
  },
  {
    title: "Discover the AI Farm Expert",
    icon: Icons.AIExpert,
    description: "Get intelligent advice on plant health, optimization strategies, sustainable practices, and more. The AI Expert is here to support your decisions.",
    actionText: "Explore AI Expert",
    actionLink: "/ai-expert",
    nextButtonText: "Finish Onboarding",
  },
  {
    title: "You're All Set!",
    icon: Icons.CheckCircle2,
    description: "You've completed the basic setup. Feel free to explore all the features AgriAssist has to offer. Happy farming!",
    actionText: "Go to Dashboard",
    actionLink: "/dashboard",
    isFinalStep: true,
  },
];

export function OnboardingModal({ isOpen, onOpenChange, onComplete }: OnboardingModalProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [isCompleting, setIsCompleting] = useState(false);

  const stepData = onboardingSteps[currentStep];
  const IconComponent = stepData.icon;

  const handleNext = () => {
    if (currentStep < onboardingSteps.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleFinish = async () => {
    setIsCompleting(true);
    await onComplete();
    setIsCompleting(false);
    // Parent component (Dashboard) will handle closing the modal by setting isOpen to false
  };

  const handleDialogInteraction = (event: Event) => {
    event.preventDefault(); // Prevent closing via Escape or overlay click
  };


  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      // Only allow programmatic close or via specific actions
      if (!open && !isCompleting && !stepData.isFinalStep) {
        return;
      }
      onOpenChange(open);
    }}>
      <DialogContent 
        className="sm:max-w-lg" 
        onEscapeKeyDown={handleDialogInteraction} 
        onPointerDownOutside={handleDialogInteraction}
      >
        {/* Remove the default close button that comes with DialogPrimitive.Close */}
        {/* <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground sr-only">
            <Icons.X className="h-4 w-4" />
            <span className="sr-only">Close</span>
        </DialogPrimitive.Close> */}

        <DialogHeader className="text-center items-center">
          {IconComponent && <IconComponent className="h-12 w-12 text-primary mb-3" />}
          <DialogTitle className="text-2xl font-semibold">{stepData.title}</DialogTitle>
          <DialogDescription className="text-muted-foreground px-4">
            {stepData.description}
          </DialogDescription>
        </DialogHeader>
        
        <Separator className="my-4" />

        {stepData.actionLink && (
          <div className="my-4 text-center">
            <Button variant="outline" asChild>
              <Link href={stepData.actionLink} onClick={() => { /* Keep modal open */ }} target="_blank" rel="noopener noreferrer">
                {stepData.actionText} <Icons.ChevronRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <p className="text-xs text-muted-foreground mt-1">
              This action will open in a new tab. You can return here to continue.
            </p>
          </div>
        )}

        <DialogFooter className="mt-6 sm:justify-between gap-2">
          {currentStep > 0 && !stepData.isFinalStep && (
            <Button variant="outline" onClick={handlePrevious} disabled={isCompleting}>
              <Icons.ChevronRight className="mr-2 h-4 w-4 rotate-180" /> Previous
            </Button>
          )}
          {!stepData.isFinalStep ? (
            <Button onClick={handleNext} className="ml-auto sm:ml-0" disabled={isCompleting}>
              {stepData.nextButtonText || "Next"} <Icons.ChevronRight className="ml-2 h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={handleFinish} className="w-full sm:w-auto" disabled={isCompleting}>
              {isCompleting ? <Icons.Search className="mr-2 h-4 w-4 animate-spin" /> : <Icons.CheckCircle2 className="mr-2 h-4 w-4" />}
              {isCompleting ? "Finishing..." : "Complete Onboarding"}
            </Button>
          )}
        </DialogFooter>
         <div className="flex justify-center mt-2">
            <p className="text-xs text-muted-foreground">
              Step {currentStep + 1} of {onboardingSteps.length}
            </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
