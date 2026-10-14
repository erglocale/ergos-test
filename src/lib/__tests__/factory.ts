// Test fixtures for the OCPP detectors.
//
// The demo generator in src/data/ocpp.ts goes state -> messages: it asks "what
// would a charger have had to say for the app to look like this?". That makes
// it useless as a test oracle, because it can only ever produce logs that agree
// with the fixtures — and it was written alongside the detectors specifically
// so each one fires exactly once.
//
// These builders go the other way. They let a test state a message sequence
// directly, including sequences the demo generator cannot express: a fault that
// never clears, a connector failing at a flat rate, a log that contradicts the
// app's own idea of the charger's status.

import type {
  BootNotificationMsg,
  ConnectionEventMsg,
  MeterValuesMsg,
  OcppErrorCode,
  OcppMessage,
  OcppSampledValue,
  OcppStatus,
  OcppStopReason,
  StartTransactionMsg,
  StatusNotificationMsg,
  StopTransactionMsg,
} from "@/data/ocpp";
import type {
  Chargepoint,
  ChargingSession,
  Connector,
  Vehicle,
  WorkOrder,
} from "@/data/types";
import type { DetectorInput } from "@/lib/ocppDetectors";

/** Fixed clock. Every helper takes an age in hours/days back from here. */
export const NOW = Date.parse("2026-03-01T12:00:00.000Z");

export const HOUR = 3_600_000;
export const DAY = 86_400_000;

export const hoursAgo = (h: number, now = NOW) => new Date(now - h * HOUR).toISOString();
export const daysAgo = (d: number, now = NOW) => new Date(now - d * DAY).toISOString();

// ---------------------------------------------------------------------------
// Fleet
// ---------------------------------------------------------------------------

export function mkConnector(id: number, powerKw = 7.4): Connector {
  return { id, type: "Type2", powerKw, status: "Available" };
}

export function mkCharger(
  id: string,
  { connectors = [mkConnector(1)], name = id }: { connectors?: Connector[]; name?: string } = {},
): Chargepoint {
  return {
    id,
    name,
    hub: "Test Hub",
    serial: `SN-${id}`,
    model: "Test Model",
    vendor: "TestVendor",
    status: "Online",
    connectors,
    address: "Test Address",
    lat: 0,
    lng: 0,
    tariffPerKwh: 10,
    createdAt: daysAgo(365),
  };
}

export function mkVehicle(reg: string, over: Partial<Vehicle> = {}): Vehicle {
  return {
    id: `veh-${reg}`,
    reg,
    make: "Test",
    model: "Cargo",
    category: "3W Cargo",
    batteryKwh: 10,
    soc: 50,
    socCapPct: 100,
    status: "Idle",
    odometerKm: 1000,
    driverId: null,
    hub: "Test Hub",
    lat: 0,
    lng: 0,
    imei: `imei-${reg}`,
    createdAt: daysAgo(365),
    ...over,
  };
}

export function mkSession(over: Partial<ChargingSession> = {}): ChargingSession {
  return {
    id: `sess-${Math.random().toString(36).slice(2, 10)}`,
    chargerId: "CP-TEST",
    chargerName: "CP-TEST",
    connectorId: 1,
    vehicleReg: "REG-1",
    driverName: "Test Driver",
    startTime: hoursAgo(3),
    endTime: hoursAgo(2),
    energyKwh: 5,
    socStart: 30,
    socEnd: 80,
    cost: 50,
    status: "Completed",
    stopReason: null,
    ...over,
  };
}

export function mkWorkOrder(subject: string, over: Partial<WorkOrder> = {}): WorkOrder {
  return {
    id: `wo-${subject}`,
    ref: "WO-0001",
    source: "Manual",
    sourceId: null,
    subject,
    subjectHref: null,
    hub: "Test Hub",
    title: "Test work order",
    details: null,
    priority: "Medium",
    assigneeId: null,
    status: "Open",
    dueDate: null,
    ...over,
  } as WorkOrder;
}

// ---------------------------------------------------------------------------
// Message log
// ---------------------------------------------------------------------------

/**
 * Fluent message-log builder. Every method appends one message and returns
 * `this`, so a test reads as the sequence the charger actually sent.
 *
 * Ids are sequential and stable (`m1`, `m2`, ...) so a test can assert on
 * `evidence` without reaching into the builder.
 */
export class LogBuilder {
  private msgs: OcppMessage[] = [];
  private seq = 0;
  private txn = 1000;

  constructor(private chargerId: string) {}

  private next(): string {
    this.seq += 1;
    return `m${this.seq}`;
  }

  /** Everything appended so far, in insertion order. */
  build(): OcppMessage[] {
    return [...this.msgs];
  }

  /** The id the next appended message will get — handy for evidence assertions. */
  peekNextId(): string {
    return `m${this.seq + 1}`;
  }

  push(m: OcppMessage): this {
    this.msgs.push(m);
    return this;
  }

  status(
    at: string,
    status: OcppStatus,
    errorCode: OcppErrorCode = "NoError",
    over: Partial<StatusNotificationMsg> = {},
  ): this {
    return this.push({
      id: this.next(),
      chargerId: this.chargerId,
      at,
      action: "StatusNotification",
      connectorId: 1,
      status,
      errorCode,
      ...over,
    } as StatusNotificationMsg);
  }

  /** A fault that clears on its own `clearAfterMin` later — the lock-wear shape. */
  faultAndClear(
    at: string,
    errorCode: OcppErrorCode,
    connectorId = 1,
    clearAfterMin = 9,
  ): this {
    this.status(at, "Faulted", errorCode, { connectorId });
    return this.status(
      new Date(Date.parse(at) + clearAfterMin * 60_000).toISOString(),
      "Available",
      "NoError",
      { connectorId },
    );
  }

  heartbeat(at: string): this {
    return this.push({
      id: this.next(),
      chargerId: this.chargerId,
      at,
      action: "Heartbeat",
    });
  }

  /**
   * Regular heartbeats across a window, skipping any suppressed range.
   * `fromDaysAgo` -> `toDaysAgo`, stepping by the configured interval.
   * Suppression is how offline is expressed: the absence is the signal.
   */
  heartbeats(
    fromDaysAgo: number,
    toDaysAgo = 0,
    opts: { intervalS?: number; suppress?: { fromMs: number; toMs: number }[]; now?: number } = {},
  ): this {
    const { intervalS = 300, suppress = [], now = NOW } = opts;
    const start = now - fromDaysAgo * DAY;
    const end = now - toDaysAgo * DAY;
    for (let t = start; t <= end; t += intervalS * 1000) {
      if (suppress.some((s) => t >= s.fromMs && t <= s.toMs)) continue;
      this.heartbeat(new Date(t).toISOString());
    }
    return this;
  }

  /** A websocket connect, as production's ChargerConnectionLogs records it. */
  connect(at: string): this {
    return this.push({
      id: this.next(),
      chargerId: this.chargerId,
      at,
      action: "ConnectionEvent",
      event: "CONNECTION",
    } as ConnectionEventMsg);
  }

  /** A websocket disconnect. */
  disconnect(at: string, reason = "Ping timeout"): this {
    return this.push({
      id: this.next(),
      chargerId: this.chargerId,
      at,
      action: "ConnectionEvent",
      event: "DISCONNECTION",
      reason,
    } as ConnectionEventMsg);
  }

  /** An outage: disconnect at `from`, reconnect `forMin` minutes later. */
  outage(from: string, forMin: number): this {
    this.disconnect(from);
    return this.connect(new Date(Date.parse(from) + forMin * 60_000).toISOString());
  }

  /** A Reset command ergOS sent to the charger. */
  reset(at: string, type: "Hard" | "Soft" = "Soft"): this {
    return this.push({
      id: this.next(),
      chargerId: this.chargerId,
      at,
      action: "Reset",
      sender: "csms",
      type,
    });
  }

  boot(at: string, over: Partial<BootNotificationMsg> = {}): this {
    return this.push({
      id: this.next(),
      chargerId: this.chargerId,
      at,
      action: "BootNotification",
      chargePointVendor: "TestVendor",
      chargePointModel: "Test Model",
      firmwareVersion: "1.2.3",
      ...over,
    } as BootNotificationMsg);
  }

  /** StartTransaction. Returns `this`; the transaction id auto-increments. */
  start(at: string, over: Partial<StartTransactionMsg> = {}): this {
    this.txn += 1;
    return this.push({
      id: this.next(),
      chargerId: this.chargerId,
      at,
      action: "StartTransaction",
      connectorId: 1,
      idTag: "TESTTAG",
      meterStart: 0,
      transactionId: this.txn,
      ...over,
    } as StartTransactionMsg);
  }

  /** StopTransaction. Pass `undefined` for a charger that sends no reason. */
  stop(at: string, reason: OcppStopReason | undefined, over: Partial<StopTransactionMsg> = {}): this {
    return this.push({
      id: this.next(),
      chargerId: this.chargerId,
      at,
      action: "StopTransaction",
      transactionId: this.txn,
      meterStop: 5000,
      ...(reason ? { reason } : {}),
      ...over,
    } as StopTransactionMsg);
  }

  /** The current transaction id, for correlating meter samples to a session. */
  currentTxn(): number {
    return this.txn;
  }

  meter(
    at: string,
    values: { importW?: number; offeredW?: number; voltage?: number; soc?: number },
    over: Partial<MeterValuesMsg> = {},
  ): this {
    const sampledValue: OcppSampledValue[] = [];
    if (values.importW != null)
      sampledValue.push({ measurand: "Power.Active.Import", value: String(values.importW), unit: "W" });
    if (values.offeredW != null)
      sampledValue.push({ measurand: "Power.Offered", value: String(values.offeredW), unit: "W" });
    if (values.voltage != null)
      sampledValue.push({ measurand: "Voltage", value: String(values.voltage), unit: "V" });
    if (values.soc != null)
      sampledValue.push({ measurand: "SoC", value: String(values.soc), unit: "Percent" });

    return this.push({
      id: this.next(),
      chargerId: this.chargerId,
      at,
      action: "MeterValues",
      connectorId: 1,
      transactionId: this.txn,
      sampledValue,
      ...over,
    } as MeterValuesMsg);
  }

  /** `count` meter samples spread evenly across the window, all identical. */
  meterRun(
    fromDaysAgo: number,
    toDaysAgo: number,
    count: number,
    values: { importW?: number; offeredW?: number; voltage?: number; soc?: number },
    over: Partial<MeterValuesMsg> = {},
  ): this {
    const start = NOW - fromDaysAgo * DAY;
    const end = NOW - toDaysAgo * DAY;
    const step = count > 1 ? (end - start) / (count - 1) : 0;
    for (let i = 0; i < count; i += 1) {
      this.meter(new Date(start + step * i).toISOString(), values, over);
    }
    return this;
  }
}

export const log = (chargerId: string) => new LogBuilder(chargerId);

// ---------------------------------------------------------------------------
// Detector input
// ---------------------------------------------------------------------------

export function mkInput(over: Partial<DetectorInput> = {}): DetectorInput {
  return {
    messages: [],
    chargepoints: [],
    nowMs: NOW,
    ...over,
  };
}
