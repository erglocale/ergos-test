"use client";

// Customer-dependent units (demo spec item 9): the same reports read in ₹/km
// for an Indian fleet and $/mile for a US one. One preference drives currency,
// distance and the default energy tariff, so nothing can end up half-converted
// — a report never shows dollars against a per-km rupee rate.

import { useSyncExternalStore } from "react";

export type UnitSystem = "metric" | "imperial";

export interface UnitConfig {
  system: UnitSystem;
  currencyCode: "INR" | "USD";
  currencySymbol: "₹" | "$";
  distanceUnit: "km" | "mi";
  /** Long form for axis titles. */
  distanceLabel: "km" | "miles";
  /** Multiply a value in km by this. */
  kmFactor: number;
  /** Retail energy price in the active currency, per kWh. */
  energyPricePerKwh: number;
}

const CONFIGS: Record<UnitSystem, UnitConfig> = {
  metric: {
    system: "metric",
    currencyCode: "INR",
    currencySymbol: "₹",
    distanceUnit: "km",
    distanceLabel: "km",
    kmFactor: 1,
    energyPricePerKwh: 8.5,
  },
  imperial: {
    system: "imperial",
    currencyCode: "USD",
    currencySymbol: "$",
    distanceUnit: "mi",
    distanceLabel: "miles",
    kmFactor: 0.621371,
    energyPricePerKwh: 0.12,
  },
};

const KEY = "ergos-test:units:v1";

let current: UnitSystem = "metric";
let loaded = false;
const listeners = new Set<() => void>();

function load(): void {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  const saved = window.localStorage.getItem(KEY);
  if (saved === "metric" || saved === "imperial") current = saved;
}

export function getUnitSystem(): UnitSystem {
  load();
  return current;
}

export function setUnitSystem(system: UnitSystem): void {
  current = system;
  loaded = true;
  if (typeof window !== "undefined") window.localStorage.setItem(KEY, system);
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Reactive units — every report that reads this switches together. */
export function useUnits(): UnitConfig {
  const system = useSyncExternalStore(
    subscribe,
    getUnitSystem,
    () => "metric" as UnitSystem,
  );
  return CONFIGS[system];
}

export function unitsFor(system: UnitSystem): UnitConfig {
  return CONFIGS[system];
}

/** Distance in the active unit, converted from km. */
export function toDistance(km: number, u: UnitConfig): number {
  return km * u.kmFactor;
}

/** "₹ 12,345" / "$12,345" — no decimals. */
export function money(value: number, u: UnitConfig): string {
  const n = Math.round(value).toLocaleString("en-US");
  return u.currencySymbol === "$" ? `$${n}` : `₹ ${n}`;
}

/** Money with two decimals, for rates and small amounts. */
export function money2(value: number, u: UnitConfig): string {
  const n = value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return u.currencySymbol === "$" ? `$${n}` : `₹ ${n}`;
}

/** "₹ / km" or "$ / mi". */
export function costPerDistanceLabel(u: UnitConfig): string {
  return `${u.currencySymbol} / ${u.distanceUnit}`;
}
