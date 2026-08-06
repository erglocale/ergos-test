import dayjs from "dayjs";

/**
 * Port of production `utils/alerts.js` — shared helpers and constants for
 * telemetry vehicle alerts. Labels, colors, and summary strings must stay
 * identical to production.
 */

export const ALERT_TYPE_OPTIONS = [
  { label: "Excessive Idle", value: "excessive_idle" },
  { label: "Low Aux Battery", value: "low_aux_battery" },
  { label: "Low SoC Level 1", value: "low_soc_level_1" },
  { label: "Low SoC Level 2", value: "low_soc_level_2" },
  { label: "Low SoC Level 3", value: "low_soc_level_3" },
  { label: "Overspeed", value: "overspeed" },
  { label: "Overspeed + Low SoC", value: "overspeed_low_soc" },
  { label: "Repeated Fast Charging", value: "repeated_fast_charging" },
];

export const SEVERITY_COLORS: Record<string, string> = {
  critical: "red",
  warning: "orange",
  info: "blue",
};

export const ALERT_TYPE_COLORS: Record<string, string> = {
  excessive_idle: "#8b5cf6",
  low_aux_battery: "#f59e0b",
  low_soc_level_1: "#f97316",
  low_soc_level_2: "#ea580c",
  low_soc_level_3: "#c2410c",
  overspeed: "#ef4444",
  overspeed_low_soc: "#dc2626",
  repeated_fast_charging: "#3b82f6",
};

export function fmtNum(val: unknown): string {
  if (val == null) return "N/A";
  const n = Number(val);
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export function formatAlertType(alertType?: string | null): string {
  if (!alertType) return "Unknown";
  return alertType
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function parsePayload(
  payload: unknown,
): Record<string, number> | null {
  if (!payload) return null;
  if (typeof payload === "string") {
    try {
      return JSON.parse(payload) as Record<string, number>;
    } catch {
      return null;
    }
  }
  return payload as Record<string, number>;
}

export function formatDuration(seconds?: number | null): string {
  if (!seconds && seconds !== 0) return "N/A";
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  const hours = Math.floor(seconds / 3600);
  const mins = Math.round((seconds % 3600) / 60);
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

export function getAlertSummary(
  alertType: string,
  payload: unknown,
): string {
  const p = parsePayload(payload);
  if (!p) return "No details available.";

  switch (alertType) {
    case "excessive_idle":
      return `Idle for ${fmtNum(p.duration_hours)}h (threshold: ${fmtNum(p.threshold_hours)}h)`;

    case "low_aux_battery":
      return `Lowest voltage: ${fmtNum(p.lowest_voltage)}V (threshold: ${fmtNum(p.threshold)}V). Duration: ${formatDuration(p.duration_seconds)}`;

    case "low_soc_level_1":
    case "low_soc_level_2":
    case "low_soc_level_3":
      return `Vehicle battery has dropped below ${fmtNum(p.threshold)}%`;

    case "overspeed":
      return `Max speed: ${fmtNum(p.max_speed)} km/h (limit: ${fmtNum(p.threshold)} km/h). Duration: ${formatDuration(p.duration_seconds)}`;

    case "overspeed_low_soc":
      return `Max speed: ${fmtNum(p.max_speed)} km/h (limit: ${fmtNum(p.overspeed_threshold ?? p.threshold)} km/h), SoC: ${fmtNum(p.start_soc)}% (limit: ${fmtNum(p.low_soc_threshold)}%)`;

    case "repeated_fast_charging":
      return `${p.consecutive_fast_charge_count} consecutive fast charges (threshold: ${p.required_fast_charge_count}, >${fmtNum(p.fast_charging_power_threshold_kw)} kW)`;

    default:
      return "No details available.";
  }
}

/**
 * Sandbox stand-in for production's
 * `getTimeZoneAndLocaleBasedDateTime(x).formattedDateTime` (utils/misc).
 */
export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "N/A";
  return dayjs(iso).format("DD MMM YYYY, hh:mm A");
}
