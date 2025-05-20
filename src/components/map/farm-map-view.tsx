
"use client";

import { MapContainer, TileLayer, Marker, Popup, GeoJSON } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-defaulticon-compatibility/dist/leaflet-defaulticon-compatibility.css';
import "leaflet-defaulticon-compatibility"; 

import { useAuth, type PreferredAreaUnit } from '@/contexts/auth-context';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Icons } from '@/components/icons';
import { useEffect, useState, useMemo, useCallback } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { Skeleton } from '../ui/skeleton';
import type { GeoJsonObject, Feature, Geometry } from 'geojson';
import L from 'leaflet'; 
import Link from 'next/link';

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

// Component to adjust map bounds and store map reference
const MapEffects = ({ features, mapInstance, preferredAreaUnit }: { features: FieldData[], mapInstance: L.Map | null, preferredAreaUnit: PreferredAreaUnit }) => {
  
  const formatFieldSizeForPopup = useCallback((size?: number, unit?: string, targetUnit?: PreferredAreaUnit): string => {
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
  }, []);

  const onEachFeature = useCallback((feature: Feature, layer: L.Layer) => {
    if (feature.properties && mapInstance) { // Check mapInstance here too
      let popupContent = `<strong>${feature.properties.name || 'Unnamed Field'}</strong>`;
      if (feature.properties.sizeInfoHTML) { // This prop is set in FarmMapView when parsing GeoJSON
        popupContent += `${feature.properties.sizeInfoHTML}`;
      }
      popupContent += `<br /><a href="/data-management?tab=fields&fieldId=${feature.properties.id}" target="_blank" rel="noopener noreferrer" class="text-primary hover:underline">View/Edit Details</a>`;
      layer.bindPopup(popupContent);

      layer.on('click', (e) => {
        if (mapInstance && (e.target as any).getBounds) {
          const bounds = (e.target as any).getBounds();
          if (bounds && bounds.isValid()) {
            mapInstance.fitBounds(bounds, { padding: [70, 70], maxZoom: 18 });
          }
        }
      });
    }
  }, [mapInstance]); // mapInstance as dependency

  useEffect(() => {
    if (mapInstance && features.length > 0) {
      const bounds = L.latLngBounds([]);
      let hasValidFeature = false;
      
      features.forEach(field => {
        if (field.geojsonBoundary) {
          try {
            const geoJsonData = JSON.parse(field.geojsonBoundary) as GeoJsonObject;
            const layer = L.geoJSON(geoJsonData);
            const layerBounds = layer.getBounds();
            if (layerBounds.isValid()) {
              bounds.extend(layerBounds);
              hasValidFeature = true;
            }
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
        mapInstance.fitBounds(bounds, { padding: [50, 50], maxZoom: 17 });
      }
    }
  }, [features, mapInstance]);

  // Render GeoJSON features here if mapInstance is ready
  const parsedGeoJsonFeatures = useMemo(() => 
    features.map(field => {
      if (field.geojsonBoundary) {
        try {
          const parsed = JSON.parse(field.geojsonBoundary) as GeoJsonObject;
          const featureProperties = { 
            name: field.fieldName, 
            id: field.id, 
            sizeInfoHTML: formatFieldSizeForPopup(field.fieldSize, field.fieldSizeUnit, preferredAreaUnit) 
          };

          if (parsed.type === "Feature") {
            parsed.properties = { ...parsed.properties, ...featureProperties };
            return parsed as Feature;
          } else if (parsed.type === "Polygon" || parsed.type === "MultiPolygon") {
            return {
              type: "Feature",
              properties: featureProperties,
              geometry: parsed as Geometry
            } as Feature;
          }
          return null;
        } catch (e) {
          console.error("Error parsing GeoJSON for field:", field.fieldName, e);
          return null; 
        }
      }
      return null;
    }).filter(Boolean) as Feature[], 
  [features, preferredAreaUnit, formatFieldSizeForPopup]);

  return (
    <>
      {parsedGeoJsonFeatures.map((geoJsonData, index) => (
        <GeoJSON 
          key={geoJsonData.properties?.id || `geojson-${index}`} 
          data={geoJsonData} 
          onEachFeature={onEachFeature}
          style={{ color: "hsl(var(--primary))", weight: 2, opacity: 0.8, fillOpacity: 0.2 }}
        />
      ))}
      {features.map(field => (
        !field.geojsonBoundary && field.latitude != null && field.longitude != null ? (
          <Marker key={field.id} position={[field.latitude, field.longitude]}>
            <Popup>
              <strong>{field.fieldName}</strong>
              <span dangerouslySetInnerHTML={{ __html: formatFieldSizeForPopup(field.fieldSize, field.fieldSizeUnit, preferredAreaUnit) }} />
              <br /><Link href={`/data-management?tab=fields&fieldId=${field.id}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">View/Edit Details</Link>
            </Popup>
          </Marker>
        ) : null
      ))}
    </>
  );
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
  
  const mapKey = useMemo(() => user?.farmId || 'default-map', [user?.farmId]);

  useEffect(() => {
    let initialLat = user?.farmLatitude;
    let initialLng = user?.farmLongitude;
    let newZoom = 10;

    if (initialLat != null && initialLng != null) {
      setMapCenter([initialLat, initialLng]);
      newZoom = 13;
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

          if (fetchedFields.length > 0 && (initialLat == null || initialLng == null)) {
            // If farm loc isn't set, try to center on first field with coordinates
            const firstFieldWithGeo = fetchedFields.find(f => f.geojsonBoundary);
            if (firstFieldWithGeo && firstFieldWithGeo.geojsonBoundary) {
              try {
                const parsedGeoJson = JSON.parse(firstFieldWithGeo.geojsonBoundary) as GeoJsonObject;
                const gjLayer = L.geoJSON(parsedGeoJson);
                const bounds = gjLayer.getBounds();
                if (bounds.isValid()) {
                  setMapCenter(bounds.getCenter().toArray() as [number, number]);
                  newZoom = 14; // Or adjust based on bounds
                }
              } catch (e) { /* fallback to first field with lat/lon */ }
            }
            if (!firstFieldWithGeo) { // No GeoJSON, try simple lat/lon
                const firstFieldWithCoords = fetchedFields.find(f => f.latitude != null && f.longitude != null);
                if (firstFieldWithCoords) {
                    setMapCenter([firstFieldWithCoords.latitude!, firstFieldWithCoords.longitude!]);
                    newZoom = 14;
                } else if (initialLat == null || initialLng == null) { // No fields with coords, no farm loc
                    setMapCenter([45.4215, -75.6972]); newZoom = 10; // Default to Ottawa
                }
            }
          } else if (fetchedFields.length === 0 && (initialLat == null || initialLng == null)) {
             setMapCenter([45.4215, -75.6972]); newZoom = 10; // Default to Ottawa
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
      if (initialLat == null || initialLng == null) {
        setMapCenter([45.4215, -75.6972]); newZoom = 10; // Default if no user/farmId and no farm loc
      }
    }
    if (mapZoom !== newZoom) setMapZoom(newZoom);
  }, [user?.farmId, user?.farmLatitude, user?.farmLongitude]); // Removed mapZoom from dependencies

  if (!user && !isLoadingFields) {
    return (
      <Alert>
        <Icons.Info className="h-4 w-4" />
        <AlertTitle>Please Log In</AlertTitle>
        <AlertDescription>Log in to view your farm map.</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      <Alert>
        <Icons.Info className="h-4 w-4" />
        <AlertTitle>Farm Map View</AlertTitle>
        <AlertDescription>
          Map centers on your farm (set in Profile if owner). Fields with boundary data are polygons (click to zoom). Fields with only Lat/Lon are markers. Draw/Edit boundaries in Data Management {'>'} Fields.
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
            key={mapKey} // Key based on farmId to force re-render if farm changes
            center={mapCenter} 
            zoom={mapZoom} 
            scrollWheelZoom={true} 
            style={{ height: '100%', width: '100%' }}
            whenCreated={setMapInstance} // Get map instance
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
            
            {/* Render farm location marker if farm has coordinates and no fields define the center */}
            {user?.farmLatitude && user?.farmLongitude && 
             !farmFields.some(f => (f.geojsonBoundary) || (f.latitude != null && f.longitude != null)) && (
              <Marker position={[user.farmLatitude, user.farmLongitude]}>
                <Popup>
                  {user.farmName || 'Your Farm Location'}
                </Popup>
              </Marker>
            )}
            {mapInstance && <MapEffects features={farmFields} mapInstance={mapInstance} preferredAreaUnit={preferredAreaUnit} />}
          </MapContainer>
        )}
      </div>
    </div>
  );
}
