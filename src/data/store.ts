"use client";

import { useSyncExternalStore } from "react";
import type { EnergyOverlay } from "./energyBrain";
import { makeFixtures } from "./fixtures";
import type { CollectionKey, Db, Profile } from "./types";

// All demo data lives in localStorage under this key. CRUD mutates it in
// place and notifies subscribers; "Reset demo data" just deletes the key.
const DB_KEY = "ergos-test:db:v12";

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
  const base = load();
  if (!energyOverlay) return base;
  if (!merged) {
    merged = {
      ...base,
      vehicles: [...energyOverlay.vehicles, ...base.vehicles],
      chargepoints: [...energyOverlay.chargepoints, ...base.chargepoints],
      sessions: [...energyOverlay.sessions, ...base.sessions],
    };
  }
  return merged;
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
