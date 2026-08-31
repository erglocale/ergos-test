// One flat row model for the charger warnings page (demo spec item 8).
//
// Every row on this page is now DERIVED. The OCPP message log is generated for
// the demo fleet (data/ocpp.ts), the seven detectors in lib/ocppDetectors.ts
// read it, and what they return is what the table shows — details, codes and
// recommended actions included. Nothing here writes an alert; it only maps a
// detection onto the shape the table wants.
//
// The generated log is built from the fixtures' own charger warnings and
// sessions, so the messages agree with the rest of the app: an offline window
// on the warnings feed becomes a real gap in the heartbeat stream, and a
// faulted connector becomes the StatusNotification that reported it.

import dayjs from "dayjs";
import { type OcppMessage, buildOcppLog } from "@/data/ocpp";
import {
  type DetectedAlert,
  type DetectedAlertType,
  type DetectedSeverity,
  type DetectedStatus,
  runDetectors,
} from "@/lib/ocppDetectors";
import type {
  ChargerWarning,
  Chargepoint,
  ChargingSession,
  Vehicle,
  WorkOrder,
} from "@/data/types";

export type WarnSeverity = DetectedSeverity;
export type WarnStatus = DetectedStatus;
export type WarnType = DetectedAlertType;

export interface ChargerWarningRow {
  id: string;
  chargerId: string;
  chargerName: string;
  hub: string;
  address: string;
  connectorId: number | null;
  severity: WarnSeverity;
  type: WarnType;
  /** Human summary shown in the DETAILS column. */
  details: string;
  /** Machine line under the summary, e.g. "ConnectorFaulted · Last: 09 Aug". */
  code: string;
  action: string;
  triggeredAt: string;
  status: WarnStatus;
  /** Ids of the OCPP messages this row was detected from. */
  evidence: string[];
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
  "Voltage / ground fault": "#dc2626",
  "Session interrupted": "#e24b4a",
  "Communication lost": "#f59e0b",
  "Throughput degraded": "#ef9f27",
  "Reboot loop": "#d97706",
  "Connector lock degrading": "#3b82f6",
};

// ---- the generated log -----------------------------------------------------
// Regenerating a week of heartbeats on every render would be wasteful, so the
// log is cached against the inputs and a coarse clock bucket.

let logCache: { key: string; log: OcppMessage[] } | null = null;

/** The demo fleet's OCPP message log, memoised. */
export function getOcppLog(
  chargepoints: Chargepoint[],
  sessions: ChargingSession[],
  warnings: ChargerWarning[],
  nowMs: number = Date.now(),
): OcppMessage[] {
  const key = [
    chargepoints.length,
    sessions.length,
    warnings.length,
    chargepoints.map((c) => c.id).join(","),
    Math.floor(nowMs / 300_000),
  ].join("|");
  if (logCache?.key === key) return logCache.log;
  const log = buildOcppLog(chargepoints, sessions, warnings, nowMs);
  logCache = { key, log };
  return log;
}

export interface WarningRowInput {
  chargepoints: Chargepoint[];
  sessions: ChargingSession[];
  chargerWarnings: ChargerWarning[];
  vehicles: Vehicle[];
  workOrders: WorkOrder[];
}

export function buildChargerWarningRows(
  input: WarningRowInput,
  nowMs: number = Date.now(),
): ChargerWarningRow[] {
  const { chargepoints, sessions, chargerWarnings, vehicles, workOrders } = input;
  const messages = getOcppLog(chargepoints, sessions, chargerWarnings, nowMs);
  const detected = runDetectors({
    messages,
    chargepoints,
    sessions,
    vehicles,
    workOrders,
    nowMs,
  });

  const cpById = new Map(chargepoints.map((c) => [c.id, c]));
  return detected
    .map((d: DetectedAlert): ChargerWarningRow => {
      const cp = cpById.get(d.chargerId);
      return {
        id: d.id,
        chargerId: d.chargerId,
        chargerName: cp?.name ?? d.chargerId,
        hub: cp?.hub ?? "—",
        address: cp?.address ?? "—",
        connectorId: d.connectorId,
        severity: d.severity,
        type: d.type,
        details: d.details,
        code: d.code,
        action: d.action,
        triggeredAt: d.detectedAt,
        status: d.status,
        evidence: d.evidence,
      };
    })
    .sort((a, b) => dayjs(b.triggeredAt).valueOf() - dayjs(a.triggeredAt).valueOf());
}
