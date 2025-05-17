
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
    description: "Your farm's name is already set from registration. Adding your farm's location (Latitude/Longitude) helps provide localized weather on your Dashboard. You can do this now or later from your Profile.",
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
    // onOpenChange(false); // The parent component (Dashboard) will handle closing the modal
  };

  // Prevent closing by Escape key or overlay click
  const handleDialogInteraction = (event: Event) => {
    event.preventDefault();
  };


  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent 
        className="sm:max-w-lg" 
        onEscapeKeyDown={handleDialogInteraction} 
        onPointerDownOutside={handleDialogInteraction}
        hideCloseButton={true} // Custom prop to hide default X, if DialogContent supported it
      >
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
              <Link href={stepData.actionLink} onClick={() => onOpenChange(false)} target="_blank" rel="noopener noreferrer">
                {stepData.actionText} <Icons.ChevronRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <p className="text-xs text-muted-foreground mt-1">
              This will open in a new tab. You can return here to continue onboarding.
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
      </