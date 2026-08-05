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
  soc: number;
  reason: string;
  createdAt: string;
  targetCap: number;
  slackMin: number;
  hubDistanceKm: number;
  rank: number;
  _kind: "charge";
}

export interface CapSweepPoint {
  cap: number;
  added_pct: number;
}

export interface CapRow {
  suggestionId: string;
  evId: string;
  label: string;
  status: Suggestion["status"];
  currentCapPct: number;
  windowFrom: string;
  windowTo: string;
  computedAt: string;
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

/** SOC-cap suggestion rows from db.suggestions, enriched with sweep data. */
export function deriveCapRows(db: Db): CapRow[] {
  const vehicleByReg = Object.fromEntries(db.vehicles.map((v) => [v.reg, v]));
  return db.suggestions.map((s) => {
    const vehicle = vehicleByReg[s.vehicleReg];
    const lowestSafe = Math.max(50, s.suggestedCapPct - 5);
    const tolerance = 5;
    const sweep: CapSweepPoint[] = [];
    for (let cap = 60; cap <= 95; cap += 5) {
      const base = cap < lowestSafe ? (lowestSafe - cap) * 1.6 + tolerance : 0;
      const jitter = ((hash(`${s.id}-${cap}`) % 100) / 100) * 2;
      sweep.push({
        cap,
        added_pct: Math.round((base + jitter) * 10) / 10,
      });
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
      socLimit: {
        suggested_cap: s.suggestedCapPct,
        lowest_safe_cap: lowestSafe,
      },
      details: {
        cap: {
          sweep,
          lowest_safe_cap: lowestSafe,
          tolerance_pct: tolerance,
          operating_days: 60 + (hash(s.id) % 30),
        },
      },
    };
  });
}
