
"use client";

import { MapContainer, TileLayer, Marker, Popup, GeoJSON, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-defaulticon-compatibility/dist/leaflet-defaulticon-compatibility.css';
import "leaflet-defaulticon-compatibility"; 

import { useAuth, type PreferredAreaUnit } from '@/contexts/auth-context';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Icons } from '@/components/icons';
import { useEffect, useState, useMemo } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, orderBy, Timestamp } from 'firebase/firestore';
import { Skeleton } from '../ui/skeleton';
import type { GeoJsonObject } from 'geojson'; // Import GeoJSON types
import L from 'leaflet'; // Import Leaflet library itself

interface FieldData {
  id: string;
  fieldName: string;
  fieldSize?: number;
  fieldSizeUnit?: string;
  geojsonBoundary?: string | null; // Can be string (GeoJSON) or null
  latitude?: number | null; // For simple marker if no GeoJSON
  longitude?: number | null; // For simple marker if no GeoJSON
}

const ACRES_TO_HECTARES = 0.404686;
const HECTARES_TO_ACRES = 1 / ACRES_TO_HECTARES;

// Component to adjust map bounds
const FitBoundsToFeatures = ({ features }: { features: FieldData[] }) => {
  const map = useMap();

  useEffect(() => {
    if (features.length > 0) {
      const bounds = L.latLngBounds([]);
      let hasValidFeature = false;
      features.forEach(field => {
        if (field.geojsonBoundary) {
          try {
            const geoJsonData = JSON.parse(field.geojsonBoundary) as GeoJsonObject;
            // L.geoJSON can create a layer group, get its bounds
            const layer = L.geoJSON(geoJsonData);
            bounds.extend(layer.getBounds());
            hasValidFeature = true;
          } catch (e) {
            // console.warn(`Invalid GeoJSON for field ${field.fieldName}:`, e);
            // If GeoJSON is invalid but lat/lng exist, use them
            if (field.latitude != null && field.longitude != null) {
              bounds.extend([field.latitude, field.longitude]);
              hasValidFeature = true;
            }
          }
        } else if (field.latitude != null && field.longitude != null) {
          bounds.extend([field.latitude, field.longitude]);
          hasValidFeature = true;
        }
      });

      if (hasValidFeature && bounds.isValid()) {
        map.fitBounds(bounds, { padding: [50, 50] });
      }
    }
  }, [features, map]);

  return null;
};


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

          // If farm location not set, try to center on first field with any coords
          if (fetchedFields.length > 0 && (!initialLat || !initialLng)) {
            const firstFieldWithGeoJSON = fetchedFields.find(f => f.geojsonBoundary);
            const firstFieldWithSimpleCoords = fetchedFields.find(f => f.latitude != null && f.longitude != null);

            if (firstFieldWithGeoJSON) {
              // Centering logic will be handled by FitBoundsToFeatures
              initialZoom = 14; // Default zoom if fitting bounds
            } else if (firstFieldWithSimpleCoords) {
              setMapCenter([firstFieldWithSimpleCoords.latitude!, firstFieldWithSimpleCoords.longitude!]);
              initialZoom = 14; 
            }
          } else if (fetchedFields.length === 0 && (!initialLat || !initialLng)) {
             setMapCenter([45.4215, -75.6972]); 
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
      setIsLoadingFields(false); 
    }
    if (initialZoom !== mapZoom) setMapZoom(initialZoom); // Only set zoom if it changed
  }, [user?.farmId, user?.farmLatitude, user?.farmLongitude, mapZoom]); // mapZoom dependency for potential re-zoom on data change if needed

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
        else displaySize = sizeInAcres; 
    }
    return `<br />Size: ${displaySize.toFixed(1)} ${displayUnit}`;
  };

  const parsedGeoJsonFeatures = useMemo(() => 
    farmFields.map(field => {
      if (field.geojsonBoundary) {
        try {
          const parsed = JSON.parse(field.geojsonBoundary) as GeoJsonObject;
          // Add field properties to be accessible in onEachFeature or style
          if (parsed.type === "Feature") {
            parsed.properties = { ...parsed.properties, name: field.fieldName, id: field.id, size: formatFieldSizeForPopup(field.fieldSize, field.fieldSizeUnit, preferredAreaUnit) };
          } else if (parsed.type === "Polygon" || parsed.type === "MultiPolygon") {
            // Wrap geometry in a Feature object
            return {
              type: "Feature",
              properties: { name: field.fieldName, id: field.id, size: formatFieldSizeForPopup(field.fieldSize, field.fieldSizeUnit, preferredAreaUnit) },
              geometry: parsed
            } as GeoJsonObject;
          }
          return parsed;
        } catch (e) {
          // console.warn(`Invalid GeoJSON for field ${field.fieldName}, using marker if lat/lng exist.`);
          return null; 
        }
      }
      return null;
    }).filter(Boolean) as GeoJsonObject[], 
  [farmFields, preferredAreaUnit]);

  const onEachFeature = (feature: any, layer: L.Layer) => {
    if (feature.properties && feature.properties.name) {
      let popupContent = `<strong>${feature.properties.name}</strong>`;
      if (feature.properties.size) {
        popupContent += `${feature.properties.size}`;
      }
      layer.bindPopup(popupContent);
    }
  };
  
  if (isLoadingFields && !user?.farmId && !user) { // Adjusted loading for initial app load without user context
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
          Map centers on your farm&apos;s location (set in Profile if owner). 
          Fields with GeoJSON boundary data are shown as polygons. Fields with only Lat/Lon are shown as markers. 
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
          <MapContainer key={`${mapCenter.join('-')}-${mapZoom}-${parsedGeoJsonFeatures.length}`} center={mapCenter} zoom={mapZoom} scrollWheelZoom={true} style={{ height: '100%', width: '100%' }}>
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            
            {user?.farmLatitude && user?.farmLongitude && 
             !farmFields.some(f => (f.latitude === user.farmLatitude && f.longitude === user.farmLongitude) || f.geojsonBoundary) && (
              <Marker position={[user.farmLatitude, user.farmLongitude]}>
                <Popup>
                  {user.farmName || 'Your Farm Location'}
                </Popup>
              </Marker>
            )}

            {parsedGeoJsonFeatures.map((geoJsonData, index) => (
              <GeoJSON key={farmFields.find(f=>f.geojsonBoundary && JSON.stringify(JSON.parse(f.geojsonBoundary)) === JSON.stringify(geoJsonData.type === "Feature" ? geoJsonData.geometry : geoJsonData))?.id || index} data={geoJsonData} onEachFeature={onEachFeature}>
                <Popup>{ (geoJsonData as any).properties?.name || 'Field Boundary'}{ (geoJsonData as any).properties?.size || '' }</Popup>
              </GeoJSON>
            ))}

            {farmFields.map(field => (
              !field.geojsonBoundary && field.latitude != null && field.longitude != null ? (
                <Marker key={field.id} position={[field.latitude, field.longitude]}>
                  <Popup>
                    <strong>{field.fieldName}</strong>
                    {formatFieldSizeForPopup(field.fieldSize, field.fieldSizeUnit, preferredAreaUnit)}
                  </Popup>
                </Marker>
              ) : null
            ))}
            <FitBoundsToFeatures features={farmFields} />
          </MapContainer>
        )}
      </div>
    </div>
  );
}
    