
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

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isAuthenticated, isLoading, user, logoutUser } = useAuth();
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
                 <Icons.Search className="h-8 w-8 text-muted-foreground animate-spin" /> {/* Using Search as a generic loading spinner */}
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

  if (!isAuthenticated && (pathname === '/login' || pathname === '/register' || pathname === '/')) {
     return <>{children}</>; 
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
