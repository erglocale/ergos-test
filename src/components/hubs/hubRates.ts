// Tariff model shared by the hub's "Energy prices" drawer (demo spec item 5)
// and the Charging Hub Energy Report (item 9) — the report prices a hub's
// consumption against whatever that hub was configured with.

export type Period = 0 | 1 | 2 | 3; // off | mid | on | super-off
export type Schedule = Period[]; // 24 entries, index = hour

export interface SeasonRates {
  onPeak: number | null;
  midPeak: number | null;
  offPeak: number | null;
  superOffPeak: number | null;
}

export interface Tariff {
  id: string;
  name: string;
  customerCharge: number;
  /** Facilities-related demand, per kW of monthly peak. */
  frd: number;
  /** Time-related demand, per kW of on-peak peak. */
  trd: number;
  ratchetDefault: boolean;
  ratchetPct: number;
  summer: SeasonRates;
  winter: SeasonRates;
  /** [first, last] month of summer, 0-indexed. */
  summerMonths: [number, number];
  billingDay: number;
  summerSchedule: Schedule;
  winterSchedule: Schedule;
}

export interface Utility {
  id: string;
  name: string;
  /** Currency these rates are quoted in. */
  currency: "USD" | "INR";
  rates: Tariff[];
}

export const UTILITIES: Utility[] = [
  {
    id: "sce",
    name: "Southern California Edison (SCE)",
    currency: "USD",
    rates: [
      {
        id: "tou8d",
        name: "TOU-8 Option D (below 2kV, >500 kW)",
        customerCharge: 774.43,
        frd: 23.63,
        trd: 28.1,
        ratchetDefault: true,
        ratchetPct: 50,
        summer: { onPeak: 0.12944, midPeak: 0.09182, offPeak: 0.06437, superOffPeak: null },
        winter: { onPeak: null, midPeak: 0.11223, offPeak: 0.07381, superOffPeak: 0.04932 },
        summerMonths: [5, 8],
        billingDay: 15,
        summerSchedule: [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 1, 1, 1],
        winterSchedule: [0, 0, 0, 0, 0, 0, 0, 0, 3, 3, 3, 3, 3, 3, 3, 3, 1, 1, 1, 1, 1, 0, 0, 0],
      },
      {
        id: "tou8e",
        name: "TOU-8 Option E (below 2kV, >500 kW)",
        customerCharge: 774.43,
        frd: 12.84,
        trd: 15.22,
        ratchetDefault: true,
        ratchetPct: 50,
        summer: { onPeak: 0.18341, midPeak: 0.12806, offPeak: 0.08219, superOffPeak: null },
        winter: { onPeak: null, midPeak: 0.13102, offPeak: 0.09614, superOffPeak: 0.06281 },
        summerMonths: [5, 8],
        billingDay: 15,
        summerSchedule: [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 1, 1, 1],
        winterSchedule: [0, 0, 0, 0, 0, 0, 0, 0, 3, 3, 3, 3, 3, 3, 3, 3, 1, 1, 1, 1, 1, 0, 0, 0],
      },
    ],
  },
  {
    id: "oncor",
    name: "Oncor + TXU Energy (Texas)",
    currency: "USD",
    rates: [
      {
        id: "com-tou",
        name: "Commercial TOU (>100 kW)",
        customerCharge: 325.0,
        frd: 9.45,
        trd: 12.3,
        ratchetDefault: false,
        ratchetPct: 0,
        summer: { onPeak: 0.112, midPeak: 0.084, offPeak: 0.051, superOffPeak: null },
        winter: { onPeak: 0.089, midPeak: 0.067, offPeak: 0.042, superOffPeak: null },
        summerMonths: [5, 9],
        billingDay: 1,
        summerSchedule: [0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 1, 1, 1, 0, 0],
        winterSchedule: [0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 1, 1, 1, 0, 0],
      },
    ],
  },
  {
    id: "aps",
    name: "Arizona Public Service (APS)",
    currency: "USD",
    rates: [
      {
        id: "e32l",
        name: "E-32 Large General Service TOU",
        customerCharge: 582.0,
        frd: 18.9,
        trd: 22.15,
        ratchetDefault: true,
        ratchetPct: 75,
        summer: { onPeak: 0.1165, midPeak: 0.0842, offPeak: 0.0583, superOffPeak: null },
        winter: { onPeak: 0.0912, midPeak: 0.0681, offPeak: 0.0495, superOffPeak: null },
        summerMonths: [4, 9],
        billingDay: 20,
        summerSchedule: [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 1, 1, 1, 0],
        winterSchedule: [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 1, 1, 1, 0],
      },
    ],
  },
  {
    id: "apdcl",
    name: "Assam Power Distribution (APDCL)",
    currency: "INR",
    rates: [
      {
        id: "hts-tou",
        name: "HT Commercial ToD (11 kV)",
        customerCharge: 12000,
        frd: 350,
        trd: 120,
        ratchetDefault: true,
        ratchetPct: 75,
        summer: { onPeak: 9.45, midPeak: 8.1, offPeak: 6.35, superOffPeak: null },
        winter: { onPeak: 9.05, midPeak: 7.9, offPeak: 6.2, superOffPeak: null },
        summerMonths: [3, 8], // Apr - Sep
        billingDay: 1,
        summerSchedule: [0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 1, 0],
        winterSchedule: [0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 1, 0],
      },
    ],
  },
];

/** Editable copy of a tariff — what the drawer saves and the report reads. */
export interface RateConfig {
  utilityId: string;
  rateId: string;
  customerCharge: number;
  frd: number;
  trd: number;
  ratchetOn: boolean;
  ratchetPct: number;
  billingDay: number;
  summerStart: number;
  summerEnd: number;
  summer: SeasonRates;
  winter: SeasonRates;
  summerSchedule: Schedule;
  winterSchedule: Schedule;
}

export const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
export const PERIOD_LABELS = ["Off-peak", "Mid-peak", "On-peak", "Super off-peak"];
export const PERIOD_BG = ["#ccfbf1", "#fef3c7", "#fee2e2", "#dbeafe"];
export const PERIOD_LINE = ["#0d9488", "#f59e0b", "#ef4444", "#3b82f6"];

export function configFrom(utilityId: string, rate: Tariff): RateConfig {
  return {
    utilityId,
    rateId: rate.id,
    customerCharge: rate.customerCharge,
    frd: rate.frd,
    trd: rate.trd,
    ratchetOn: rate.ratchetDefault,
    ratchetPct: rate.ratchetPct,
    billingDay: rate.billingDay,
    summerStart: rate.summerMonths[0],
    summerEnd: rate.summerMonths[1],
    summer: { ...rate.summer },
    winter: { ...rate.winter },
    summerSchedule: [...rate.summerSchedule],
    winterSchedule: [...rate.winterSchedule],
  };
}

export function rateKey(hub: string) {
  return `ergos-test:hub-rates:v1:${hub}`;
}

/** The default tariff for a currency — used until a hub is configured. */
export function defaultConfigFor(currency: "USD" | "INR"): RateConfig {
  const utility = UTILITIES.find((u) => u.currency === currency) ?? UTILITIES[0];
  return configFrom(utility.id, utility.rates[0]);
}

export function utilityOf(cfg: RateConfig): Utility {
  return UTILITIES.find((u) => u.id === cfg.utilityId) ?? UTILITIES[0];
}

export function tariffOf(cfg: RateConfig): Tariff {
  const utility = utilityOf(cfg);
  return utility.rates.find((r) => r.id === cfg.rateId) ?? utility.rates[0];
}

/** Saved config for a hub, or null when the user has not set one up. */
export function loadRateConfig(hub: string): RateConfig | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(rateKey(hub));
    return raw ? (JSON.parse(raw) as RateConfig) : null;
  } catch {
    return null;
  }
}

/** Summer or winter, given a month index and the config's season window. */
export function isSummerMonth(month: number, cfg: RateConfig): boolean {
  const { summerStart, summerEnd } = cfg;
  return summerStart <= summerEnd
    ? month >= summerStart && month <= summerEnd
    : month >= summerStart || month <= summerEnd;
}
