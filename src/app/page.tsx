
"use client";

import Image from 'next/image';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Icons } from '@/components/icons';
import { PublicPageLayout } from '@/components/layout/public-page-layout'; // Import the layout

export default function LandingPage() {
  return (
    <PublicPageLayout>
      <section className="w-full py-12 md:py-24 lg:py-32 xl:py-40">
        <div className="container px-4 md:px-6">
          <div className="grid gap-6 lg:grid-cols-[1fr_450px] lg:gap-12 xl:grid-cols-[1fr_550px]">
            <div className="flex flex-col justify-center space-y-6">
              <div className="space-y-3">
                <h1 className="text-4xl font-bold tracking-tighter sm:text-5xl xl:text-6xl/none text-foreground">
                  Unlock Your Farm's Potential with <span className="text-primary">AgriAssist</span>
                </h1>
                <p className="max-w-[600px] text-muted-foreground md:text-xl">
                  The all-in-one platform empowering modern farmers. Seamlessly manage data, optimize resources, leverage AI-driven insights, and cultivate sustainability for a more profitable and efficient farm.
                </p>
              </div>
              <div className="flex flex-col gap-3 min-[400px]:flex-row">
                <Button size="lg" asChild className="shadow-lg hover:shadow-primary/30 transition-shadow">
                  <Link href="/register">
                    Start Farming Smarter
                  </Link>
                </Button>
                <Button size="lg" variant="outline" asChild className="shadow-lg hover:shadow-accent/30 transition-shadow">
                   <Link href="/features">
                    Explore Features
                  </Link>
                </Button>
              </div>
            </div>
            <Image
              src="/static/hero-image.svg"
              alt="Illustration of modern farming technology integrating with nature"
              width={550}
              height={550}
              className="mx-auto aspect-square overflow-hidden rounded-xl object-contain sm:w-full lg:order-last"
            />
          </div>
        </div>
      </section>
      
      <section id="why-agriassist" className="w-full py-12 md:py-24 lg:py-32 bg-muted/50 border-t">
        <div className="container px-4 md:px-6">
          <div className="flex flex-col items-center justify-center space-y-4 text-center mb-12">
            <div className="inline-block rounded-lg bg-secondary px-3 py-1 text-sm text-secondary-foreground shadow">Why Choose AgriAssist?</div>
            <h2 className="text-3xl font-bold tracking-tighter sm:text-5xl text-foreground">
              Your Partner in Smart & Sustainable Farming
            </h2>
            <p className="max-w-[900px] text-muted-foreground md:text-xl/relaxed lg:text-base/relaxed xl:text-xl/relaxed">
              We provide intuitive tools to overcome modern agricultural challenges, helping you increase yield, optimize resource use, and embrace sustainable practices with confidence.
            </p>
          </div>
          <div className="mx-auto grid max-w-5xl items-start gap-8 sm:grid-cols-2 md:gap-12 lg:grid-cols-3 lg:max-w-none">
            <BenefitCard icon={Icons.DataManagement} title="Unified Data Hub" description="Centralize all your farm records – from field activities to finances – in one accessible platform. Say goodbye to scattered spreadsheets."/>
            <BenefitCard icon={Icons.AIExpert} title="AI-Powered Insights" description="Leverage our Farm Expert for tailored advice on crop health, optimization strategies, and sustainable practices, turning data into actionable decisions."/>
            <BenefitCard icon={Icons.Recycle} title="Sustainability Focused" description="Easily track and implement sustainable practices. We provide tools to help you work towards environmental stewardship and potential carbon credit opportunities."/>
            <BenefitCard icon={Icons.Dollar} title="Cost-Effective Solution" description="Access powerful AgTech features without the hefty price tag. Our affordable plans are designed for small to medium-sized farms."/>
            <BenefitCard icon={Icons.Smartphone} title="User-Friendly & Accessible" description="Designed for ease of use, regardless of your tech expertise. Access your farm data anytime, anywhere with our mobile-responsive platform."/>
            <BenefitCard icon={Icons.TrendingUp} title="Future-Ready Farming" description="Build a foundation for data-driven decisions, preparing your farm for advanced precision agriculture and emerging market opportunities."/>
          </div>
        </div>
      </section>

      <section id="features-overview" className="w-full py-12 md:py-24 lg:py-32 border-t bg-background">
        <div className="container px-4 md:px-6">
          <div className="flex flex-col items-center justify-center space-y-4 text-center">
            <div className="inline-block rounded-lg bg-secondary px-3 py-1 text-sm text-secondary-foreground shadow">Core Features</div>
            <h2 className="text-3xl font-bold tracking-tighter sm:text-5xl text-foreground">
              Tools to Cultivate Success
            </h2>
            <p className="max-w-[900px] text-muted-foreground md:text-xl/relaxed lg:text-base/relaxed xl:text-xl/relaxed">
              AgriAssist provides a comprehensive suite of features to streamline every aspect of your farm management.
            </p>
          </div>
          <div className="mx-auto grid max-w-5xl items-start gap-8 sm:grid-cols-2 md:gap-12 lg:grid-cols-3 lg:max-w-none mt-12">
            <FeatureCard icon={Icons.Map} title="Visual Field Mapping" description="Define and visualize your fields, eventually with boundary drawing and detailed overlays."/>
            <FeatureCard icon={Icons.DataManagement} title="Integrated Data Logging" description="Easily record planting, harvesting, soil tests, inputs, equipment, finances, and more."/>
            <FeatureCard icon={Icons.Analytics} title="Farm Analytics & Reporting" description="Track resource usage, yields, and financial performance with intuitive charts and summaries."/>
            <FeatureCard icon={Icons.AIExpert} title="AI Farm Expert" description="Get AI-powered advice for crop health, optimization, sustainability, and timing."/>
            <FeatureCard icon={Icons.Users} title="Staff Collaboration" description="Manage farm access for your team members with role-based permissions."/>
            <FeatureCard icon={Icons.Settings} title="Customizable Settings" description="Tailor the platform to your needs with preferences for units, notifications, and themes."/>
          </div>
           <div className="text-center mt-12">
              <Button size="lg" asChild className="shadow-lg hover:shadow-primary/30 transition-shadow">
                  <Link href="/features">Discover All Features</Link>
              </Button>
          </div>
        </div>
      </section>

      <section className="w-full py-12 md:py-24 lg:py-32 border-t bg-primary/10">
        <div className="container grid items-center justify-center gap-4 px-4 text-center md:px-6">
          <div className="space-y-3">
            <h2 className="text-3xl font-bold tracking-tighter md:text-4xl/tight text-foreground">
              Ready to Grow with AgriAssist?
            </h2>
            <p className="mx-auto max-w-[600px] text-muted-foreground md:text-xl/relaxed lg:text-base/relaxed xl:text-xl/relaxed">
              Join a community of forward-thinking farmers. Sign up for AgriAssist today and take the first step towards a more efficient, sustainable, and profitable future.
            </p>
          </div>
          <div className="mx-auto w-full max-w-sm space-y-2">
            <Button size="lg" asChild className="w-full shadow-lg hover:shadow-primary/40 transition-shadow">
              <Link href="/register">Sign Up for Free</Link>
            </Button>
            <p className="text-xs text-muted-foreground">
              Explore our <Link href="/pricing" className="underline underline-offset-2 text-primary hover:text-primary/80">pricing plans</Link> to find the perfect fit for your farm.
            </p>
          </div>
        </div>
      </section>
    </PublicPageLayout>
  );
}

interface CardProps {
  icon: React.ElementType;
  title: string;
  description: string;
}

function FeatureCard({ icon: Icon, title, description }: CardProps) {
  return (
    <div className="grid gap-2 p-6 rounded-lg border bg-card text-card-foreground shadow-md hover:shadow-lg transition-shadow">
      <Icon className="w-10 h-10 text-primary mb-2" />
      <h3 className="text-lg font-bold">{title}</h3>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

function BenefitCard({ icon: Icon, title, description }: CardProps) {
  return (
    <div className="flex flex-col items-center text-center gap-2 p-6 rounded-lg border bg-background/70 text-card-foreground shadow-lg hover:shadow-primary/20 transition-shadow">
      <div className="bg-primary/10 p-3 rounded-full mb-3">
        <Icon className="w-8 h-8 text-primary" />
      </div>
      <h3 className="text-xl font-semibold">{title}</h3>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
