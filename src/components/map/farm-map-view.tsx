
"use client";

import { MapContainer, TileLayer, Marker, Popup, Polygon } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-defaulticon-compatibility/dist/leaflet-defaulticon-compatibility.css';
import "leaflet-defaulticon-compatibility"; 

import { useAuth } from '@/contexts/auth-context';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Icons } from '@/components/icons';
import { useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, orderBy, Timestamp } from 'firebase/firestore';
import { Skeleton } from '../ui/skeleton';

interface FieldData {
  id: string;
  fieldName: string;
  latitude?: number | null;
  longitude?: number | null;
  // GeoJSON field boundary could be added here in the future
  // boundary?: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>;
}

export function FarmMapView() {
  const { user } = useAuth();
  const [mapCenter, setMapCenter] = useState<[number, number]>([45.4215, -75.6972]); // Default to Ottawa
  const [mapZoom, setMapZoom] = useState(10);
  const [farmFields, setFarmFields] = useState<FieldData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let farmLat = user?.farmLatitude;
    let farmLng = user?.farmLongitude;
    let initialZoom = 10;

    if (farmLat && farmLng) {
      setMapCenter([farmLat, farmLng]);
      initialZoom = 13; 
    }
    setMapZoom(initialZoom);

    if (user?.farmId) {
      const fetchFields = async () => {
        setIsLoading(true);
        setError(null);
        try {
          const q = query(
            collection(db, "fields"),
            where("farmId", "==", user.farmId)
          );
          const querySnapshot = await getDocs(q);
          const fetchedFields: FieldData[] = querySnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
          } as FieldData));
          setFarmFields(fetchedFields);

          // If no farm-level coords but fields have coords, center on the first field
          if (fetchedFields.length > 0 && (!farmLat || !farmLng)) {
            const firstFieldWithCoords = fetchedFields.find(f => f.latitude && f.longitude);
            if (firstFieldWithCoords) {
              setMapCenter([firstFieldWithCoords.latitude!, firstFieldWithCoords.longitude!]);
              setMapZoom(14); // Zoom closer to a field
            }
          }

        } catch (e) {
          console.error("Error fetching fields for map:", e);
          setError("Could not load field data for the map.");
        } finally {
          setIsLoading(false);
        }
      };
      fetchFields();
    } else {
      setIsLoading(false); // No farmId, so nothing to load
    }
  }, [user?.farmId, user?.farmLatitude, user?.farmLongitude]);


  if (isLoading && !user?.farmId) { // Only show this initial general loading if we don't even have a farmId yet.
    return (
      <div className="space-y-4">
          <Skeleton className="h-10 w-1/3" />
          <Skeleton className="h-[500px] w-full rounded-md" />
      </div>
    );
  }
  
  return (
    <div className="space-y-4">
      <Alert>
        <Icons.Info className="h-4 w-4" />
        <AlertTitle>Farm Map View</AlertTitle>
        <AlertDescription>
          This map centers on your farm's general location (if set in profile) or the first field with coordinates. 
          Individual field markers are shown if latitude/longitude are defined for them. 
          Drawing field boundaries is a planned future enhancement.
        </AlertDescription>
      </Alert>

      {error && (
        <Alert variant="destructive">
          <Icons.AlertCircle className="h-4 w-4" />
          <AlertTitle>Map Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="h-[500px] w-full rounded-md border shadow-md overflow-hidden">
        {isLoading ? (
           <Skeleton className="h-full w-full" />
        ) : (
          <MapContainer key={`${mapCenter.join('-')}-${mapZoom}`} center={mapCenter} zoom={mapZoom} scrollWheelZoom={true} style={{ height: '100%', width: '100%' }}>
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {/* Marker for main farm location if set and different from any field */}
            {user?.farmLatitude && user?.farmLongitude && 
             !farmFields.some(f => f.latitude === user.farmLatitude && f.longitude === user.farmLongitude) && (
              <Marker position={[user.farmLatitude, user.farmLongitude]}>
                <Popup>
                  {user.farmName || 'Your Farm Location'}
                </Popup>
              </Marker>
            )}

            {/* Markers for individual fields */}
            {farmFields.map(field => (
              field.latitude && field.longitude ? (
                <Marker key={field.id} position={[field.latitude, field.longitude]}>
                  <Popup>
                    <strong>{field.fieldName}</strong>
                    <br/>
                    {field.fieldSize && field.fieldSizeUnit ? `${field.fieldSize.toFixed(1)} ${field.fieldSizeUnit}` : ''}
                  </Popup>
                </Marker>
              ) : null
            ))}
            {/* Future: Polygons for field boundaries */}
          </MapContainer>
        )}
      </div>
    </div>
  );
}

    