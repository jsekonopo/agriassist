
"use client";

import Link from 'next/link';
import Image from 'next/image';
import { Icons } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/auth-context';
import { publicNavItems } from '@/lib/navigation';

interface PublicPageLayoutProps {
  children: React.ReactNode;
}

export function PublicPageLayout({ children }: PublicPageLayoutProps) {
  const { isAuthenticated, logoutUser, user } = useAuth();

  return (
    <div className="flex flex-col min-h-screen bg-gradient-to-br from-primary/10 via-background to-background">
      <header className="px-4 lg:px-6 h-16 flex items-center border-b bg-background/80 backdrop-blur-sm sticky top-0 z-50">
        <Link href="/" className="flex items-center justify-center" prefetch={false}>
          <Icons.Logo className="h-8 w-8 text-primary" />
          <span className="ml-2 text-xl font-semibold text-foreground">AgriAssist</span>
        </Link>
        <nav className="ml-auto flex gap-2 sm:gap-4 items-center">
          {publicNavItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-sm font-medium hover:underline underline-offset-4 text-foreground"
              prefetch={false}
            >
              {item.title}
            </Link>
          ))}
          {isAuthenticated ? (
            <>
              <span className="text-sm text-muted-foreground hidden md:inline">Welcome, {user?.name || 'Farmer'}!</span>
              <Button variant="outline" size="sm" onClick={logoutUser}> 
                Logout
              </Button>
              <Button asChild size="sm">
                <Link href="/dashboard">Dashboard</Link>
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
                <Link href="/register">Sign Up Free</Link>
              </Button>
            </>
          )}
        </nav>
      </header>
      <main className="flex-1 pt-20 md:pt-24"> {/* Added top padding here */}
        {children}
      </main>
      <footer className="flex flex-col gap-2 sm:flex-row py-6 w-full shrink-0 items-center px-4 md:px-6 border-t bg-background">
        <p className="text-xs text-muted-foreground">&copy; {new Date().getFullYear()} AgriAssist. All rights reserved.</p>
        <nav className="sm:ml-auto flex gap-4 sm:gap-6">
          {publicNavItems.map((item) => (
             <Link
              key={item.href}
              href={item.href}
              className="text-xs hover:underline underline-offset-4 text-muted-foreground"
              prefetch={false}
            >
              {item.title}
            </Link>
          ))}
          <Link href="/terms" className="text-xs hover:underline underline-offset-4 text-muted-foreground" prefetch={false}>
            Terms of Service
          </Link>
          <Link href="/privacy" className="text-xs hover:underline underline-offset-4 text-muted-foreground" prefetch={false}>
            Privacy
          </Link>
        </nav>
      </footer>
    </div>
  );
}
