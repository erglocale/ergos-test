import dayjs from "dayjs";
import type { Alert } from "@/data/types";

/** Vehicle regs look like "AS01SC0300"; charger sources are hub names like "Beltola-01". */
export function isVehicleAlert(alert: Alert): boolean {
  return /^AS\d/.test(alert.source);
}

export const SEVERITY_COLORS: Record<Alert["severity"], string> = {
  Critical: "red",
  Warning: "orange",
  Info: "blue",
};

/** Mirrors ALERT_TYPE_COLORS from the production utils/alerts.js, keyed by the sandbox alert types. */
export const ALERT_TYPE_COLORS: Record<string, string> = {
  "Low SOC": "#f97316",
  "Charger fault": "#ef4444",
  "Charging interrupted": "#f59e0b",
  "Idle vehicle": "#8b5cf6",
  "Offline device": "#64748b",
  "Charging complete": "#22c55e",
  "New suggestion": "#3b82f6",
};

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "N/A";
  return dayjs(iso).format("DD MMM YYYY, hh:mm A");
}

export const rangePresets = [
  { label: "Last 2 Days", value: [dayjs().subtract(2, "day"), dayjs()] as [dayjs.Dayjs, dayjs.Dayjs] },
  { label: "Last 7 Days", value: [dayjs().subtract(7, "day"), dayjs()] as [dayjs.Dayjs, dayjs.Dayjs] },
  { label: "Last 14 Days", value: [dayjs().subtract(14, "day"), dayjs()] as [dayjs.Dayjs, dayjs.Dayjs] },
  { label: "Last 30 Days", value: [dayjs().subtract(30, "day"), dayjs()] as [dayjs.Dayjs, dayjs.Dayjs] },
  { label: "Last 90 Days", value: [dayjs().subtract(90, "day"), dayjs()] as [dayjs.Dayjs, dayjs.Dayjs] },
];
