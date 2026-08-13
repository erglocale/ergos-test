"use client";

import dayjs from "dayjs";
import type { Db, Suggestion, Vehicle } from "@/data/types";

// Row shapes mirroring the production suggestions API payloads. The fixtures
// only carry `db.suggestions` (SOC-cap) — live charging "nudges" and the cap
// sweep chart data are derived deterministically from the store here.

export interface NudgeRow {
  evId: string;
  label: string;
  hub: string;
  soc: number | null;
  reason: string;
  createdAt: string;
  targetCap: number | null;
  slackMin: number | null;
  hubDistanceKm: number | null;
  rank: number | null;
  _kind: "charge";
}

export interface CapSweepPoint {
  cap: number;
  added_pct: number;
}

export type CapConfidence = "High" | "Medium" | "Low";

/**
 * How much history the cap was learned from, banded exactly as the analytics
 * engine bands it (suggestions.py: >=20 operating days High, >=8 Medium).
 */
export function capConfidence(operatingDays: number | null | undefined): CapConfidence {
  const days = operatingDays ?? 0;
  return days >= 20 ? "High" : days >= 8 ? "Medium" : "Low";
}

export interface CapRow {
  suggestionId: string;
  evId: string;
  label: string;
  status?: Suggestion["status"];
  currentCapPct?: number;
  windowFrom: string;
  windowTo: string;
  computedAt: string;
  confidence: CapConfidence;
  socLimit: { suggested_cap: number; lowest_safe_cap: number } | null;
  details: {
    cap: {
      sweep: CapSweepPoint[];
      lowest_safe_cap: number;
      tolerance_pct: number;
      operating_days: number;
    };
  };
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/** Vehicles that should plug in now — derived from low-SOC vehicles at the depot. */
export function deriveNudges(vehicles: Vehicle[]): NudgeRow[] {
  return vehicles
    .filter((v) => v.soc <= 45 && v.status !== "Driving")
    .sort((a, b) => a.soc - b.soc)
    .map((v, i) => {
      const urgent = v.soc < 25;
      const gap = v.socCapPct - v.soc;
      return {
        evId: v.id,
        label: v.reg,
        hub: v.hub,
        soc: v.soc,
        reason: urgent ? "critically low SOC" : "top-up window open",
        createdAt: dayjs()
          .subtract(5 + i * 9, "minute")
          .toISOString(),
        targetCap: v.socCapPct,
        slackMin: 90 - gap * 2,
        hubDistanceKm: (hash(v.id) % 400) / 100,
        rank: i + 1,
        _kind: "charge",
      };
    });
}

// The cap grid the analytics engine sweeps on: it starts at 100 and steps the
// cap down, and it stops at the first cap that breaks the tolerance — lowering
// a cap only removes stored energy, so every lower cap fails too and the engine
// never simulates them. That is why a real sweep is three or four bars ending
// just past the knee, and not a fixed grid of the same width for every vehicle.
const SWEEP_STEP_PCT = 10;
const SWEEP_FLOOR_PCT = 60;

/** SOC-cap suggestion rows from db.suggestions, enriched with sweep data. */
export function deriveCapRows(db: Db): CapRow[] {
  const vehicleByReg = Object.fromEntries(db.vehicles.map((v) => [v.reg, v]));
  return db.suggestions.map((s) => {
    const vehicle = vehicleByReg[s.vehicleReg];
    // The lowest safe cap is one of the caps actually swept, so the chart has a
    // bar to highlight for it.
    const lowestSafe = Math.max(
      SWEEP_FLOOR_PCT,
      Math.floor((s.suggestedCapPct - 5) / SWEEP_STEP_PCT) * SWEEP_STEP_PCT,
    );
    const tolerance = 5;
    // Days of driving behind the suggestion. Vehicles that sat idle for much of
    // the window give the engine less to go on, which is what the confidence
    // banding reports — so the fleet carries a spread of them, not all High.
    const operatingDays = 4 + (hash(s.id) % 30);
    const sweep: CapSweepPoint[] = [];
    for (let cap = 100; cap >= SWEEP_FLOOR_PCT; cap -= SWEEP_STEP_PCT) {
      const jitter = ((hash(`${s.id}-${cap}`) % 100) / 100) * 1.2;
      const base = cap < lowestSafe ? (lowestSafe - cap) * 1.1 + tolerance : 0;
      const added = Math.round((base + jitter) * 10) / 10;
      sweep.push({ cap, added_pct: added });
      if (added > tolerance) break; // the knee — the engine stops here too
    }
    return {
      suggestionId: s.id,
      evId: vehicle?.id ?? s.vehicleReg,
      label: s.vehicleReg,
      status: s.status,
      currentCapPct: s.currentCapPct,
      windowFrom: s.windowFrom,
      windowTo: s.windowTo,
      computedAt: dayjs(s.windowTo).toISOString(),
      confidence: capConfidence(operatingDays),
      socLimit: {
        suggested_cap: s.suggestedCapPct,
        lowest_safe_cap: lowestSafe,
      },
      details: {
        cap: {
          sweep,
          lowest_safe_cap: lowestSafe,
          tolerance_pct: tolerance,
          operating_days: operatingDays,
        },
      },
    };
  });
}
