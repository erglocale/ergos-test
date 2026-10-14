// One flat row model for the charger alerts page. Every row is derived: the OCPP log is
// generated for the demo fleet (data/ocpp.ts) and lib/ocppDetectors.ts reads it with prod's rules.

import { type OcppMessage, buildOcppLog } from "@/data/ocpp";
import { type DetectedAlert, type DetectedAlertType, runDetectors } from "@/lib/ocppDetectors";
import type { ChargerWarning, Chargepoint, ChargingSession } from "@/data/types";

export interface ChargerWarningRow extends DetectedAlert {
  chargerName: string;
  hub: string;
}

// Replica of prod's chargerAlertLabels.js
export const CHARGER_ALERT_TYPES: Partial<Record<
  DetectedAlertType,
  { label: string; color: string; workTitle: string }
>> = {
  ConnectorFaulted: { label: "Charger fault", color: "#ef4444", workTitle: "Investigate charger fault" },
  CommunicationLost: {
    label: "Communication lost",
    color: "#f59e0b",
    workTitle: "Restore charger communication",
  },
};

export const alertTypeLabel = (type: DetectedAlertType) => CHARGER_ALERT_TYPES[type]?.label ?? type;

export const connectorLabel = (connectorId: number | null) => {
  if (connectorId === null) return "All connectors";
  if (connectorId === 0) return "Whole charger";
  return `Connector ${connectorId}`;
};

// Regenerating weeks of heartbeats on every render would be wasteful, so the log is
// cached against the inputs and a coarse clock bucket.
let logCache: { key: string; log: OcppMessage[] } | null = null;

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
  resolved: DetectedAlert[];
}

export function buildChargerWarningRows(
  { chargepoints, sessions, chargerWarnings, resolved }: WarningRowInput,
  nowMs: number = Date.now(),
): ChargerWarningRow[] {
  const messages = getOcppLog(chargepoints, sessions, chargerWarnings, nowMs);
  const cpById = new Map(chargepoints.map((c) => [c.id, c]));
  return runDetectors({ messages, chargepoints, nowMs, resolved }).map((d) => ({
    ...d,
    chargerName: cpById.get(d.chargerId)?.name ?? d.chargerId,
    hub: cpById.get(d.chargerId)?.hub ?? "—",
  }));
}
