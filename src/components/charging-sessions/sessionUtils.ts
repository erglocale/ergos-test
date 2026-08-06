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
