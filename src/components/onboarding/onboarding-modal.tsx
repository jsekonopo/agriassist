
"use client";

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Icons } from "@/components/icons";
import Link from 'next/link';
import { Separator } from '../ui/separator';
import type { LucideIcon } from 'lucide-react';

interface OnboardingStep {
  title: string;
  icon: LucideIcon;
  description: string;
  actionText?: string;
  actionLink?: string | null; // Can be null if no direct link for this step
  nextButtonText?: string;
  isFinalStep?: boolean;
}

const onboardingSteps: OnboardingStep[] = [
  {
    title: "Welcome to AgriAssist!",
    icon: Icons.Logo,
    description: "We're excited to help you manage your farm more effectively. Let's get you started with a few quick steps to make the most out of the platform.",
    nextButtonText: "Next: Your Farm Profile",
  },
  {
    title: "Set Up Your Farm Profile",
    icon: Icons.Settings,
    description: "Your farm's name was set during registration. Adding your farm's approximate location (Latitude/Longitude) helps provide localized weather on your Dashboard and can improve AI insights. You can do this now or update it later from your Profile page if you are the farm owner.",
    actionText: "Go to Profile",
    actionLink: "/profile",
    nextButtonText: "Next: Define Your Fields",
  },
  {
    title: "Define Your Fields",
    icon: Icons.Location,
    description: "Fields are the foundation of your farm records. Defining them allows you to accurately log planting, harvesting, soil data, and more. Let's head to Data Management to add your first field!",
    actionText: "Define First Field",
    actionLink: "/data-management?tab=fields",
    nextButtonText: "Next: Explore AI Expert",
  },
  {
    title: "Discover the AI Farm Expert",
    icon: Icons.AIExpert,
    description: "Get intelligent advice on plant health, optimization strategies, sustainable practices, and more. The AI Farm Expert is here to support your decisions. Try asking a question or diagnosing a plant!",
    actionText: "Explore AI Expert",
    actionLink: "/ai-expert",
    nextButtonText: "Finish Onboarding",
  },
  {
    title: "You're All Set!",
    icon: Icons.CheckCircle2,
    description: "You've completed the basic setup guidance. Feel free to explore all the features AgriAssist has to offer, log your data, and get valuable insights. Happy farming!",
    nextButtonText: "Go to Dashboard",
    isFinalStep: true,
  },
];

interface OnboardingModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: () => Promise<void>;
}

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
    // Parent component (Dashboard) will set isOpen to false
  };

  const handleDialogInteraction = (event: Event) => {
    event.preventDefault();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      if (!open && !isCompleting && !stepData.isFinalStep) {
        return; 
      }
      onOpenChange(open);
    }}>
      <DialogContent 
        className="sm:max-w-lg p-6 rounded-lg shadow-xl" 
        onEscapeKeyDown={handleDialogInteraction} 
        onPointerDownOutside={handleDialogInteraction}
      >
        <DialogHeader className="text-center items-center pt-4">
          {IconComponent && <IconComponent className="h-12 w-12 text-primary mb-3" />}
          <DialogTitle className="text-2xl font-semibold text-foreground">{stepData.title}</DialogTitle>
          <DialogDescription className="text-muted-foreground px-4 text-sm">
            {stepData.description}
          </DialogDescription>
        </DialogHeader>
        
        <Separator className="my-6" />

        {stepData.actionLink && stepData.actionText && (
          <div className="my-4 text-center">
            <Button variant="outline" asChild className="shadow-sm hover:shadow-md transition-shadow">
              <Link href={stepData.actionLink} target="_blank" rel="noopener noreferrer">
                {stepData.actionText} <Icons.ChevronRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <p className="text-xs text-muted-foreground mt-1.5">
              This action will open in a new tab. You can return here to continue.
            </p>
          </div>
        )}

        <DialogFooter className="mt-8 sm:justify-between gap-2 flex-col sm:flex-row">
          <div className="flex w-full justify-center sm:justify-start">
            <p className="text-xs text-muted-foreground self-center">
              Step {currentStep + 1} of {onboardingSteps.length}
            </p>
          </div>
          <div className="flex gap-2 w-full sm:w-auto justify-end">
            {currentStep > 0 && !stepData.isFinalStep && (
              <Button variant="outline" onClick={handlePrevious} disabled={isCompleting} className="shadow-sm">
                <Icons.ChevronRight className="mr-2 h-4 w-4 rotate-180" /> Previous
              </Button>
            )}
            {!stepData.isFinalStep ? (
              <Button onClick={handleNext} disabled={isCompleting} className="shadow-sm bg-primary hover:bg-primary/90">
                {stepData.nextButtonText || "Next"} <Icons.ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            ) : (
              <Button onClick={handleFinish} className="w-full sm:w-auto shadow-sm bg-green-600 hover:bg-green-700 text-white" disabled={isCompleting}>
                {isCompleting ? <Icons.Search className="mr-2 h-4 w-4 animate-spin" /> : <Icons.CheckCircle2 className="mr-2 h-4 w-4" />}
                {isCompleting ? "Finishing..." : (stepData.nextButtonText || "Complete Onboarding")}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
