"use client";

// Real-time charging simulation for ongoing sessions.
//
// Instead of freezing a session's energy/SoC at seed time, every live session
// is integrated forward on a timer from real quantities: the connector's kW,
// what the vehicle can accept, its pack size and its current SoC.
//
// Two power sources feed the integrator:
//   - Fixture sessions draw the physical ceiling (connector vs vehicle limit).
//   - energy-brain sessions draw whatever the OPTIMIZER allocated for the
//     current interval. That schedule decides both *when* a vehicle charges
//     and *how many kW* it gets, so a vehicle the optimizer parked sits at
//     0 kW until its slot arrives. Nothing here changes energy-brain's
//     algorithm — the plan is read from /optimizations and obeyed.
//
// A battery cannot absorb full power when nearly full, so the allocated kW is
// still shaped by a constant-voltage taper above 80 % SoC.

import { useSyncExternalStore } from "react";
import { fetchPredictedSchedules, type PredictedPoint } from "./energyBrain";

/** How far the integrator may advance in a single step (backgrounded tabs). */
const MAX_STEP_HOURS = 0.25;
/** AC losses: metered energy is a little higher than what reaches the pack. */
const CHARGE_EFFICIENCY = 0.93;
const TAPER_FROM_SOC = 80;
const TAPER_FLOOR = 0.2;
/** Optimizer profiles are emitted on a 15-minute grid. */
const PLAN_STEP_MS = 15 * 60_000;

export interface SimState {
  /** Energy delivered so far in this session, kWh. */
  energyKwh: number;
  /** Vehicle SoC right now, %. */
  soc: number;
  /** Instantaneous power, kW. */
  powerKw: number;
  updatedAt: number;
  /** True once the target SoC is reached. */
  finished: boolean;
}

export interface SimInputs {
  connectorKw: number;
  /** Vehicle's own charge acceptance, kW. Falls back to the connector. */
  vehicleMaxKw?: number;
  batteryKwh: number;
  targetSoc: number;
  /** kW the optimizer allocated for this instant, or null when unplanned. */
  plannedKw: number | null;
}

/** Constant-current below 80 % SoC, then a linear taper toward the top. */
export function taperFactor(soc: number): number {
  if (soc <= TAPER_FROM_SOC) return 1;
  const f = Math.min(1, (soc - TAPER_FROM_SOC) / (100 - TAPER_FROM_SOC));
  return Math.max(TAPER_FLOOR, 1 - f * (1 - TAPER_FLOOR));
}

/** kW the session can actually draw right now. */
export function chargePowerKw(soc: number, i: SimInputs): number {
  if (soc >= i.targetSoc) return 0;
  const ceiling = Math.min(i.connectorKw, i.vehicleMaxKw ?? i.connectorKw);
  // A planned 0 kW is the optimizer deliberately parking this vehicle, so it
  // must be honoured rather than treated as "no plan".
  const allowed = i.plannedKw === null ? ceiling : Math.min(i.plannedKw, ceiling);
  return Math.round(allowed * taperFactor(soc) * 100) / 100;
}

/** Integrate one session forward to `nowMs`. */
export function advance(state: SimState, i: SimInputs, nowMs: number): SimState {
  const dtHours = Math.min(MAX_STEP_HOURS, (nowMs - state.updatedAt) / 3_600_000);
  const powerKw = chargePowerKw(state.soc, i);
  if (dtHours <= 0) return { ...state, powerKw };

  const deliveredKwh = powerKw * dtHours;
  const socGain =
    i.batteryKwh > 0 ? ((deliveredKwh * CHARGE_EFFICIENCY) / i.batteryKwh) * 100 : 0;
  const soc = Math.min(i.targetSoc, state.soc + socGain);
  return {
    energyKwh: Math.round((state.energyKwh + deliveredKwh) * 1000) / 1000,
    soc: Math.round(soc * 100) / 100,
    powerKw,
    updatedAt: nowMs,
    finished: soc >= i.targetSoc - 0.05,
  };
}

/** Minutes until the target SoC at the current power, or null when parked. */
export function etaMinutes(state: SimState, i: SimInputs): number | null {
  if (state.powerKw <= 0) return null;
  const remainingKwh = Math.max(0, ((i.targetSoc - state.soc) / 100) * i.batteryKwh);
  return Math.round((remainingKwh / (state.powerKw * CHARGE_EFFICIENCY)) * 60);
}

// ---- Optimizer plan cache ---------------------------------------------------
// One shared copy of /optimizations: the simulator needs it every few seconds
// and the calendar needs it to draw future blocks. Running the optimizer twice
// on two timers would double the backend's work for identical answers.

let schedules = new Map<string, PredictedPoint[]>();
const planListeners = new Set<() => void>();
let planSnapshot: { sessionId: string; points: PredictedPoint[] }[] = [];

export function setSchedules(next: { sessionId: string; points: PredictedPoint[] }[]): void {
  schedules = new Map(next.map((s) => [s.sessionId, s.points]));
  planSnapshot = next;
  planListeners.forEach((l) => l());
}

export function getSchedules(): { sessionId: string; points: PredictedPoint[] }[] {
  return planSnapshot;
}

export function subscribeSchedules(listener: () => void): () => void {
  planListeners.add(listener);
  return () => planListeners.delete(listener);
}

/** Reactive view of the shared optimizer plan. */
export function useSchedules(): { sessionId: string; points: PredictedPoint[] }[] {
  return useSyncExternalStore(subscribeSchedules, getSchedules, getSchedules);
}

/** Refresh the shared plan cache. Heavy — the backend runs the allocator. */
export async function refreshSchedules(): Promise<void> {
  const next = await fetchPredictedSchedules();
  // An empty result usually means "optimizer unavailable", not "no plan"; keep
  // the previous profiles so live blocks don't blink out on a transient error.
  if (next.length > 0 || planSnapshot.length === 0) setSchedules(next);
}

/**
 * kW the optimizer allocated to a session at `atMs`, or null when the session
 * has no plan at all (fixture sessions, or the optimizer never ran).
 */
export function plannedPowerKw(sessionId: string, atMs: number): number | null {
  const points = schedules.get(sessionId);
  if (!points?.length) return null;
  let value: number | null = null;
  for (const p of points) {
    const t = new Date(p.time).getTime();
    if (atMs >= t && atMs < t + PLAN_STEP_MS) {
      value = p.limit;
      break;
    }
  }
  // Inside the planned window but between samples -> the optimizer allocated
  // nothing for this slot, which means "wait".
  if (value === null) {
    const first = new Date(points[0].time).getTime();
    const last = new Date(points[points.length - 1].time).getTime() + PLAN_STEP_MS;
    if (atMs >= first && atMs < last) return 0;
    return null;
  }
  return value;
}
