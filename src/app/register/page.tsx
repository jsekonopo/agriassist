
"use client";

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { RegisterForm } from '@/components/auth/register-form';
import { Icons } from '@/components/icons';
import Link from 'next/link';

export default function RegisterPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      const redirectUrl = searchParams.get('redirect');
       if (redirectUrl && redirectUrl.startsWith('/')) {
        try {
          const url = new URL(redirectUrl, window.location.origin);
          if (url.origin === window.location.origin) {
            router.push(redirectUrl);
            return;
          }
        } catch (e) {
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
            Create your AgriAssist Account
          </h1>
          <p className="mt-2 text-muted-foreground">
            Start managing your farm smarter, today.
          </p>
        </div>
        <RegisterForm />
        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{' '}
          <Link href="/login" className="font-medium text-primary hover:underline">
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}
