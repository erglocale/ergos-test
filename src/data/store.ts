"use client";

import { useSyncExternalStore } from "react";
import { demoVehicleAlerts } from "./demoAlerts";
import type { EnergyOverlay } from "./energyBrain";
import { makeFixtures } from "./fixtures";
import {
  advance,
  chargePowerKw,
  plannedPowerKw,
  type SimInputs,
  type SimState,
} from "./liveSim";
import type { CollectionKey, Db, Profile } from "./types";

// All demo data lives in localStorage under this key. CRUD mutates it in
// place and notifies subscribers; "Reset demo data" just deletes the key.
// v18: Azara carries charging history up to the day its sockets faulted.
// v19: a faulted socket on CP-1 Six Mile, plus past charger warnings.
// v20: repeated fast charging is a 4W-only alert, at the MG's thresholds.
// v21: outside-hub (telematics) sessions, a live session per working site, and
//      drivers on the Kapashera cars so their sessions are fleet sessions.
// v22: outside-hub sessions carry no public location name — the tag reads
//      "Outside Hub", not the name of the place.
// v24: maintenance tasks gained a service visit (status IN_SERVICE + `visit`),
//      and records a daysOffRoad. New fields on existing rows are not
//      backfilled the way whole collections are, so the key has to move.
const DB_KEY = "ergos-test:db:v24";

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
 * An ongoing session is drawn from its start up to the current moment, so one
 * left open while the tab was closed would stretch across the whole calendar.
 * Pull it back — but never by discarding what the simulator delivered. The new
 * start is derived FROM the accumulated energy, so the block is exactly as long
 * as that energy takes at the connector's power and every number still agrees.
 * Returns true when something changed.
 */
function reanchorLiveSessions(db: Db): boolean {
  const MAX_LIVE_MIN = 90;
  const now = Date.now();
  let changed = false;
  for (const s of db.sessions) {
    if (s.endTime !== null) continue;
    const elapsedMin = (now - new Date(s.startTime).getTime()) / 60_000;
    if (elapsedMin <= MAX_LIVE_MIN) continue;
    const cp = db.chargepoints.find((c) => c.id === s.chargerId);
    const kw = cp?.connectors.find((cn) => cn.id === s.connectorId)?.powerKw ?? 3;
    const impliedMin = kw > 0 ? (s.energyKwh / kw) * 60 : 0;
    const freshMin = Math.min(MAX_LIVE_MIN, Math.max(5, Math.round(impliedMin)));
    s.startTime = new Date(now - freshMin * 60_000).toISOString();
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

// ---- SoC cap overrides -----------------------------------------------------
// energy-brain owns target_soc for its own vehicles, so writing to the fixture
// rows never reaches them and its next poll would undo anything merged in.
// Accepting a cap suggestion (or editing the limit, or saving a hub charging
// plan) records the cap here instead and the merge lays it over the overlay.
// Sandbox-only: nothing is ever written back to energy-brain.
const CAP_KEY = "ergos-test:soc-caps:v1";
let capOverrides: Record<string, number> | null = null;

function loadCapOverrides(): Record<string, number> {
  if (capOverrides) return capOverrides;
  capOverrides = {};
  if (typeof window === "undefined") return capOverrides;
  try {
    const raw = window.localStorage.getItem(CAP_KEY);
    if (raw) capOverrides = JSON.parse(raw) as Record<string, number>;
  } catch {
    // corrupt overrides — fall back to what energy-brain reports
  }
  return capOverrides;
}

/**
 * Set a vehicle's SoC cap, whichever layer owns the vehicle. This is the target
 * the live simulation charges to, so the change shows up on the vehicle detail
 * page, the charging plan and the schedule at once.
 */
export function setVehicleSocCap(vehicleId: string, cap: number): void {
  if (!isEnergyBrainVehicle(vehicleId)) {
    updateRow("vehicles", vehicleId, { socCapPct: cap });
    return;
  }
  capOverrides = { ...loadCapOverrides(), [vehicleId]: cap };
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(CAP_KEY, JSON.stringify(capOverrides));
    } catch {
      // storage full/unavailable — the override still applies in memory
    }
  }
  merged = null;
  listeners.forEach((l) => l());
}

export function getDb(): Db {
  if (!merged) {
    const base = load();
    const caps = loadCapOverrides();
    const overlayVehicles = energyOverlay?.vehicles.map((v) =>
      caps[v.id] != null && caps[v.id] !== v.socCapPct ? { ...v, socCapPct: caps[v.id] } : v,
    );
    const combined: Db = energyOverlay
      ? {
          ...base,
          vehicles: [...(overlayVehicles ?? []), ...base.vehicles],
          chargepoints: [...energyOverlay.chargepoints, ...base.chargepoints],
          sessions: [...energyOverlay.sessions, ...base.sessions],
          // The demo vans have no alert feed of their own; theirs are
          // synthesized so the fleet the demo actually shows has alerts too.
          alerts: [...demoVehicleAlerts(energyOverlay.vehicles), ...base.alerts].sort((a, b) =>
            a.createdAt < b.createdAt ? 1 : -1,
          ),
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
/** One integration step — matches advance()'s own cap. */
const SIM_STEP_MS = 15 * 60_000;
/** How far back a newly seen energy-brain session is replayed from. */
const BACKFILL_MAX_MS = 12 * 3_600_000;
let lastSimPersist = 0;
// Kept out of DB_KEY: this is derived state that must survive a reload, but it
// also covers energy-brain sessions, which never belong in the fixture db.
// v2: energy-brain sessions are replayed from their start, so the states saved
// before that change (which began at zero progress) are dropped once.
const SIM_KEY = "ergos-test:sim:v2";
let simLoaded = false;

function loadSimStates(): void {
  if (simLoaded || typeof window === "undefined") return;
  simLoaded = true;
  try {
    const raw = window.localStorage.getItem(SIM_KEY);
    if (!raw) return;
    const stored = JSON.parse(raw) as Record<string, Partial<SimState>>;
    for (const [id, st] of Object.entries(stored)) {
      if (typeof st?.energyKwh === "number" && typeof st?.updatedAt === "number") {
        simStates.set(id, {
          energyKwh: st.energyKwh,
          soc: st.soc ?? 0,
          powerKw: st.powerKw ?? 0,
          updatedAt: st.updatedAt,
          finished: st.finished ?? false,
        });
      }
    }
    simSnapshot = new Map(simStates);
  } catch {
    // corrupt sim state — start the integrator from the stored rows instead
  }
}

function persistSimStates(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SIM_KEY, JSON.stringify(Object.fromEntries(simStates)));
  } catch {
    // storage full/unavailable — the simulation keeps running in memory
  }
}

/**
 * Write everything to localStorage immediately. Called when the page is being
 * hidden or unloaded, so the last few seconds of progress aren't lost to the
 * 30 s flush interval.
 */
export function flushSimulation(): void {
  lastSimPersist = Date.now();
  persist();
  persistSimStates();
}

const isEnergyBrainSession = (id: string) => id.startsWith("EB-");

/**
 * True when a vehicle comes from the energy-brain overlay rather than the
 * fixtures. Those rows are owned by energy-brain — writing to them here would
 * be overwritten on the next poll, so callers skip them instead.
 */
export function isEnergyBrainVehicle(id: string): boolean {
  return energyOverlay?.vehicles.some((v) => v.id === id) ?? false;
}

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
  // Resume where the last visit left off. advance() caps a single step at
  // MAX_STEP_HOURS, so a refresh or a short tab switch is seamless while a
  // gap of hours simply doesn't accrue — you never come back to a full pack.
  loadSimStates();
  const db = getDb();
  const live = db.sessions.filter((s) => s.endTime === null);
  const seen = new Set<string>();
  const completed: { session: (typeof live)[number]; soc: number; energyKwh: number }[] = [];

  // Chargers are routinely oversubscribed against the site's grid connection,
  // so the sum of what every session *could* draw is capped to the hub's grid
  // limit and shared out proportionally. Without this a hub can report more kW
  // than its connection allows (e.g. two 22 kW connectors on a 20 kW site).
  const hubOf = new Map<string, string>();
  for (const cp of db.chargepoints) hubOf.set(cp.id, cp.hub);
  const gridLimits = energyOverlay?.hubGridLimitKw ?? {};
  const wantByHub = new Map<string, number>();
  const wantById = new Map<string, number>();

  const inputsFor = (s: (typeof live)[number]): SimInputs => {
    const vehicle = db.vehicles.find((v) => v.reg === s.vehicleReg);
    const cp = db.chargepoints.find((c) => c.id === s.chargerId);
    return {
      connectorKw:
        cp?.connectors.find((cn) => cn.id === s.connectorId)?.powerKw ??
        cp?.connectors[0]?.powerKw ??
        3,
      vehicleMaxKw: vehicle?.maxChargeKw,
      batteryKwh: vehicle?.batteryKwh ?? 8,
      targetSoc: vehicle?.socCapPct ?? 100,
      plannedKw: plannedPowerKw(s.id, nowMs),
    };
  };

  for (const s of live) {
    const soc = simStates.get(s.id)?.soc ?? db.vehicles.find((v) => v.reg === s.vehicleReg)?.soc ?? s.socStart;
    const want = chargePowerKw(soc, inputsFor(s));
    wantById.set(s.id, want);
    const hub = hubOf.get(s.chargerId);
    if (hub) wantByHub.set(hub, (wantByHub.get(hub) ?? 0) + want);
  }

  /** Scale factor to bring a hub back under its grid limit, or 1. */
  const hubScale = (chargerId: string): number => {
    const hub = hubOf.get(chargerId);
    if (!hub) return 1;
    const limit = gridLimits[hub];
    const want = wantByHub.get(hub) ?? 0;
    if (!limit || want <= limit) return 1;
    return limit / want;
  };

  for (const s of live) {
    seen.add(s.id);
    const vehicle = db.vehicles.find((v) => v.reg === s.vehicleReg);
    const base = inputsFor(s);
    const scale = hubScale(s.chargerId);
    const inputs: SimInputs =
      scale >= 1
        ? base
        : {
            ...base,
            plannedKw: (wantById.get(s.id) ?? 0) * scale,
          };

    const stored = simStates.get(s.id);
    const fromEnergyBrain = isEnergyBrainSession(s.id);
    // A session energy-brain opened earlier has, as far as the demo is
    // concerned, been charging ever since. Start its meter at the plug-in
    // moment so the first tick can replay that time.
    const openedMs = new Date(s.startTime).getTime();
    let prior: SimState = stored ?? {
      // energy-brain reports the energy still REQUESTED, not delivered, so a
      // simulated session always starts its meter at zero.
      energyKwh: fromEnergyBrain ? 0 : (s.energyKwh ?? 0),
      soc: vehicle?.soc ?? s.socStart,
      powerKw: 0,
      updatedAt:
        fromEnergyBrain && Number.isFinite(openedMs)
          ? Math.min(nowMs, Math.max(nowMs - BACKFILL_MAX_MS, openedMs))
          : nowMs,
      finished: false,
    };

    // Replay that elapsed time. advance() deliberately caps one step, so the
    // catch-up walks forward in cap-sized steps — and at the connector's
    // physical rate, because the optimizer's plan describes the future only and
    // would otherwise silence a charge that has already happened. Only ever
    // done on first sight of an energy-brain session: a fixture session left
    // open while the tab was closed must NOT accrue hours of charge.
    if (!stored && fromEnergyBrain && nowMs - prior.updatedAt > SIM_STEP_MS) {
      const unplanned: SimInputs = { ...base, plannedKw: null };
      let t = prior.updatedAt;
      while (t < nowMs && !prior.finished) {
        t = Math.min(nowMs, t + SIM_STEP_MS);
        prior = advance(prior, unplanned, t);
      }
    }

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
    persistSimStates();
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
  persistSimStates();

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
  capOverrides = {};
  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(SIM_KEY);
      window.localStorage.removeItem(CAP_KEY);
    } catch {
      // nothing to clean up
    }
  }
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
