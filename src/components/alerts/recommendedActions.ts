// Recommended actions for vehicle alerts (demo spec item 8).
//
// The copy comes from the spec, but the numbers in it are derived from the
// sandbox's own data wherever they can be: remaining range from the vehicle's
// rated range and SoC, the nearest charger from real coordinates and live
// connector occupancy, idle time from the alert payload. Overspeed escalates
// with frequency — first event is informational, repeat offenders get coaching
// language.

import dayjs from "dayjs";
import { deriveVehicleExtras } from "@/components/vehicles/detail/vehicleDetailUtils";
import type { Alert, Chargepoint, ChargingSession, Vehicle } from "@/data/types";
import { fmtNum, parsePayload } from "./alertUtils";

const EARTH_KM = 6371;

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.sqrt(a));
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

/** Remaining range in km from the vehicle's rated range and current SoC. */
function remainingRangeKm(vehicle: Vehicle | undefined, socAtAlert: number | null): number | null {
  if (!vehicle) return null;
  const soc = socAtAlert ?? vehicle.soc;
  return Math.round(deriveVehicleExtras(vehicle).rangeKm * (soc / 100));
}

/** Closest charger to the vehicle, with whether a connector is free right now. */
function nearestCharger(
  vehicle: Vehicle | undefined,
  chargepoints: Chargepoint[],
  sessions: ChargingSession[],
): { name: string; km: number; free: boolean } | null {
  if (!vehicle || !chargepoints.length) return null;
  let best: { cp: Chargepoint; km: number } | null = null;
  for (const cp of chargepoints) {
    const km = haversineKm(vehicle.lat, vehicle.lng, cp.lat, cp.lng);
    if (!best || km < best.km) best = { cp, km };
  }
  if (!best) return null;
  const busy = sessions.filter((s) => s.endTime === null && s.chargerId === best.cp.id).length;
  const usable = best.cp.connectors.filter((c) => c.status !== "Faulted" && c.status !== "Unavailable");
  return {
    name: best.cp.hub,
    km: Math.round(best.km * 10) / 10,
    free: best.cp.status === "Online" && busy < usable.length,
  };
}

export interface ActionContext {
  vehicles: Vehicle[];
  chargepoints: Chargepoint[];
  sessions: ChargingSession[];
  /** Every alert in scope — used to count repeat offences. */
  allAlerts: Alert[];
}

/**
 * The action a fleet manager should take for one alert. Returns plain text so
 * it can be rendered in a table cell or exported.
 */
export function recommendedAction(alert: Alert, ctx: ActionContext): string {
  const p = parsePayload(alert.payload) ?? {};
  const vehicle = ctx.vehicles.find((v) => v.reg === alert.vehicleLicensePlate);

  switch (alert.alertType) {
    case "repeated_fast_charging":
      return "Please use slow charging for the next session.";

    case "low_soc_level_2": {
      const km = remainingRangeKm(vehicle, p.threshold ?? null);
      return km === null
        ? "Route to nearest available charger."
        : `Route to nearest available charger. Estimated ${km} km remaining range.`;
    }

    case "low_soc_level_3": {
      const near = nearestCharger(vehicle, ctx.chargepoints, ctx.sessions);
      if (!near) return "Divert immediately to the nearest available charger.";
      return `Divert immediately. Nearest charger: ${near.name}, ${near.km} km, ${
        near.free ? "connector available" : "no free connector — call ahead"
      }.`;
    }

    case "overspeed_low_soc":
      return (
        "Reduce speed immediately to conserve range. Current driving pattern will deplete " +
        "battery before next charging point."
      );

    case "excessive_idle": {
      const minutes = Math.round(Number(p.duration_hours ?? 0) * 60);
      const howLong = minutes > 0 ? `${minutes} min` : "an extended period";
      return `Vehicle idle for ${howLong} at current location. Check if driver is on unscheduled break or waiting for loading.`;
    }

    case "overspeed": {
      // Frequency drives the tone: the first event of the week is a note, the
      // third and beyond is a coaching flag.
      const weekStart = dayjs(alert.createdAt).subtract(7, "day");
      const count = ctx.allAlerts.filter(
        (a) =>
          a.alertType === "overspeed" &&
          a.vehicleLicensePlate === alert.vehicleLicensePlate &&
          !dayjs(a.createdAt).isAfter(dayjs(alert.createdAt)) &&
          dayjs(a.createdAt).isAfter(weekStart),
      ).length;
      if (count <= 1) return "Informational. First overspeed event this week for this vehicle.";
      if (count === 2) return "Review with driver. 2nd overspeed event this week for this vehicle.";
      return `Flag for driver coaching. ${ordinal(count)} overspeed event this week for this vehicle.`;
    }

    case "low_soc_level_1":
      return `Plan a top-up at the next stop — battery below ${fmtNum(p.threshold)}%.`;

    case "low_aux_battery":
      return "Check the 12 V auxiliary battery and its charging circuit at the next service.";

    default:
      return "Review with the fleet supervisor.";
  }
}
