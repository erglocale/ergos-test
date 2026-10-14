// The OCPP 1.6J message log behind the charger alerts.
//
// The sandbox has no real chargers, so the message stream each one would have
// sent is generated here — deterministically, so a charger tells the same story
// on every render and reload. What is deliberately NOT generated is the
// diagnosis: lib/ocppDetectors.ts reads this log the way a production detector
// would read the backend's OCPPLogs table, so every charger alert is derived
// from messages rather than asserted.
//
// Field names, enums and optionality follow the OCPP 1.6 JSON schemas. Two
// details from the spec shape everything below:
//
//   - StatusNotification requires only connectorId, errorCode and status. Its
//     `timestamp` is OPTIONAL, so a charger may send a fault with no time on
//     it. Every duration rule therefore keys off `at`, the server receive time
//     — the equivalent of the backend's OCPPLogs.time — and never off the
//     charger's own clock.
//   - StopTransaction carries meterStop but not meterStart, so energy per
//     session only exists by joining back to the StartTransaction.
//
// The log is derived, never persisted: it is inbound telemetry, not something
// the demo user edits, and a month of heartbeats would not fit in localStorage.

import type { ChargerWarning, Chargepoint, ChargingSession } from "./types";

// ---- protocol enums (OCPP 1.6, verbatim) -----------------------------------

/** ChargePointErrorCode — 15 faults plus NoError. */
export type OcppErrorCode =
  | "ConnectorLockFailure"
  | "EVCommunicationError"
  | "GroundFailure"
  | "HighTemperature"
  | "InternalError"
  | "LocalListConflict"
  | "NoError"
  | "OtherError"
  | "OverCurrentFailure"
  | "OverVoltage"
  | "PowerMeterFailure"
  | "PowerSwitchFailure"
  | "ReaderFailure"
  | "ResetFailure"
  | "UnderVoltage"
  | "WeakSignal";

/** ChargePointStatus. */
export type OcppStatus =
  | "Available"
  | "Preparing"
  | "Charging"
  | "SuspendedEVSE"
  | "SuspendedEV"
  | "Finishing"
  | "Reserved"
  | "Unavailable"
  | "Faulted";

/** Reason on StopTransaction. */
export type OcppStopReason =
  | "DeAuthorized"
  | "EmergencyStop"
  | "EVDisconnected"
  | "HardReset"
  | "Local"
  | "Other"
  | "PowerLoss"
  | "Reboot"
  | "Remote"
  | "SoftReset"
  | "UnlockCommand";

export type OcppMeasurand =
  | "Energy.Active.Import.Register"
  | "Power.Active.Import"
  | "Power.Offered"
  | "Current.Import"
  | "Voltage"
  | "SoC";

export type OcppContext =
  | "Interruption.Begin"
  | "Interruption.End"
  | "Sample.Clock"
  | "Sample.Periodic"
  | "Transaction.Begin"
  | "Transaction.End"
  | "Trigger"
  | "Other";

/** Only `value` is required by the schema; everything else is optional. */
export interface OcppSampledValue {
  value: string;
  measurand?: OcppMeasurand;
  unit?: string;
  context?: OcppContext;
}

// ---- message shapes --------------------------------------------------------

interface Base {
  id: string;
  chargerId: string;
  /** Server receive time (OCPPLogs.time). Always present, unlike the
   *  charger-supplied timestamps inside the payloads. */
  at: string;
}

export interface StatusNotificationMsg extends Base {
  action: "StatusNotification";
  connectorId: number;
  status: OcppStatus;
  errorCode: OcppErrorCode;
  /** CiString50. Free text, manufacturer's wording. */
  info?: string;
  /** CiString255. */
  vendorId?: string;
  /** CiString50. The field a rules table cannot cover without a per-OEM map. */
  vendorErrorCode?: string;
  /** Optional in the schema — absent on chargers that do not set a clock. */
  timestamp?: string;
}

export interface HeartbeatMsg extends Base {
  action: "Heartbeat";
}

export interface BootNotificationMsg extends Base {
  action: "BootNotification";
  chargePointVendor: string;
  chargePointModel: string;
  firmwareVersion?: string;
}

/**
 * A Reset command ergOS sent to the charger — an outgoing CALL, stored in
 * production's OCPPLogs with sender = 'csms'. A reboot that follows one of
 * these was asked for, so it must not count towards a reboot loop.
 */
export interface ResetCommandMsg extends Base {
  action: "Reset";
  sender: "csms";
  type: "Hard" | "Soft";
}

/**
 * A websocket connect or disconnect, as production records it in the
 * ChargerConnectionLogs table. Not an OCPP message, but it is the signal
 * production uses for "is this charger online": the server pings every charger
 * every 6 minutes and logs a DISCONNECTION when a ping goes unanswered or the
 * socket closes.
 */
export interface ConnectionEventMsg extends Base {
  action: "ConnectionEvent";
  event: "CONNECTION" | "DISCONNECTION";
  /** Close reason, e.g. "Ping timeout". */
  reason?: string;
}

export interface StartTransactionMsg extends Base {
  action: "StartTransaction";
  connectorId: number;
  idTag: string;
  /** Wh. */
  meterStart: number;
  transactionId: number;
}

export interface StopTransactionMsg extends Base {
  action: "StopTransaction";
  transactionId: number;
  /** Wh. */
  meterStop: number;
  /** Optional in OCPP 1.6 — and when it is missing the spec says to read it
   *  as "Local", i.e. an ordinary stop. */
  reason?: OcppStopReason;
}

export interface MeterValuesMsg extends Base {
  action: "MeterValues";
  connectorId: number;
  transactionId: number;
  sampledValue: OcppSampledValue[];
}

export type OcppMessage =
  | StatusNotificationMsg
  | HeartbeatMsg
  | BootNotificationMsg
  | StartTransactionMsg
  | StopTransactionMsg
  | MeterValuesMsg
  | ResetCommandMsg
  | ConnectionEventMsg;

// ---- configuration ---------------------------------------------------------

/**
 * Heartbeat spacing in the generated log. Production tells chargers to
 * heartbeat every 30 s (BootNotification interval), but a fortnight of that is
 * over half a million messages. No alert reads heartbeats any more — being
 * offline comes from ConnectionEvent, as it does in production — so they are
 * generated sparsely, only so the replay stream looks alive.
 */
export const HEARTBEAT_INTERVAL_S = 300;

/** How far back heartbeats are generated. */
const HEARTBEAT_GEN_DAYS = 14;

/**
 * MeterValues are emitted every 15 minutes of session time rather than at the
 * configured MeterValueSampleInterval of 60 s. The detectors average the
 * samples, so the cadence does not change any result — it only keeps a week of
 * sessions from generating a hundred thousand rows.
 */
const METER_SAMPLE_MIN = 15;

const LOG_WINDOW_DAYS = 30;
const DAY_MS = 86_400_000;
const MIN_MS = 60_000;

/**
 * An ergOS server restart, e.g. a deploy: every charger's socket drops in the
 * same minute and reconnects a few minutes later. It must not read as a fleet of
 * offline chargers.
 */
const SERVER_RESTART = { agoDays: 2.2, downMin: 4 };

// ---- determinism -----------------------------------------------------------

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

// ---- scripted fault patterns ----------------------------------------------
// The fixtures already describe two situations in charger terms (an offline
// window, a faulted connector); those are turned back into the messages that
// would have produced them, so the log never contradicts the rest of the app.
// The patterns below are the ones the fixtures have no vocabulary for, keyed by
// charger name so each detector has something real to find.

interface ChargerScript {
  /** Accelerating lock failures on one connector — the predictive pattern. */
  lockDegrading?: { connectorId: number; agesDays: number[] };
  /** Crash loop. `plannedIndex` is the boot ergOS itself asked for. */
  rebootLoop?: { count: number; plannedIndex: number; withinHours: number };
  /** Safety-critical electrical fault, alerting on first occurrence. */
  electrical?: { connectorId: number; agoHours: number; errorCode: OcppErrorCode };
  /** Supply dips: one of these is noise, several in a day is a site problem. */
  voltageDips?: { connectorId: number; agesHours: number[]; errorCode: OcppErrorCode };
  /** An error code reported while the connector keeps working (not Faulted). */
  warningWhileWorking?: {
    connectorId: number;
    agesHours: number[];
    status: OcppStatus;
    errorCode: OcppErrorCode;
  };
  /**
   * What the meter reports during sessions. `offeredKw` close to `importKw`
   * means the charger is the ceiling; `offeredKw` well above it means the
   * vehicle is, which must NOT raise an alert.
   */
  meter?: { offeredKw: number; importKw: number; voltage: number };
  /** One-off faults so every error code shows up; clearAfterMin null means still reported. */
  faults?: {
    connectorId: number;
    errorCode: OcppErrorCode;
    agoHours: number;
    clearAfterMin: number | null;
    status?: OcppStatus;
    info?: string;
  }[];
}

const SCRIPTS: Record<string, ChargerScript> = {
  "CP-3, Bentonville": {
    lockDegrading: { connectorId: 2, agesDays: [12.4, 9.1, 5.2, 2.3, 1.1] },
    voltageDips: { connectorId: 1, agesHours: [21, 14, 9, 3], errorCode: "UnderVoltage" },
    // Running hot during charges, never bad enough to fault.
    warningWhileWorking: {
      connectorId: 3,
      agesHours: [60, 34, 11],
      status: "Charging",
      errorCode: "HighTemperature",
    },
  },
  "CP-2, Bentonville": {
    rebootLoop: { count: 5, plannedIndex: 2, withinHours: 18 },
    faults: [
      { connectorId: 1, errorCode: "InternalError", agoHours: 30, clearAfterMin: 15, info: "Firmware watchdog" },
      { connectorId: 1, errorCode: "ResetFailure", agoHours: 52, clearAfterMin: 40 },
    ],
  },
  "CP-2, Fort Worth": {
    electrical: { connectorId: 1, agoHours: 8, errorCode: "GroundFailure" },
    faults: [
      { connectorId: 1, errorCode: "OverCurrentFailure", agoHours: 70, clearAfterMin: 10, info: "Output 38 A" },
      { connectorId: 1, errorCode: "NoError", agoHours: 100, clearAfterMin: 20 },
    ],
  },
  // Offering 2.2 kW on a 3.3 kW unit, and the vehicles take all of it: the
  // ceiling is upstream of the car, so this is the charger's problem.
  "CP-1, Bentonville": {
    meter: { offeredKw: 2.2, importKw: 2.15, voltage: 198 },
    faults: [
      { connectorId: 1, errorCode: "ReaderFailure", agoHours: 2, clearAfterMin: null, status: "Available" },
      { connectorId: 2, errorCode: "LocalListConflict", agoHours: 40, clearAfterMin: 30, status: "Available" },
    ],
  },
  // Offering the full 7.4 kW; the vans simply cannot take more than 3.3 kW.
  // A worse ratio than the one above, and the detector must stay quiet about it.
  "CP-1, Fort Worth": {
    meter: { offeredKw: 7.4, importKw: 3.3, voltage: 236 },
    faults: [
      { connectorId: 1, errorCode: "OverVoltage", agoHours: 20, clearAfterMin: 5, info: "Input 262 V" },
      { connectorId: 1, errorCode: "PowerMeterFailure", agoHours: 4, clearAfterMin: null },
    ],
  },
};

/** Sessions rewritten to end abnormally, by charger and recency rank. */
const INTERRUPTS: {
  charger: string;
  nth: number;
  reason: OcppStopReason;
  errorCode?: OcppErrorCode;
  vendorErrorCode?: string;
  info?: string;
}[] = [
  { charger: "CP-2, Fort Worth", nth: 0, reason: "PowerLoss", errorCode: "UnderVoltage", info: "Supply lost mid-transaction" },
  { charger: "CP-3, Bentonville", nth: 1, reason: "EmergencyStop", errorCode: "OtherError", info: "E-stop asserted" },
  // Vehicle-side: the charger is fine and no technician should be dispatched.
  { charger: "CP-1, Bentonville", nth: 0, reason: "Other", errorCode: "EVCommunicationError", vendorErrorCode: "VehicleProtocolError", info: "ISO15118 session terminated" },
];

// ---- generator -------------------------------------------------------------

interface OfflineWindow {
  fromMs: number;
  /** null while the charger is still dark. */
  toMs: number | null;
}

/** Offline windows for one charger, from the warnings feed and its status. */
function offlineWindows(
  cp: Chargepoint,
  warnings: ChargerWarning[],
  nowMs: number,
): OfflineWindow[] {
  const out: OfflineWindow[] = [];
  for (const w of warnings) {
    if (w.charger.id !== cp.id) continue;
    if (w.warningObject.type !== "ChargerOffline") continue;
    const fromMs = new Date(w.warningObject.createdAt).getTime();
    if (!Number.isFinite(fromMs)) continue;
    const hours = w.warningObject.offlineForHours ?? 1;
    out.push({
      fromMs,
      toMs: w.warningObject.status === "Fixed" ? fromMs + hours * 3_600_000 : null,
    });
  }
  // A charger the fleet currently shows as offline went dark at some point even
  // if no warning row says so.
  if (cp.status === "Offline" && !out.some((w) => w.toMs === null)) {
    out.push({ fromMs: nowMs - 3 * 3_600_000, toMs: null });
  }
  return out.sort((a, b) => a.fromMs - b.fromMs);
}

const inWindow = (ms: number, windows: OfflineWindow[]): boolean =>
  windows.some((w) => ms >= w.fromMs && (w.toMs === null || ms <= w.toMs));

/**
 * Every OCPP message the demo fleet would have sent over the last 30 days
 * (heartbeats over the last 7). Pure and deterministic for a given nowMs.
 */
export function buildOcppLog(
  chargepoints: Chargepoint[],
  sessions: ChargingSession[],
  warnings: ChargerWarning[],
  nowMs: number = Date.now(),
): OcppMessage[] {
  const out: OcppMessage[] = [];
  const windowStart = nowMs - LOG_WINDOW_DAYS * DAY_MS;

  for (const cp of chargepoints) {
    const rand = rng(hash(cp.id));
    const script = SCRIPTS[cp.name] ?? {};
    const offline = offlineWindows(cp, warnings, nowMs);
    let n = 0;
    const id = () => `${cp.id}-${(n += 1)}`;
    const push = (m: OcppMessage) => {
      if (new Date(m.at).getTime() >= windowStart) out.push(m);
    };
    const boot = (atMs: number) =>
      push({
        id: id(),
        chargerId: cp.id,
        at: new Date(atMs).toISOString(),
        action: "BootNotification",
        chargePointVendor: cp.vendor,
        chargePointModel: cp.model,
        firmwareVersion: `1.${4 + (hash(cp.id) % 3)}.${hash(cp.name) % 10}`,
      });
    const connection = (atMs: number, event: "CONNECTION" | "DISCONNECTION", reason?: string) =>
      push({
        id: id(),
        chargerId: cp.id,
        at: new Date(atMs).toISOString(),
        action: "ConnectionEvent",
        event,
        ...(reason ? { reason } : {}),
      });

    // ---- connect + boot at the start of the window -------------------------
    const firstUp = windowStart + rand() * 3_600_000;
    connection(firstUp, "CONNECTION");
    boot(firstUp + 5_000);

    // ---- offline windows: the socket drops, and comes back with a boot -----
    for (const w of offline) {
      connection(w.fromMs, "DISCONNECTION", "Ping timeout");
      if (w.toMs !== null) {
        connection(w.toMs, "CONNECTION");
        boot(w.toMs + 5_000);
      }
    }

    // ---- ergOS server restart: every charger drops and reconnects together -
    // No boot — the chargers never lost power, only the connection to us.
    const restartMs = nowMs - SERVER_RESTART.agoDays * DAY_MS + (hash(cp.id) % 40) * 1000;
    if (!inWindow(restartMs, offline)) {
      connection(restartMs, "DISCONNECTION", "Server closed connection");
      connection(restartMs + SERVER_RESTART.downMin * MIN_MS, "CONNECTION");
    }

    // ---- reboot loop -------------------------------------------------------
    // Each crash is a short drop and a fresh boot. One of them ergOS asked
    // for, so a Reset command goes out a minute before it.
    if (script.rebootLoop) {
      const { count, plannedIndex, withinHours } = script.rebootLoop;
      const spacing = (withinHours * 3_600_000) / count;
      for (let i = 0; i < count; i += 1) {
        const bootMs = nowMs - withinHours * 3_600_000 + i * spacing;
        if (i === plannedIndex) {
          push({
            id: id(),
            chargerId: cp.id,
            at: new Date(bootMs - 2 * MIN_MS).toISOString(),
            action: "Reset",
            sender: "csms",
            type: "Soft",
          });
        }
        connection(bootMs - MIN_MS, "DISCONNECTION", "Connection closed by charger");
        connection(bootMs, "CONNECTION");
        boot(bootMs + 5_000);
      }
    }

    // ---- heartbeats --------------------------------------------------------
    // Suppressed inside an offline window: the absence IS the signal, which is
    // exactly what the detector reads.
    const hbFrom = nowMs - HEARTBEAT_GEN_DAYS * DAY_MS;
    for (let t = hbFrom; t <= nowMs; t += HEARTBEAT_INTERVAL_S * 1000) {
      if (inWindow(t, offline)) continue;
      push({
        id: id(),
        chargerId: cp.id,
        at: new Date(t).toISOString(),
        action: "Heartbeat",
      });
    }
    // A charger about to lose its link usually says so first.
    for (const w of offline) {
      if (w.fromMs - 4 * MIN_MS < hbFrom) continue;
      push({
        id: id(),
        chargerId: cp.id,
        at: new Date(w.fromMs - 4 * MIN_MS).toISOString(),
        action: "StatusNotification",
        connectorId: 0,
        status: "Available",
        errorCode: "WeakSignal",
        info: "RSSI -104 dBm",
        vendorId: cp.vendor,
      });
      // Back online, the charger reports a clean status again
      if (w.toMs !== null) {
        push({
          id: id(),
          chargerId: cp.id,
          at: new Date(w.toMs + 10_000).toISOString(),
          action: "StatusNotification",
          connectorId: 0,
          status: "Available",
          errorCode: "NoError",
        });
      }
    }

    // ---- connector state ---------------------------------------------------
    for (const conn of cp.connectors) {
      push({
        id: id(),
        chargerId: cp.id,
        at: new Date(windowStart + 2 * MIN_MS).toISOString(),
        action: "StatusNotification",
        connectorId: conn.id,
        status: "Available",
        errorCode: "NoError",
      });
    }

    // Faulted connectors from the warnings feed, with their recovery.
    const faultedFromFeed = new Set<number>();
    for (const w of warnings) {
      if (w.charger.id !== cp.id) continue;
      if (w.warningObject.type !== "ConnectorFaulted") continue;
      const connectorId = w.connector?.connectorId ?? 1;
      const atMs = new Date(w.warningObject.createdAt).getTime();
      if (!Number.isFinite(atMs)) continue;
      faultedFromFeed.add(connectorId);
      push({
        id: id(),
        chargerId: cp.id,
        at: new Date(atMs).toISOString(),
        action: "StatusNotification",
        connectorId,
        status: "Faulted",
        errorCode: "ConnectorLockFailure",
        vendorId: cp.vendor,
        vendorErrorCode: `E-${40 + (hash(cp.id + connectorId) % 9)}`,
        timestamp: new Date(atMs).toISOString(),
      });
      if (w.warningObject.status === "Fixed") {
        push({
          id: id(),
          chargerId: cp.id,
          at: new Date(atMs + 2 * 3_600_000).toISOString(),
          action: "StatusNotification",
          connectorId,
          status: "Available",
          errorCode: "NoError",
        });
      }
    }

    // Connectors the fleet currently shows as faulted, with no recovery after.
    // Aged so the demo carries one past the 24 h critical line and one inside
    // the 4 h warning band.
    const stillFaulted = cp.connectors.filter((c) => c.status === "Faulted");
    stillFaulted.forEach((conn, i) => {
      if (faultedFromFeed.has(conn.id)) return;
      const agoH = stillFaulted.length > 1 ? 60 + i * 3 : 6;
      const errorCode: OcppErrorCode =
        stillFaulted.length > 1 ? "PowerSwitchFailure" : "ConnectorLockFailure";
      push({
        id: id(),
        chargerId: cp.id,
        at: new Date(nowMs - agoH * 3_600_000).toISOString(),
        action: "StatusNotification",
        connectorId: conn.id,
        status: "Faulted",
        errorCode,
        vendorId: cp.vendor,
        vendorErrorCode:
          errorCode === "PowerSwitchFailure" ? "CONTACTOR_WELD" : `E-${40 + (hash(cp.id) % 9)}`,
        info:
          errorCode === "PowerSwitchFailure" ? "Contactor did not open" : "Latch motor stalled",
      });
    });

    // ---- accelerating lock failures ---------------------------------------
    if (script.lockDegrading) {
      const { connectorId, agesDays } = script.lockDegrading;
      for (const age of agesDays) {
        const atMs = nowMs - age * DAY_MS;
        push({
          id: id(),
          chargerId: cp.id,
          at: new Date(atMs).toISOString(),
          action: "StatusNotification",
          connectorId,
          status: "Faulted",
          errorCode: "ConnectorLockFailure",
          vendorId: cp.vendor,
          vendorErrorCode: "LOCK_TIMEOUT",
          info: "Latch feedback not seen within 3 s",
          timestamp: new Date(atMs).toISOString(),
        });
        // Each one clears on its own — which is why nobody has looked at it yet.
        push({
          id: id(),
          chargerId: cp.id,
          at: new Date(atMs + 9 * MIN_MS).toISOString(),
          action: "StatusNotification",
          connectorId,
          status: "Available",
          errorCode: "NoError",
        });
      }
    }

    // ---- safety-critical electrical fault ----------------------------------
    if (script.electrical) {
      const { connectorId, agoHours, errorCode } = script.electrical;
      const atMs = nowMs - agoHours * 3_600_000;
      push({
        id: id(),
        chargerId: cp.id,
        at: new Date(atMs).toISOString(),
        action: "StatusNotification",
        connectorId,
        status: "Faulted",
        errorCode,
        vendorId: cp.vendor,
        vendorErrorCode: "RCD_TRIP",
        info: "Residual current 31 mA",
        timestamp: new Date(atMs).toISOString(),
      });
    }

    // ---- supply dips, each clearing a couple of minutes later --------------
    if (script.voltageDips) {
      const { connectorId, agesHours, errorCode } = script.voltageDips;
      for (const h of agesHours) {
        const atMs = nowMs - h * 3_600_000;
        push({
          id: id(),
          chargerId: cp.id,
          at: new Date(atMs).toISOString(),
          action: "StatusNotification",
          connectorId,
          status: "Faulted",
          errorCode,
          vendorId: cp.vendor,
          info: "Input 176 V",
        });
        push({
          id: id(),
          chargerId: cp.id,
          at: new Date(atMs + 3 * MIN_MS).toISOString(),
          action: "StatusNotification",
          connectorId,
          status: "Available",
          errorCode: "NoError",
        });
      }
    }

    // ---- an error code the connector keeps working through -----------------
    if (script.warningWhileWorking) {
      const { connectorId, agesHours, status, errorCode } = script.warningWhileWorking;
      for (const h of agesHours) {
        const atMs = nowMs - h * 3_600_000;
        push({
          id: id(),
          chargerId: cp.id,
          at: new Date(atMs).toISOString(),
          action: "StatusNotification",
          connectorId,
          status,
          errorCode,
          vendorId: cp.vendor,
          info: "Derating: enclosure 71 C",
        });
        push({
          id: id(),
          chargerId: cp.id,
          at: new Date(atMs + 20 * MIN_MS).toISOString(),
          action: "StatusNotification",
          connectorId,
          status: "Available",
          errorCode: "NoError",
        });
      }
    }

    // ---- one-off faults, so every error code shows up -----------------------
    for (const f of script.faults ?? []) {
      const atMs = nowMs - f.agoHours * 3_600_000;
      push({
        id: id(),
        chargerId: cp.id,
        at: new Date(atMs).toISOString(),
        action: "StatusNotification",
        connectorId: f.connectorId,
        status: f.status ?? "Faulted",
        errorCode: f.errorCode,
        vendorId: cp.vendor,
        ...(f.info ? { info: f.info } : {}),
      });
      if (f.clearAfterMin !== null) {
        push({
          id: id(),
          chargerId: cp.id,
          at: new Date(atMs + f.clearAfterMin * MIN_MS).toISOString(),
          action: "StatusNotification",
          connectorId: f.connectorId,
          status: "Available",
          errorCode: "NoError",
        });
      }
    }
  }

  out.push(...transactionMessages(chargepoints, sessions, nowMs, windowStart));
  return out.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
}

/**
 * StartTransaction / MeterValues / StopTransaction for every session inside the
 * window. The meter register is synthetic but self-consistent: meterStop always
 * equals meterStart plus the session's energy, so a detector that joins the two
 * gets the same kWh the sessions table reports.
 */
function transactionMessages(
  chargepoints: Chargepoint[],
  sessions: ChargingSession[],
  nowMs: number,
  windowStart: number,
): OcppMessage[] {
  const out: OcppMessage[] = [];
  const cpById = new Map(chargepoints.map((c) => [c.id, c]));

  // Recency rank per charger, so the INTERRUPTS script can name "the most
  // recent completed session on CP-2, Fort Worth" without hard-coding an id.
  const rankByCharger = new Map<string, number>();
  const ranked = new Map<string, number>();
  for (const s of [...sessions].sort((a, b) => (a.startTime < b.startTime ? 1 : -1))) {
    if (s.endTime === null) continue;
    const r = rankByCharger.get(s.chargerId) ?? 0;
    rankByCharger.set(s.chargerId, r + 1);
    ranked.set(s.id, r);
  }

  for (const s of sessions) {
    const cp = cpById.get(s.chargerId);
    if (!cp) continue;
    const startMs = new Date(s.startTime).getTime();
    if (!Number.isFinite(startMs) || startMs < windowStart) continue;
    // Charges seen only through the vehicle's own pack never touched one of our
    // chargers, so there is no transaction to log.
    if (s.detectionSource === "TELEMATICS") continue;

    const script = SCRIPTS[cp.name] ?? {};
    const txId = Number(s.id.replace(/^\D+/, "")) || hash(s.id) % 100000;
    const meterStart = 100_000 + (hash(s.chargerId) % 5_000) * 10 + txId;
    const endMs = s.endTime ? new Date(s.endTime).getTime() : nowMs;
    const ratedKw = Math.max(0, ...cp.connectors.map((c) => c.powerKw));
    let n = 0;
    const id = () => `${s.id}-tx-${(n += 1)}`;

    out.push({
      id: id(),
      chargerId: cp.id,
      at: s.startTime,
      action: "StartTransaction",
      connectorId: s.connectorId,
      idTag: s.vehicleReg.replace(/[^A-Z0-9]/gi, "").toUpperCase().slice(0, 20),
      meterStart,
      transactionId: txId,
    });

    // ---- periodic meter samples -------------------------------------------
    const durationMin = Math.max(1, (endMs - startMs) / MIN_MS);
    const steps = Math.max(1, Math.min(24, Math.floor(durationMin / METER_SAMPLE_MIN)));
    const avgKw = durationMin > 0 ? (s.energyKwh / (durationMin / 60)) : 0;
    // Scripted chargers report what the script says; everything else reports
    // the rate its own session data implies.
    const importKw = script.meter ? script.meter.importKw : avgKw;
    const offeredKw = script.meter ? script.meter.offeredKw : ratedKw;
    const voltage = script.meter ? script.meter.voltage : 232;

    for (let i = 1; i <= steps; i += 1) {
      const at = new Date(startMs + (i * (endMs - startMs)) / steps).toISOString();
      const wh = Math.round(meterStart + (s.energyKwh * 1000 * i) / steps);
      out.push({
        id: id(),
        chargerId: cp.id,
        at,
        action: "MeterValues",
        connectorId: s.connectorId,
        transactionId: txId,
        sampledValue: [
          { value: String(wh), measurand: "Energy.Active.Import.Register", unit: "Wh", context: "Sample.Periodic" },
          { value: String(Math.round(importKw * 1000)), measurand: "Power.Active.Import", unit: "W", context: "Sample.Periodic" },
          { value: String(Math.round(offeredKw * 1000)), measurand: "Power.Offered", unit: "W", context: "Sample.Periodic" },
          { value: String(voltage), measurand: "Voltage", unit: "V", context: "Sample.Periodic" },
          { value: String(Math.round((importKw * 1000) / voltage)), measurand: "Current.Import", unit: "A", context: "Sample.Periodic" },
          ...(s.socEnd != null
            ? [
                {
                  value: String(Math.round(s.socStart + ((s.socEnd - s.socStart) * i) / steps)),
                  measurand: "SoC" as const,
                  unit: "Percent",
                  context: "Sample.Periodic" as const,
                },
              ]
            : []),
        ],
      });
    }

    if (s.endTime === null) continue;

    // ---- stop, normal or scripted -----------------------------------------
    const rank = ranked.get(s.id);
    const interrupt = INTERRUPTS.find((x) => x.charger === cp.name && x.nth === rank);
    // A session with no recorded stop reason sends none at all — which OCPP
    // reads as "Local", an ordinary stop. Plenty of real chargers do this.
    const reason: OcppStopReason | undefined = interrupt
      ? interrupt.reason
      : isStopReason(s.stopReason)
        ? s.stopReason
        : undefined;

    // The fault a charger reports lands just before it gives up the session,
    // which is exactly the correlation window the detector looks in.
    if (interrupt?.errorCode) {
      out.push({
        id: id(),
        chargerId: cp.id,
        at: new Date(endMs - 12_000).toISOString(),
        action: "StatusNotification",
        connectorId: s.connectorId,
        status: "Faulted",
        errorCode: interrupt.errorCode,
        vendorId: cp.vendor,
        ...(interrupt.vendorErrorCode ? { vendorErrorCode: interrupt.vendorErrorCode } : {}),
        ...(interrupt.info ? { info: interrupt.info } : {}),
      });
      // Once the vehicle is unplugged the charger reports a clean status again
      if (endMs + 15 * MIN_MS < nowMs) {
        out.push({
          id: id(),
          chargerId: cp.id,
          at: new Date(endMs + 15 * MIN_MS).toISOString(),
          action: "StatusNotification",
          connectorId: s.connectorId,
          status: "Available",
          errorCode: "NoError",
        });
      }
    }

    out.push({
      id: id(),
      chargerId: cp.id,
      at: s.endTime,
      action: "StopTransaction",
      transactionId: txId,
      meterStop: Math.round(meterStart + s.energyKwh * 1000),
      ...(reason ? { reason } : {}),
    });
  }

  return out;
}

const STOP_REASONS: readonly string[] = [
  "DeAuthorized", "EmergencyStop", "EVDisconnected", "HardReset", "Local", "Other",
  "PowerLoss", "Reboot", "Remote", "SoftReset", "UnlockCommand",
];

function isStopReason(v: string | null): v is OcppStopReason {
  return v !== null && STOP_REASONS.includes(v);
}

// ---- read helpers used by the detectors ------------------------------------

export const isStatusNotification = (m: OcppMessage): m is StatusNotificationMsg =>
  m.action === "StatusNotification";
export const isHeartbeat = (m: OcppMessage): m is HeartbeatMsg => m.action === "Heartbeat";
export const isBootNotification = (m: OcppMessage): m is BootNotificationMsg =>
  m.action === "BootNotification";
export const isStartTransaction = (m: OcppMessage): m is StartTransactionMsg =>
  m.action === "StartTransaction";
export const isStopTransaction = (m: OcppMessage): m is StopTransactionMsg =>
  m.action === "StopTransaction";
export const isMeterValues = (m: OcppMessage): m is MeterValuesMsg => m.action === "MeterValues";
export const isResetCommand = (m: OcppMessage): m is ResetCommandMsg => m.action === "Reset";
export const isConnectionEvent = (m: OcppMessage): m is ConnectionEventMsg =>
  m.action === "ConnectionEvent";

/** First sample for a measurand, as a number. NaN when absent or unparseable. */
export function sampleOf(m: MeterValuesMsg, measurand: OcppMeasurand): number {
  const hit = m.sampledValue.find((v) => v.measurand === measurand);
  return hit ? Number(hit.value) : Number.NaN;
}
