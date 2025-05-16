
"use client";

import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-defaulticon-compatibility/dist/leaflet-defaulticon-compatibility.css'; // For default marker icons
import "leaflet-defaulticon-compatibility"; // For default marker icons

import { useAuth } from '@/contexts/auth-context';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Icons } from '@/components/icons';
import { useEffect, useState } from 'react';
import L from 'leaflet'; // Import L for custom icon

// Fix for default icon issue with Webpack / Next.js
// You might not need this if leaflet-defaulticon-compatibility works perfectly
// delete (L.Icon.Default.prototype as any)._getIconUrl;
// L.Icon.Default.mergeOptions({
//   iconRetinaUrl: require('leaflet/dist/images/marker-icon-2x.png').default,
//   iconUrl: require('leaflet/dist/images/marker-icon.png').default,
//   shadowUrl: require('leaflet/dist/images/marker-shadow.png').default,
// });

export function FarmMapView() {
  const { user } = useAuth();
  const [mapCenter, setMapCenter] = useState<[number, number]>([45.4215, -75.6972]); // Default to Ottawa
  const [mapZoom, setMapZoom] = useState(10);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (user?.farmLatitude && user?.farmLongitude) {
      setMapCenter([user.farmLatitude, user.farmLongitude]);
      setMapZoom(13); // Zoom in a bit if farm location is known
    }
    setIsLoading(false); 
  }, [user?.farmLatitude, user?.farmLongitude]);

  if (isLoading) {
    return <p>Loading map data...</p>; // Or a skeleton loader
  }
  
  // A very basic custom icon example (optional)
  // const customIcon = new L.Icon({
  //   iconUrl: '/farm-marker.png', // you'd need to add this image to your public folder
  //   iconSize: [25, 41],
  //   iconAnchor: [12, 41],
  //   popupAnchor: [1, -34],
  //   shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  //   shadowSize: [41, 41]
  // });

  return (
    <div className="space-y-4">
      <Alert>
        <Icons.Info className="h-4 w-4" />
        <AlertTitle>Map View - Beta</AlertTitle>
        <AlertDescription>
          This map view currently centers on your farm's general location (if set in your profile) or Ottawa. 
          Displaying individual field markers and drawing field boundaries are planned future enhancements.
        </AlertDescription>
      </Alert>

      <div className="h-[500px] w-full rounded-md border shadow-md overflow-hidden">
        <MapContainer center={mapCenter} zoom={mapZoom} scrollWheelZoom={true} style={{ height: '100%', width: '100%' }}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {/* Example Marker for Farm Location - if available */}
          {user?.farmLatitude && user?.farmLongitude && (
            <Marker position={[user.farmLatitude, user.farmLongitude]}>
              <Popup>
                {user.farmName || 'Your Farm Location'}
              </Popup>
            </Marker>
          )}
          {/* Future: Iterate over fields with coordinates and add Markers or Polygons */}
        </MapContainer>
      </div>
    </div>
  );
}
