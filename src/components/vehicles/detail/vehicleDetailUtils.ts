import dayjs, { type Dayjs } from "dayjs";
import { taperFactor } from "@/data/liveSim";
import type { ChargingSession, Trip, Vehicle } from "@/data/types";

export function fmtDateTime(iso: string | number | null | undefined): string {
  if (iso === null || iso === undefined || iso === "") return "N/A";
  return dayjs(iso).format("DD MMM YYYY, hh:mm A");
}

export function fmtDate(iso: string | number | null | undefined): string {
  if (iso === null || iso === undefined || iso === "") return "N/A";
  return dayjs(iso).format("DD MMM YYYY");
}

/** "2 hours 15 minutes" style duration, mirroring utils/misc getDurationString. */
export function getDurationString(startIso: string | number, endIso: string | number): string {
  const seconds = Math.max(0, dayjs(endIso).diff(dayjs(startIso), "second"));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  let result = "";
  if (hours > 0) result += `${hours} ${hours === 1 ? "hour" : "hours"} `;
  if (minutes > 0) result += `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
  if (result === "") return "0 minutes";
  return result.trim();
}

/** Port of utils/misc getRelativeTime — "15 sec ago", "1 hour ago", … */
export function getRelativeTime(
  date: string | number | Date,
  options: { now?: Date; withSuffix?: boolean } = {},
): string {
  const { now = new Date(), withSuffix = true } = options;
  const then = new Date(date);
  if (Number.isNaN(then.getTime())) return "";

  const diffMs = now.getTime() - then.getTime();
  const isFuture = diffMs < 0;
  const absMs = Math.abs(diffMs);

  const sec = Math.round(absMs / 1000);
  const min = Math.round(absMs / 60000);
  const hour = Math.round(absMs / 3600000);
  const day = Math.round(absMs / 86400000);

  let value: number;
  let unit: string;
  if (sec < 45) {
    value = Math.max(sec, 0);
    unit = "sec";
  } else if (min < 60) {
    value = min;
    unit = "min";
  } else if (hour < 24) {
    value = hour;
    unit = "hour";
  } else {
    value = day;
    unit = "day";
  }
  const plural = value === 1 || unit === "sec" || unit === "min" ? unit : `${unit}s`;
  const core = `${value} ${plural}`;
  if (!withSuffix) return core;
  return isFuture ? `in ${core}` : `${core} ago`;
}

// ---- deterministic derivation helpers --------------------------------------

export function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
}

/** Deterministic pseudo-random in [0,1) from a seed string + index. */
export function noise(seed: string, i: number): number {
  const h = hashId(`${seed}:${i}`);
  return (h % 1000) / 1000;
}

/**
 * Fixture gaps derived deterministically per vehicle: model year, rated
 * range, battery SoH, VIN — the production API returns these but the
 * sandbox fixtures do not store them.
 */
export function deriveVehicleExtras(vehicle: Vehicle) {
  const h = hashId(vehicle.id);
  const year = 2021 + (h % 4); // 2021-2024
  const rangeKm = Math.round(vehicle.batteryKwh * (8 + (h % 3))); // ~8-10 km/kWh for 3W EVs
  const soh = 82 + (h % 16); // 82-97 %
  const vin = `MA1${String(h % 1_000_000_000).padStart(9, "0")}${vehicle.id.replace(/\D/g, "").padStart(5, "0")}`.slice(0, 17);
  return { year, rangeKm, soh, vin };
}

/** Whether the fixture vehicle counts as telematics-connected. */
export function hasTelemetry(vehicle: Vehicle): boolean {
  return vehicle.status !== "Offline";
}

/**
 * Deterministic "last telemetry update" timestamp — a few minutes ago for
 * online vehicles, hours ago for offline ones.
 */
export function deriveLastTelemetryTs(vehicle: Vehicle, now = dayjs()): Dayjs {
  const h = hashId(vehicle.id);
  if (vehicle.status === "Offline") return now.subtract(6 + (h % 40), "hour");
  return now.subtract(1 + (h % 9), "minute").subtract(h % 60, "second");
}

/**
 * SoC at an arbitrary timestamp for the charted history. Deterministic
 * daily cycle: overnight charging up to the SoC cap, daytime discharge.
 * The series is later blended so that "now" lands exactly on vehicle.soc.
 */
function socPatternAt(vehicle: Vehicle, tMs: number): number {
  const cap = vehicle.socCapPct || 90;
  const dayIdx = Math.floor(tMs / 86_400_000);
  const low = Math.max(8, cap - 42 - noise(vehicle.id, dayIdx) * 12);
  const d = dayjs(tMs);
  const hour = d.hour() + d.minute() / 60;

  // 21:00 → 08:00 charging, 08:00 → 21:00 discharging
  let base: number;
  if (hour >= 8 && hour < 21) {
    const f = (hour - 8) / 13;
    base = cap - (cap - low) * f;
  } else {
    const sinceCharge = hour >= 21 ? hour - 21 : hour + 3; // 0..11
    const f = Math.min(1, sinceCharge / 9);
    base = low + (cap - low) * f;
  }
  const jitter = (noise(vehicle.id, Math.floor(tMs / 900_000)) - 0.5) * 2.4;
  return Math.min(100, Math.max(0, base + jitter));
}

export interface SocAuxPoint {
  ts: number;
  soc: number;
  aux: number;
}

/** One charge the vehicle actually went through, on the chart's time axis. */
export interface ChargeWindow {
  startMs: number;
  /** "now" while the session is still running. */
  endMs: number;
  socStart: number;
  socEnd: number;
  live: boolean;
}

/**
 * The vehicle's charges as time windows, taken from the session rows rather
 * than invented. A live session is simulated, so its end is "now" and its end
 * SoC is the vehicle's current one — which is exactly what the simulator has
 * been writing. That makes the battery chart agree with the session, the hub
 * calendar and the SoC ring instead of telling a third story.
 */
export function chargeWindowsFor(
  sessions: ChargingSession[],
  vehicle: Vehicle,
  nowMs: number = dayjs().valueOf(),
): ChargeWindow[] {
  const out: ChargeWindow[] = [];
  for (const s of sessions) {
    if (s.vehicleReg !== vehicle.reg) continue;
    const startMs = dayjs(s.startTime).valueOf();
    const live = s.endTime === null;
    const endMs = live ? nowMs : dayjs(s.endTime).valueOf();
    const socEnd = live ? vehicle.soc : s.socEnd;
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) continue;
    if (endMs <= startMs || socEnd == null) continue;
    out.push({ startMs, endMs, socStart: s.socStart, socEnd, live });
  }
  return out.sort((a, b) => a.startMs - b.startMs);
}

/**
 * SoC as a fraction of the way through a charge. Not linear: the rate is
 * shaped by the same taper the live simulator uses, so a charge crossing 80 %
 * visibly slows down. Returns a sampler so the integration is done once per
 * window rather than once per point.
 */
function chargeCurve(socStart: number, socEnd: number): (progress: number) => number {
  if (socEnd <= socStart) {
    return (p) => socStart + (socEnd - socStart) * Math.min(1, Math.max(0, p));
  }
  const STEPS = 48;
  const dSoc = (socEnd - socStart) / STEPS;
  // How long each equal slice of SoC takes, in arbitrary units.
  const slices: number[] = [];
  let total = 0;
  for (let i = 0; i < STEPS; i += 1) {
    const dt = dSoc / taperFactor(socStart + dSoc * (i + 0.5));
    slices.push(dt);
    total += dt;
  }
  return (progress) => {
    let want = Math.min(1, Math.max(0, progress)) * total;
    let soc = socStart;
    for (let i = 0; i < STEPS; i += 1) {
      if (want <= slices[i]) return soc + dSoc * (want / slices[i]);
      want -= slices[i];
      soc += dSoc;
    }
    return socEnd;
  };
}

/**
 * Derived SoC + aux-battery telemetry history between two instants
 * (fixtures store only the current SoC). ~15-minute samples.
 *
 * Where a charge is known — `charges`, built from the session rows — the curve
 * IS that charge: it starts at the SoC the vehicle plugged in with and ends at
 * the SoC it has reached, so a running simulated session shows as a rising line
 * that keeps growing while the demo is open. Between charges the line falls
 * from one to the next (driving), and outside them it falls back to the generic
 * daily pattern, anchored so it joins up rather than jumping.
 */
export function deriveSocAuxHistory(
  vehicle: Vehicle,
  start: Dayjs,
  end: Dayjs,
  charges: ChargeWindow[] = [],
): SocAuxPoint[] {
  const startMs = start.valueOf();
  const endMs = end.valueOf();
  if (endMs <= startMs) return [];
  const stepMs = Math.max(5 * 60_000, Math.min(30 * 60_000, Math.floor((endMs - startMs) / 180)));
  const nowMs = Date.now();
  const anchorMs = Math.min(endMs, nowMs);
  const patternAtAnchor = socPatternAt(vehicle, anchorMs);
  const socOffset = vehicle.soc - patternAtAnchor;

  const windows = charges
    .filter((w) => w.endMs > startMs && w.startMs < endMs)
    .map((w) => ({ ...w, curve: chargeCurve(w.socStart, w.socEnd) }));
  // Every instant the SoC is actually known: each charge's two ends.
  const keys = windows
    .flatMap((w) => [
      { ms: w.startMs, soc: w.socStart },
      { ms: w.endMs, soc: w.socEnd },
    ])
    .sort((a, b) => a.ms - b.ms);

  /** The generic pattern shifted to pass through a known point. */
  const patternThrough = (t: number, key: { ms: number; soc: number }) =>
    socPatternAt(vehicle, t) + (key.soc - socPatternAt(vehicle, key.ms));

  const socAt = (t: number): number => {
    const inside = windows.find((w) => t >= w.startMs && t <= w.endMs);
    if (inside) return inside.curve((t - inside.startMs) / (inside.endMs - inside.startMs));
    if (keys.length === 0) {
      const blend = Math.min(1, Math.max(0, (t - startMs) / Math.max(1, anchorMs - startMs)));
      return socPatternAt(vehicle, t) + socOffset * blend;
    }
    let prev: { ms: number; soc: number } | undefined;
    let next: { ms: number; soc: number } | undefined;
    for (const k of keys) {
      if (k.ms <= t) prev = k;
      else {
        next = k;
        break;
      }
    }
    // Between two charges the vehicle is out working: run the SoC down from
    // where the last charge left it to where the next one picked it up.
    if (prev && next) {
      const f = (t - prev.ms) / Math.max(1, next.ms - prev.ms);
      const jitter = (noise(vehicle.id, Math.floor(t / 900_000)) - 0.5) * 1.2;
      return prev.soc + (next.soc - prev.soc) * f + jitter;
    }
    return patternThrough(t, (prev ?? next) as { ms: number; soc: number });
  };

  const points: SocAuxPoint[] = [];
  for (let t = startMs; t <= endMs; t += stepMs) {
    const soc = Math.min(100, Math.max(0, socAt(t)));
    // The DC-DC converter tops the 12 V battery up while the pack charges, so
    // the aux line lifts over exactly the same windows.
    const hour = dayjs(t).hour();
    const charging = windows.length
      ? windows.some((w) => t >= w.startMs && t <= w.endMs)
      : hour >= 21 || hour < 8;
    const aux = 12.5 + noise(vehicle.id, Math.floor(t / 600_000)) * 0.7 + (charging ? 0.6 : 0);
    points.push({ ts: t, soc: Math.round(soc * 10) / 10, aux: Math.round(aux * 100) / 100 });
  }
  return points;
}

/**
 * 4-day, 30-min-interval SoC series for the Battery tab's "SoC over time"
 * chart (production reads a bundled ev_soc_data_4days.json fixture).
 */
export function deriveSoc4Day(vehicle: Vehicle): { dates: string[]; vals: number[] } {
  const end = dayjs().startOf("hour");
  const start = end.subtract(4, "day");
  const dates: string[] = [];
  const vals: number[] = [];
  for (let t = start.valueOf(); t <= end.valueOf(); t += 30 * 60_000) {
    dates.push(fmtDateTime(t));
    vals.push(Math.round(socPatternAt(vehicle, t) * 10) / 10);
  }
  return { dates, vals };
}

export interface CheckinLog {
  id: string;
  driverName: string;
  checkinTime: string;
  checkoutTime: string | null;
  evReg: string;
}

/**
 * Check-in sessions derived from the vehicle's trips (fixtures have no
 * check-in table): check-in a few minutes before trip start, check-out a
 * few minutes after trip end. The latest log stays open while Driving.
 */
export function deriveCheckins(trips: Trip[], vehicle: Vehicle): CheckinLog[] {
  const logs: CheckinLog[] = trips.map((t, idx) => {
    const h = hashId(t.id);
    const checkin = dayjs(t.startTime).subtract(3 + (h % 15), "minute");
    const checkout = dayjs(t.endTime).add(2 + (h % 10), "minute");
    return {
      id: `chk-${vehicle.id.replace(/\D/g, "")}${String(idx + 1).padStart(3, "0")}`,
      driverName: t.driverName,
      checkinTime: checkin.toISOString(),
      checkoutTime: checkout.toISOString(),
      evReg: t.vehicleReg,
    };
  });
  if (vehicle.status === "Driving" && logs.length > 0) {
    logs[0] = { ...logs[0], checkoutTime: null };
  }
  return logs;
}

export interface VehicleDoc {
  id: string;
  documentType: "VEHICLE_REGISTRATION" | "VEHICLE_FITNESS_CERTIFICATE" | "VEHICLE_INSURANCE" | "OTHERS";
  documentIdentifier: string;
  fileKind: "PDF Document" | "Image";
  createdAt: string;
  expiresAt: string | null;
  verificationStatus: "VERIFIED" | "PENDING" | "REJECTED";
  rejectionReason?: string;
}

/** Deterministic dummy documents for the Documents tab (no docs in fixtures). */
export function deriveVehicleDocs(vehicle: Vehicle): VehicleDoc[] {
  const h = hashId(vehicle.id);
  const created = dayjs(vehicle.createdAt);
  const regNo = vehicle.reg;
  const docs: VehicleDoc[] = [
    {
      id: `doc-${vehicle.id}-rc`,
      documentType: "VEHICLE_REGISTRATION",
      documentIdentifier: regNo,
      fileKind: "PDF Document",
      createdAt: created.add(2, "day").toISOString(),
      expiresAt: null,
      verificationStatus: "VERIFIED",
    },
    {
      id: `doc-${vehicle.id}-ins`,
      documentType: "VEHICLE_INSURANCE",
      documentIdentifier: `POL${String(h % 10_000_000).padStart(7, "0")}`,
      fileKind: "PDF Document",
      createdAt: created.add(3, "day").toISOString(),
      expiresAt: dayjs()
        .add(20 + (h % 300), "day")
        .toISOString(),
      verificationStatus: h % 3 === 0 ? "PENDING" : "VERIFIED",
    },
    {
      id: `doc-${vehicle.id}-fit`,
      documentType: "VEHICLE_FITNESS_CERTIFICATE",
      documentIdentifier: `FIT${String(h % 1_000_000).padStart(6, "0")}`,
      fileKind: "Image",
      createdAt: created.add(5, "day").toISOString(),
      expiresAt: dayjs()
        .add(60 + (h % 400), "day")
        .toISOString(),
      verificationStatus: h % 4 === 0 ? "PENDING" : "VERIFIED",
    },
  ];
  return docs;
}
