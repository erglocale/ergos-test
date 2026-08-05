"use client";

import { Card } from "antd";
import type { Vehicle } from "@/data/types";
import { SectionLabel, SURFACE_CARD_STYLE } from "./ui";
import { deriveVehicleExtras, hasTelemetry } from "./vehicleDetailUtils";

function SpecsItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-gray-500">{label}</div>
      <div className="mt-0.5 text-sm font-medium text-gray-800">
        {value !== undefined && value !== null && value !== "" ? value : "—"}
      </div>
    </div>
  );
}

// Full-width specs card placed below the live strip.
export default function SpecsCard({ vehicle }: { vehicle: Vehicle }) {
  const extras = deriveVehicleExtras(vehicle);
  const hasDeviceId = hasTelemetry(vehicle);
  const idLabel = hasDeviceId ? "Device ID" : "VIN";
  const idValue = hasDeviceId ? vehicle.imei : extras.vin;

  return (
    <Card style={{ ...SURFACE_CARD_STYLE, height: "auto" }} styles={{ body: { padding: 20 } }}>
      <SectionLabel>Vehicle Specifications</SectionLabel>
      <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-3 lg:grid-cols-6">
        <SpecsItem label="Manufacturer" value={vehicle.make} />
        <SpecsItem label="Model" value={vehicle.model} />
        <SpecsItem label="Year" value={extras.year} />
        <SpecsItem label="Battery capacity" value={`${vehicle.batteryKwh} kWh`} />
        <SpecsItem label="Range" value={`${extras.rangeKm} km`} />
        <SpecsItem label={idLabel} value={idValue} />
      </div>
    </Card>
  );
}
