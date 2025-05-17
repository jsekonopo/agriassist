
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
import type { GeoJsonObject, Feature } from 'geojson'; // Import GeoJSON types
import L from 'leaflet'; // Import Leaflet library itself
import Link from 'next/link'; // For "View Details" link

interface FieldData {
  id: string;
  fieldName: string;
  fieldSize?: number;
  fieldSizeUnit?: string;
  geojsonBoundary?: string | null; 
  latitude?: number | null; 
  longitude?: number | null; 
}

const ACRES_TO_HECTARES = 0.404686;
const HECTARES_TO_ACRES = 1 / ACRES_TO_HECTARES;

// Component to adjust map bounds
const FitBoundsToFeatures = ({ features, map }: { features: FieldData[], map: L.Map | null }) => {
  useEffect(() => {
    if (map && features.length > 0) {
      const bounds = L.latLngBounds([]);
      let hasValidFeature = false;
      features.forEach(field => {
        if (field.geojsonBoundary) {
          try {
            const geoJsonData = JSON.parse(field.geojsonBoundary) as GeoJsonObject;
            const layer = L.geoJSON(geoJsonData);
            bounds.extend(layer.getBounds());
            hasValidFeature = true;
          } catch (e) {
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
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
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
  const [mapInstance, setMapInstance] = useState<L.Map | null>(null);


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
            const firstFieldWithGeoJSON = fetchedFields.find(f => f.geojsonBoundary);
            const firstFieldWithSimpleCoords = fetchedFields.find(f => f.latitude != null && f.longitude != null);
            if (firstFieldWithGeoJSON) {
              initialZoom = 14; 
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
    if (initialZoom !== mapZoom) setMapZoom(initialZoom); 
  }, [user?.farmId, user?.farmLatitude, user?.farmLongitude]); // Removed mapZoom from deps

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
          const featureProperties = { 
            name: field.fieldName, 
            id: field.id, 
            sizeInfo: formatFieldSizeForPopup(field.fieldSize, field.fieldSizeUnit, preferredAreaUnit) 
          };

          if (parsed.type === "Feature") {
            parsed.properties = { ...parsed.properties, ...featureProperties };
            return parsed as Feature;
          } else if (parsed.type === "Polygon" || parsed.type === "MultiPolygon") {
            return {
              type: "Feature",
              properties: featureProperties,
              geometry: parsed
            } as Feature;
          }
          return null; // Not a supported top-level geometry type for direct use as a Feature
        } catch (e) {
          return null; 
        }
      }
      return null;
    }).filter(Boolean) as Feature[], 
  [farmFields, preferredAreaUnit]);

  const onEachFeature = (feature: Feature, layer: L.Layer) => {
    if (feature.properties) {
      let popupContent = `<strong>${feature.properties.name || 'Unnamed Field'}</strong>`;
      if (feature.properties.sizeInfo) {
        popupContent += `${feature.properties.sizeInfo}`;
      }
      // Placeholder link - actual functionality for field details page/modal would be separate
      popupContent += `<br /><a href="/data-management?tab=fields&fieldId=${feature.properties.id}" target="_blank" rel="noopener noreferrer" class="text-primary hover:underline">View Details</a>`;
      layer.bindPopup(popupContent);
    }
  };
  
  if (isLoadingFields && !user?.farmId && !user) {
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
          Map centers on your farm's location (set in Profile if owner). 
          Fields with boundary data are shown as polygons. Fields with only Lat/Lon are shown as markers. 
          Drawing field boundaries is done in the Field Definition form.
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
          <MapContainer 
            key={`${mapCenter.join('-')}-${mapZoom}-${farmFields.length}`} 
            center={mapCenter} 
            zoom={mapZoom} 
            scrollWheelZoom={true} 
            style={{ height: '100%', width: '100%' }}
            whenCreated={setMapInstance}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &amp; Satellite: &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            />
            <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                pane="tilePane" 
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
              <GeoJSON 
                key={geoJsonData.properties?.id || `geojson-${index}`} 
                data={geoJsonData} 
                onEachFeature={onEachFeature}
                style={{ color: "hsl(var(--primary))", weight: 2, opacity: 0.8, fillOpacity: 0.1 }}
              />
            ))}

            {farmFields.map(field => (
              !field.geojsonBoundary && field.latitude != null && field.longitude != null ? (
                <Marker key={field.id} position={[field.latitude, field.longitude]}>
                  <Popup>
                    <strong>{field.fieldName}</strong>
                    {formatFieldSizeForPopup(field.fieldSize, field.fieldSizeUnit, preferredAreaUnit)}
                     <br /><Link href={`/data-management?tab=fields&fieldId=${field.id}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">View Details</Link>
                  </Popup>
                </Marker>
              ) : null
            ))}
            <FitBoundsToFeatures features={farmFields} map={mapInstance} />
          </MapContainer>
        )}
      </div>
    </div>
  );
}
    
