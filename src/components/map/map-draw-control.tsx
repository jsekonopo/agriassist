
"use client";

import { useEffect, useRef } from 'react';
import { useMap, FeatureGroup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet-draw';
import type { GeoJsonObject } from 'geojson';

interface MapDrawControlProps {
  onShapeDrawn: (geojson: GeoJsonObject | null) => void;
  initialGeoJson?: GeoJsonObject | null; // To display an existing shape
}

export function MapDrawControl({ onShapeDrawn, initialGeoJson }: MapDrawControlProps) {
  const map = useMap();
  const drawnItemsRef = useRef<L.FeatureGroup>(new L.FeatureGroup()); // Ref for drawn items

  useEffect(() => {
    const drawnItems = drawnItemsRef.current;
    map.addLayer(drawnItems);

    // Clear existing drawn items if initialGeoJson changes or on unmount
    drawnItems.clearLayers();
    if (initialGeoJson) {
        try {
            const layer = L.geoJSON(initialGeoJson as L.GeoJSON.GeoJsonObject); // Type assertion
            layer.getLayers().forEach(l => drawnItems.addLayer(l));
            // Do not fit bounds here, let parent component manage overall map view
        } catch (e) {
            console.error("Error parsing initialGeoJson in MapDrawControl:", e);
        }
    }


    const drawControl = new L.Control.Draw({
      edit: {
        featureGroup: drawnItems,
        remove: true, // Allow removing shapes within the control
      },
      draw: {
        polygon: {
          allowIntersection: false,
          showArea: true,
          shapeOptions: {
            color: 'hsl(var(--primary))',
            fillColor: 'hsl(var(--primary) / 0.3)',
          },
        },
        rectangle: {
          showArea: true,
          shapeOptions: {
            color: 'hsl(var(--primary))',
            fillColor: 'hsl(var(--primary) / 0.3)',
          },
        },
        polyline: false,
        circle: false,
        marker: false,
        circlemarker: false,
      },
    });
    map.addControl(drawControl);

    const handleDrawCreated = (e: any) => {
      const layer = e.layer;
      drawnItems.clearLayers(); // Clear previous shapes, only allow one
      drawnItems.addLayer(layer);
      onShapeDrawn(layer.toGeoJSON());
    };

    const handleDrawEdited = (e: any) => {
        let newGeoJson = null;
        // drawnItems should contain the edited layer(s)
        // If there's only one layer (our current assumption), get its GeoJSON
        const layers = drawnItems.getLayers();
        if (layers.length === 1) {
            newGeoJson = (layers[0] as L.Path).toGeoJSON();
        } else if (layers.length > 1) {
            // Handle multiple layers if necessary, e.g., by creating a FeatureCollection
            // For now, we'll just take the first one for simplicity, or null
            console.warn("Multiple layers edited, taking the first one for GeoJSON output.");
            newGeoJson = (layers[0] as L.Path).toGeoJSON();
        }
        onShapeDrawn(newGeoJson);
    };

    const handleDrawDeleted = (e: any) => {
        // After leaflet-draw removes layers, our drawnItems ref might be out of sync
        // or we might just want to signal that there's no shape.
        // If drawnItems is empty or contains no layers after delete, signal null
        if (drawnItems.getLayers().length === 0) {
             onShapeDrawn(null);
        }
    };


    map.on(L.Draw.Event.CREATED, handleDrawCreated);
    map.on(L.Draw.Event.EDITED, handleDrawEdited);
    map.on(L.Draw.Event.DELETED, handleDrawDeleted);


    return () => {
      map.removeControl(drawControl);
      map.removeLayer(drawnItems);
      map.off(L.Draw.Event.CREATED, handleDrawCreated);
      map.off(L.Draw.Event.EDITED, handleDrawEdited);
      map.off(L.Draw.Event.DELETED, handleDrawDeleted);
    };
  }, [map, onShapeDrawn, initialGeoJson]); // Rerun if initialGeoJson changes

  return null;
}
