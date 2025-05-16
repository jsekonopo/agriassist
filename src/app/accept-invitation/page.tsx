
"use client";

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Icons } from '@/components/icons';
import Link from 'next/link';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';

type InvitationStatus = 'initial_loading' | 'prompt_login' | 'processing_token' | 'success' | 'error';

function AcceptInvitationContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { firebaseUser, isLoading: authLoading, refreshUserData } = useAuth();
  const { toast } = useToast();
  
  const [status, setStatus] = useState<InvitationStatus>('initial_loading');
  const [message, setMessage] = useState<string | null>(null);
  const [processedApiCall, setProcessedApiCall] = useState(false);

  const token = searchParams.get('token');

  useEffect(() => {
    if (authLoading) {
      setStatus('initial_loading');
      setMessage('Loading user session...');
      return;
    }

    if (!token) {
      setStatus('error');
      setMessage('Invitation token is missing or invalid.');
      setProcessedApiCall(true);
      return;
    }

    if (!firebaseUser) {
      setStatus('prompt_login');
      setMessage('Please log in or register with the invited email address to accept this invitation. Once logged in, please return to this page or click the invitation link again if not redirected automatically.');
      return;
    }

    if (!processedApiCall) {
      setStatus('processing_token');
      setMessage('Verifying your invitation...');

      const processToken = async () => {
        try {
          const idToken = await firebaseUser.getIdToken();
          const response = await fetch('/api/farm/invitations/process-token', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${idToken}`,
            },
            body: JSON.stringify({ invitationToken: token }),
          });

          const result = await response.json();

          if (response.ok && result.success) {
            setStatus('success');
            setMessage(result.message || 'Invitation accepted successfully! You are now part of the farm.');
            toast({ title: 'Success', description: result.message || 'Invitation accepted!' });
            await refreshUserData(); 
            router.push('/profile'); 
          } else {
            setStatus('error');
            setMessage(result.message || 'Failed to process invitation. The token might be invalid, expired, already used, or you might not be authorized for this invitation.');
            toast({ title: 'Error', description: result.message || 'Could not process invitation.', variant: 'destructive' });
          }
        } catch (err) {
          console.error('Error processing invitation token:', err);
          setStatus('error');
          setMessage('An unexpected error occurred while processing your invitation. Please try again later or contact support.');
          toast({ title: 'Error', description: 'An unexpected error occurred.', variant: 'destructive' });
        } finally {
          setProcessedApiCall(true);
        }
      };
      processToken();
    }
  }, [token, firebaseUser, authLoading, router, toast, refreshUserData, processedApiCall]);

  const getRedirectUrl = () => {
    if (typeof window !== "undefined") {
      // Pass the current URL (including the token) as the redirect target
      return encodeURIComponent(window.location.pathname + window.location.search);
    }
    return '';
  };
  
  if (status === 'initial_loading' || (status === 'processing_token' && !processedApiCall)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[300px]">
        <Icons.Search className="h-12 w-12 text-primary animate-spin mb-4" />
        <p className="text-muted-foreground">{authLoading ? 'Loading user session...' : 'Preparing to process invitation...'}</p>
        <Skeleton className="h-4 w-3/4 mt-4" />
        <Skeleton className="h-4 w-1/2 mt-2" />
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto">
      {status === 'processing_token' && processedApiCall && ( // Show processing only after API call started
        <div className="flex flex-col items-center justify-center min-h-[200px]">
          <Icons.Search className="h-10 w-10 text-primary animate-spin mb-4" />
          <p className="text-lg font-medium text-center">{message || 'Verifying your invitation...'}</p>
        </div>
      )}
      {status === 'success' && (
        <Card className="bg-green-50 border-green-200 shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-green-700">
              <Icons.CheckCircle2 className="h-6 w-6" />
              Invitation Accepted!
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-green-600">{message}</p>
            <Button onClick={() => router.push('/dashboard')} className="mt-4 w-full">
              Go to Dashboard
            </Button>
          </CardContent>
        </Card>
      )}
      {status === 'error' && (
        <Card className="bg-red-50 border-red-200 shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-700">
              <Icons.AlertCircle className="h-6 w-6" />
              Invitation Error
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-red-600">{message}</p>
            <Button onClick={() => router.push('/profile')} className="mt-4 w-full" variant="outline">
              Go to My Profile
            </Button>
          </CardContent>
        </Card>
      )}
      {status === 'prompt_login' && (
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-primary">
              <Icons.Info className="h-6 w-6" />
              Authentication Required
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">{message}</p>
            <div className="flex flex-col sm:flex-row gap-2">
              <Button asChild className="flex-1">
                <Link href={`/login?redirect=${getRedirectUrl()}`}>Login</Link>
              </Button>
              <Button asChild variant="outline" className="flex-1">
                <Link href={`/register?redirect=${getRedirectUrl()}`}>Register</Link>
              </Button>
            </div>
            <p className="text-xs text-muted-foreground text-center pt-2">
                After logging in or registering, you should be automatically redirected to process the invitation. If not, please click the link from your email again.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}


export default function AcceptInvitationPage() {
  return (
    <div className="container mx-auto px-4 py-8 md:py-12">
      <div className="flex justify-center mb-8">
        <Link href="/" className="flex items-center gap-2">
          <Icons.Logo className="h-10 w-10 text-primary" />
          <span className="text-2xl font-semibold">AgriAssist</span>
        </Link>
      </div>
      <Suspense fallback={<div className="text-center p-8"><Icons.Search className="h-12 w-12 text-primary animate-spin mx-auto" /><p className="mt-2 text-muted-foreground">Loading invitation details...</p></div>}>
        <AcceptInvitationContent />
      </Suspense>
    </div>
  );
}

    