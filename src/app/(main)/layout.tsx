
"use client"
import { AppSidebar } from '@/components/layout/app-sidebar';
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { Icons } from '@/components/icons';
import { useAuth } from '@/contexts/auth-context';
import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation'; 
import { Skeleton } from '@/components/ui/skeleton'; 

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isAuthenticated, isLoading, user, logoutUser } = useAuth(); // Updated to logoutUser
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      if (pathname !== '/login' && pathname !== '/register' && pathname !== '/') {
         router.push('/login');
      }
    }
  }, [isAuthenticated, isLoading, router, pathname]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="space-y-4 p-8 max-w-md w-full">
            <div className="flex items-center justify-center mb-6">
                 <Icons.Logo className="h-12 w-12 text-primary animate-pulse" />
            </div>
            <Skeleton className="h-8 w-3/4 mx-auto" />
            <Skeleton className="h-6 w-1/2 mx-auto" />
            <div className="flex justify-center pt-4">
                 <Icons.Search className="h-8 w-8 text-muted-foreground animate-spin" />
            </div>
            <p className="text-center text-muted-foreground">Loading AgriAssist...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated && !['/login', '/register', '/'].includes(pathname)) {
     return (
      <div className="flex min-h-screen items-center justify-center">
        <p>Redirecting to login...</p>
      </div>
    );
  }

  // If authenticated or on a public page, render layout or children
  if (!isAuthenticated && (pathname === '/login' || pathname === '/register' || pathname === '/')) {
     return <>{children}</>; // Render login/register/landing pages directly
  }


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
              {/* Placeholder for breadcrumbs or page title if needed */}
            </div>
            <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground hidden sm:inline">
                    {user?.name || 'Farmer'}
                </span>
                <Button variant="ghost" size="sm" onClick={logoutUser}> {/* Updated to logoutUser */}
                    <Icons.LogOut className="mr-2 h-4 w-4" />
                    Logout
                </Button>
            </div>
          </header>
          <main className="flex-1 p-4 md:p-6 lg:p-8 overflow-auto">
            {children}
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
