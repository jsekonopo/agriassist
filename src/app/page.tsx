
"use client";

import Image from 'next/image';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Icons } from '@/components/icons';
import { useAuth } from '@/contexts/auth-context';

export default function LandingPage() {
  const { isAuthenticated, logout, user } = useAuth();

  return (
    <div className="flex flex-col min-h-screen">
      <header className="px-4 lg:px-6 h-16 flex items-center border-b">
        <Link href="/" className="flex items-center justify-center" prefetch={false}>
          <Icons.Logo className="h-8 w-8 text-primary" />
          <span className="ml-2 text-xl font-semibold text-foreground">AgriAssist</span>
        </Link>
        <nav className="ml-auto flex gap-4 sm:gap-6 items-center">
          <Link
            href="/dashboard#features" // Assuming features are on dashboard or a section there
            className="text-sm font-medium hover:underline underline-offset-4 text-foreground"
            prefetch={false}
          >
            Features
          </Link>
          {/* <Link
            href="/pricing" // Placeholder for pricing page
            className="text-sm font-medium hover:underline underline-offset-4 text-foreground"
            prefetch={false}
          >
            Pricing
          </Link> */}
          {isAuthenticated ? (
            <>
              <span className="text-sm text-muted-foreground hidden sm:inline">Welcome, {user?.name || 'Farmer'}!</span>
              <Button variant="outline" size="sm" onClick={logout}>
                Logout
              </Button>
              <Button asChild size="sm">
                <Link href="/dashboard">Go to Dashboard</Link>
              </Button>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="text-sm font-medium hover:underline underline-offset-4 text-foreground"
                prefetch={false}
              >
                Login
              </Link>
              <Button asChild>
                <Link href="/register">Sign Up</Link>
              </Button>
            </>
          )}
        </nav>
      </header>
      <main className="flex-1">
        <section className="w-full py-12 md:py-24 lg:py-32 xl:py-48 bg-gradient-to-br from-primary/20 via-background to-background">
          <div className="container px-4 md:px-6">
            <div className="grid gap-6 lg:grid-cols-[1fr_400px] lg:gap-12 xl:grid-cols-[1fr_600px]">
              <div className="flex flex-col justify-center space-y-4">
                <div className="space-y-2">
                  <h1 className="text-3xl font-bold tracking-tighter sm:text-5xl xl:text-6xl/none text-foreground">
                    Smart Farming, Simplified with <span className="text-primary">AgriAssist</span>
                  </h1>
                  <p className="max-w-[600px] text-muted-foreground md:text-xl">
                    Your all-in-one platform for data-driven agriculture. Manage records, track resources, and get AI-powered insights to boost your farm&apos;s productivity and sustainability.
                  </p>
                </div>
                <div className="flex flex-col gap-2 min-[400px]:flex-row">
                  <Button size="lg" asChild>
                    <Link href={isAuthenticated ? "/dashboard" : "/register"}>
                      {isAuthenticated ? "Explore Dashboard" : "Get Started Free"}
                    </Link>
                  </Button>
                  <Button size="lg" variant="outline" asChild>
                     <Link href="/ai-expert">
                      Try AI Expert
                    </Link>
                  </Button>
                </div>
              </div>
              <Image
                src="https://placehold.co/600x400.png"
                alt="Farm illustration"
                data-ai-hint="modern farm technology"
                width={600}
                height={400}
                className="mx-auto aspect-video overflow-hidden rounded-xl object-cover sm:w-full lg:order-last lg:aspect-square shadow-lg"
              />
            </div>
          </div>
        </section>
        <section id="features" className="w-full py-12 md:py-24 lg:py-32 border-t">
          <div className="container px-4 md:px-6">
            <div className="flex flex-col items-center justify-center space-y-4 text-center">
              <div className="space-y-2">
                <div className="inline-block rounded-lg bg-secondary px-3 py-1 text-sm text-secondary-foreground">Key Features</div>
                <h2 className="text-3xl font-bold tracking-tighter sm:text-5xl text-foreground">
                  Everything Your Farm Needs to Thrive
                </h2>
                <p className="max-w-[900px] text-muted-foreground md:text-xl/relaxed lg:text-base/relaxed xl:text-xl/relaxed">
                  From data management to AI-driven advice, AgriAssist provides the tools to optimize your farming operations.
                </p>
              </div>
            </div>
            <div className="mx-auto grid max-w-5xl items-start gap-8 sm:grid-cols-2 md:gap-12 lg:grid-cols-3 lg:max-w-none mt-12">
              <div className="grid gap-1 p-6 rounded-lg border bg-card text-card-foreground shadow-sm">
                <Icons.Dashboard className="w-10 h-10 text-primary mb-2" />
                <h3 className="text-lg font-bold">Farm Overview Dashboard</h3>
                <p className="text-sm text-muted-foreground">Visualize key farm data and trends at a glance.</p>
              </div>
              <div className="grid gap-1 p-6 rounded-lg border bg-card text-card-foreground shadow-sm">
                <Icons.DataManagement className="w-10 h-10 text-primary mb-2" />
                <h3 className="text-lg font-bold">Integrated Data Management</h3>
                <p className="text-sm text-muted-foreground">Centralize planting, harvesting, soil, and weather records.</p>
              </div>
              <div className="grid gap-1 p-6 rounded-lg border bg-card text-card-foreground shadow-sm">
                <Icons.Analytics className="w-10 h-10 text-primary mb-2" />
                <h3 className="text-lg font-bold">Resource Tracking & Analytics</h3>
                <p className="text-sm text-muted-foreground">Monitor resource use and get insights for optimization.</p>
              </div>
              <div className="grid gap-1 p-6 rounded-lg border bg-card text-card-foreground shadow-sm">
                <Icons.AIExpert className="w-10 h-10 text-primary mb-2" />
                <h3 className="text-lg font-bold">AI Farm Expert</h3>
                <p className="text-sm text-muted-foreground">Get AI-powered advice for common farming challenges.</p>
              </div>
               <div className="grid gap-1 p-6 rounded-lg border bg-card text-card-foreground shadow-sm">
                <Icons.Tractor className="w-10 h-10 text-primary mb-2" />
                <h3 className="text-lg font-bold">Mobile Accessible</h3>
                <p className="text-sm text-muted-foreground">Access your farm data anytime, anywhere, even with limited connectivity.</p>
              </div>
               <div className="grid gap-1 p-6 rounded-lg border bg-card text-card-foreground shadow-sm">
                <Icons.Planting className="w-10 h-10 text-primary mb-2" />
                <h3 className="text-lg font-bold">Sustainable Practices</h3>
                <p className="text-sm text-muted-foreground">Guidance and tools to support eco-friendly farming.</p>
              </div>
            </div>
          </div>
        </section>
      </main>
      <footer className="flex flex-col gap-2 sm:flex-row py-6 w-full shrink-0 items-center px-4 md:px-6 border-t">
        <p className="text-xs text-muted-foreground">&copy; {new Date().getFullYear()} AgriAssist. All rights reserved.</p>
        <nav className="sm:ml-auto flex gap-4 sm:gap-6">
          <Link href="#" className="text-xs hover:underline underline-offset-4 text-muted-foreground" prefetch={false}>
            Terms of Service
          </Link>
          <Link href="#" className="text-xs hover:underline underline-offset-4 text-muted-foreground" prefetch={false}>
            Privacy
          </Link>
        </nav>
      </footer>
    </div>
  );
}
