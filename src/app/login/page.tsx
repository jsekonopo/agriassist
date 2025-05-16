
import { LoginForm } from '@/components/auth/login-form';
import { Icons } from '@/components/icons';
import Link from 'next/link';

export default function LoginPage() {
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
