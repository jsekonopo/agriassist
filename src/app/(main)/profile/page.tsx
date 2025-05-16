
"use client";

import { useAuth } from '@/contexts/auth-context';
import { PageHeader } from '@/components/layout/page-header';
import { Icons } from '@/components/icons';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export default function ProfilePage() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="User Profile"
          description="View your account details."
          icon={Icons.UserCircle}
        />
        <Card className="shadow-lg">
          <CardHeader>
            <Skeleton className="h-7 w-1/3 mb-2" />
            <Skeleton className="h-4 w-1/2" />
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <Skeleton className="h-4 w-1/4" />
              <Skeleton className="h-6 w-3/4" />
            </div>
            <div className="space-y-1">
              <Skeleton className="h-4 w-1/4" />
              <Skeleton className="h-6 w-3/4" />
            </div>
            <div className="space-y-1">
              <Skeleton className="h-4 w-1/4" />
              <Skeleton className="h-6 w-3/4" />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="User Profile"
          description="View your account details."
          icon={Icons.UserCircle}
        />
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>Profile Not Found</CardTitle>
            <CardDescription>Please log in to view your profile.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/login">Go to Login</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="User Profile"
        description="Manage your account details and preferences."
        icon={Icons.UserCircle}
      />
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle>{user.name || 'N/A'}</CardTitle>
          <CardDescription>{user.email || 'No email provided'}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h3 className="text-sm font-medium text-muted-foreground">Full Name</h3>
            <p className="text-lg text-foreground">{user.name || 'Not set'}</p>
          </div>
          <div>
            <h3 className="text-sm font-medium text-muted-foreground">Email Address</h3>
            <p className="text-lg text-foreground">{user.email || 'Not set'}</p>
          </div>
          <div>
            <h3 className="text-sm font-medium text-muted-foreground">Farm Name</h3>
            <p className="text-lg text-foreground">{user.farmName || 'Not set'}</p>
          </div>
          {/* Add more profile fields here as needed */}
          {/* <Button variant="outline" disabled>Edit Profile (Coming Soon)</Button> */}
        </CardContent>
      </Card>
    </div>
  );
}
