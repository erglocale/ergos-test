// Vehicle alerts for the energy-brain demo fleet (BrightDrop 400 / E-Transit).
//
// The fixtures generate alerts for their own vehicles, but the demo vans arrive
// at runtime from energy-brain, so theirs are synthesized here — same Alert
// shape and the same payload keys getAlertSummary() renders.
//
// Repeated fast charging is the alert Eco Mobility sees most in the field: a
// vehicle that keeps taking high-power top-ups instead of charging on the depot
// overnight. It is also the one the SoC-cap suggestions exist to correct, so it
// leads the demo feed, with a couple of excessive-idle alerts alongside it.
//
// Severity is per alert type, not per occurrence — production tags every alert
// of a type the same way, and critical is reserved for the ones that can strand
// a vehicle (overspeed + low SoC, low SoC level 3).

import type { Alert, Vehicle } from "./types";

/** ~0.5C for an 89–100 kWh van pack — above this a session counts as "fast". */
const FAST_KW = 50;
/** Consecutive fast charges before the alert fires. */
const REQUIRED = 3;

interface ScriptEntry {
  /** Index into the fleet sorted by plate, wrapped if the fleet is smaller. */
  vehicle: number;
  alertType: Alert["alertType"];
  /** Under 168 h so every entry sits inside the alerts page's default 7-day
   *  window whatever time of day the demo runs. */
  hoursAgo: number;
  payload: Record<string, number>;
  resolved: boolean;
}

const fastCharge = (count: number) => ({
  consecutive_fast_charge_count: count,
  required_fast_charge_count: REQUIRED,
  fast_charging_power_threshold_kw: FAST_KW,
});

const idle = (hours: number) => ({ duration_hours: hours, threshold_hours: 2 });

/** 12 V auxiliary battery — recovers once the vehicle runs or charges. */
const aux = (volts: number, minutes: number) => ({
  lowest_voltage: volts,
  threshold: 11.8,
  duration_seconds: minutes * 60,
});

// Three repeated-fast-charging alerts (the newest is the worst offender), two
// excessive-idle ones and two low auxiliary battery.
const SCRIPT: ScriptEntry[] = [
  { vehicle: 0, alertType: "repeated_fast_charging", hoursAgo: 14, payload: fastCharge(5), resolved: false },
  { vehicle: 3, alertType: "low_aux_battery", hoursAgo: 17, payload: aux(11.1, 95), resolved: false },
  { vehicle: 2, alertType: "excessive_idle", hoursAgo: 20, payload: idle(5.5), resolved: false },
  { vehicle: 1, alertType: "repeated_fast_charging", hoursAgo: 2 * 24 + 3, payload: fastCharge(4), resolved: false },
  { vehicle: 2, alertType: "low_aux_battery", hoursAgo: 2 * 24 + 19, payload: aux(10.7, 140), resolved: true },
  { vehicle: 3, alertType: "excessive_idle", hoursAgo: 3 * 24 + 2, payload: idle(3.2), resolved: true },
  { vehicle: 3, alertType: "repeated_fast_charging", hoursAgo: 4 * 24 + 6, payload: fastCharge(3), resolved: true },
];

// Timestamps are anchored once per page load: getDb() re-merges on every store
// change, and alerts that shifted a few milliseconds each time would re-render
// the list forever.
const ANCHOR = Date.now();

let cache: { key: string; alerts: Alert[] } | null = null;

/**
 * Vehicle alerts for the demo fleet. Deterministic and cached on the fleet's
 * plates, so repeated merges return the identical rows.
 */
export function demoVehicleAlerts(vehicles: Vehicle[]): Alert[] {
  const fleet = [...vehicles].sort((a, b) => a.reg.localeCompare(b.reg));
  const key = fleet.map((v) => v.reg).join("|");
  if (cache?.key === key) return cache.alerts;
  if (!fleet.length) {
    cache = { key, alerts: [] };
    return cache.alerts;
  }

  const alerts: Alert[] = SCRIPT.map((entry, i): Alert => {
    const vehicle = fleet[entry.vehicle % fleet.length];
    const createdAt = new Date(ANCHOR - entry.hoursAgo * 3_600_000);
    return {
      id: `demo-alert-${i}-${vehicle.reg}`,
      alertType: entry.alertType,
      severity: "warning",
      vehicleLicensePlate: vehicle.reg,
      payload: entry.payload,
      createdAt: createdAt.toISOString(),
      resolved: entry.resolved,
      resolvedAt: entry.resolved
        ? new Date(createdAt.getTime() + 3 * 3_600_000).toISOString()
        : null,
    };
  }).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  cache = { key, alerts };
  return alerts;
}
