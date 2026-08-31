// Charger alert detection over the OCPP 1.6J message log.
//
// Seven detectors, one per alert type in ergos-charger-alert-detection-logic.md.
// Each is a pure function of the message log plus the fleet context it needs, so
// the same code would run unchanged against the backend's OCPPLogs table — the
// sandbox differs only in where the messages come from, never in how they are
// read.
//
// Two rules hold throughout:
//   - Timing comes from `at`, the server receive time. StatusNotification's own
//     `timestamp` is optional in the 1.6 schema, so it can never be relied on.
//   - Every alert carries `evidence`: the ids of the messages it fired on. An
//     alert nobody can trace back to a message is an assertion, not a detection.

import {
  HEARTBEAT_INTERVAL_S,
  HEARTBEAT_WINDOW_DAYS,
  type MeterValuesMsg,
  type OcppErrorCode,
  type OcppMessage,
  type StatusNotificationMsg,
  isBootNotification,
  isMeterValues,
  isStartTransaction,
  isStatusNotification,
  isStopTransaction,
  sampleOf,
} from "@/data/ocpp";
import type { Chargepoint, ChargingSession, Vehicle, WorkOrder } from "@/data/types";

export type DetectedAlertType =
  | "Connector lock degrading"
  | "Connector faulted"
  | "Session interrupted"
  | "Communication lost"
  | "Throughput degraded"
  | "Voltage / ground fault"
  | "Reboot loop";

export type DetectedSeverity = "Critical" | "Warning" | "Predicted";
export type DetectedStatus = "Active" | "Watching" | "Resolved";

export interface DetectedAlert {
  id: string;
  chargerId: string;
  connectorId: number | null;
  type: DetectedAlertType;
  severity: DetectedSeverity;
  status: DetectedStatus;
  /** When the condition began, not when it was noticed. */
  detectedAt: string;
  /** Plain-language summary for the DETAILS column. */
  details: string;
  /** The machine line under it — codes, counts, windows. */
  code: string;
  /** What the operator should actually do. */
  action: string;
  /** OcppMessage ids this fired on. */
  evidence: string[];
}

export interface DetectorInput {
  messages: OcppMessage[];
  chargepoints: Chargepoint[];
  sessions: ChargingSession[];
  vehicles: Vehicle[];
  workOrders: WorkOrder[];
  nowMs: number;
}

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

const iso = (ms: number) => new Date(ms).toISOString();
const ms = (at: string) => new Date(at).getTime();

/** Messages for one charger, oldest first. */
function forCharger(messages: OcppMessage[], chargerId: string): OcppMessage[] {
  return messages.filter((m) => m.chargerId === chargerId);
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Rounds to whole hours, or to a day count once it is past two days. */
function humanDuration(msSpan: number): string {
  const hours = msSpan / HOUR_MS;
  if (hours < 1) return `${Math.max(1, Math.round(msSpan / 60_000))} minutes`;
  if (hours < 48) return plural(Math.round(hours), "hour");
  return plural(Math.round(hours / 24), "day");
}

/** True when a charger already has work raised and still open. */
function hasOpenWorkOrder(workOrders: WorkOrder[], cp: Chargepoint): boolean {
  return workOrders.some(
    (w) => w.status !== "Done" && w.subject === cp.name,
  );
}

// ---------------------------------------------------------------------------
// 1. Connector lock degrading (Predicted)
//
// Frequency analysis, not ML: three or more lock failures on one connector
// inside a fortnight, and getting more frequent rather than less. The value is
// that every one of them cleared on its own, so nothing else in the system
// treats them as a problem yet.
// ---------------------------------------------------------------------------

const PATTERN_WINDOW_DAYS = 14;
const MIN_LOCK_FAILURES = 3;

export function detectConnectorLockDegrading(input: DetectorInput): DetectedAlert[] {
  const { messages, chargepoints, workOrders, nowMs } = input;
  const out: DetectedAlert[] = [];
  const from = nowMs - PATTERN_WINDOW_DAYS * DAY_MS;
  const half = nowMs - (PATTERN_WINDOW_DAYS / 2) * DAY_MS;

  for (const cp of chargepoints) {
    // Condition 3: nothing already raised for this charger.
    if (hasOpenWorkOrder(workOrders, cp)) continue;

    const byConnector = new Map<number, StatusNotificationMsg[]>();
    for (const m of forCharger(messages, cp.id)) {
      if (!isStatusNotification(m)) continue;
      if (m.errorCode !== "ConnectorLockFailure") continue;
      if (ms(m.at) < from) continue;
      const list = byConnector.get(m.connectorId) ?? [];
      list.push(m);
      byConnector.set(m.connectorId, list);
    }

    for (const [connectorId, events] of byConnector) {
      // Condition 1: enough of them.
      if (events.length < MIN_LOCK_FAILURES) continue;
      // Condition 2: accelerating.
      const recent = events.filter((e) => ms(e.at) >= half).length;
      const prior = events.length - recent;
      if (recent <= prior) continue;

      const sorted = [...events].sort((a, b) => ms(a.at) - ms(b.at));
      const spanDays = (nowMs - ms(sorted[0].at)) / DAY_MS;
      // Days to consistent failure, extrapolated from the change in rate: at
      // `recent` per week rising from `prior`, the gap between failures is
      // closing by this much each week.
      const perWeekNow = recent;
      const perWeekBefore = Math.max(prior, 0.5);
      const growth = perWeekNow / perWeekBefore;
      const daysToFailure = Math.max(2, Math.round(7 / Math.max(growth, 1.1)));

      const share = sessionShare(input, cp.id, connectorId);
      out.push({
        id: `LOCK-${cp.id}-${connectorId}`,
        chargerId: cp.id,
        connectorId,
        type: "Connector lock degrading",
        severity: "Predicted",
        status: "Watching",
        detectedAt: sorted[sorted.length - 1].at,
        details:
          `Connector ${connectorId} lock mechanism degrading. Failure likely within ` +
          `${daysToFailure} days.` +
          (share != null ? ` This connector handled ${share}% of sessions last week.` : ""),
        code:
          `${events.length} ConnectorLockFailure in ${Math.round(spanDays)}d on the same ` +
          `connector · ${prior} then ${recent} per week`,
        action: `Schedule physical inspection of connector ${connectorId} latch before it fails.`,
        evidence: sorted.map((e) => e.id),
      });
    }
  }
  return out;
}

/** Share of the charger's last-7-day sessions that used this connector. */
function sessionShare(
  input: DetectorInput,
  chargerId: string,
  connectorId: number,
): number | null {
  const from = input.nowMs - 7 * DAY_MS;
  const starts = input.messages.filter(
    (m) => m.chargerId === chargerId && isStartTransaction(m) && ms(m.at) >= from,
  );
  if (starts.length === 0) return null;
  const mine = starts.filter((m) => isStartTransaction(m) && m.connectorId === connectorId);
  return Math.round((mine.length / starts.length) * 100);
}

// ---------------------------------------------------------------------------
// 2. Connector faulted (Warning at 4 h, Critical at 24 h)
// ---------------------------------------------------------------------------

const FAULT_WARN_H = 4;
const FAULT_CRITICAL_H = 24;

/** Recommended action per error code, from the spec's table. */
const FAULT_ACTIONS: Partial<Record<OcppErrorCode, (c: number) => string>> = {
  ConnectorLockFailure: (c) => `Remote unlock connector ${c}. If unresolved, inspect latch mechanism.`,
  GroundFailure: () => "Disable charger immediately. Dispatch electrician. Safety-critical.",
  HighTemperature: () => "Allow charger to cool. If persists, check ventilation and site temp.",
  OverCurrentFailure: () => "Check cable and connector for damage. May need hardware replacement.",
  PowerSwitchFailure: () => "Contactor failure. Charger needs hardware service.",
  PowerMeterFailure: () => "Suspend charging. Billing accuracy compromised. Service internal meter.",
  OtherError: (c) => `Remote reset connector ${c}. If unresolved, dispatch maintenance.`,
  InternalError: () => "Attempt remote reboot. If unresolved, escalate to vendor support.",
  ReaderFailure: () => "RFID reader malfunction. Enable remote-start as fallback.",
  EVCommunicationError: () => "Retry with another vehicle to isolate charger from vehicle fault.",
};

const faultAction = (code: OcppErrorCode, connectorId: number): string =>
  FAULT_ACTIONS[code]?.(connectorId) ??
  `Remote reset connector ${connectorId}. If unresolved, dispatch maintenance.`;

export function detectConnectorFaulted(input: DetectorInput): DetectedAlert[] {
  const { messages, chargepoints, nowMs } = input;
  const out: DetectedAlert[] = [];

  for (const cp of chargepoints) {
    const mine = forCharger(messages, cp.id);
    const open: { msg: StatusNotificationMsg; sinceMs: number }[] = [];

    for (const conn of cp.connectors) {
      // The last Faulted with no Available/Preparing after it.
      const statuses = mine
        .filter((m): m is StatusNotificationMsg => isStatusNotification(m) && m.connectorId === conn.id)
        .sort((a, b) => ms(a.at) - ms(b.at));
      let faultedAt: StatusNotificationMsg | null = null;
      for (const s of statuses) {
        if (s.status === "Faulted") faultedAt = s;
        else if (s.status === "Available" || s.status === "Preparing") faultedAt = null;
      }
      if (!faultedAt) continue;

      // Confirm nothing charged on it since — a connector that took a session
      // after the fault is not actually down.
      const started = mine.some(
        (m) => isStartTransaction(m) && m.connectorId === conn.id && ms(m.at) > ms(faultedAt.at),
      );
      if (started) continue;
      open.push({ msg: faultedAt, sinceMs: ms(faultedAt.at) });
    }

    if (open.length === 0) continue;

    // Every connector down is one dead charger, not N separate rows.
    const wholeCharger = open.length === cp.connectors.length && cp.connectors.length > 1;
    const groups = wholeCharger ? [open] : open.map((o) => [o]);

    for (const group of groups) {
      const oldest = group.reduce((a, b) => (a.sinceMs <= b.sinceMs ? a : b));
      const heldMs = nowMs - oldest.sinceMs;
      const heldH = heldMs / HOUR_MS;
      if (heldH < FAULT_WARN_H) continue;

      const code = oldest.msg.errorCode;
      const connectorId = wholeCharger ? null : oldest.msg.connectorId;
      const vendor = oldest.msg.vendorErrorCode ? ` · Vendor: ${oldest.msg.vendorErrorCode}` : "";
      out.push({
        id: `FAULT-${cp.id}-${connectorId ?? "all"}`,
        chargerId: cp.id,
        connectorId,
        type: "Connector faulted",
        severity: heldH >= FAULT_CRITICAL_H ? "Critical" : "Warning",
        status: "Active",
        detectedAt: iso(oldest.sinceMs),
        details: wholeCharger
          ? `All ${cp.connectors.length} connectors faulted for over ${humanDuration(heldMs)}. ` +
            "No sessions possible."
          : `Connector ${connectorId} in faulted status for over ${humanDuration(heldMs)}. ` +
            "No sessions possible.",
        code: `${code}${vendor}${oldest.msg.info ? ` · ${oldest.msg.info}` : ""}`,
        action: faultAction(code, oldest.msg.connectorId),
        evidence: group.map((g) => g.msg.id),
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// 3. Session interrupted mid-charge (Critical)
//
// A stop the driver did not ask for. EVDisconnected, Local and Remote are all
// somebody deliberately ending a charge, so they are explicitly not alerts.
// ---------------------------------------------------------------------------

const NORMAL_STOPS = new Set(["Local", "Remote", "EVDisconnected"]);
/** How far before the stop to look for the fault that explains it. */
const CORRELATION_MS = 60_000;

export function detectSessionInterrupted(input: DetectorInput): DetectedAlert[] {
  const { messages, chargepoints, sessions, vehicles, nowMs } = input;
  const candidates: DetectedAlert[] = [];
  const out = candidates;
  const cpById = new Map(chargepoints.map((c) => [c.id, c]));
  const from = nowMs - 14 * DAY_MS;

  for (const stop of messages) {
    if (!isStopTransaction(stop)) continue;
    if (NORMAL_STOPS.has(stop.reason)) continue;
    if (ms(stop.at) < from) continue;
    const cp = cpById.get(stop.chargerId);
    if (!cp) continue;

    const mine = forCharger(messages, cp.id);
    const start = mine.find((m) => isStartTransaction(m) && m.transactionId === stop.transactionId);
    const kwh =
      start && isStartTransaction(start)
        ? Math.max(0, (stop.meterStop - start.meterStart) / 1000)
        : null;

    // The fault the charger reported just before giving up, if any.
    const preceding = mine
      .filter(
        (m): m is StatusNotificationMsg =>
          isStatusNotification(m) &&
          m.errorCode !== "NoError" &&
          ms(m.at) <= ms(stop.at) &&
          ms(m.at) >= ms(stop.at) - CORRELATION_MS,
      )
      .sort((a, b) => ms(b.at) - ms(a.at))[0];

    // SoC at the moment it stopped, straight from the last meter sample.
    const lastSoc = mine
      .filter((m): m is MeterValuesMsg => isMeterValues(m) && m.transactionId === stop.transactionId)
      .sort((a, b) => ms(b.at) - ms(a.at))
      .map((m) => sampleOf(m, "SoC"))
      .find((v) => Number.isFinite(v));

    const session = sessions.find(
      (s) => s.chargerId === cp.id && s.endTime !== null && Math.abs(ms(s.endTime) - ms(stop.at)) < 60_000,
    );
    const vehicle = session ? vehicles.find((v) => v.reg === session.vehicleReg) : undefined;

    const socText =
      lastSoc != null && Number.isFinite(lastSoc)
        ? ` Vehicle was at ${Math.round(lastSoc)}% SoC when interrupted.`
        : vehicle && kwh != null && vehicle.batteryKwh > 0
          ? ` Roughly ${Math.round((kwh / vehicle.batteryKwh) * 100)}% of a pack delivered before it stopped.`
          : "";

    out.push({
      id: `INTR-${cp.id}-${stop.transactionId}`,
      chargerId: cp.id,
      connectorId: start && isStartTransaction(start) ? start.connectorId : null,
      type: "Session interrupted",
      severity: "Critical",
      status: "Active",
      detectedAt: stop.at,
      details:
        `Session ended mid-charge${session ? ` on ${session.vehicleReg}` : ""}.` +
        socText +
        (kwh != null ? ` ${kwh.toFixed(1)} kWh delivered.` : ""),
      code:
        `StopReason: ${stop.reason}` +
        (preceding
          ? ` · ${preceding.errorCode}${preceding.vendorErrorCode ? ` (${preceding.vendorErrorCode})` : ""}`
          : " · no charger fault logged"),
      action: interruptAction(stop.reason, preceding),
      evidence: [stop.id, ...(preceding ? [preceding.id] : []), ...(start ? [start.id] : [])],
    });
  }

  // One row per charger and cause, not per session. A site that drops power
  // three times in a fortnight has one problem, and listing it three times
  // buries every other alert on the page — the repeat count is the useful part,
  // so it goes on the row rather than into more rows.
  const grouped = new Map<string, { newest: DetectedAlert; repeats: number }>();
  for (const a of candidates) {
    const key = `${a.chargerId}|${a.code.split(" · ")[0]}`;
    const seen = grouped.get(key);
    if (!seen) grouped.set(key, { newest: a, repeats: 0 });
    else {
      seen.repeats += 1;
      if (ms(a.detectedAt) > ms(seen.newest.detectedAt)) seen.newest = a;
    }
  }

  return [...grouped.values()].map(({ newest, repeats }) =>
    repeats === 0
      ? newest
      : {
          ...newest,
          details: `${newest.details} ${plural(repeats, "further session")} ended the same way in the last 14 days.`,
          code: `${newest.code} · ${repeats + 1} sessions in 14d`,
        },
  );
}

function interruptAction(
  reason: string,
  preceding: StatusNotificationMsg | undefined,
): string {
  // A vehicle-side protocol fault is the one case where the right answer is to
  // send nobody to the charger at all.
  const vendor = preceding?.vendorErrorCode ?? "";
  if (/VehicleProtocolError|SoftError/i.test(vendor) || preceding?.errorCode === "EVCommunicationError") {
    return "Vehicle-side issue. No charger action needed. Flag vehicle for fleet check.";
  }
  if (preceding?.errorCode === "ConnectorLockFailure") {
    return `Inspect connector ${preceding.connectorId} latch.`;
  }
  if (reason === "PowerLoss") return "Check site power supply. UPS or backup may be needed.";
  if (reason === "EmergencyStop") return "Verify e-stop button is not stuck. Check for site safety issues.";
  if (reason === "HardReset" || reason === "Reboot" || reason === "SoftReset") {
    return "Charger reset during an active session. Check firmware stability and reboot history.";
  }
  if (reason === "DeAuthorized") return "Authorization revoked mid-session. Check the RFID list and account balance.";
  return "Review the charger's error log around the stop and dispatch maintenance if it repeats.";
}

// ---------------------------------------------------------------------------
// 4. Communication lost (Warning, Critical past 24 h)
//
// Read from the absence of messages: any gap longer than twice the configured
// heartbeat interval means the charger stopped talking.
// ---------------------------------------------------------------------------

const OFFLINE_ALERT_MS = 30 * 60_000;
const OFFLINE_CRITICAL_MS = 24 * HOUR_MS;
const RECURRENCE_WINDOW_DAYS = 30;
const RECURRENCE_COUNT = 3;

export function detectCommunicationLost(input: DetectorInput): DetectedAlert[] {
  const { messages, chargepoints, nowMs } = input;
  const out: DetectedAlert[] = [];
  const gapMs = 2 * HEARTBEAT_INTERVAL_S * 1000;
  // Heartbeats only exist this far back, so an older "gap" is the edge of the
  // log rather than an outage.
  const horizon = nowMs - HEARTBEAT_WINDOW_DAYS * DAY_MS;

  for (const cp of chargepoints) {
    const times = forCharger(messages, cp.id)
      .map((m) => ({ id: m.id, t: ms(m.at) }))
      .filter((x) => x.t >= horizon)
      .sort((a, b) => a.t - b.t);
    if (times.length === 0) continue;

    const outages: { fromMs: number; toMs: number | null; before: string; after: string | null }[] = [];
    for (let i = 1; i < times.length; i += 1) {
      const span = times[i].t - times[i - 1].t;
      if (span > gapMs) {
        outages.push({
          fromMs: times[i - 1].t,
          toMs: times[i].t,
          before: times[i - 1].id,
          after: times[i].id,
        });
      }
    }
    // Still dark right now?
    const last = times[times.length - 1];
    if (nowMs - last.t > gapMs) {
      outages.push({ fromMs: last.t, toMs: null, before: last.id, after: null });
    }

    for (const o of outages) {
      const span = (o.toMs ?? nowMs) - o.fromMs;
      if (span < OFFLINE_ALERT_MS) continue;
      const recovered = o.toMs !== null;
      const priorCount = outages.filter(
        (x) => x.fromMs >= nowMs - RECURRENCE_WINDOW_DAYS * DAY_MS && x.fromMs <= o.fromMs,
      ).length;

      // A weak-signal warning just before the outage turns "it dropped" into
      // "it told us it was about to drop".
      const weak = forCharger(messages, cp.id).find(
        (m) =>
          isStatusNotification(m) &&
          m.errorCode === "WeakSignal" &&
          ms(m.at) <= o.fromMs &&
          ms(m.at) >= o.fromMs - 10 * 60_000,
      );

      out.push({
        id: `COMMS-${cp.id}-${o.fromMs}`,
        chargerId: cp.id,
        connectorId: null,
        type: "Communication lost",
        severity: !recovered && span >= OFFLINE_CRITICAL_MS ? "Critical" : "Warning",
        status: recovered ? "Resolved" : "Active",
        detectedAt: iso(o.fromMs),
        details: recovered
          ? `Communication lost for ${humanDuration(span)}. Charger went offline, now recovered.`
          : `Charger offline since ${new Date(o.fromMs).toLocaleString()}. ` +
            `No communication for ${humanDuration(span)}.`,
        code:
          `HeartbeatTimeout · no messages ${new Date(o.fromMs).toISOString().slice(11, 16)}` +
          `${o.toMs ? ` - ${new Date(o.toMs).toISOString().slice(11, 16)}` : " - now"}` +
          (weak ? " · WeakSignal before outage" : ""),
        action: commsAction(recovered, span, priorCount, Boolean(weak)),
        evidence: [o.before, ...(o.after ? [o.after] : []), ...(weak ? [weak.id] : [])],
      });
    }
  }
  return out;
}

function commsAction(
  recovered: boolean,
  span: number,
  priorCount: number,
  weak: boolean,
): string {
  if (weak) return "Signal degradation preceded outage. Consider external antenna or wired connection.";
  if (!recovered) return "Charger unreachable. Dispatch site visit to check power and network.";
  if (priorCount >= RECURRENCE_COUNT) {
    return "Recurring connectivity issue. Replace SIM card or relocate antenna.";
  }
  if (span < 4 * HOUR_MS) return "Check network connection at site. If recurring, inspect SIM/router.";
  return "Extended outage recovered on its own. Inspect the site router and SIM before it repeats.";
}

// ---------------------------------------------------------------------------
// 5. Throughput degradation (Warning)
//
// The hard part is not spotting low power, it is not blaming the charger for a
// vehicle that cannot take more. Three guards below, and the spec's own wording
// on the Power.Offered test is inverted — see the comment.
// ---------------------------------------------------------------------------

const THROUGHPUT_FLOOR = 0.75;
/** Import within this fraction of Offered means the charger is the ceiling. */
const OFFERED_TOLERANCE = 0.15;
const MIN_DISTINCT_VEHICLES = 2;

export function detectThroughputDegradation(input: DetectorInput): DetectedAlert[] {
  const { messages, chargepoints, sessions, vehicles, nowMs } = input;
  const out: DetectedAlert[] = [];
  const from = nowMs - 7 * DAY_MS;

  for (const cp of chargepoints) {
    const ratedKw = Math.max(0, ...cp.connectors.map((c) => c.powerKw));
    if (ratedKw <= 0) continue;

    const samples = forCharger(messages, cp.id).filter(
      (m): m is MeterValuesMsg => isMeterValues(m) && ms(m.at) >= from,
    );
    if (samples.length === 0) continue;

    const importW = samples.map((s) => sampleOf(s, "Power.Active.Import")).filter(Number.isFinite);
    const offeredW = samples.map((s) => sampleOf(s, "Power.Offered")).filter(Number.isFinite);
    const voltage = samples.map((s) => sampleOf(s, "Voltage")).filter(Number.isFinite);
    if (importW.length === 0) continue;

    const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    const avgImportKw = avg(importW) / 1000;
    const ratio = avgImportKw / ratedKw;
    if (ratio >= THROUGHPUT_FLOOR) continue;

    // Guard 1: one vehicle behaving oddly is a vehicle story, not a charger one.
    const recent = sessions.filter(
      (s) => s.chargerId === cp.id && ms(s.startTime) >= from && s.detectionSource !== "TELEMATICS",
    );
    const distinct = new Set(recent.map((s) => s.vehicleReg));
    if (distinct.size < MIN_DISTINCT_VEHICLES) continue;

    // Guard 2: telematics knows what these vehicles can actually take. If none
    // of them could use the charger's rating, the charger is not at fault.
    const capable = [...distinct]
      .map((reg) => vehicles.find((v) => v.reg === reg)?.maxChargeKw)
      .filter((kw): kw is number => typeof kw === "number");
    if (capable.length > 0 && Math.max(...capable) < ratedKw * THROUGHPUT_FLOOR) continue;

    // Guard 3: Power.Offered. The spec says "if Offered is close to Import, the
    // vehicle is the bottleneck" — that is backwards. Offered is what the
    // charger is willing to give: if the vehicle is taking nearly all of it,
    // the ceiling is the charger or its supply. Real headroom between the two
    // means the vehicle simply is not asking for more, and there is nothing to
    // report.
    if (offeredW.length > 0) {
      const avgOfferedKw = avg(offeredW) / 1000;
      const headroom = (avgOfferedKw - avgImportKw) / Math.max(avgOfferedKw, 0.001);
      if (headroom > OFFERED_TOLERANCE) continue;
    }

    const avgVolts = voltage.length > 0 ? avg(voltage) : null;
    const lowVolts = avgVolts != null && avgVolts < 210;
    const worstConnectors = [
      ...new Set(samples.map((s) => s.connectorId)),
    ].sort((a, b) => a - b);

    out.push({
      id: `THRU-${cp.id}`,
      chargerId: cp.id,
      connectorId: worstConnectors.length === 1 ? worstConnectors[0] : null,
      type: "Throughput degraded",
      severity: "Warning",
      status: "Active",
      // Measured across the trailing week, so it belongs to the window, not to
      // an instant.
      detectedAt: iso(from),
      details:
        `Throughput at ${Math.round(ratio * 100)}% of rated capacity over 7-day window` +
        (worstConnectors.length === 1
          ? `. Connector ${worstConnectors[0]} only.`
          : `. Connectors ${worstConnectors.join(", ")}.`) +
        (lowVolts ? ` Input voltage averaging ${Math.round(avgVolts)}V, below nominal.` : ""),
      code:
        `Avg ${avgImportKw.toFixed(1)} kW on ${ratedKw.toFixed(1)} kW rated · ` +
        `${distinct.size} vehicles · ${samples.length} meter samples`,
      action: lowVolts
        ? "Check input supply voltage at site. May need utility-side fix."
        : worstConnectors.length === 1
          ? `Issue isolated to connector ${worstConnectors[0]}. Check cable and connector.`
          : "Check cable condition and connector contacts.",
      evidence: samples.slice(0, 6).map((s) => s.id),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// 6. Voltage / ground fault (Critical, on first occurrence)
// ---------------------------------------------------------------------------

const ELECTRICAL: Partial<Record<OcppErrorCode, string>> = {
  GroundFailure: "Safety-critical. Disable charger. Dispatch licensed electrician immediately.",
  OverVoltage: "Check site electrical supply. Input voltage exceeds safe range.",
  UnderVoltage: "Check site electrical supply. Input voltage below minimum. May need utility fix.",
  OverCurrentFailure: "Possible cable damage or vehicle fault. Inspect cable and connector hardware.",
};

/** The error code as an operator would say it out loud. */
const ELECTRICAL_PHRASE: Partial<Record<OcppErrorCode, string>> = {
  GroundFailure: "Ground fault",
  OverVoltage: "Over-voltage",
  UnderVoltage: "Under-voltage",
  OverCurrentFailure: "Over-current",
};

export function detectElectricalFault(input: DetectorInput): DetectedAlert[] {
  const { messages, chargepoints, nowMs } = input;
  const out: DetectedAlert[] = [];
  const from = nowMs - 14 * DAY_MS;
  const chargerIds = new Set(chargepoints.map((c) => c.id));

  for (const m of messages) {
    if (!isStatusNotification(m)) continue;
    if (!chargerIds.has(m.chargerId)) continue;
    if (ms(m.at) < from) continue;
    const action = ELECTRICAL[m.errorCode];
    if (!action) continue;

    // Cleared since?
    const cleared = messages.some(
      (x) =>
        x.chargerId === m.chargerId &&
        isStatusNotification(x) &&
        x.connectorId === m.connectorId &&
        (x.status === "Available" || x.status === "Preparing") &&
        ms(x.at) > ms(m.at),
    );

    out.push({
      id: `ELEC-${m.chargerId}-${m.connectorId}-${ms(m.at)}`,
      chargerId: m.chargerId,
      connectorId: m.connectorId,
      type: "Voltage / ground fault",
      severity: "Critical",
      status: cleared ? "Resolved" : "Active",
      detectedAt: m.at,
      details:
        `${ELECTRICAL_PHRASE[m.errorCode] ?? m.errorCode} detected on connector ` +
        `${m.connectorId}. Charging stopped.` +
        (cleared ? " Connector has since returned to service." : ""),
      code: `${m.errorCode}${m.vendorErrorCode ? ` · Vendor: ${m.vendorErrorCode}` : ""}` +
        (m.info ? ` · ${m.info}` : ""),
      action,
      evidence: [m.id],
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// 7. Charger reboot / reset loop (Warning, Critical past 3 in 24 h)
//
// One BootNotification per power cycle is normal. Several in a day is a charger
// crash-looping — but only if we did not ask for them, so boots that follow a
// Reset command sent from ergOS are excluded.
// ---------------------------------------------------------------------------

const REBOOT_WINDOW_H = 24;
const REBOOT_MIN = 3;

export function detectRebootLoop(input: DetectorInput): DetectedAlert[] {
  const { messages, chargepoints, nowMs } = input;
  const out: DetectedAlert[] = [];
  const from = nowMs - REBOOT_WINDOW_H * HOUR_MS;

  for (const cp of chargepoints) {
    const boots = forCharger(messages, cp.id)
      .filter(isBootNotification)
      .filter((b) => ms(b.at) >= from)
      .sort((a, b) => ms(a.at) - ms(b.at));
    const unplanned = boots.filter((b) => !b.planned);
    if (unplanned.length < REBOOT_MIN) continue;

    const excluded = boots.length - unplanned.length;
    const firmware = unplanned[unplanned.length - 1].firmwareVersion;
    out.push({
      id: `BOOT-${cp.id}`,
      chargerId: cp.id,
      connectorId: null,
      type: "Reboot loop",
      severity: unplanned.length > REBOOT_MIN ? "Critical" : "Warning",
      status: "Active",
      detectedAt: unplanned[0].at,
      details:
        `Charger rebooted ${unplanned.length} times in ${REBOOT_WINDOW_H} hours. ` +
        "Possible firmware or hardware instability.",
      code:
        `${unplanned.length} BootNotification in ${REBOOT_WINDOW_H}h` +
        (excluded > 0 ? ` · ${excluded} planned reset excluded` : "") +
        (firmware ? ` · fw ${firmware}` : ""),
      action: `Charger rebooting repeatedly. Check for firmware issues. If persists, escalate to vendor (${cp.vendor}).`,
      evidence: unplanned.map((b) => b.id),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------

export const DETECTORS = [
  detectConnectorLockDegrading,
  detectConnectorFaulted,
  detectSessionInterrupted,
  detectCommunicationLost,
  detectThroughputDegradation,
  detectElectricalFault,
  detectRebootLoop,
] as const;

/**
 * Every detector, newest first.
 *
 * One cross-detector rule applies afterwards. An electrical fault that a
 * session-interrupted alert already cites as its cause would otherwise appear
 * twice — once as the fault and once as the session it killed — so the
 * standalone row is dropped. Ground faults are the exception: they are a safety
 * callout with their own action ("disable the charger, dispatch an
 * electrician"), and must never be folded into a story about a lost session.
 */
export function runDetectors(input: DetectorInput): DetectedAlert[] {
  const all = DETECTORS.flatMap((d) => d(input));
  const explained = new Set(
    all
      .filter((a) => a.type === "Session interrupted")
      .flatMap((a) => a.evidence),
  );
  return all
    .filter(
      (a) =>
        a.type !== "Voltage / ground fault" ||
        a.code.startsWith("GroundFailure") ||
        !a.evidence.some((id) => explained.has(id)),
    )
    .sort((a, b) => ms(b.detectedAt) - ms(a.detectedAt));
}
