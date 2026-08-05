"use client";

// Real Google Maps port of Components/Map/VehicleByIdRealtimeMapGoogle.jsx
// from the production frontend: a clean chrome-less map centered on the
// vehicle, the custom HTML overlay marker (pulsing green badge while the
// vehicle is running, black otherwise, license plate + "updated x ago" line)
// and the "Realtime Vehicle Location" title control. Nearby chargers from the
// dummy store and a Recenter button are added for the sandbox.

import { useEffect, useRef } from "react";
import { useDb } from "@/data/store";
import type { Vehicle } from "@/data/types";
import { apiKey, importLibrary, POI_OFF_STYLES } from "@/lib/googleMaps";

// Default location in India (New Delhi) — production fallback.
const DEFAULT_LOCATION = { lat: 28.6139, lng: 77.209 };

function isValidCoordinates(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180 &&
    !(lat === 0 && lng === 0)
  );
}

// Deterministic per-vehicle "minutes ago" for the telemetry timestamp the
// fixtures lack (same derivation as FleetAndChargerHostLayout).
function hashMinutes(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) | 0;
  return (Math.abs(h) % 170) + 2; // 2..171 minutes
}

function formatAgo(minutes: number): string {
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  return `about ${hours} hour${hours === 1 ? "" : "s"} ago`;
}

export default function VehicleRealtimeMap({ vehicle }: { vehicle: Vehicle }) {
  const db = useDb();
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const centerRef = useRef(DEFAULT_LOCATION);
  const chargepointsRef = useRef(db.chargepoints);
  chargepointsRef.current = db.chargepoints;

  const isRunning = vehicle.status === "Driving";
  const center = isValidCoordinates(vehicle.lat, vehicle.lng)
    ? { lat: vehicle.lat, lng: vehicle.lng }
    : DEFAULT_LOCATION;
  centerRef.current = center;

  useEffect(() => {
    if (!apiKey) return;
    let cancelled = false;

    async function init() {
      try {
        const { Map } = await importLibrary("maps");
        await importLibrary("marker");
        if (cancelled || !mapContainerRef.current) return;

        const gm = window.google.maps;

        if (!mapInstanceRef.current) {
          mapInstanceRef.current = new Map(mapContainerRef.current, {
            center,
            zoom: 15,
            minZoom: 2,
            // Hide all default Google Maps UI controls — keeps the realtime
            // location card clean (same as production).
            mapTypeControl: false,
            fullscreenControl: false,
            streetViewControl: false,
            zoomControl: false,
            rotateControl: false,
            scaleControl: false,
            panControl: false,
            keyboardShortcuts: false,
            styles: POI_OFF_STYLES,
          });

          // Title control — same look as production addMapTitle().
          const titleControlDiv = document.createElement("div");
          Object.assign(titleControlDiv.style, {
            backgroundColor: "rgba(255, 255, 255, 1)",
            border: "2px solid #fff",
            borderRadius: "7px",
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
          titleControlDiv.textContent = "Realtime Vehicle Location";
          mapInstanceRef.current.controls[gm.ControlPosition.TOP_LEFT].push(
            titleControlDiv,
          );
        }

        const map = mapInstanceRef.current;

        // ── Custom HTML overlay marker (production CustomOverlay) ──
        class CustomOverlay extends gm.OverlayView {
          position: google.maps.LatLngLiteral;
          div: HTMLDivElement | null = null;
          isTrailMode: boolean;

          constructor(
            overlayMap: google.maps.Map,
            position: google.maps.LatLngLiteral,
            isTrailMode: boolean,
          ) {
            super();
            this.position = position;
            this.isTrailMode = isTrailMode;
            this.setMap(overlayMap);
          }

          onAdd() {
            this.div = document.createElement("div");
            Object.assign(this.div.style, {
              position: "absolute",
              transform: "translate(-50%, -100%)",
              zIndex: "1000",
              display: "flex",
              alignItems: "center",
              flexDirection: "column-reverse",
              padding: "1px",
              borderRadius: "8px",
              fontFamily: "Arial, sans-serif",
            });

            // Badge/indicator
            const badgeContainer = document.createElement("div");
            badgeContainer.style.position = "relative";
            badgeContainer.style.marginTop = "4px";

            const badge = document.createElement("div");
            Object.assign(badge.style, {
              width: "20px",
              height: "20px",
              borderRadius: "50%",
              position: "relative",
            });

            if (this.isTrailMode) {
              // Green pulsing badge while running
              badge.style.backgroundColor = "#52c41a";
              badge.style.animation = "pulse 1.5s infinite";
              if (!document.getElementById("pulse-animation")) {
                const style = document.createElement("style");
                style.id = "pulse-animation";
                style.textContent = `
                  @keyframes pulse {
                    0% { box-shadow: 0 0 0 0 rgba(82, 196, 26, 0.7); }
                    70% { box-shadow: 0 0 0 10px rgba(82, 196, 26, 0); }
                    100% { box-shadow: 0 0 0 0 rgba(82, 196, 26, 0); }
                  }
                `;
                document.head.appendChild(style);
              }
            } else {
              // Black static badge when not running
              badge.style.backgroundColor = "rgba(0, 0, 0, 0.8)";
              badge.style.border = "2px solid rgba(0, 0, 0, 1)";
            }

            badgeContainer.appendChild(badge);
            this.div.appendChild(badgeContainer);

            // License plate
            const licensePlate = document.createElement("p");
            licensePlate.textContent = vehicle.reg;
            Object.assign(licensePlate.style, {
              fontWeight: "900",
              margin: "0px 0",
              fontSize: "15px",
              color: "#f97315",
              textShadow:
                "0 0 1px white, 0 0 2px white, 0 0 3px white, 0 0 4px white, 0 0 5px white",
            });
            this.div.appendChild(licensePlate);

            // Timestamp
            const timestamp = document.createElement("p");
            timestamp.textContent = `🛜 Updated ${formatAgo(hashMinutes(vehicle.id))}`;
            Object.assign(timestamp.style, {
              fontSize: "10px",
              margin: "0",
              color: "black",
            });
            this.div.appendChild(timestamp);

            this.getPanes()?.overlayMouseTarget.appendChild(this.div);
          }

          draw() {
            const projection = this.getProjection();
            if (!projection || !this.div) return;
            const pos = projection.fromLatLngToDivPixel(
              new gm.LatLng(this.position),
            );
            if (!pos) return;
            this.div.style.left = `${pos.x}px`;
            this.div.style.top = `${pos.y}px`;
          }

          onRemove() {
            if (this.div?.parentNode) {
              this.div.parentNode.removeChild(this.div);
              this.div = null;
            }
          }
        }

        const overlay = new CustomOverlay(map, center, isRunning);

        // ── Nearby chargers from the dummy store ──
        const info = new gm.InfoWindow();
        const chargerMarkers = chargepointsRef.current
          .filter((c) => isValidCoordinates(c.lat, c.lng))
          .map((charger) => {
            const marker = new gm.Marker({
              position: { lat: charger.lat, lng: charger.lng },
              map,
              title: charger.name,
              icon: {
                path: "M7 2v11h3v9l7-12h-4l4-8z", // Lightning bolt
                fillColor: "#16a34a",
                fillOpacity: 1,
                strokeColor: "#fff",
                strokeWeight: 1.5,
                scale: 1.2,
                anchor: new gm.Point(12, 22),
              },
            });
            marker.addListener("click", () => {
              const kw = Math.max(0, ...charger.connectors.map((c) => c.powerKw));
              info.setContent(
                `<div style="font-family:sans-serif;padding:4px;min-width:100px">` +
                  `<strong style="color:#f97416">${charger.name}</strong>` +
                  `<br/><span style="font-size:12px;color:#666">${kw ? `${kw} kW` : ""} ${charger.connectors[0]?.type ?? ""}</span>` +
                  `</div>`,
              );
              info.open(map, marker);
            });
            return marker;
          });

        map.setCenter(center);
        map.setZoom(15);

        cleanupRef.current = () => {
          overlay.setMap(null);
          chargerMarkers.forEach((m) => m.setMap(null));
          info.close();
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicle.id, vehicle.lat, vehicle.lng, isRunning]);

  function recenter() {
    const map = mapInstanceRef.current;
    if (!map) return;
    map.setCenter(centerRef.current);
    map.setZoom(15);
  }

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
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <div
        ref={mapContainerRef}
        style={{ width: "100%", height: "100%", borderRadius: "8px" }}
      />
      <button
        type="button"
        onClick={recenter}
        className="realtime-recenter-btn"
      >
        Recenter
      </button>
      <style>{`
        .realtime-recenter-btn {
          position: absolute; top: 10px; right: 10px; z-index: 10;
          background: #fff; border: 1px solid #d1d5db; border-radius: 8px;
          padding: 6px 14px; font-size: 13px; font-weight: 600; color: #374151;
          cursor: pointer; box-shadow: 0 1px 4px rgba(0,0,0,0.1); transition: all 0.15s;
        }
        .realtime-recenter-btn:hover { background: #f97416; color: #fff; border-color: #f97416; }
      `}</style>
    </div>
  );
}
