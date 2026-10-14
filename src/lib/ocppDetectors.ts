// Charger alerts over the OCPP 1.6J message log, the same three rules production runs:
//   - Charger fault: raised as soon as a connector reports an error code, resolved as soon as it stops.
//   - Recurring fault: the same code 3 times in 7 days on one connector. Critical, closed only by hand.
//   - Communication lost: a charger silent for 30 minutes, resolved when it is heard from again.
// Every number lives in ALERT_RULES; docs/charger-error-code-mapping.md describes the same rules.

import {
  type OcppErrorCode,
  type OcppMessage,
  type StatusNotificationMsg,
  isConnectionEvent,
  isStatusNotification,
} from "@/data/ocpp";
import type { Chargepoint } from "@/data/types";

export type DetectedAlertType = "ConnectorFaulted" | "RecurringFault" | "CommunicationLost";
export type DetectedSeverity = "Critical" | "Warning";

export interface DetectedAlert {
  id: string;
  /** One open alert per key, as production's ChargerAlerts.alertKey. */
  alertKey: string;
  chargerId: string;
  connectorId: number | null;
  type: DetectedAlertType;
  severity: DetectedSeverity;
  errorCode: string | null;
  message: string;
  action: string;
  /** When the condition began. */
  startedAt: string;
  raisedAt: string;
  resolvedAt: string | null;
  /** OcppMessage ids this fired on. */
  evidence: string[];
}

export interface DetectorInput {
  messages: OcppMessage[];
  chargepoints: Chargepoint[];
  nowMs: number;
  /** Alerts someone marked resolved, kept as they were at that moment. */
  resolved?: DetectedAlert[];
}

export const ALERT_RULES = {
  communicationLost: {
    warnAfterMin: 30,
    criticalAfterHours: 24,
    fleetWithinMin: 2,
    fleetMinChargers: 3,
    fleetMinShare: 0.5,
    weakSignalBeforeMin: 10,
    recurringCount: 3,
    recurringWindowDays: 30,
  },
  recurringFault: { count: 3, windowDays: 7, lookbackDays: 30 },
} as const;

const MIN_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

const iso = (t: number) => new Date(t).toISOString();
const ms = (at: string) => new Date(at).getTime();
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function humanSpan(span: number): string {
  const hours = span / HOUR_MS;
  if (hours < 1) return plural(Math.max(1, Math.round(span / MIN_MS)), "minute");
  if (hours < 48) return plural(Math.round(hours), "hour");
  return plural(Math.round(hours / 24), "day");
}

// ---- error codes, word for word as the rows seeded into production's ChargerErrorCodes table ----

export const ERROR_CODES: Partial<Record<OcppErrorCode, { name: string; action: string }>> = {
  GroundFailure: {
    name: "Ground fault",
    action: "Switch the charger off. Send a licensed electrician. Safety-critical.",
  },
  UnderVoltage: {
    name: "Supply voltage too low",
    action: "Check the site electrical supply. Input voltage is below the minimum.",
  },
  OverVoltage: {
    name: "Supply voltage too high",
    action: "Check the site electrical supply. Input voltage is above the safe range.",
  },
  OverCurrentFailure: {
    name: "Too much current",
    action: "Check the cable and {connector} for damage. May need hardware replacement.",
  },
  ConnectorLockFailure: {
    name: "Connector lock failed",
    action: "Unlock {connector} remotely. If it does not clear, inspect the latch.",
  },
  HighTemperature: {
    name: "Charger too hot",
    action: "Let the charger cool. If it keeps happening, check ventilation and site temperature.",
  },
  PowerSwitchFailure: {
    name: "Power switch failed",
    action: "Internal switch failure. The charger needs hardware service.",
  },
  PowerMeterFailure: {
    name: "Energy meter failed",
    action: "Stop using {connector}. Billing readings are wrong. Service the meter.",
  },
  InternalError: {
    name: "Internal charger error",
    action: "Restart the charger remotely. If that fails, contact the vendor.",
  },
  OtherError: {
    name: "Other fault",
    action: "Reset {connector} remotely. If that fails, send maintenance.",
  },
  ReaderFailure: {
    name: "Card reader failed",
    action: "Card reader broken. Start sessions from the app meanwhile.",
  },
  LocalListConflict: {
    name: "Authorisation list mismatch",
    action: "Resend the authorisation list to the charger.",
  },
  ResetFailure: { name: "Restart failed", action: "Power-cycle the charger on site." },
  EVCommunicationError: {
    name: "Vehicle communication error",
    action: "Try a different vehicle to find out whether it is the charger or the vehicle.",
  },
  WeakSignal: {
    name: "Weak mobile signal",
    action: "If the charger keeps going offline, check the antenna or move to a wired connection.",
  },
};

const codeName = (code: OcppErrorCode) => ERROR_CODES[code]?.name ?? code;

function faultAction(code: OcppErrorCode, connectorId: number | null): string {
  const target = connectorId === null ? "all connectors" : `connector ${connectorId}`;
  return ERROR_CODES[code]?.action.replace(/\{connector\}/g, target) ?? "Physical inspection needed";
}

const subjectOf = (connectorId: number, chargerName: string) =>
  connectorId === 0 ? `Charger ${chargerName}` : `Connector ${connectorId} on charger ${chargerName}`;

// ---- manual resolutions ----------------------------------------------------

/** Latest time someone marked this key resolved, or 0. */
function lastResolvedMs(resolved: DetectedAlert[] | undefined, alertKey: string): number {
  return (resolved ?? [])
    .filter((r) => r.alertKey === alertKey && r.resolvedAt)
    .reduce((max, r) => Math.max(max, ms(r.resolvedAt!)), 0);
}

/** An open alert marked resolved while the problem continues is raised again, as a new alert. */
function reraiseAfterResolve(alert: DetectedAlert, resolved: DetectedAlert[] | undefined): DetectedAlert {
  const last = lastResolvedMs(resolved, alert.alertKey);
  if (last < ms(alert.raisedAt) || (alert.resolvedAt && last >= ms(alert.resolvedAt))) return alert;
  return {
    ...alert,
    id: alert.resolvedAt ? `${alert.id}@${iso(last)}` : `${alert.alertKey}@${iso(last)}`,
    raisedAt: iso(last),
  };
}

// ---- fault runs ------------------------------------------------------------

export interface FaultRun {
  chargerId: string;
  connectorId: number;
  errorCode: OcppErrorCode;
  first: StatusNotificationMsg;
  latest: StatusNotificationMsg;
  /** The message that ended it; null while still open. */
  cleared: StatusNotificationMsg | null;
}

const isFault = (m: StatusNotificationMsg) => m.errorCode !== "NoError" || m.status === "Faulted";

/**
 * Every stretch of one error code on one connector. Repeats of the same code are one run, even when
 * the connector moves between Faulted and another status; a different code, or NoError, ends it.
 */
export function faultRuns(messages: OcppMessage[], chargerId: string): FaultRun[] {
  const runs: FaultRun[] = [];
  const open = new Map<number, FaultRun>();
  const statuses = messages
    .filter((m): m is StatusNotificationMsg => m.chargerId === chargerId && isStatusNotification(m))
    .sort((a, b) => ms(a.at) - ms(b.at));

  for (const m of statuses) {
    const run = open.get(m.connectorId);
    if (run && isFault(m) && m.errorCode === run.errorCode) {
      run.latest = m;
      continue;
    }
    if (run) {
      run.cleared = m;
      open.delete(m.connectorId);
    }
    if (isFault(m)) {
      const next: FaultRun = {
        chargerId,
        connectorId: m.connectorId,
        errorCode: m.errorCode,
        first: m,
        latest: m,
        cleared: null,
      };
      runs.push(next);
      open.set(m.connectorId, next);
    }
  }
  return runs;
}

// ---- 1. Charger fault ------------------------------------------------------

export function detectChargerFault(input: DetectorInput): DetectedAlert[] {
  const { messages, chargepoints, resolved } = input;
  const out: DetectedAlert[] = [];

  for (const cp of chargepoints) {
    const runs = faultRuns(messages, cp.id);
    const seen = new Map<string, number>();

    for (const run of [...runs].reverse()) {
      const { connectorId, errorCode, latest } = run;
      const alertKey = `ConnectorFaulted:${cp.id}:${connectorId}:${errorCode}`;
      const known = errorCode !== "NoError";
      const subject = subjectOf(connectorId, cp.name);
      const back = seen.get(alertKey) ?? 0;
      seen.set(alertKey, back + 1);

      out.push(
        reraiseAfterResolve(
          {
            id: run.cleared ? `${alertKey}~${back}` : alertKey,
            alertKey,
            chargerId: cp.id,
            connectorId,
            type: "ConnectorFaulted",
            severity: "Warning",
            errorCode: known ? errorCode : null,
            message: known
              ? `${subject} is reporting "${codeName(errorCode)}"${
                  latest.status !== "Faulted" ? ` while still ${latest.status.toLowerCase()}` : ""
                }.`
              : `${subject} is faulted, with no error code from the charger.`,
            action: known ? faultAction(errorCode, connectorId) : "Physical inspection needed",
            startedAt: run.first.at,
            raisedAt: run.first.at,
            resolvedAt: run.cleared?.at ?? null,
            evidence: [run.first.id, ...(run.latest.id !== run.first.id ? [run.latest.id] : [])],
          },
          resolved,
        ),
      );
    }
  }
  return out;
}

// ---- 2. Recurring fault ----------------------------------------------------

export function detectRecurringFault(input: DetectorInput): DetectedAlert[] {
  const { messages, chargepoints, nowMs, resolved } = input;
  const R = ALERT_RULES.recurringFault;
  const out: DetectedAlert[] = [];

  for (const cp of chargepoints) {
    const groups = new Map<string, FaultRun[]>();
    for (const run of faultRuns(messages, cp.id)) {
      if (run.errorCode === "NoError" || ms(run.first.at) < nowMs - R.lookbackDays * DAY_MS) continue;
      const key = `${run.connectorId}:${run.errorCode}`;
      groups.set(key, [...(groups.get(key) ?? []), run]);
    }

    for (const [key, runs] of groups) {
      const alertKey = `RecurringFault:${cp.id}:${key}`;
      // Marking it resolved starts the count again: only what happened since counts
      const floor = lastResolvedMs(resolved, alertKey);
      const after = runs.filter((r) => ms(r.first.at) > floor);

      // The first moment the count reached the threshold inside the window raises it
      const hit = after.findIndex((r, i) => {
        const from = ms(r.first.at) - R.windowDays * DAY_MS;
        return after.slice(0, i + 1).filter((x) => ms(x.first.at) > from).length >= R.count;
      });
      if (hit < 0) continue;

      const raisedMs = ms(after[hit].first.at);
      const events = after
        .slice(0, hit + 1)
        .filter((x) => ms(x.first.at) > raisedMs - R.windowDays * DAY_MS);
      const { connectorId, errorCode } = runs[0];

      out.push({
        id: floor ? `${alertKey}@${iso(floor)}` : alertKey,
        alertKey,
        chargerId: cp.id,
        connectorId,
        type: "RecurringFault",
        severity: "Critical",
        errorCode,
        message: `Connector ${connectorId} on charger ${cp.name} reported "${codeName(errorCode)}" ${plural(
          events.length,
          "time",
        )} in the last ${R.windowDays} days.`,
        action: `Keeps coming back — check it before it fails for good. ${faultAction(errorCode, connectorId)}`,
        startedAt: events[0].first.at,
        raisedAt: iso(raisedMs),
        // Never closed by the check; only a person closes it
        resolvedAt: null,
        evidence: events.map((e) => e.first.id),
      });
    }
  }
  return out;
}

// ---- 3. Communication lost -------------------------------------------------

interface Outage {
  chargerId: string;
  fromMs: number;
  /** null while still offline. */
  toMs: number | null;
  evidence: string[];
}

/** Disconnected → reconnected stretches, from the connection log. */
function outagesFor(messages: OcppMessage[], chargerId: string): Outage[] {
  const out: Outage[] = [];
  let open: Outage | null = null;
  const events = messages
    .filter((m) => m.chargerId === chargerId && isConnectionEvent(m))
    .sort((a, b) => ms(a.at) - ms(b.at));
  for (const m of events) {
    if (!isConnectionEvent(m)) continue;
    if (m.event === "DISCONNECTION") {
      open ??= { chargerId, fromMs: ms(m.at), toMs: null, evidence: [m.id] };
    } else if (open) {
      out.push({ ...open, toMs: ms(m.at), evidence: [...open.evidence, m.id] });
      open = null;
    }
  }
  if (open) out.push(open);
  return out;
}

export function detectCommunicationLost(input: DetectorInput): DetectedAlert[] {
  const { messages, chargepoints, nowMs, resolved } = input;
  const R = ALERT_RULES.communicationLost;
  const out: DetectedAlert[] = [];

  const long = chargepoints.flatMap((cp) =>
    outagesFor(messages, cp.id).filter((o) => (o.toMs ?? nowMs) - o.fromMs >= R.warnAfterMin * MIN_MS),
  );

  for (const cp of chargepoints) {
    const mine = long.filter((o) => o.chargerId === cp.id);
    mine.forEach((o, i) => {
      const span = (o.toMs ?? nowMs) - o.fromMs;
      const alertKey = `CommunicationLost:${cp.id}`;

      // Other chargers that went silent within a couple of minutes of this one
      const together = long.filter(
        (x) => x.chargerId !== cp.id && Math.abs(x.fromMs - o.fromMs) <= R.fleetWithinMin * MIN_MS,
      ).length;
      const fleetWide =
        together + 1 >= R.fleetMinChargers &&
        (together + 1) / Math.max(chargepoints.length, 1) >= R.fleetMinShare;

      const weak = messages.some(
        (m) =>
          m.chargerId === cp.id &&
          isStatusNotification(m) &&
          m.errorCode === "WeakSignal" &&
          ms(m.at) <= o.fromMs &&
          ms(m.at) >= o.fromMs - R.weakSignalBeforeMin * MIN_MS,
      );
      const outages = mine
        .slice(0, i + 1)
        .filter((x) => x.fromMs >= o.fromMs - R.recurringWindowDays * DAY_MS).length;
      const recurring = outages >= R.recurringCount;

      let action = "Charger unreachable. Send someone to check its power and network.";
      if (fleetWide) {
        action =
          "Several chargers went offline together. Check the ergOS server and the site network before visiting chargers.";
      } else if (weak) {
        action = "Weak mobile signal before it went offline. Consider an external antenna or a wired connection.";
      } else if (recurring) {
        action = "Keeps going offline. Check the SIM card, router or antenna, and the power supply to the charger.";
      }

      out.push(
        reraiseAfterResolve(
          {
            id: o.toMs === null ? alertKey : `${alertKey}~${mine.length - 1 - i}`,
            alertKey,
            chargerId: cp.id,
            connectorId: null,
            type: "CommunicationLost",
            severity: span >= R.criticalAfterHours * HOUR_MS ? "Critical" : "Warning",
            errorCode: null,
            message:
              `Charger ${cp.name} has been offline for ${humanSpan(span)}.` +
              (fleetWide ? ` ${plural(together, "other charger")} went offline at the same time.` : "") +
              (weak ? " It reported a weak mobile signal just before." : "") +
              (recurring ? ` This is outage ${outages} in the last ${R.recurringWindowDays} days.` : ""),
            action,
            startedAt: iso(o.fromMs),
            raisedAt: iso(o.fromMs + R.warnAfterMin * MIN_MS),
            resolvedAt: o.toMs === null ? null : iso(o.toMs),
            evidence: o.evidence,
          },
          resolved,
        ),
      );
    });
  }
  return out;
}

// ---------------------------------------------------------------------------

export const DETECTORS = [detectChargerFault, detectRecurringFault, detectCommunicationLost] as const;

/** Every alert, open and closed, plus the ones closed by hand. Newest first. */
export function runDetectors(input: DetectorInput): DetectedAlert[] {
  return [...DETECTORS.flatMap((d) => d(input)), ...(input.resolved ?? [])].sort(
    (a, b) => ms(b.raisedAt) - ms(a.raisedAt),
  );
}
