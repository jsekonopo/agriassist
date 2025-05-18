
"use client";

import { useState, useMemo } from 'react';
import { PublicPageLayout } from '@/components/layout/public-page-layout';
import { PageHeader } from '@/components/layout/page-header';
import { Icons } from '@/components/icons';
import { Input } from '@/components/ui/input';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Card, CardContent } from '@/components/ui/card';

interface FAQItem {
  id: string;
  question: string;
  answer: string;
  keywords: string[];
}

const faqData: FAQItem[] = [
  {
    id: 'q1',
    question: 'What is AgriAssist?',
    answer: 'AgriAssist is a modern Farm Management and Precision Agriculture Platform designed to help small to medium-sized farms optimize operations, improve yields, and enhance sustainability through data-driven insights and AI-powered advice.',
    keywords: ['about', 'introduction', 'what is'],
  },
  {
    id: 'q2',
    question: 'How do I register for AgriAssist?',
    answer: 'You can register for AgriAssist by clicking the "Sign Up Free" button on our homepage or pricing page. The registration process involves selecting a plan and providing your account details. For paid plans, you will be guided through a secure payment process via Stripe.',
    keywords: ['register', 'signup', 'account', 'join', 'new user', 'plan'],
  },
  {
    id: 'q3',
    question: 'What are the main features of AgriAssist?',
    answer: 'AgriAssist offers a range of features including: Farm Dashboard, Visual Field Mapping, comprehensive Data Management (planting, harvesting, soil, weather, inputs, equipment, financials, livestock), AI Farm Expert for advice, Analytics & Reporting, Staff Collaboration, and User Settings. Visit our "Features" page for more details.',
    keywords: ['features', 'capabilities', 'tools', 'functions'],
  },
  {
    id: 'q4',
    question: 'How does the AI Farm Expert work?',
    answer: 'The AI Farm Expert uses advanced AI models to provide advice based on your inputs or farm data. You can ask general farming questions, diagnose plant health issues (with photos), get treatment plans, optimization strategies, advice on planting/harvesting windows, sustainable practices, and soil health interpretations.',
    keywords: ['ai', 'expert', 'artificial intelligence', 'advice', 'diagnosis', 'recommendations'],
  },
  {
    id: 'q5',
    question: 'Is my farm data secure?',
    answer: 'Yes, data security is a top priority. We use Firebase Authentication for secure logins and Firestore with robust security rules to ensure your data is protected and only accessible by authorized users associated with your farm. Payment processing is handled by Stripe, a PCI-compliant payment provider.',
    keywords: ['security', 'data', 'privacy', 'protection', 'safe'],
  },
  {
    id: 'q6',
    question: 'Can I manage multiple staff members?',
    answer: 'Yes! Farm owners and admins can invite staff members and assign them roles like Admin, Editor, or Viewer, controlling their access to data and features. This helps in collaborative farm management.',
    keywords: ['staff', 'team', 'users', 'collaboration', 'roles', 'permissions'],
  },
  {
    id: 'q7',
    question: 'What are the subscription plans?',
    answer: 'We offer a "Hobbyist Farmer" (Free) plan, a "Pro Farmer" plan, and an "AgriBusiness" plan, each with different feature sets and capacities to suit various farm sizes and needs. Please visit our "Pricing" page for detailed information.',
    keywords: ['pricing', 'subscription', 'plans', 'cost', 'billing'],
  },
  {
    id: 'q8',
    question: 'How do I set my farm\'s location for weather updates?',
    answer: 'If you are the farm owner, you can set your farm\'s latitude and longitude on your Profile page (in the edit mode). This location will be used to provide localized weather information on your Dashboard.',
    keywords: ['weather', 'location', 'profile', 'coordinates', 'map', 'dashboard'],
  },
  {
    id: 'q9',
    question: 'How do I manage notification preferences?',
    answer: 'You can manage your email notification preferences for various alerts (like task reminders, AI insights, weather alerts, staff activity) on the Settings page under "Notification Preferences".',
    keywords: ['notifications', 'alerts', 'email', 'settings', 'preferences'],
  },
  {
    id: 'q10',
    question: 'What if I forget my password?',
    answer: 'You can use the "Forgot Password?" link on the Login page to securely reset your password. An email with instructions will be sent to your registered email address.',
    keywords: ['password', 'reset', 'forgot', 'login', 'account recovery'],
  },
];

export default function HelpPage() {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredFaqs = useMemo(() => {
    if (!searchTerm.trim()) {
      return faqData;
    }
    const lowerCaseSearchTerm = searchTerm.toLowerCase();
    return faqData.filter(
      (item) =>
        item.question.toLowerCase().includes(lowerCaseSearchTerm) ||
        item.answer.toLowerCase().includes(lowerCaseSearchTerm) ||
        item.keywords.some(keyword => keyword.toLowerCase().includes(lowerCaseSearchTerm))
    );
  }, [searchTerm]);

  return (
    <PublicPageLayout>
      <div className="container mx-auto px-4 py-8 md:px-6 md:py-12">
        <PageHeader
          title="Help & FAQ"
          description="Find answers to common questions about AgriAssist. If you can't find what you're looking for, feel free to contact us."
          icon={Icons.Help}
        />
        <section className="mt-8">
          <Card className="shadow-lg">
            <CardContent className="p-6">
              <div className="mb-6">
                <Input
                  type="text"
                  placeholder="Search FAQs..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full max-w-lg text-base"
                  aria-label="Search FAQs"
                />
              </div>

              {filteredFaqs.length > 0 ? (
                <Accordion type="single" collapsible className="w-full">
                  {filteredFaqs.map((item) => (
                    <AccordionItem value={item.id} key={item.id}>
                      <AccordionTrigger className="text-lg hover:no-underline text-left">
                        {item.question}
                      </AccordionTrigger>
                      <AccordionContent className="text-base text-muted-foreground leading-relaxed whitespace-pre-line">
                        {item.answer}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              ) : (
                <p className="text-center text-muted-foreground py-8">
                  No FAQs found matching your search term. Try a different query or browse all questions.
                </p>
              )}
            </CardContent>
          </Card>
        </section>
      </div>
    </PublicPageLayout>
  );
}
