
"use client";

import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-defaulticon-compatibility/dist/leaflet-defaulticon-compatibility.css';
import "leaflet-defaulticon-compatibility"; 

import { useAuth, type PreferredAreaUnit } from '@/contexts/auth-context';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Icons } from '@/components/icons';
import { useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, orderBy, Timestamp } from 'firebase/firestore';
import { Skeleton } from '../ui/skeleton';

interface FieldData {
  id: string;
  fieldName: string;
  fieldSize?: number;
  fieldSizeUnit?: string;
  latitude?: number | null;
  longitude?: number | null;
}

const ACRES_TO_HECTARES = 0.404686;
const HECTARES_TO_ACRES = 1 / ACRES_TO_HECTARES;

export function FarmMapView() {
  const { user } = useAuth();
  const [mapCenter, setMapCenter] = useState<[number, number]>([45.4215, -75.6972]); // Default to Ottawa
  const [mapZoom, setMapZoom] = useState(10);
  const [farmFields, setFarmFields] = useState<FieldData[]>([]);
  const [isLoadingFields, setIsLoadingFields] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const preferredAreaUnit = user?.settings?.preferredAreaUnit || "acres";


  useEffect(() => {
    let initialLat = user?.farmLatitude;
    let initialLng = user?.farmLongitude;
    let initialZoom = 10;

    if (initialLat && initialLng) {
      setMapCenter([initialLat, initialLng]);
      initialZoom = 13; 
    }
    
    if (user?.farmId) {
      setIsLoadingFields(true);
      setError(null);
      const fetchFields = async () => {
        try {
          const q = query(
            collection(db, "fields"),
            where("farmId", "==", user.farmId)
          );
          const querySnapshot = await getDocs(q);
          const fetchedFields: FieldData[] = querySnapshot.docs.map(docSnap => ({
            id: docSnap.id,
            ...docSnap.data(),
          } as FieldData));
          setFarmFields(fetchedFields);

          if (fetchedFields.length > 0 && (!initialLat || !initialLng)) {
            const firstFieldWithCoords = fetchedFields.find(f => f.latitude != null && f.longitude != null);
            if (firstFieldWithCoords) {
              setMapCenter([firstFieldWithCoords.latitude!, firstFieldWithCoords.longitude!]);
              initialZoom = 14; 
            }
          } else if (fetchedFields.length === 0 && (!initialLat || !initialLng)) {
            // No farm specific location and no fields with coords, keep default Ottawa or show wider area
             setMapCenter([45.4215, -75.6972]); // Re-default if no data at all
             initialZoom = 10;
          }
        } catch (e) {
          console.error("Error fetching fields for map:", e);
          setError("Could not load field data for the map.");
        } finally {
          setIsLoadingFields(false);
        }
      };
      fetchFields();
    } else {
      setIsLoadingFields(false); // No farmId, so nothing to load
    }
    setMapZoom(initialZoom); // Set zoom after potential updates
  }, [user?.farmId, user?.farmLatitude, user?.farmLongitude]);

  const formatFieldSizeForPopup = (size?: number, unit?: string, targetUnit?: PreferredAreaUnit): string => {
    if (size === undefined || size === null) return "";
    
    const originalUnit = unit?.toLowerCase() || "acres"; 
    const displayUnit = targetUnit || "acres";

    let displaySize = size;
    if (originalUnit !== displayUnit) {
        let sizeInAcres: number;
        if (originalUnit.includes("hectare")) sizeInAcres = size * HECTARES_TO_ACRES;
        else sizeInAcres = size;

        if (displayUnit === "hectares") displaySize = sizeInAcres * ACRES_TO_HECTARES;
        else displaySize = sizeInAcres; // Default display is acres if targetUnit is acres
    }
    return `<br />Size: ${displaySize.toFixed(1)} ${displayUnit}`;
  };

  if (isLoadingFields && !user?.farmId) {
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
          This map centers on your farm&apos;s general location (set in Profile if owner) or the first defined field. 
          Markers indicate individual fields if they have latitude/longitude defined. 
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

      <div className="h-[500px] w-full rounded-md border shadow-md overflow-hidden bg-muted">
        {isLoadingFields ? (
           <Skeleton className="h-full w-full" />
        ) : (
          <MapContainer key={`${mapCenter.join('-')}-${mapZoom}`} center={mapCenter} zoom={mapZoom} scrollWheelZoom={true} style={{ height: '100%', width: '100%' }}>
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {/* Marker for main farm location if set AND different from any field that might also be at the exact same spot */}
            {user?.farmLatitude && user?.farmLongitude && 
             !farmFields.some(f => f.latitude === user.farmLatitude && f.longitude === user.farmLongitude) && (
              <Marker position={[user.farmLatitude, user.farmLongitude]}>
                <Popup>
                  {user.farmName || 'Your Farm Location'}
                </Popup>
              </Marker>
            )}

            {farmFields.map(field => (
              field.latitude != null && field.longitude != null ? (
                <Marker key={field.id} position={[field.latitude, field.longitude]}>
                  <Popup>
                    <strong>{field.fieldName}</strong>
                    {formatFieldSizeForPopup(field.fieldSize, field.fieldSizeUnit, preferredAreaUnit)}
                  </Popup>
                </Marker>
              ) : null
            ))}
          </MapContainer>
        )}
      </div>
    </div>
  );
}

    