"use client";

// Real Google Maps port of Components/Map/TripRouteMapGoogle.jsx from the
// production frontend. The fixtures carry no GPS track, so a deterministic
// plausible route is derived from the trip id (hash-seeded PRNG): start/end
// near the Guwahati hub with ~20 jittered intermediate waypoints. Polyline,
// start/end markers, "Start"/"End" label overlays, info windows and the map
// title control match the production component.

import { useEffect, useRef } from "react";
import type { Trip } from "@/data/types";
import { apiKey, importLibrary, POI_OFF_STYLES } from "@/lib/googleMaps";

const MARKER_ICON_URL =
  "https://mapbox-public-data.s3.ap-south-1.amazonaws.com/icons/OrangeMarker.png";

// ─── Deterministic route derivation ───────────────────────────────
function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// Small deterministic PRNG (mulberry32).
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function deriveTripPath(trip: Trip): { lat: number; lng: number }[] {
  const rand = mulberry32(hashString(trip.id) || 1);
  const latMin = 26.11;
  const latMax = 26.13;
  const lngMin = 91.78;
  const lngMax = 91.81;

  const start = {
    lat: latMin + rand() * (latMax - latMin),
    lng: lngMin + rand() * (lngMax - lngMin),
  };
  const end = {
    lat: latMin + rand() * (latMax - latMin),
    lng: lngMin + rand() * (lngMax - lngMin),
  };

  const steps = 20;
  const bendPhase = rand() * Math.PI * 2;
  const bendAmp = 0.0015 + rand() * 0.002;
  const path: { lat: number; lng: number }[] = [start];
  for (let i = 1; i < steps; i += 1) {
    const t = i / steps;
    // Linear interpolation + a smooth "road curve" bend + small jitter.
    const bend = Math.sin(t * Math.PI + bendPhase) * bendAmp;
    path.push({
      lat:
        start.lat +
        (end.lat - start.lat) * t +
        bend +
        (rand() - 0.5) * 0.0006,
      lng:
        start.lng +
        (end.lng - start.lng) * t -
        bend +
        (rand() - 0.5) * 0.0006,
    });
  }
  path.push(end);
  return path;
}

// ──────────────────────────────────────────────────────────────────
export default function TripRouteMap({ trip }: { trip: Trip }) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!apiKey) return;
    let cancelled = false;

    async function init() {
      try {
        const { Map } = await importLibrary("maps");
        await importLibrary("marker");
        if (cancelled || !mapContainerRef.current) return;

        const gm = window.google.maps;
        const path = deriveTripPath(trip);

        if (!mapInstanceRef.current) {
          mapInstanceRef.current = new Map(mapContainerRef.current, {
            center: path[0],
            zoom: 13,
            minZoom: 2,
            mapTypeControl: false,
            styles: POI_OFF_STYLES,
          });

          // Map title control — same look as production addMapTitle().
          const titleControlDiv = document.createElement("div");
          Object.assign(titleControlDiv.style, {
            backgroundColor: "rgba(255, 255, 255, 1)",
            border: "2px solid #fff",
            borderRadius: "5px",
            boxShadow: "0 2px 6px rgba(0,0,0,.3)",
            cursor: "pointer",
            marginTop: "10px",
            marginLeft: "10px",
            textAlign: "center",
            fontFamily: "Roboto,Arial,sans-serif",
            fontSize: "16px",
            fontWeight: "bold",
            color: "#333",
            padding: "8px 16px",
          });
          titleControlDiv.textContent = "Trip route";
          mapInstanceRef.current.controls[gm.ControlPosition.TOP_LEFT].push(
            titleControlDiv,
          );
        }

        const map = mapInstanceRef.current;

        // ── Polyline (production: red, weight 4, geodesic) ──
        const polyline = new gm.Polyline({
          path,
          geodesic: true,
          strokeColor: "#FF0000",
          strokeOpacity: 1.0,
          strokeWeight: 4,
        });
        polyline.setMap(map);

        // ── Start/End markers ──
        const startPoint = path[0];
        const endPoint = path[path.length - 1];

        const makeMarker = (
          position: google.maps.LatLngLiteral,
          title: string,
          zIndex: number,
        ) =>
          new gm.Marker({
            position,
            map,
            title,
            icon: {
              url: MARKER_ICON_URL,
              scaledSize: new gm.Size(40, 50),
            },
            zIndex,
          });

        const startMarker = makeMarker(startPoint, "Start Point", 1000);
        const endMarker = makeMarker(endPoint, "End Point", 999);

        // ── "Start"/"End" label overlays (production LabelOverlay) ──
        class LabelOverlay extends gm.OverlayView {
          position: google.maps.LatLngLiteral;
          text: string;
          div: HTMLDivElement | null = null;

          constructor(position: google.maps.LatLngLiteral, text: string) {
            super();
            this.position = position;
            this.text = text;
          }

          onAdd() {
            const div = document.createElement("div");
            Object.assign(div.style, {
              position: "absolute",
              backgroundColor: "rgba(255, 255, 255, 1)",
              padding: "4px 8px",
              borderRadius: "4px",
              border: "1px solid rgba(0,0,0,0.3)",
              fontSize: "16px",
              fontWeight: "600",
              color: "#ff6506",
              whiteSpace: "nowrap",
            });
            div.textContent = this.text;
            this.div = div;
            this.getPanes()?.overlayMouseTarget.appendChild(div);
          }

          draw() {
            const projection = this.getProjection();
            if (!projection || !this.div) return;
            const pos = projection.fromLatLngToDivPixel(
              new gm.LatLng(this.position),
            );
            if (!pos) return;
            this.div.style.left = `${pos.x - this.div.offsetWidth / 2}px`;
            this.div.style.top = `${pos.y - 80}px`;
          }

          onRemove() {
            if (this.div?.parentNode) {
              this.div.parentNode.removeChild(this.div);
              this.div = null;
            }
          }
        }

        const startOverlay = new LabelOverlay(startPoint, "Start");
        startOverlay.setMap(map);
        const endOverlay = new LabelOverlay(endPoint, "End");
        endOverlay.setMap(map);

        // ── Info windows ──
        const startInfoWindow = new gm.InfoWindow({
          content: "<div><strong>Trip Start</strong><br/>Departure Point</div>",
        });
        const endInfoWindow = new gm.InfoWindow({
          content: "<div><strong>Trip End</strong><br/>Return Point</div>",
        });
        startMarker.addListener("click", () => {
          endInfoWindow.close();
          startInfoWindow.open(map, startMarker);
        });
        endMarker.addListener("click", () => {
          startInfoWindow.close();
          endInfoWindow.open(map, endMarker);
        });

        // ── Fit route ──
        const bounds = new gm.LatLngBounds();
        path.forEach((p) => bounds.extend(p));
        map.fitBounds(bounds);

        cleanupRef.current = () => {
          polyline.setMap(null);
          startMarker.setMap(null);
          endMarker.setMap(null);
          startOverlay.setMap(null);
          endOverlay.setMap(null);
        };
      } catch (err) {
        console.error("Google Maps init failed:", err);
      }
    }

    init();
    return () => {
      cancelled = true;
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  }, [trip]);

  if (!apiKey) {
    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          borderRadius: "8px",
          background: "#e8e4e0",
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
      ref={mapContainerRef}
      style={{ width: "100%", height: "100%", borderRadius: "8px" }}
    />
  );
}
