
"use client"
import { AppSidebar } from '@/components/layout/app-sidebar';
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { Icons } from '@/components/icons';
import { useAuth } from '@/contexts/auth-context';
import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import Link from 'next/link';
import { AppNotifications } from '@/components/layout/app-notifications';

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isAuthenticated, isLoading, user, logoutUser } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = typeof window !== "undefined" ? window.location.search : "";


  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      // Construct redirect URL to pass current path for potential redirect back after login
      const currentPath = pathname + searchParams;
      router.push(`/login?redirect=${encodeURIComponent(currentPath)}`);
    }
  }, [isAuthenticated, isLoading, router, pathname, searchParams]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="w-full max-w-md space-y-6 text-center">
            <Icons.Logo className="h-16 w-16 text-primary mx-auto animate-pulse" />
            <Skeleton className="h-8 w-3/4 mx-auto mt-4" />
            <Skeleton className="h-6 w-1/2 mx-auto mt-2" />
            <div className="flex justify-center pt-6">
                 <Icons.Search className="h-10 w-10 text-muted-foreground animate-spin" />
            </div>
            <p className="text-muted-foreground mt-2">Loading AgriAssist application...</p>
        </div>
      </div>
    );
  }

  // If not authenticated (and loading is false), show a message while redirecting
  // This ensures nothing from the authenticated layout renders.
  if (!isAuthenticated) {
     return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="text-center">
          <Icons.Logo className="h-12 w-12 text-primary mx-auto mb-4 animate-pulse" />
          <p className="text-muted-foreground">Redirecting to login...</p>
        </div>
      </div>
    );
  }

  // If authenticated, render the main app layout
  return (
    <SidebarProvider defaultOpen={true}>
      <div className="flex min-h-screen">
        <AppSidebar />
        <SidebarInset className="flex flex-col flex-1">
          <header className="sticky top-0 z-10 flex h-14 items-center gap-4 border-b bg-background/80 backdrop-blur-sm px-4 lg:h-[60px] lg:px-6">
            <div className="md:hidden">
               <SidebarTrigger asChild>
                <Button variant="outline" size="icon">
                  <Icons.Menu className="h-5 w-5" />
                  <span className="sr-only">Toggle navigation menu</span>
                </Button>
              </SidebarTrigger>
            </div>
            <div className="flex-1">
              {/* Placeholder for potential breadcrumbs or page title */}
            </div>
            <AppNotifications />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-8 w-auto px-2 sm:px-3">
                  <div className="flex items-center gap-2">
                    <Icons.UserCircle className="h-5 w-5 sm:h-6 sm:w-6" />
                    <span className="hidden sm:inline text-sm text-muted-foreground">
                      {user?.name || user?.email || 'Farmer'}
                    </span>
                    <Icons.ChevronDown className="h-4 w-4 opacity-50 hidden sm:inline" />
                  </div>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56" align="end" forceMount>
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium leading-none">
                      {user?.name || 'AgriAssist User'}
                    </p>
                    <p className="text-xs leading-none text-muted-foreground">
                      {user?.email}
                    </p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/profile">
                    <Icons.User className="mr-2 h-4 w-4" />
                    <span>Profile</span>
                  </Link>
                </DropdownMenuItem>
                 <DropdownMenuItem asChild>
                  <Link href="/settings">
                    <Icons.Settings className="mr-2 h-4 w-4" />
                    <span>Settings</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={logoutUser}>
                  <Icons.LogOut className="mr-2 h-4 w-4" />
                  <span>Log out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </header>
          <main className="flex-1 p-4 md:p-6 lg:p-8 overflow-auto">
            {children}
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
