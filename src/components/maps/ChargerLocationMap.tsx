"use client";

// Generic small charger/location map styled after the production report maps
// (Components/Reports/ChargingLocationMap.jsx and IdleClusterMap.jsx): clean
// chrome (zoom control only), POI-free base style, orange circle markers with
// optional count labels and an info window per point. Used by the charging
// session detail page and the reports maps.

import { useEffect, useMemo, useRef } from "react";
import { apiKey, importLibrary, POI_OFF_STYLES } from "@/lib/googleMaps";

export interface ChargerMapPoint {
  lat: number;
  lng: number;
  label?: string;
  /** Marker fill (defaults to the hub orange used in the reports). */
  color?: string;
  /** Optional cluster size — rendered as a white label, scales the marker. */
  count?: number;
}

const DEFAULT_COLOR = "#f97316";

export default function ChargerLocationMap({
  points,
  height = 420,
}: {
  points: ChargerMapPoint[];
  height?: number | string;
}) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  /** Geometry the viewport was last fitted to. */
  const fittedRef = useRef<string | null>(null);

  // The store notifies on every simulation tick, so the parent hands us a
  // fresh array several times a minute even when nothing on the map moved.
  // Rebuilding markers and re-fitting the bounds on each of those threw away
  // whatever the viewer had zoomed into — the map appeared to zoom itself back
  // out a second after every interaction. Keying the work on what the points
  // actually *say* leaves an unchanged set alone, and the viewport is only
  // re-fitted when the geometry itself moves: a label that ticks up by 0.1 kWh
  // is new content for the same pin, not a reason to reframe the map.
  const valid = useMemo(
    () => points.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng)),
    [points],
  );
  const geoSignature = useMemo(
    () => valid.map((p) => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`).join("|"),
    [valid],
  );
  const signature = useMemo(
    () =>
      valid
        .map((p) => `${p.count ?? 0},${p.color ?? ""},${p.label ?? ""}`)
        .join("|") + `#${geoSignature}`,
    [valid, geoSignature],
  );

  useEffect(() => {
    if (!apiKey || !mapRef.current) return;
    let isMounted = true;

    async function initMap() {
      const { Map } = await importLibrary("maps");
      await importLibrary("marker");
      if (!isMounted || !mapRef.current) return;

      const gm = window.google.maps;
      const center = valid[0]
        ? { lat: valid[0].lat, lng: valid[0].lng }
        : { lat: 20.5937, lng: 78.9629 }; // Default: India center

      if (!mapInstanceRef.current) {
        mapInstanceRef.current = new Map(mapRef.current, {
          center,
          zoom: 13,
          disableDefaultUI: true,
          zoomControl: true,
          clickableIcons: false,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          styles: POI_OFF_STYLES,
        });
      }
      const map = mapInstanceRef.current;

      // Clear previous markers (points changed).
      markersRef.current.forEach((m) => m.setMap(null));
      markersRef.current = [];

      const infoWindow = new gm.InfoWindow();
      const bounds = new gm.LatLngBounds();

      valid.forEach((point) => {
        const count = point.count ?? 0;
        const scale =
          count > 1 ? Math.min(18, 8 + Math.log2(count + 1) * 3) : 7;

        const marker = new gm.Marker({
          position: { lat: point.lat, lng: point.lng },
          map,
          title: point.label ?? "",
          icon: {
            path: gm.SymbolPath.CIRCLE,
            scale,
            fillColor: point.color ?? DEFAULT_COLOR,
            fillOpacity: 0.85,
            strokeColor: "#ffffff",
            strokeWeight: 2,
          },
          label:
            count > 1
              ? {
                  text: String(count),
                  color: "#ffffff",
                  fontSize: "13px",
                  fontWeight: "700",
                }
              : undefined,
        });

        if (point.label) {
          marker.addListener("click", () => {
            infoWindow.setContent(
              `<div style="font-family:Inter,Segoe UI,sans-serif;font-size:12px;">` +
                `<strong>${point.label}</strong>` +
                `</div>`,
            );
            infoWindow.open({ map, anchor: marker });
          });
        }

        markersRef.current.push(marker);
        bounds.extend({ lat: point.lat, lng: point.lng });
      });

      if (fittedRef.current !== geoSignature) {
        fittedRef.current = geoSignature;
        if (valid.length > 1) {
          map.fitBounds(bounds, 40);
        } else if (valid.length === 1) {
          map.setCenter(center);
          map.setZoom(14);
        }
      }
    }

    initMap().catch((err) => {
      console.error("Failed to initialize map:", err);
    });

    return () => {
      isMounted = false;
      markersRef.current.forEach((m) => m.setMap(null));
      markersRef.current = [];
    };
    // `valid`/`geoSignature` are deliberately not listed: `signature` changes
    // exactly when the points do, and this closure holds that render's array.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  // Map instance is tied to the div's lifetime.
  useEffect(() => {
    return () => {
      mapInstanceRef.current = null;
    };
  }, []);

  if (!apiKey) {
    return (
      <div
        style={{
          width: "100%",
          height,
          borderRadius: 8,
          background: "#e8e4e0",
          border: "1px solid #e5e5e0",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#9ca3af",
          fontSize: 14,
          fontWeight: 500,
        }}
      >
        Map unavailable
      </div>
    );
  }

  return (
    <div
      ref={mapRef}
      style={{
        width: "100%",
        height,
        borderRadius: 8,
        backgroundColor: "#f0f0f0",
      }}
    />
  );
}
