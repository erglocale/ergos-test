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

/**
 * Rupees per US dollar. The dollar tariff is the rupee tariff converted at
 * this rate, rounded to the paise/cent the money columns actually print, so
 * the two halves of the toggle reconcile: an ₹ 71 charge reads as $ 0.84, not
 * as a fresh US quote that happens to land on a round dollar.
 */
export const INR_PER_USD = 85;

const INR_PRICE_PER_KWH = 8.5;

const CONFIGS: Record<UnitSystem, UnitConfig> = {
  metric: {
    system: "metric",
    currencyCode: "INR",
    currencySymbol: "₹",
    distanceUnit: "km",
    distanceLabel: "km",
    kmFactor: 1,
    energyPricePerKwh: INR_PRICE_PER_KWH,
  },
  imperial: {
    system: "imperial",
    currencyCode: "USD",
    currencySymbol: "$",
    distanceUnit: "mi",
    distanceLabel: "miles",
    kmFactor: 0.621371,
    energyPricePerKwh: Math.round((INR_PRICE_PER_KWH / INR_PER_USD) * 100) / 100,
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

/**
 * Rupee amount in the active currency, and back. Reports whose tariffs are
 * quoted in ₹ keep them in ₹ and convert at the display boundary, so nothing
 * is stored half-converted.
 */
export function fromInr(valueInr: number, u: UnitConfig): number {
  return u.currencyCode === "USD" ? valueInr / INR_PER_USD : valueInr;
}

export function toInr(value: number, u: UnitConfig): number {
  return u.currencyCode === "USD" ? value * INR_PER_USD : value;
}

/** Distance in the active unit, converted from km. */
export function toDistance(km: number, u: UnitConfig): number {
  return km * u.kmFactor;
}

/**
 * "₹ 12,345" / "$12,345" for totals, "$0.84" for small amounts. Whole units
 * are fine once a figure runs to four digits, but rounding there would turn
 * every dollar-side cost into "$1" — the amounts a fleet's per-vehicle costs
 * land on are under a dollar once converted, so they keep their cents.
 */
export function money(value: number, u: UnitConfig): string {
  const decimals = Math.abs(value) >= 1000 ? 0 : 2;
  const n = value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
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

/**
 * A cost-per-distance figure with enough decimals to stay distinguishable.
 * Two is right for ₹/km, where rates sit above 1; on the dollar side the same
 * rates are ~1/85th the size and every vehicle would print "0.02".
 */
export function perDistance(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "N/A";
  const v = Math.abs(value);
  const decimals = v === 0 || v >= 1 ? 2 : v >= 0.1 ? 3 : 4;
  return value.toFixed(decimals);
}

/** "₹ / km" or "$ / mi". */
export function costPerDistanceLabel(u: UnitConfig): string {
  return `${u.currencySymbol} / ${u.distanceUnit}`;
}
