import dayjs from "dayjs";
import type { ChargingSession, Chargepoint, Vehicle } from "@/data/types";

// Formats copied from real ergOS session pages: "05/08/2026",
// "05/08/2026, 08:41 pm", "2 hrs 48 mins 14s".
export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "N/A";
  return dayjs(iso).format("DD/MM/YYYY, hh:mm a");
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "N/A";
  return dayjs(iso).format("DD/MM/YYYY");
}

export function getDurationString(startIso: string, endIso: string): string {
  const seconds = Math.max(0, dayjs(endIso).diff(dayjs(startIso), "second"));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  let result = "";
  if (hours > 0) result += `${hours} hrs `;
  if (minutes > 0) result += `${minutes} mins `;
  result += `${secs}s`;
  return result.trim();
}

// ---- Deterministic stand-ins for backend fields the fixtures don't store,
// shaped like the real values (e.g. transactionId 335015207, billingId
// "sessionBilling_2Vu_VdZqgx", meter counters in Wh, VIN "MBX0007ZBZG119653").
function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function sessionTransactionId(session: ChargingSession): number {
  return 100_000_000 + (hashStr(session.id) % 900_000_000);
}

export function sessionBillingId(session: ChargingSession): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let h = hashStr(`${session.id}-billing`);
  let slug = "";
  for (let i = 0; i < 10; i += 1) {
    slug += chars[h % chars.length];
    h = Math.floor(h / chars.length) + i * 7;
  }
  return `sessionBilling_${slug}`;
}

/** Wh meter counters: stop − start equals the session's energy in Wh. */
export function sessionMeterValues(session: ChargingSession): {
  meterStart: number;
  meterStop: number | null;
} {
  const meterStart = 1_400_000 + (hashStr(`${session.id}-meter`) % 200_000);
  const meterStop = session.endTime
    ? meterStart + Math.round(session.energyKwh * 1000)
    : null;
  return { meterStart, meterStop };
}

/** OCPP-style charge point identity like the real "3S_AC1" (from "CP-1, Six Mile"). */
export function chargerOcppId(cp: Chargepoint | undefined): string | null {
  if (!cp) return null;
  const [unit, place] = cp.name.split(", ");
  const initials = (place ?? cp.hub)
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  const num = unit?.replace(/\D/g, "") || "1";
  return `${initials}_AC${num}`;
}

export function vehicleVin(vehicle: Vehicle | undefined): string | null {
  if (!vehicle) return null;
  return `MBX0007ZBZG${String(100_000 + (hashStr(vehicle.reg) % 900_000))}`;
}

export function sessionDurationHours(session: ChargingSession): number | null {
  if (!session.endTime) return null;
  const h = dayjs(session.endTime).diff(dayjs(session.startTime), "minute") / 60;
  return h > 0 ? h : null;
}

export function sessionAvgPowerKw(session: ChargingSession): number | null {
  const hours = sessionDurationHours(session);
  if (hours === null || session.energyKwh == null) return null;
  return session.energyKwh / hours;
}

export function hubForSession(session: ChargingSession, chargepoints: Chargepoint[]): string {
  return chargepoints.find((c) => c.id === session.chargerId)?.hub ?? "Outside Hub";
}

/** Simple client-side CSV download (sandbox stand-in for the xlsx export). */
export function downloadCsv(filename: string, header: string[], rows: (string | number | null)[][]) {
  const esc = (v: string | number | null) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [header, ...rows].map((r) => r.map(esc).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ---- Meter values -----------------------------------------------------------
// The real /host/session/:id/meter-values feed returns one row per measurand
// per OCPP sample. Shape below is copied from live Etash Delivery Technologies
// sessions on "CP-2, Six Mile" (3 kW AC, 3PIN): a sample every 30 s carrying
// Energy.Active.Import.Register (cumulative Wh), Power.Active.Import (kW),
// Current.Import (A), Voltage (V) — plus SoC injected from telematics. Those
// logs show a constant-current plateau just under the connector rating that
// drifts up a few percent, then a constant-voltage taper down to ~0.3 kW, with
// mains voltage wandering between 237 V and 246 V.

export interface MeterPoint {
  t: number;
  /** Cumulative meter register, kWh (what the real charger reports). */
  energyKwh: number;
  powerKw: number;
  currentA: number;
  voltageV: number;
  socPct: number | null;
}

/** Deterministic 0..1 generator so a session's curve never changes on re-render. */
function seededRandom(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * Full meter-value series for the detail chart, matching the production
 * measurand set. Energy is scaled so the register ends exactly on the
 * session's Meter Stop, and power never exceeds the connector rating.
 */
export function deriveMeterSeries(
  session: ChargingSession,
  ratedKw: number,
  fallbackEndSoc?: number,
): MeterPoint[] {
  const start = dayjs(session.startTime);
  const end = session.endTime ? dayjs(session.endTime) : dayjs();
  const totalSec = Math.max(120, end.diff(start, "second"));

  const rnd = seededRandom(hashStr(`${session.id}-meter-series`));
  // Real logs sample every 30 s; stretch the interval on long sessions so the
  // chart stays under a few hundred points.
  const stepSec = totalSec > 3 * 3600 ? 60 : 30;
  const steps = Math.min(400, Math.max(6, Math.floor(totalSec / stepSec)));
  const dtHours = totalSec / steps / 3600;

  // Constant-current plateau, then a constant-voltage taper. The break point
  // is normally ~60-80 % in, but it has to move late enough that the session's
  // energy still fits under the connector rating (mean of the shape below is
  // ~0.357 + 0.613 x taperStart).
  const hours = totalSec / 3600;
  let taperStart = 0.6 + rnd() * 0.2;
  const meanShape = (ts: number) => 0.3573 + 0.6127 * ts;
  if (session.energyKwh / (meanShape(taperStart) * hours) > ratedKw) {
    const needed = session.energyKwh / (hours * ratedKw);
    taperStart = Math.min(0.97, Math.max(taperStart, (needed - 0.3573) / 0.6127));
  }

  const shape: number[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const f = i / steps;
    if (i === 0) {
      shape.push(0.04); // first sample catches the ramp-up
    } else if (f <= taperStart) {
      shape.push(0.94 + 0.06 * (f / taperStart));
    } else {
      shape.push(Math.exp(-2.6 * ((f - taperStart) / (1 - taperStart))));
    }
  }

  // Scale the shape so the integral equals the session's delivered energy,
  // then cap at the connector rating.
  const shapeEnergy = shape.reduce((a, v) => a + v, 0) * dtHours;
  let k = shapeEnergy > 0 ? session.energyKwh / shapeEnergy : 0;
  const peak = Math.max(...shape);
  if (k * peak > ratedKw) k = ratedKw / peak;

  const { meterStart } = sessionMeterValues(session);
  const endSoc = session.socEnd ?? fallbackEndSoc ?? Math.min(100, session.socStart + 20);

  const points: MeterPoint[] = [];
  let register = meterStart / 1000; // Wh counter -> kWh, as the UI shows it
  let voltageV = 240 + rnd() * 5; // mains wanders slowly, it doesn't jitter
  for (let i = 0; i <= steps; i += 1) {
    const f = i / steps;
    const powerKw = Math.round(k * shape[i] * 100) / 100;
    if (i > 0) register += powerKw * dtHours;
    voltageV = Math.min(246.5, Math.max(236.5, voltageV + (rnd() - 0.5) * 0.7));
    const volts = Math.round(voltageV * 100) / 100;
    // Charging slows near the top, same ease-out the SoC bar uses elsewhere.
    const eased = 1 - Math.pow(1 - f, 1.6);
    points.push({
      t: start.add((f * totalSec) / 60, "minute").valueOf(),
      energyKwh: Math.round(register * 100) / 100,
      powerKw,
      currentA: Math.round(((powerKw * 1000) / volts) * 100) / 100,
      voltageV: volts,
      socPct: Math.round((session.socStart + (endSoc - session.socStart) * eased) * 10) / 10,
    });
  }
  return points;
}

/**
 * Derived SoC-vs-time series for the detail chart (fixtures store only
 * start/end SoC). Deterministic ease-out curve sampled every ~2 minutes.
 */
export function deriveSocSeries(session: ChargingSession, fallbackEndSoc?: number): [number, number][] {
  const start = dayjs(session.startTime);
  const end = session.endTime ? dayjs(session.endTime) : dayjs();
  const endSoc = session.socEnd ?? fallbackEndSoc ?? Math.min(100, session.socStart + 20);
  const totalMin = Math.max(4, end.diff(start, "minute"));
  const points: [number, number][] = [];
  const steps = Math.min(120, Math.max(10, Math.floor(totalMin / 2)));
  for (let i = 0; i <= steps; i += 1) {
    const f = i / steps;
    // ease-out: charging slows near the end
    const eased = 1 - Math.pow(1 - f, 1.6);
    const soc = session.socStart + (endSoc - session.socStart) * eased;
    points.push([start.add(f * totalMin, "minute").valueOf(), Math.round(soc * 10) / 10]);
  }
  return points;
}
