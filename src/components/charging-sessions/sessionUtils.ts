import dayjs from "dayjs";
import type { ChargingSession, Chargepoint } from "@/data/types";

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "N/A";
  return dayjs(iso).format("DD MMM YYYY, hh:mm A");
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "N/A";
  return dayjs(iso).format("DD MMM YYYY");
}

/** "2 hours 15 minutes" style duration, mirroring utils/misc getDurationString. */
export function getDurationString(startIso: string, endIso: string): string {
  const seconds = Math.max(0, dayjs(endIso).diff(dayjs(startIso), "second"));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  let result = "";
  if (hours > 0) result += `${hours} ${hours === 1 ? "hour" : "hours"} `;
  if (minutes > 0) result += `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
  if (result === "") return "0 minutes";
  return result.trim();
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
