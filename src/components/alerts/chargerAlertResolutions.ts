// Alerts marked resolved by hand, kept in localStorage as they were at that moment.
// Stands in for production's PATCH /host/chargerAlert/:id/status with status 'Fixed'.

import { useSyncExternalStore } from "react";
import type { DetectedAlert } from "@/lib/ocppDetectors";

const KEY = "ergos-test:charger-alert-resolutions:v1";
const EMPTY: DetectedAlert[] = [];
const listeners = new Set<() => void>();
let cache: DetectedAlert[] | null = null;

function load(): DetectedAlert[] {
  if (cache) return cache;
  if (typeof window === "undefined") return EMPTY;
  try {
    cache = JSON.parse(window.localStorage.getItem(KEY) ?? "[]") as DetectedAlert[];
  } catch {
    cache = [];
  }
  return cache;
}

export function resolveChargerAlert(alert: DetectedAlert): void {
  cache = [...load(), { ...alert, resolvedAt: new Date().toISOString() }];
  try {
    window.localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    // storage unavailable — it stays resolved until the page reloads
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useResolvedChargerAlerts(): DetectedAlert[] {
  return useSyncExternalStore(subscribe, load, () => EMPTY);
}
