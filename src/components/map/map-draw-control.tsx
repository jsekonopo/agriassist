
"use client";

import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet-draw';
import type { GeoJsonObject } from 'geojson';

interface MapDrawControlProps {
  onShapeDrawn: (geojson: GeoJsonObject | null) => void;
  initialGeoJson?: GeoJsonObject | null; // To display an existing shape for editing
}

export function MapDrawControl({ onShapeDrawn, initialGeoJson }: MapDrawControlProps) {
  const map = useMap();
  const drawnItemsRef = useRef<L.FeatureGroup>(new L.FeatureGroup());
  const isInitialShapeLoaded = useRef(false);

  useEffect(() => {
    const drawnItems = drawnItemsRef.current;
    map.addLayer(drawnItems);

    // Load initialGeoJson if provided and not already loaded
    if (initialGeoJson && !isInitialShapeLoaded.current) {
      try {
        const layer = L.geoJSON(initialGeoJson as L.GeoJSON.GeoJsonObject);
        layer.getLayers().forEach(l => {
          // Ensure only one shape is present for editing/drawing
          drawnItems.clearLayers(); 
          drawnItems.addLayer(l);
        });
        isInitialShapeLoaded.current = true;
        // Optionally fit bounds to the initial shape
        // if (drawnItems.getLayers().length > 0) {
        //   map.fitBounds(drawnItems.getBounds(), { padding: [20, 20] });
        // }
      } catch (e) {
        console.error("Error parsing initialGeoJson in MapDrawControl:", e);
      }
    } else if (!initialGeoJson && isInitialShapeLoaded.current) {
      // If initialGeoJson is cleared (e.g. form reset), clear layers and reset flag
      drawnItems.clearLayers();
      isInitialShapeLoaded.current = false;
    }


    const drawControl = new L.Control.Draw({
      edit: {
        featureGroup: drawnItems,
        remove: true,
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
      drawnItems.clearLayers(); // Ensure only one shape
      drawnItems.addLayer(layer);
      onShapeDrawn(layer.toGeoJSON());
      isInitialShapeLoaded.current = true; // A shape is now loaded/drawn
    };

    const handleDrawEdited = (e: any) => {
      let newGeoJson: GeoJsonObject | null = null;
      const layers = drawnItems.getLayers(); // drawnItems reflects the edited layers
      if (layers.length === 1 && layers[0] instanceof L.Path) { // L.Path for Polygons, Rectangles
        newGeoJson = (layers[0] as L.Path).toGeoJSON() as GeoJsonObject;
      } else if (layers.length > 1) {
        // This case should ideally not happen if we clear layers on create.
        // If it does, we might form a FeatureCollection or take the first.
        console.warn("Multiple layers edited, taking the first one for GeoJSON output.");
        if (layers[0] instanceof L.Path) {
          newGeoJson = (layers[0] as L.Path).toGeoJSON() as GeoJsonObject;
        }
      }
      onShapeDrawn(newGeoJson);
    };

    const handleDrawDeleted = (e: any) => {
      // After leaflet-draw internal deletion, drawnItems might be empty.
      // Check its state to confirm.
      if (drawnItems.getLayers().length === 0) {
        onShapeDrawn(null);
        isInitialShapeLoaded.current = false;
      }
    };

    map.on(L.Draw.Event.CREATED, handleDrawCreated);
    map.on(L.Draw.Event.EDITED, handleDrawEdited);
    map.on(L.Draw.Event.DELETED, handleDrawDeleted);

    return () => {
      map.removeControl(drawControl);
      // It's good practice to remove layers added by the control,
      // but drawnItems is managed by this component.
      // If drawnItems is added to map directly, ensure it's removed.
      // map.removeLayer(drawnItems); // Might cause issues if map unmounts before control
      map.off(L.Draw.Event.CREATED, handleDrawCreated);
      map.off(L.Draw.Event.EDITED, handleDrawEdited);
      map.off(L.Draw.Event.DELETED, handleDrawDeleted);
    };
  }, [map, onShapeDrawn, initialGeoJson]); // Rerun if initialGeoJson changes

  return null;
}
