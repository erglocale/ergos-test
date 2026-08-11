// One flat row model for the charger warnings page (demo spec item 8).
//
// Two sources feed it: the real warnings feed (offline chargers, faulted
// connectors) and the predicted faults derived by the charger health model —
// the same derivation the charger Overview tab shows, so a prediction can
// never appear on one screen and not the other.

import dayjs from "dayjs";
import { deriveChargerHealth } from "@/components/chargers/chargerHealth";
import type { Chargepoint, ChargerWarning, ChargingSession } from "@/data/types";

export type WarnSeverity = "Critical" | "Warning" | "Predicted";
export type WarnStatus = "Active" | "Watching" | "Resolved";
export type WarnType = "Connector faulted" | "Communication lost" | "Predicted fault";

export interface ChargerWarningRow {
  id: string;
  chargerId: string;
  chargerName: string;
  hub: string;
  address: string;
  severity: WarnSeverity;
  type: WarnType;
  /** Human summary shown in the DETAILS column. */
  details: string;
  /** Machine line under the summary, e.g. "ConnectorFaulted · Last: 09 Aug". */
  code: string;
  action: string;
  triggeredAt: string;
  status: WarnStatus;
}

export const SEVERITY_TAG_COLOR: Record<WarnSeverity, string> = {
  Critical: "red",
  Warning: "orange",
  Predicted: "blue",
};

export const SEVERITY_DOT_COLOR: Record<WarnSeverity, string> = {
  Critical: "#ef4444",
  Warning: "#f59e0b",
  Predicted: "#3b82f6",
};

export const TYPE_BAR_COLOR: Record<WarnType, string> = {
  "Connector faulted": "#ef4444",
  "Communication lost": "#f59e0b",
  "Predicted fault": "#3b82f6",
};

function statusOf(w: ChargerWarning): WarnStatus {
  if (w.warningObject.status === "Fixed") return "Resolved";
  if (w.warningObject.status === "Ignore") return "Watching";
  return "Active";
}

export function buildChargerWarningRows(
  warnings: ChargerWarning[],
  chargepoints: Chargepoint[],
  sessions: ChargingSession[],
  nowMs: number = Date.now(),
): ChargerWarningRow[] {
  const rows: ChargerWarningRow[] = [];
  const cpById = new Map(chargepoints.map((c) => [c.id, c]));

  for (const w of warnings) {
    const cp = cpById.get(w.charger.id);
    const status = statusOf(w);
    const at = w.warningObject.createdAt;
    const common = {
      id: w.id,
      chargerId: w.charger.id,
      chargerName: w.charger.name,
      hub: w.charger.hub,
      address: cp?.address ?? "—",
      triggeredAt: at,
      status,
    };

    if (w.warningObject.type === "ChargerOffline") {
      const hours = Math.round(w.warningObject.offlineForHours ?? 0);
      // A short blip is a warning; half a day dark means no vehicle charged.
      const severity: WarnSeverity = hours >= 6 && status !== "Resolved" ? "Critical" : "Warning";
      rows.push({
        ...common,
        severity,
        type: "Communication lost",
        details:
          status === "Resolved"
            ? `Communication lost for ${hours} hour${hours === 1 ? "" : "s"}. Charger offline, now recovered.`
            : `Charger offline for ${hours} hour${hours === 1 ? "" : "s"}. No sessions possible.`,
        code: `HeartbeatTimeout · ${dayjs(at).format("HH:mm")} - ${dayjs(at)
          .add(hours, "hour")
          .format("HH:mm")}`,
        action:
          status === "Resolved"
            ? "Check network at site. If recurring, inspect SIM/router."
            : "Check the site network. If unresolved within an hour, dispatch maintenance.",
      });
      continue;
    }

    const conn = w.connector?.connectorId ?? 1;
    const since = w.connector?.updatedAt ?? at;
    const hoursFaulted = Math.max(0, Math.round((nowMs - dayjs(since).valueOf()) / 3_600_000));
    rows.push({
      ...common,
      severity: status === "Resolved" ? "Warning" : "Critical",
      type: "Connector faulted",
      details:
        status === "Resolved"
          ? `Connector ${conn} recovered after a fault.`
          : `Connector ${conn} faulted for over ${hoursFaulted} hours. No sessions possible.`,
      code: `ConnectorFaulted · Last: ${dayjs(since).format("DD MMM, h:mm A")}`,
      action:
        status === "Resolved"
          ? `Recovered on its own. Watch connector ${conn} for a repeat.`
          : `Remote reset connector ${conn}. If unresolved, dispatch maintenance.`,
    });
  }

  // Predicted faults, one per charger that shows a wear pattern.
  for (const cp of chargepoints) {
    const { prediction } = deriveChargerHealth(cp, sessions, warnings, nowMs);
    if (!prediction) continue;
    rows.push({
      id: `PRED-${cp.id}`,
      chargerId: cp.id,
      chargerName: cp.name,
      hub: cp.hub,
      address: cp.address,
      severity: "Predicted",
      type: "Predicted fault",
      details: `Connector ${prediction.connectorId} lock degrading. Failure likely within 5 days.`,
      code: `${prediction.occurrences} ConnectorLockFailure in ${prediction.windowDays}d on the same connector`,
      action: `Schedule a physical inspection of connector ${prediction.connectorId}'s latch before it fails.`,
      triggeredAt: prediction.lastAt,
      status: "Watching",
    });
  }

  return rows.sort((a, b) => dayjs(b.triggeredAt).valueOf() - dayjs(a.triggeredAt).valueOf());
}
