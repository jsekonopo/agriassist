
// src/app/contact/page.tsx
'use client';
import { PageHeader } from '@/components/layout/page-header';
import { Icons } from '@/components/icons';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { PublicPageLayout } from '@/components/layout/public-page-layout'; 

export default function ContactUsPage() {
  return (
    <PublicPageLayout>
      <div className="container mx-auto px-4 py-8 md:px-6 md:py-12">
        <PageHeader
          title="Contact AgriAssist"
          description="We're here to help. Reach out to us with your questions, feedback, or support needs."
          icon={Icons.Mail}
        />
        <div className="grid md:grid-cols-2 gap-8 md:gap-12 items-start mt-8"> {/* Added mt-8 here as PageHeader has mb */}
          <Card className="shadow-xl">
            <CardHeader>
              <CardTitle className="text-2xl">Get in Touch</CardTitle>
              <CardDescription>
                Fill out the form below, or use our contact details. We aim to respond within 24-48 business hours.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Placeholder for a future contact form */}
              <form className="space-y-4 opacity-50 cursor-not-allowed" onSubmit={(e) => e.preventDefault()}>
                <div>
                  <Label htmlFor="name">Full Name</Label>
                  <Input id="name" placeholder="Your Name" disabled />
                </div>
                <div>
                  <Label htmlFor="email">Email Address</Label>
                  <Input id="email" type="email" placeholder="your.email@example.com" disabled />
                </div>
                 <div>
                  <Label htmlFor="subject">Subject</Label>
                  <Input id="subject" placeholder="Regarding..." disabled />
                </div>
                <div>
                  <Label htmlFor="message">Message</Label>
                  <Textarea id="message" placeholder="Your message here..." className="min-h-[120px]" disabled />
                </div>
                <Button type="submit" disabled className="w-full">Send Message (Coming Soon)</Button>
              </form>
               <p className="text-sm text-center text-muted-foreground pt-4">
                Contact form functionality is under development. Please use the details below for now.
              </p>
            </CardContent>
          </Card>

          <Card className="shadow-xl">
            <CardHeader>
              <CardTitle className="text-2xl">Contact Information</CardTitle>
              <CardDescription>Find us or send us mail.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start gap-3">
                <Icons.Mail className="w-6 h-6 text-primary flex-shrink-0 mt-1" />
                <div>
                  <h3 className="font-semibold">Email Us</h3>
                  <p className="text-muted-foreground">For general inquiries: <a href="mailto:info@agriassist.example.com" className="text-primary hover:underline">info@agriassist.example.com</a></p>
                  <p className="text-muted-foreground">For support: <a href="mailto:support@agriassist.example.com" className="text-primary hover:underline">support@agriassist.example.com</a></p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Icons.Location className="w-6 h-6 text-primary flex-shrink-0 mt-1" />
                <div>
                  <h3 className="font-semibold">Our Office (Conceptual)</h3>
                  <p className="text-muted-foreground">123 AgriTech Avenue<br />Ottawa, Ontario, K1A 0A1<br />Canada</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Icons.Help className="w-6 h-6 text-primary flex-shrink-0 mt-1" />
                <div>
                  <h3 className="font-semibold">Looking for Help?</h3>
                  <p className="text-muted-foreground">Check out our <Link href="/features" className="text-primary hover:underline">Features Overview</Link> or visit our future FAQ section.</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

         <section className="text-center py-16 md:py-24">
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">Let's Grow Together</h2>
          <p className="mt-4 max-w-2xl mx-auto text-lg text-muted-foreground">
            Your feedback and questions are invaluable as we continue to develop AgriAssist.
          </p>
          <div className="mt-8 flex justify-center">
            <Button size="lg" variant="outline" asChild className="shadow-lg hover:shadow-accent/30 transition-shadow">
              <Link href="/pricing">View Our Plans</Link>
            </Button>
          </div>
        </section>
      </div>
    </PublicPageLayout>
  );
}
