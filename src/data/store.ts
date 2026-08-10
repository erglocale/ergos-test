"use client";

import { useSyncExternalStore } from "react";
import type { EnergyOverlay } from "./energyBrain";
import { makeFixtures } from "./fixtures";
import { advance, plannedPowerKw, type SimInputs, type SimState } from "./liveSim";
import type { CollectionKey, Db, Profile } from "./types";

// All demo data lives in localStorage under this key. CRUD mutates it in
// place and notifies subscribers; "Reset demo data" just deletes the key.
const DB_KEY = "ergos-test:db:v14";

let cache: Db | null = null;
// Live rows from energy-brain, merged (not persisted) on top of the fixtures.
let energyOverlay: EnergyOverlay | null = null;
let merged: Db | null = null;
const listeners = new Set<() => void>();

function seed(): Db {
  return makeFixtures();
}

function load(): Db {
  if (cache) return cache;
  if (typeof window === "undefined") {
    // Stable server-side snapshot; real data hydrates client-side after mount.
    cache = seed();
    return cache;
  }
  try {
    const raw = window.localStorage.getItem(DB_KEY);
    if (raw) {
      const stored = JSON.parse(raw) as Partial<Db>;
      // Backfill collections added to the schema after this browser seeded,
      // so stored data survives without a key bump.
      const fresh = seed();
      let patched = false;
      for (const k of Object.keys(fresh) as (keyof Db)[]) {
        if (stored[k] === undefined) {
          (stored as Record<string, unknown>)[k] = fresh[k];
          patched = true;
        }
      }
      if (reanchorLiveSessions(stored as Db)) patched = true;
      cache = stored as Db;
      if (patched) persist();
      return cache;
    }
  } catch {
    // corrupted storage — fall through to reseed
  }
  cache = seed();
  persist();
  return cache;
}

/**
 * Fixture sessions are frozen at seed time, but an ongoing one is drawn from
 * its start up to the current moment — so hours after seeding it would stretch
 * across the whole calendar. Pull any stale live session back to a plausible
 * recent start. Returns true when something changed.
 */
function reanchorLiveSessions(db: Db): boolean {
  const MAX_LIVE_MIN = 90;
  const now = Date.now();
  let changed = false;
  for (const s of db.sessions) {
    if (s.endTime !== null) continue;
    const elapsedMin = (now - new Date(s.startTime).getTime()) / 60_000;
    if (elapsedMin <= MAX_LIVE_MIN) continue;
    const freshMin = 25 + Math.floor(Math.random() * 25);
    s.startTime = new Date(now - freshMin * 60_000).toISOString();
    const cp = db.chargepoints.find((c) => c.id === s.chargerId);
    const kw = cp?.connectors.find((cn) => cn.id === s.connectorId)?.powerKw ?? 3;
    s.energyKwh = Math.round(((kw * freshMin) / 60) * 100) / 100;
    changed = true;
  }
  return changed;
}

function persist() {
  if (typeof window === "undefined" || !cache) return;
  try {
    window.localStorage.setItem(DB_KEY, JSON.stringify(cache));
  } catch {
    // storage full/unavailable — demo keeps working in memory
  }
}

function notify() {
  persist();
  merged = null;
  listeners.forEach((l) => l());
}

/** Replace the energy-brain overlay (null clears it). Called by the poller. */
export function setEnergyOverlay(overlay: EnergyOverlay | null): void {
  energyOverlay = overlay;
  merged = null;
  listeners.forEach((l) => l());
}

export function getDb(): Db {
  if (!merged) {
    const base = load();
    const combined: Db = energyOverlay
      ? {
          ...base,
          vehicles: [...energyOverlay.vehicles, ...base.vehicles],
          chargepoints: [...energyOverlay.chargepoints, ...base.chargepoints],
          sessions: [...energyOverlay.sessions, ...base.sessions],
        }
      : base;
    merged = applySim(combined);
  }
  return merged;
}

// ---- Live charging simulation ----------------------------------------------
// Ongoing sessions are integrated forward by tickSimulation(); the results are
// layered on top of the stored rows here rather than persisted, so a reload
// re-derives them and the energy-brain overlay never fights the simulator.

const simStates = new Map<string, SimState>();
let simSnapshot: ReadonlyMap<string, SimState> = new Map();
/** localStorage is only rewritten this often, not on every 5 s step. */
const SIM_PERSIST_MS = 30_000;
let lastSimPersist = 0;

const isEnergyBrainSession = (id: string) => id.startsWith("EB-");

function applySim(db: Db): Db {
  const socByReg = new Map<string, number>();
  const sessions =
    simStates.size === 0
      ? db.sessions
      : db.sessions.map((s) => {
          const st = simStates.get(s.id);
          if (!st || s.endTime !== null) return s;
          socByReg.set(s.vehicleReg, st.soc);
          return { ...s, energyKwh: Math.round(st.energyKwh * 100) / 100 };
        });

  // "Charging" is derived, never stored: a vehicle is charging exactly when it
  // has a live session. Anything else claiming that status is stale, and would
  // otherwise make the hub pages count more vehicles than there are sessions.
  const chargingRegs = new Set(
    db.sessions.filter((s) => s.endTime === null).map((s) => s.vehicleReg),
  );
  let vehiclesChanged = false;
  const vehicles = db.vehicles.map((v) => {
    const soc = socByReg.get(v.reg);
    const charging = chargingRegs.has(v.reg);
    const status = charging ? ("Charging" as const) : v.status === "Charging" ? ("Idle" as const) : v.status;
    if (soc === undefined && status === v.status) return v;
    vehiclesChanged = true;
    return { ...v, soc: soc ?? v.soc, status };
  });

  if (sessions === db.sessions && !vehiclesChanged) return db;
  return { ...db, sessions, vehicles };
}


/** Live per-session simulation readings (power, SoC, ETA inputs). */
export function getSimStates(): ReadonlyMap<string, SimState> {
  return simSnapshot;
}

export function useSimStates(): ReadonlyMap<string, SimState> {
  return useSyncExternalStore(subscribe, getSimStates, getSimStates);
}

/**
 * Advance every ongoing session to `nowMs`. Fixture sessions that reach their
 * target SoC are closed and, if that leaves nothing charging, a fresh one is
 * started so the demo keeps running. energy-brain sessions are left open —
 * only its own backend may close those — and simply settle at 0 kW.
 */
export function tickSimulation(nowMs: number = Date.now()): void {
  const db = getDb();
  const live = db.sessions.filter((s) => s.endTime === null);
  const seen = new Set<string>();
  const completed: { session: (typeof live)[number]; soc: number; energyKwh: number }[] = [];

  for (const s of live) {
    seen.add(s.id);
    const vehicle = db.vehicles.find((v) => v.reg === s.vehicleReg);
    const cp = db.chargepoints.find((c) => c.id === s.chargerId);
    const inputs: SimInputs = {
      connectorKw:
        cp?.connectors.find((cn) => cn.id === s.connectorId)?.powerKw ??
        cp?.connectors[0]?.powerKw ??
        3,
      vehicleMaxKw: vehicle?.maxChargeKw,
      batteryKwh: vehicle?.batteryKwh ?? 8,
      targetSoc: vehicle?.socCapPct ?? 100,
      plannedKw: plannedPowerKw(s.id, nowMs),
    };

    const prior = simStates.get(s.id) ?? {
      // energy-brain reports the energy still REQUESTED, not delivered, so a
      // simulated session always starts its meter at zero.
      energyKwh: isEnergyBrainSession(s.id) ? 0 : (s.energyKwh ?? 0),
      soc: vehicle?.soc ?? s.socStart,
      powerKw: 0,
      updatedAt: nowMs,
      finished: false,
    };
    const next = advance(prior, inputs, nowMs);
    simStates.set(s.id, next);
    if (isEnergyBrainSession(s.id)) {
      // energy-brain owns these rows; the simulation stays a display layer.
      continue;
    }
    // Fixture rows carry the progress so a page reload resumes where the
    // simulation left off instead of snapping back to the seeded values.
    writeThrough(s.id, s.vehicleReg, next);
    if (next.finished) {
      completed.push({ session: s, soc: next.soc, energyKwh: next.energyKwh });
    }
  }

  for (const id of [...simStates.keys()]) {
    if (!seen.has(id)) simStates.delete(id);
  }
  simSnapshot = new Map(simStates);

  if (completed.length > 0) {
    closeSessions(completed, nowMs);
    return; // closeSessions notifies
  }
  if (nowMs - lastSimPersist > SIM_PERSIST_MS) {
    lastSimPersist = nowMs;
    persist();
  }
  merged = null;
  listeners.forEach((l) => l());
}

/** Copy a step's result onto the stored fixture rows (no notify, no persist). */
function writeThrough(sessionId: string, vehicleReg: string, state: SimState): void {
  const db = load();
  const session = db.sessions.find((s) => s.id === sessionId);
  if (session) session.energyKwh = Math.round(state.energyKwh * 100) / 100;
  const vehicle = db.vehicles.find((v) => v.reg === vehicleReg);
  if (vehicle) {
    vehicle.soc = Math.round(state.soc * 10) / 10;
    vehicle.status = "Charging";
  }
}

function closeSessions(
  done: { session: ChargingSessionRow; soc: number; energyKwh: number }[],
  nowMs: number,
): void {
  const db = load();
  const endTime = new Date(nowMs).toISOString();
  const finishedIds = new Set(done.map((d) => d.session.id));

  db.sessions = db.sessions.map((s) => {
    if (!finishedIds.has(s.id)) return s;
    const d = done.find((x) => x.session.id === s.id) as (typeof done)[number];
    return {
      ...s,
      endTime,
      energyKwh: Math.round(d.energyKwh * 100) / 100,
      socEnd: Math.round(d.soc),
      status: "Completed" as const,
      stopReason: "EVDisconnected",
    };
  });
  db.vehicles = db.vehicles.map((v) => {
    const hit = done.find((d) => d.session.vehicleReg === v.reg);
    if (!hit) return v;
    return { ...v, soc: Math.round(hit.soc * 10) / 10, status: "Idle" as const };
  });
  for (const id of finishedIds) simStates.delete(id);
  simSnapshot = new Map(simStates);

  if (!db.sessions.some((s) => s.endTime === null)) startFixtureSession(db, nowMs);

  cache = { ...db };
  notify();
}

type ChargingSessionRow = Db["sessions"][number];

/**
 * Plug the emptiest idle vehicle into a free connector so the live view never
 * runs dry. Fixture data only — energy-brain sessions are created in its own UI.
 */
function startFixtureSession(db: Db, nowMs: number): void {
  const busyConnectors = new Set(
    db.sessions.filter((s) => s.endTime === null).map((s) => `${s.chargerId}#${s.connectorId}`),
  );
  for (const cp of db.chargepoints) {
    if (cp.status !== "Online") continue;
    const connector = cp.connectors.find(
      (cn) => cn.status !== "Faulted" && !busyConnectors.has(`${cp.id}#${cn.id}`),
    );
    if (!connector) continue;
    const candidates = db.vehicles
      .filter((v) => v.hub === cp.hub && v.status !== "Charging" && v.soc < v.socCapPct - 5)
      .sort((a, b) => a.soc - b.soc);
    const vehicle = candidates[0];
    if (!vehicle) continue;

    const maxId = db.sessions.reduce((m, s) => {
      const n = Number(s.id.replace(/^\D+/, ""));
      return Number.isFinite(n) && n > m ? n : m;
    }, 0);
    db.sessions = [
      {
        id: `CS-${String(maxId + 1).padStart(5, "0")}`,
        chargerId: cp.id,
        chargerName: cp.name,
        connectorId: connector.id,
        vehicleReg: vehicle.reg,
        driverName: db.drivers.find((d) => d.vehicleReg === vehicle.reg)?.name ?? "—",
        startTime: new Date(nowMs).toISOString(),
        endTime: null,
        energyKwh: 0,
        socStart: Math.round(vehicle.soc),
        socEnd: null,
        cost: 0,
        status: "Ongoing",
        stopReason: null,
      },
      ...db.sessions,
    ];
    db.vehicles = db.vehicles.map((v) =>
      v.reg === vehicle.reg ? { ...v, status: "Charging" as const } : v,
    );
    return;
  }
}

const NO_LIMITS: Record<string, number> = {};

/** Hub -> grid connection limit (kW) as configured in energy-brain. */
export function getEnergyHubLimits(): Record<string, number> {
  return energyOverlay?.hubGridLimitKw ?? NO_LIMITS;
}

export function useEnergyHubLimits(): Record<string, number> {
  return useSyncExternalStore(subscribe, getEnergyHubLimits, getEnergyHubLimits);
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Reactive snapshot of the whole DB. Components re-render on any change. */
export function useDb(): Db {
  return useSyncExternalStore(subscribe, getDb, getDb);
}

// ---- CRUD ------------------------------------------------------------------

type Row<K extends CollectionKey> = Db[K][number];

export function list<K extends CollectionKey>(key: K): Db[K] {
  return load()[key];
}

export function createRow<K extends CollectionKey>(key: K, row: Row<K>): void {
  const db = load();
  (db[key] as Row<K>[]) = [row, ...(db[key] as Row<K>[])];
  cache = { ...db };
  notify();
}

export function updateRow<K extends CollectionKey>(
  key: K,
  id: string,
  patch: Partial<Row<K>>,
): void {
  const db = load();
  (db[key] as Row<K>[]) = (db[key] as Row<K>[]).map((r) =>
    (r as { id: string }).id === id ? { ...r, ...patch } : r,
  );
  cache = { ...db };
  notify();
}

export function removeRow(key: CollectionKey, id: string): void {
  const db = load();
  (db[key] as { id: string }[]) = (db[key] as { id: string }[]).filter(
    (r) => r.id !== id,
  );
  cache = { ...db };
  notify();
}

export function updateProfile(patch: Partial<Profile>): void {
  const db = load();
  cache = { ...db, profile: { ...db.profile, ...patch } };
  notify();
}

export function resetDb(): void {
  // Drop the running simulation too, otherwise the freshly seeded session
  // would inherit the old one's energy/SoC on the next tick.
  simStates.clear();
  simSnapshot = new Map();
  lastSimPersist = 0;
  cache = seed();
  notify();
}

/** Next sequential id for a collection, e.g. nextId("vehicles", "veh"). */
export function nextId(key: CollectionKey, prefix: string): string {
  const rows = load()[key] as { id: string }[];
  const max = rows.reduce((m, r) => {
    const n = Number(r.id.replace(/^\D+/, ""));
    return Number.isFinite(n) && n > m ? n : m;
  }, 0);
  return `${prefix}-${max + 1}`;
}
