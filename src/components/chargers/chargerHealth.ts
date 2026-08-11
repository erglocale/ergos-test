// Health + error model behind the charger Overview tab (demo spec item 7).
//
// Everything that CAN come from the sandbox's own data does: session counts,
// energy, throughput and downtime are computed from db.sessions and
// db.chargerWarnings. The fixtures have no OCPP error log, so the fault
// timeline is generated deterministically per charger (same charger -> same
// errors on every render and reload) and merged with the real warnings.

import dayjs from "dayjs";
import type { Chargepoint, ChargerWarning, ChargingSession } from "@/data/types";

export type ErrorSeverity = "session-ending" | "minor";

export interface ChargerError {
  id: string;
  /** ISO timestamp. */
  at: string;
  /** Plain-language summary, e.g. "Session ended mid-charge on connector 1". */
  title: string;
  /** OCPP-style code line, e.g. "ConnectorLockFailure · Vendor: 43". */
  code: string;
  action: string;
  severity: ErrorSeverity;
  connectorId: number | null;
}

export interface ChargerHealth {
  uptimePct: number;
  /** Percentage points vs the previous 30 days. */
  uptimeDeltaPct: number;
  sessions7d: number;
  sessionsPerDay: number;
  energy7dKwh: number;
  energyPerDayKwh: number;
  faults30d: number;
  faultsSessionEnding: number;
  faultsMinor: number;
  /** Delivered kW averaged over the last 7 days of charging time. */
  actualKw: number;
  ratedKw: number;
  /** 0-100 composite shown in the ring. */
  score: number;
  prediction: ChargerPrediction | null;
  errors: ChargerError[];
}

/** A fault the wear pattern says is coming, not one that has happened yet. */
export interface ChargerPrediction {
  title: string;
  body: string;
  connectorId: number;
  /** Matching failures seen in the pattern window. */
  occurrences: number;
  windowDays: number;
  /** Most recent matching failure. */
  lastAt: string;
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Fault catalog. `lock` entries are the ones that form a wear pattern. */
const CATALOG: {
  key: string;
  title: (c: number) => string;
  code: string;
  action: (c: number) => string;
  severity: ErrorSeverity;
}[] = [
  {
    key: "lock-mid",
    title: (c) => `Session ended mid-charge on connector ${c}`,
    code: "ConnectorLockFailure · Vendor: 43",
    action: (c) => `Inspect latch mechanism on connector ${c}. Part of a degradation pattern.`,
    severity: "session-ending",
  },
  {
    key: "lock-start",
    title: () => "Charging prevented, connector failed to lock",
    code: "ConnectorLockFailure · Vendor: 43",
    action: () => "Same connector, same fault. Pattern detected — see the prediction above.",
    severity: "session-ending",
  },
  {
    key: "soft",
    title: () => "Session ended early, vehicle-side stop",
    code: "OtherError · StopReason: SoftError",
    action: () => "Vehicle-side issue. No charger action needed — flag the vehicle for a fleet check.",
    severity: "minor",
  },
  {
    key: "heartbeat",
    title: () => "Brief communication timeout, auto-recovered",
    code: "InternalError · HeartbeatTimeout",
    action: () => "No action. Transient network issue, session unaffected.",
    severity: "minor",
  },
  {
    key: "ground",
    title: (c) => `Charging halted, ground fault on connector ${c}`,
    code: "GroundFailure · Vendor: 12",
    action: (c) => `Electrical inspection required before re-enabling connector ${c}.`,
    severity: "session-ending",
  },
  {
    key: "voltage",
    title: () => "Input voltage out of range for 4 minutes",
    code: "OverVoltage · Vendor: 7",
    action: () => "Check the site supply voltage with the utility.",
    severity: "minor",
  },
  {
    key: "handshake",
    title: () => "Handshake failed, vehicle never started charging",
    code: "EVCommunicationError",
    action: () => "Retry with another vehicle to isolate charger from vehicle.",
    severity: "minor",
  },
];

const DAY_MS = 86_400_000;

export function deriveChargerHealth(
  cp: Chargepoint,
  allSessions: ChargingSession[],
  allWarnings: ChargerWarning[],
  nowMs: number = Date.now(),
): ChargerHealth {
  const rand = rng(hash(cp.id));
  const sessions = allSessions.filter((s) => s.chargerId === cp.id);
  const warnings = allWarnings.filter((w) => w.charger.id === cp.id);
  const ratedKw = Math.max(0, ...cp.connectors.map((c) => c.powerKw));

  // ---- last 7 days: sessions, energy, throughput --------------------------
  const from7 = nowMs - 7 * DAY_MS;
  const recent = sessions.filter((s) => dayjs(s.startTime).valueOf() >= from7);
  const energy7dKwh = recent.reduce((sum, s) => sum + s.energyKwh, 0);
  const chargingHours = recent.reduce((sum, s) => {
    const end = s.endTime ? dayjs(s.endTime).valueOf() : nowMs;
    return sum + Math.max(0, end - dayjs(s.startTime).valueOf()) / 3_600_000;
  }, 0);
  const actualKw = chargingHours > 0 ? energy7dKwh / chargingHours : 0;

  // ---- uptime from real downtime warnings ---------------------------------
  const from30 = nowMs - 30 * DAY_MS;
  const offlineHours = warnings
    .filter((w) => dayjs(w.warningObject.createdAt).valueOf() >= from30)
    .reduce((sum, w) => sum + (w.warningObject.offlineForHours ?? 0), 0);
  // Short blips never reach the warnings feed; a small deterministic allowance
  // keeps a charger with zero warnings from claiming a perfect 100 %.
  const blipHours = rand() * 6;
  const uptimePct = Math.max(
    0,
    Math.min(100, 100 - ((Math.min(offlineHours, 720) + blipHours) / 720) * 100),
  );
  const uptimeDeltaPct = Math.round((rand() * 5 - 2) * 10) / 10;

  // ---- fault timeline: generated, merged with the real warnings -----------
  const errors: ChargerError[] = [];
  const connectorIds = cp.connectors.map((c) => c.id);
  const patternConnector = connectorIds[Math.floor(rand() * connectorIds.length)] ?? 1;
  // Two out of three chargers carry a wear pattern on one connector — that is
  // what makes the predicted-fault callout meaningful.
  const hasPattern = hash(cp.id) % 3 !== 0;

  const push = (entry: (typeof CATALOG)[number], ageDays: number, connector: number) => {
    errors.push({
      id: `${cp.id}-${entry.key}-${Math.round(ageDays * 24)}`,
      at: new Date(nowMs - ageDays * DAY_MS).toISOString(),
      title: entry.title(connector),
      code: entry.code,
      action: entry.action(connector),
      severity: entry.severity,
      connectorId: connector,
    });
  };

  const byKey = (k: string) => CATALOG.find((c) => c.key === k)!;
  if (hasPattern) {
    push(byKey("lock-mid"), 1 + rand() * 1.5, patternConnector);
    push(byKey("lock-start"), 3 + rand() * 1.5, patternConnector);
    push(byKey("lock-mid"), 10 + rand() * 3, patternConnector);
  }
  // Two or three unrelated events, drawn from the rest of the catalog.
  const others = CATALOG.filter((c) => !c.key.startsWith("lock"));
  const extra = 2 + Math.floor(rand() * 2);
  for (let i = 0; i < extra; i += 1) {
    const entry = others[Math.floor(rand() * others.length)];
    const connector = connectorIds[Math.floor(rand() * connectorIds.length)] ?? 1;
    push(entry, 2 + rand() * 26, connector);
  }

  // Real rows from the warnings feed so the Overview never contradicts Alerts.
  for (const w of warnings) {
    const at = dayjs(w.warningObject.createdAt);
    if (at.valueOf() < from30) continue;
    if (w.warningObject.type === "ChargerOffline") {
      const hours = Math.round(w.warningObject.offlineForHours ?? 0);
      errors.push({
        id: `${w.id}-offline`,
        at: at.toISOString(),
        title: `Charger offline for ${hours} hour${hours === 1 ? "" : "s"}`,
        code: "InternalError · HeartbeatTimeout",
        action:
          w.warningObject.status === "Fixed"
            ? "Recovered on its own. Check the site router if it recurs."
            : "Check network at the site. If unresolved, dispatch maintenance.",
        severity: "session-ending",
        connectorId: null,
      });
    } else {
      const conn = w.connector?.connectorId ?? 1;
      errors.push({
        id: `${w.id}-faulted`,
        at: at.toISOString(),
        title: `Connector ${conn} reported ${w.connector?.status ?? "Faulted"}`,
        code: "ConnectorFaulted",
        action: `Remote reset connector ${conn}. If it stays faulted, dispatch maintenance.`,
        severity: "session-ending",
        connectorId: conn,
      });
    }
  }

  errors.sort((a, b) => dayjs(b.at).valueOf() - dayjs(a.at).valueOf());

  const in30 = errors.filter((e) => dayjs(e.at).valueOf() >= from30);
  const faultsSessionEnding = in30.filter((e) => e.severity === "session-ending").length;
  const faultsMinor = in30.length - faultsSessionEnding;

  // ---- prediction ---------------------------------------------------------
  const PATTERN_WINDOW_DAYS = 14;
  const lockFailures = in30.filter(
    (e) =>
      e.code.startsWith("ConnectorLockFailure") &&
      dayjs(e.at).valueOf() >= nowMs - PATTERN_WINDOW_DAYS * DAY_MS,
  );
  const prediction: ChargerPrediction | null =
    lockFailures.length >= 2
      ? {
          title: `Predicted: connector ${patternConnector} lock mechanism degrading`,
          body:
            `Lock failure rate on connector ${patternConnector} increased 3x over the last ${PATTERN_WINDOW_DAYS} days. ` +
            `Based on similar patterns, physical inspection is likely needed within the next 5 days.` +
            (cp.connectors.length === 1 ? " This is the only connector on this charger." : ""),
          connectorId: patternConnector,
          occurrences: lockFailures.length,
          windowDays: PATTERN_WINDOW_DAYS,
          lastAt: lockFailures[0].at,
        }
      : null;

  // ---- composite score ----------------------------------------------------
  const throughputRatio = ratedKw > 0 ? Math.min(1, actualKw / ratedKw) : 0;
  const score = Math.max(
    0,
    Math.min(
      100,
      Math.round(uptimePct * 0.5 + throughputRatio * 100 * 0.3 + Math.max(0, 100 - in30.length * 10) * 0.2),
    ),
  );

  return {
    uptimePct: Math.round(uptimePct * 10) / 10,
    uptimeDeltaPct,
    sessions7d: recent.length,
    sessionsPerDay: Math.round((recent.length / 7) * 10) / 10,
    energy7dKwh: Math.round(energy7dKwh * 10) / 10,
    energyPerDayKwh: Math.round((energy7dKwh / 7) * 10) / 10,
    faults30d: in30.length,
    faultsSessionEnding,
    faultsMinor,
    actualKw: Math.round(actualKw * 10) / 10,
    ratedKw,
    score,
    prediction,
    errors,
  };
}
