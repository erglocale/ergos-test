"use client";

import { Card } from "antd";
import type { Driver, Vehicle } from "@/data/types";
import VehiclePhoto from "../vehiclePhoto";
import { SURFACE_CARD_STYLE } from "./ui";
import { deriveVehicleExtras, fmtDate, hasTelemetry } from "./vehicleDetailUtils";

// Small SoC ring used inside the vehicle header. Matches the brand
// orange/amber/red thresholds the live status card used to show.
function SocRing({ soc }: { soc: number | null }) {
  if (soc == null) {
    return (
      <div
        className="flex h-[68px] w-[68px] items-center justify-center rounded-full border border-dashed text-[10px] text-gray-400"
        style={{ borderColor: "#e5e7eb" }}
        title="Telematics not connected"
      >
        N/A
      </div>
    );
  }

  const color = soc >= 60 ? "#22c55e" : soc >= 30 ? "#f59e0b" : "#ef4444";
  const radius = 30;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - soc / 100);

  return (
    <div className="relative" style={{ width: 68, height: 68 }}>
      <svg viewBox="0 0 72 72" width={68} height={68} style={{ transform: "rotate(-90deg)" }}>
        <circle cx="36" cy="36" r={radius} fill="none" stroke="#f0f0f0" strokeWidth="6" />
        <circle
          cx="36"
          cy="36"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
      <div
        className="absolute inset-0 flex items-center justify-center text-base font-semibold"
        style={{ color: "#1a1f2e" }}
      >
        {soc}%
      </div>
    </div>
  );
}

// green = identified driver, amber = unknown driver (warning), gray = idle
function VehicleStatusPill({ vehicle, driver }: { vehicle: Vehicle; driver: Driver | undefined }) {
  let dot = "#9ca3af";
  let bg = "#f3f4f6";
  let fg = "#374151";
  let border = "#e5e7eb";
  let label = "Idle";
  let sub: string | null = null;

  if (vehicle.status === "Driving" && driver) {
    dot = "#22c55e";
    bg = "#f0fdf4";
    fg = "#166534";
    border = "#bbf7d0";
    label = `In use by ${driver.name}`;
  } else if (vehicle.status === "Driving") {
    dot = "#f59e0b";
    bg = "#fffbeb";
    fg = "#92400e";
    border = "#fde68a";
    label = "Driver not checked in";
  } else if (driver) {
    sub = `Last known driver: ${driver.name}`;
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <span
        className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium"
        style={{ background: bg, color: fg, borderColor: border }}
      >
        <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: dot }} />
        {label}
      </span>
      {sub && <span className="text-xs text-gray-500">{sub}</span>}
    </div>
  );
}

// Vehicle header — image, plate, model meta, live SoC ring, driver badge
// and the QR action (moved out of the tab bar, as in production).
export default function VehicleHeader({
  vehicle,
  driver,
  qrCodeSlot,
}: {
  vehicle: Vehicle;
  driver: Driver | undefined;
  qrCodeSlot: React.ReactNode;
}) {
  const extras = deriveVehicleExtras(vehicle);
  const telemetryOn = hasTelemetry(vehicle);
  const soc = telemetryOn ? Math.max(0, Math.min(100, Math.round(vehicle.soc))) : null;
  const trackingSince = fmtDate(vehicle.createdAt);

  const subtitle = [vehicle.make, vehicle.model, extras.year, `${vehicle.batteryKwh} kWh`]
    .filter(Boolean)
    .join(" · ");

  return (
    <Card
      style={{ ...SURFACE_CARD_STYLE, marginBottom: 16, height: "auto" }}
      styles={{ body: { padding: 20 } }}
    >
      <div className="flex flex-wrap items-center gap-5">
        {/* Photo for the demo fleet; icon placeholder for anything else. */}
        <VehiclePhoto vehicle={vehicle} width={150} height={96} />

        {/* Identity */}
        <div className="min-w-0 flex-1">
          <div className="text-xl font-bold tracking-wide" style={{ color: "#1a1f2e" }}>
            {vehicle.reg || "—"}
          </div>
          <div className="mt-0.5 text-sm text-gray-500">{subtitle || "—"}</div>
          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-gray-400">
            {telemetryOn && (
              <span>
                Device ID: <span className="text-gray-600">{vehicle.imei}</span>
              </span>
            )}
            <span>
              Range: <span className="text-gray-600">{extras.rangeKm} km</span>
            </span>
            <span>
              Tracking since: <span className="text-gray-600">{trackingSince}</span>
            </span>
          </div>
          {/* Assigned hubs chips */}
          <div className="mt-2">
            <span
              className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium"
              style={{ background: "#fff7ed", color: "#9a3412", borderColor: "#fed7aa" }}
            >
              <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: "#f97417" }} />
              {vehicle.hub}
            </span>
          </div>
        </div>

        {/* Live SoC + driver badge */}
        <div className="flex flex-shrink-0 items-center gap-4">
          <SocRing soc={soc} />
          <VehicleStatusPill vehicle={vehicle} driver={driver} />
        </div>

        {/* Actions */}
        <div className="flex flex-shrink-0 items-center gap-2">{qrCodeSlot}</div>
      </div>
    </Card>
  );
}
