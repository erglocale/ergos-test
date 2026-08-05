"use client";

import { Card } from "antd";
import type { Vehicle } from "@/data/types";
import VehicleRealtimeMap from "@/components/maps/VehicleRealtimeMap";
import { SectionLabel, SURFACE_CARD_STYLE } from "./ui";
import { deriveLastTelemetryTs, fmtDateTime, hasTelemetry } from "./vehicleDetailUtils";

export default function MapCard({ vehicle }: { vehicle: Vehicle }) {
  const lastUpdate = hasTelemetry(vehicle) ? deriveLastTelemetryTs(vehicle) : null;

  return (
    <Card
      style={SURFACE_CARD_STYLE}
      styles={{
        body: { padding: 0, height: "100%", display: "flex", flexDirection: "column" },
      }}
    >
      <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-3">
        <span
          className="inline-block h-1.5 w-1.5 rounded-full"
          style={{ background: "#22c55e", animation: "pulse 2s infinite" }}
        />
        <SectionLabel>Live Location</SectionLabel>
      </div>
      <div
        className="map-wrapper"
        style={{ flex: 1, minHeight: 360, position: "relative", overflow: "hidden" }}
      >
        <VehicleRealtimeMap vehicle={vehicle} />
      </div>
      <div
        className="border-t border-gray-100 px-4 py-2 text-[11px] text-gray-500"
        style={{ borderBottomLeftRadius: 10, borderBottomRightRadius: 10 }}
      >
        Last updated:{" "}
        <span className="font-medium text-gray-700">
          {lastUpdate ? fmtDateTime(lastUpdate.toISOString()) : "—"}
        </span>
      </div>
    </Card>
  );
}
