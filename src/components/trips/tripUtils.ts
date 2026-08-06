import dayjs from "dayjs";
import type { Trip } from "@/data/types";

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "N/A";
  return dayjs(iso).format("DD/MM/YYYY, hh:mm a");
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

// Fixture trips have no addresses — derive deterministic Guwahati locality
// addresses from the trip id so the table/detail views stay stable.
const PLACES = [
  "Beltola Main Rd, Guwahati, Assam 781028",
  "GS Rd, Six Mile, Guwahati, Assam 781022",
  "Zoo Road Tiniali, Guwahati, Assam 781024",
  "Paltan Bazaar, Guwahati, Assam 781008",
  "Maligaon Chariali, Guwahati, Assam 781011",
  "Khanapara, NH27, Guwahati, Assam 781022",
  "Ganeshguri Flyover, Guwahati, Assam 781006",
  "Lokhra Rd, Lalganesh, Guwahati, Assam 781034",
];

function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
}

export function tripAddresses(trip: Trip): { startAddress: string; endAddress: string } {
  const h = hashId(trip.id);
  const start = PLACES[h % PLACES.length];
  const end = PLACES[(h + 3) % PLACES.length];
  return { startAddress: start, endAddress: end };
}

/** Deterministic pseudo-random in [0,1) from a seed string + index. */
function noise(seed: string, i: number): number {
  const h = hashId(`${seed}:${i}`);
  return (h % 1000) / 1000;
}

/** Derived SoC-vs-time series for the trip detail chart (fixtures store only start/end SoC). */
export function deriveTripSocSeries(trip: Trip): [number, number][] {
  const start = dayjs(trip.startTime);
  const totalMin = Math.max(4, dayjs(trip.endTime).diff(start, "minute"));
  const steps = Math.min(150, Math.max(12, Math.floor(totalMin / 2)));
  const points: [number, number][] = [];
  for (let i = 0; i <= steps; i += 1) {
    const f = i / steps;
    const base = trip.startSoc + (trip.endSoc - trip.startSoc) * f;
    const jitter = i === 0 || i === steps ? 0 : (noise(trip.id, i) - 0.5) * 1.4;
    points.push([
      start.add(f * totalMin, "minute").valueOf(),
      Math.round(Math.min(100, Math.max(0, base + jitter)) * 100) / 100,
    ]);
  }
  return points;
}

/** Derived speed-vs-time series around the trip's average speed. */
export function deriveTripSpeedSeries(trip: Trip): [number, number][] {
  const start = dayjs(trip.startTime);
  const totalMin = Math.max(4, dayjs(trip.endTime).diff(start, "minute"));
  const steps = Math.min(150, Math.max(12, Math.floor(totalMin / 2)));
  const points: [number, number][] = [];
  for (let i = 0; i <= steps; i += 1) {
    const f = i / steps;
    // ramp up, cruise with noise, ramp down
    const envelope = f < 0.08 ? f / 0.08 : f > 0.92 ? (1 - f) / 0.08 : 1;
    const wobble = 0.55 + noise(trip.id, i) * 0.9;
    const speed = Math.max(0, trip.avgSpeedKmh * envelope * wobble);
    points.push([start.add(f * totalMin, "minute").valueOf(), Math.round(speed * 100) / 100]);
  }
  return points;
}

/** Max speed derived from the sampled speed series. */
export function deriveTripMaxSpeed(trip: Trip): number {
  return deriveTripSpeedSeries(trip).reduce((m, [, v]) => Math.max(m, v), 0);
}
