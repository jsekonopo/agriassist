
"use client";

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { LoginForm } from '@/components/auth/login-form';
import { Icons } from '@/components/icons';
import Link from 'next/link';

export default function LoginPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      const redirectUrl = searchParams.get('redirect');
      if (redirectUrl && redirectUrl.startsWith('/')) {
        try {
          // Basic validation: Ensure it's not an external URL
          const url = new URL(redirectUrl, window.location.origin);
          if (url.origin === window.location.origin) {
            router.push(redirectUrl);
            return;
          }
        } catch (e) {
          // Invalid URL, fall through to dashboard
          console.warn("Invalid redirect URL:", redirectUrl);
        }
      }
      router.push('/dashboard');
    }
  }, [isAuthenticated, isLoading, router, searchParams]);

  if (isLoading || (!isLoading && isAuthenticated)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="text-center">
            <Icons.Logo className="h-12 w-12 text-primary mx-auto mb-4 animate-pulse" />
            <p className="text-muted-foreground">Loading session...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <Link href="/" className="inline-block mb-6">
            <Icons.Logo className="h-12 w-12 text-primary mx-auto" />
          </Link>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Welcome Back to AgriAssist
          </h1>
          <p className="mt-2 text-muted-foreground">
            Log in to manage your farm.
          </p>
        </div>
        <LoginForm />
        <p className="text-center text-sm text-muted-foreground">
          Don&apos;t have an account?{' '}
          <Link href="/register" className="font-medium text-primary hover:underline">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}
