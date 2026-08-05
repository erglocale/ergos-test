"use client";

// Real Google Maps port of Components/Map/DashboardMapGoogle.jsx from the
// production frontend: clustered vehicle + charger markers, license-plate
// labels, info windows, Vehicles/Chargers toggles, legend, Reset Zoom and the
// `flyToVehicle` CustomEvent listener. Data comes from the dummy store
// instead of the analytics/vehicles APIs.

import { MarkerClusterer } from "@googlemaps/markerclusterer";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useDb } from "@/data/store";
import { apiKey, importLibrary, POI_OFF_STYLES } from "@/lib/googleMaps";

const COLORS = {
  charging: "#16a34a",
  running: "#3b82f6",
  idle: "#f97416",
  charger: "#f97416",
};

export default function DashboardMap({
  mapContainerHeight = "100%",
}: {
  mapContainerHeight?: string;
}) {
  const db = useDb();
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<{
    vehicles: google.maps.Marker[];
    chargers: google.maps.Marker[];
    labels: google.maps.Marker[];
  }>({ vehicles: [], chargers: [], labels: [] });
  const clusterRef = useRef<{
    vehicles: MarkerClusterer | null;
    chargers: MarkerClusterer | null;
  }>({ vehicles: null, chargers: null });
  const infoRef = useRef<google.maps.InfoWindow | null>(null);
  const boundsRef = useRef<google.maps.LatLngBounds | null>(null);
  const [ready, setReady] = useState(false);
  const [showChargers, setShowChargers] = useState(true);
  const [showVehicles, setShowVehicles] = useState(true);

  // ─── Init ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!apiKey) return;
    let cancelled = false;
    async function init() {
      try {
        const { Map } = await importLibrary("maps");
        await importLibrary("marker");
        if (cancelled || !containerRef.current || mapRef.current) return;

        const map = new Map(containerRef.current, {
          zoom: 11,
          center: { lat: 26.13, lng: 91.81 },
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          zoomControl: false,
          styles: POI_OFF_STYLES,
        });

        mapRef.current = map;
        infoRef.current = new window.google.maps.InfoWindow();
        setReady(true);
      } catch (err) {
        console.error("Google Maps init failed:", err);
      }
    }
    init();
    return () => {
      cancelled = true;
    };
  }, []);

  // ─── Clear ──────────────────────────────────────────────────────
  const clearAll = useCallback(() => {
    if (clusterRef.current.chargers) {
      clusterRef.current.chargers.clearMarkers();
      clusterRef.current.chargers.setMap(null);
    }
    if (clusterRef.current.vehicles) {
      clusterRef.current.vehicles.clearMarkers();
      clusterRef.current.vehicles.setMap(null);
    }
    markersRef.current.labels.forEach((m) => m.setMap(null));
    markersRef.current = { vehicles: [], chargers: [], labels: [] };
    clusterRef.current = { vehicles: null, chargers: null };
  }, []);

  // ─── Render markers ─────────────────────────────────────────────
  const renderMarkers = useCallback(() => {
    const map = mapRef.current;
    const gm = window.google?.maps;
    const info = infoRef.current;
    if (!map || !gm || !info) return;

    clearAll();

    const bounds = new gm.LatLngBounds();
    let count = 0;

    // Charger markers
    const chargerMarkers: google.maps.Marker[] = [];
    db.chargepoints.forEach((charger) => {
      if (!charger.lat || !charger.lng) return;
      const pos = { lat: charger.lat, lng: charger.lng };
      const kw = Math.max(0, ...charger.connectors.map((c) => c.powerKw));
      const type = charger.connectors[0]?.type ?? "";

      const marker = new gm.Marker({
        position: pos,
        title: charger.name || "",
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
        info.setContent(
          `<div style="font-family:sans-serif;padding:4px;min-width:100px">` +
            `<strong style="color:${COLORS.charger}">${charger.name || ""}</strong>` +
            `<br/><span style="font-size:12px;color:#666">${kw ? `${kw} kW` : ""} ${type}</span>` +
            `</div>`,
        );
        info.open(map, marker);
      });

      marker.addListener("dblclick", () =>
        router.push(`/chargingStations/${charger.id}`),
      );

      chargerMarkers.push(marker);
      bounds.extend(pos);
      count++;
    });

    markersRef.current.chargers = chargerMarkers;
    clusterRef.current.chargers = new MarkerClusterer({
      map,
      markers: showChargers ? chargerMarkers : [],
      renderer: {
        render: ({ count: c, position }) =>
          new gm.Marker({
            position,
            label: {
              text: String(c),
              color: "#fff",
              fontSize: "12px",
              fontWeight: "700",
            },
            icon: {
              path: gm.SymbolPath.CIRCLE,
              fillColor: COLORS.charger,
              fillOpacity: 0.7,
              strokeColor: "#fff",
              strokeWeight: 2,
              scale: 16 + Math.min(c, 50) * 0.2,
            },
            zIndex: 100,
          }),
      },
    });

    // Vehicle markers
    const vehicleMarkers: google.maps.Marker[] = [];
    const vehicleLabels: google.maps.Marker[] = [];

    db.vehicles.forEach((vehicle) => {
      if (!vehicle.lat || !vehicle.lng) return;
      const pos = { lat: vehicle.lat, lng: vehicle.lng };

      const isCharging = vehicle.status === "Charging";
      const isRunning = vehicle.status === "Driving";
      const color = isCharging
        ? COLORS.charging
        : isRunning
          ? COLORS.running
          : COLORS.idle;

      const marker = new gm.Marker({
        position: pos,
        title: vehicle.reg || "",
        icon: {
          path: gm.SymbolPath.CIRCLE,
          fillColor: color,
          fillOpacity: 1,
          strokeColor: "#fff",
          strokeWeight: 2.5,
          scale: 9,
        },
        zIndex: 10,
      });

      marker.addListener("click", () => {
        info.setContent(
          `<div style="font-family:sans-serif;padding:4px;min-width:100px">` +
            `<strong style="color:${color}">${vehicle.reg || ""}</strong>` +
            `<br/><span style="font-size:12px;color:#666">${vehicle.make} ${vehicle.model}</span>` +
            `<br/><span style="font-size:12px">SoC: ${Number(vehicle.soc ?? 0).toFixed(1)}%</span>` +
            `</div>`,
        );
        info.open(map, marker);
      });

      marker.addListener("dblclick", () =>
        router.push(`/vehicles/${vehicle.id}`),
      );

      vehicleMarkers.push(marker);

      // License plate label — color matches marker
      const label = new gm.Marker({
        position: pos,
        map: showVehicles ? map : null,
        icon: { path: "M 0 0", fillOpacity: 0, strokeOpacity: 0 },
        label: {
          text: vehicle.reg || "",
          color,
          fontSize: "11px",
          fontWeight: "700",
          className: "gmap-vehicle-label",
        },
        zIndex: 5,
        clickable: false,
      });

      vehicleLabels.push(label);
      bounds.extend(pos);
      count++;
    });

    markersRef.current.vehicles = vehicleMarkers;
    markersRef.current.labels = vehicleLabels;

    clusterRef.current.vehicles = new MarkerClusterer({
      map,
      markers: showVehicles ? vehicleMarkers : [],
      renderer: {
        render: ({ count: c, position }) =>
          new gm.Marker({
            position,
            label: {
              text: String(c),
              color: "#fff",
              fontSize: "12px",
              fontWeight: "700",
            },
            icon: {
              path: gm.SymbolPath.CIRCLE,
              fillColor: "rgba(81, 187, 214, 0.8)",
              fillOpacity: 1,
              strokeColor: "#fff",
              strokeWeight: 2,
              scale: 16 + Math.min(c, 50) * 0.2,
            },
            zIndex: 100,
          }),
      },
    });

    if (count > 0) {
      boundsRef.current = bounds;
      map.fitBounds(bounds, 50);
      gm.event.addListenerOnce(map, "idle", () => {
        const zoom = map.getZoom();
        if (zoom !== undefined && zoom > 15) map.setZoom(15);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db.chargepoints, db.vehicles, router, clearAll]);

  useEffect(() => {
    if (!ready || !mapRef.current) return;
    renderMarkers();
  }, [ready, renderMarkers]);

  // ─── Toggle chargers ─────────────────────────────────────────────
  useEffect(() => {
    if (!ready) return;
    if (clusterRef.current.chargers) {
      if (showChargers) {
        clusterRef.current.chargers.addMarkers(markersRef.current.chargers);
      } else {
        clusterRef.current.chargers.clearMarkers();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showChargers]);

  // ─── Toggle vehicles ────────────────────────────────────────────
  useEffect(() => {
    if (!ready) return;
    if (clusterRef.current.vehicles) {
      if (showVehicles) {
        clusterRef.current.vehicles.addMarkers(markersRef.current.vehicles);
      } else {
        clusterRef.current.vehicles.clearMarkers();
      }
    }
    markersRef.current.labels.forEach((m) =>
      m.setMap(showVehicles ? mapRef.current : null),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showVehicles]);

  // ─── Slide to vehicle from table row click ───────────────────────
  useEffect(() => {
    const handler = (e: Event) => {
      const map = mapRef.current;
      const detail = (e as CustomEvent<{ lat?: number; lng?: number }>).detail;
      if (!map || !detail?.lat || !detail?.lng) return;
      // Smooth pan + set zoom — Google Maps animates panTo natively
      map.setZoom(15);
      map.panTo({ lat: detail.lat, lng: detail.lng });
    };
    window.addEventListener("flyToVehicle", handler);
    return () => window.removeEventListener("flyToVehicle", handler);
  }, []);

  // ─── Reset zoom ─────────────────────────────────────────────────
  function resetZoom() {
    if (mapRef.current && boundsRef.current) {
      mapRef.current.fitBounds(boundsRef.current, 50);
    }
  }

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: mapContainerHeight,
      }}
    >
      {apiKey ? (
        <div
          ref={containerRef}
          style={{ width: "100%", height: "100%", background: "#f1f5f9" }}
        />
      ) : (
        <div
          style={{
            width: "100%",
            height: "100%",
            background: "#e8e4e0",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <span style={{ color: "#9ca3af", fontSize: 14, fontWeight: 500 }}>
            Map unavailable
          </span>
        </div>
      )}

      {/* Controls — top left */}
      <div className="map-controls-panel">
        <div className="map-toggle-row" onClick={() => setShowVehicles((v) => !v)}>
          <div className={`map-switch ${showVehicles ? "map-switch-on" : ""}`}>
            <div className="map-switch-thumb" />
          </div>
          <span>Vehicles</span>
        </div>
        <div className="map-toggle-row" onClick={() => setShowChargers((v) => !v)}>
          <div className={`map-switch ${showChargers ? "map-switch-on" : ""}`}>
            <div className="map-switch-thumb" />
          </div>
          <span>Chargers</span>
        </div>
        <div className="map-legend-divider" />
        <div className="map-legend-row">
          <span className="map-dot" style={{ background: COLORS.charging }} />
          Charging
        </div>
        <div className="map-legend-row">
          <span className="map-dot" style={{ background: COLORS.running }} />
          Running
        </div>
        <div className="map-legend-row">
          <span className="map-dot" style={{ background: COLORS.idle }} />
          Idle
        </div>
      </div>

      {/* Reset Zoom — top right */}
      <button type="button" onClick={resetZoom} className="reset-zoom-btn">
        Reset Zoom
      </button>

      <style>{`
        .gmap-vehicle-label {
          margin-top: -28px !important;
          text-shadow: 0 0 3px #fff, 0 0 3px #fff, 0 0 6px #fff;
        }
        .map-controls-panel {
          position: absolute; top: 10px; left: 10px; z-index: 10;
          background: rgba(255,255,255,0.95); padding: 8px 12px; border-radius: 8px;
          box-shadow: 0 1px 4px rgba(0,0,0,0.1); font-size: 12px;
        }
        .map-toggle-row {
          display: flex; align-items: center; gap: 8px; cursor: pointer;
          color: #374151; font-size: 12px; font-weight: 500; padding: 2px 0;
          user-select: none;
        }
        .map-switch {
          width: 22px; height: 12px; border-radius: 6px;
          background: #d1d5db; position: relative; transition: background 0.2s;
          flex-shrink: 0;
        }
        .map-switch-on { background: #3b82f6; }
        .map-switch-thumb {
          width: 8px; height: 8px; border-radius: 50%;
          background: #fff; position: absolute; top: 2px; left: 2px;
          transition: left 0.2s; box-shadow: 0 1px 2px rgba(0,0,0,0.15);
        }
        .map-switch-on .map-switch-thumb { left: 12px; }
        .map-legend-divider { border-top: 1px solid #e5e7eb; margin: 6px 0; }
        .map-legend-row { display: flex; align-items: center; gap: 5px; color: #6b7280; font-size: 11px; margin-bottom: 1px; }
        .map-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
        .reset-zoom-btn {
          position: absolute; top: 10px; right: 10px; z-index: 10;
          background: #fff; border: 1px solid #d1d5db; border-radius: 8px;
          padding: 6px 14px; font-size: 13px; font-weight: 600; color: #374151;
          cursor: pointer; box-shadow: 0 1px 4px rgba(0,0,0,0.1); transition: all 0.15s;
        }
        .reset-zoom-btn:hover { background: #f97416; color: #fff; border-color: #f97416; }
      `}</style>
    </div>
  );
}
