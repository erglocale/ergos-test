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
export type WarnType =
  | "Connector faulted"
  | "Communication lost"
  | "Session interrupted"
  | "Throughput degraded"
  | "Predicted fault";

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
  "Session interrupted": "#e24b4a",
  "Throughput degraded": "#ef9f27",
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

  // Everything else the health model already knows about each charger, so the
  // page reports the faults a site actually deals with — a session cut short,
  // a unit delivering well under its rating — and not only the two states that
  // can be read off the charger's current status.
  const RECENT_FAULT_DAYS = 10;

  const healthByCharger = chargepoints.map(
    (cp) => [cp, deriveChargerHealth(cp, sessions, warnings, nowMs)] as const,
  );

  // Throughput is judged against the rest of the fleet, not against the
  // nameplate. These are 3.3 kW AC units doing small top-ups, so every one of
  // them averages well under its rating and an absolute floor would flag the
  // lot — which tells a site nothing. What is worth a row is a charger
  // delivering materially less than its neighbours on the same duty.
  const ratios = healthByCharger
    .filter(([, h]) => h.ratedKw > 0 && h.sessions7d > 0)
    .map(([, h]) => h.actualKw / h.ratedKw)
    .sort((a, b) => a - b);
  const medianRatio = ratios.length
    ? ratios[Math.floor((ratios.length - 1) / 2)]
    : 0;
  const throughputFloor = medianRatio * 0.85;

  for (const [cp, health] of healthByCharger) {
    const { prediction } = health;

    // Predicted fault, for a charger showing a wear pattern.
    if (prediction) {
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

    // The most recent session-ending fault from the charger's own error log.
    // Only lock failures: an offline unit and a faulted connector already have
    // rows above from the warnings feed, and repeating them here would count
    // one fault twice.
    const cutoff = nowMs - RECENT_FAULT_DAYS * 86_400_000;
    const interrupted = health.errors.find(
      (e) =>
        e.severity === "session-ending" &&
        e.code.startsWith("ConnectorLockFailure") &&
        dayjs(e.at).valueOf() >= cutoff,
    );
    if (interrupted) {
      rows.push({
        id: `ERR-${interrupted.id}`,
        chargerId: cp.id,
        chargerName: cp.name,
        hub: cp.hub,
        address: cp.address,
        severity: "Critical",
        type: "Session interrupted",
        details: `${interrupted.title}. The vehicle left on a part charge.`,
        code: `${interrupted.code}${
          interrupted.connectorId ? ` · Conn ${interrupted.connectorId}` : ""
        }`,
        action: interrupted.action,
        triggeredAt: interrupted.at,
        status: "Active",
      });
    }

    // A unit that is up but not delivering what it is rated for — cabling or
    // supply, and invisible on a status page.
    if (health.ratedKw > 0 && health.sessions7d > 0 && throughputFloor > 0) {
      const ratio = health.actualKw / health.ratedKw;
      if (ratio < throughputFloor) {
        rows.push({
          id: `THRU-${cp.id}`,
          chargerId: cp.id,
          chargerName: cp.name,
          hub: cp.hub,
          address: cp.address,
          severity: "Warning",
          type: "Throughput degraded",
          details:
            `Throughput at ${Math.round(ratio * 100)}% of rated capacity over a 7-day ` +
            `window — ${Math.round((1 - ratio / medianRatio) * 100)}% below the rest of the fleet.`,
          code: `Avg ${health.actualKw.toFixed(1)} kW on ${health.ratedKw.toFixed(1)} kW rated`,
          action: "Check input supply voltage and cable condition at site.",
          // Measured over the trailing week, so it is dated to the start of it
          // rather than to an instant.
          triggeredAt: dayjs(nowMs).subtract(7, "day").hour(12).minute(0).toISOString(),
          status: "Active",
        });
      }
    }
  }

  return rows.sort((a, b) => dayjs(b.triggeredAt).valueOf() - dayjs(a.triggeredAt).valueOf());
}
