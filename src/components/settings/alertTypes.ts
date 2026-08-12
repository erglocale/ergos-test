/**
 * Port of production `utils/alertTypes.js` — per-alert-type metadata for the
 * notification preferences UI. Groups, ids, labels and ordering must stay
 * identical to production, which mirrors the canonical list in
 * telematics-processor's alert types and reuses the friendly labels from
 * alertUtils, so preferences, the alerts list and toasts all agree.
 */

import { ALERT_TYPE_OPTIONS } from "@/components/alerts/alertUtils";

const labelByValue = Object.fromEntries(
  ALERT_TYPE_OPTIONS.map(({ value, label }) => [value, label]),
);

export const ALERT_TYPE_GROUPS = [
  {
    id: "battery",
    label: "Battery",
    description: "Low SoC and auxiliary battery alerts.",
    types: ["low_soc_level_1", "low_soc_level_2", "low_soc_level_3", "low_aux_battery"],
  },
  {
    id: "speed",
    label: "Speed",
    description: "Speed-limit and combined speed/SoC alerts.",
    types: ["overspeed", "overspeed_low_soc"],
  },
  {
    id: "driving",
    label: "Others",
    description: "Idle and charging-pattern alerts.",
    types: ["excessive_idle", "repeated_fast_charging"],
  },
];

export const ALL_ALERT_TYPES = ALERT_TYPE_GROUPS.flatMap((g) => g.types);

export function getAlertTypeLabel(value: string): string {
  return labelByValue[value] || value;
}
