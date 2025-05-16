
"use client"; // Leaflet components need to be client-side

import { PageHeader } from '@/components/layout/page-header';
import { Icons } from '@/components/icons';
import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';

// Dynamically import the map component to ensure it's only loaded on the client
const FarmMapView = dynamic(
  () => import('@/components/map/farm-map-view').then((mod) => mod.FarmMapView),
  { 
    ssr: false,
    loading: () => (
      <div className="space-y-4">
        <Skeleton className="h-10 w-1/3" />
        <Skeleton className="h-[400px] w-full rounded-md" />
        <Skeleton className="h-6 w-2/3" />
      </div>
    )
  }
);

export default function FarmMapPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Farm Map View"
        description="Visualize your farm and field layouts. (Field plotting coming soon)"
        icon={Icons.Map}
      />
      <FarmMapView />
    </div>
  );
}
