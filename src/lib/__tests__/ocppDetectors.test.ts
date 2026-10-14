// The three charger alert rules, as production runs them.

import { describe, expect, it } from "vitest";
import { DAY, NOW, daysAgo, hoursAgo, log, mkCharger, mkConnector, mkInput } from "./factory";
import {
  type DetectedAlert,
  detectChargerFault,
  detectCommunicationLost,
  detectRecurringFault,
  runDetectors,
} from "@/lib/ocppDetectors";

const minsAgo = (m: number) => new Date(NOW - m * 60_000).toISOString();
const cp = mkCharger("CP-1", { connectors: [mkConnector(1), mkConnector(2)] });
const resolvedAt = (a: DetectedAlert, at: string): DetectedAlert => ({ ...a, resolvedAt: at });

describe("detectChargerFault", () => {
  it("raises as soon as a code arrives and keeps it open while reported", () => {
    const messages = log(cp.id).status(minsAgo(1), "Faulted", "GroundFailure", { connectorId: 2 }).build();
    const [a] = detectChargerFault(mkInput({ messages, chargepoints: [cp] }));
    expect(a.type).toBe("ConnectorFaulted");
    expect(a.severity).toBe("Warning");
    expect(a.resolvedAt).toBeNull();
    expect(a.errorCode).toBe("GroundFailure");
    expect(a.message).toBe('Connector 2 on charger CP-1 is reporting "Ground fault".');
  });

  it("resolves as soon as the code goes away", () => {
    const messages = log(cp.id).faultAndClear(hoursAgo(5), "ConnectorLockFailure", 1, 3).build();
    const [a] = detectChargerFault(mkInput({ messages, chargepoints: [cp] }));
    expect(a.resolvedAt).toBe(new Date(Date.parse(hoursAgo(5)) + 3 * 60_000).toISOString());
    expect(a.action).toBe("Unlock connector 1 remotely. If it does not clear, inspect the latch.");
  });

  it("treats repeats of the same code as one alert, across status changes", () => {
    const messages = log(cp.id)
      .status(hoursAgo(3), "Faulted", "HighTemperature")
      .status(hoursAgo(2), "Faulted", "HighTemperature")
      .status(hoursAgo(1), "Charging", "HighTemperature")
      .build();
    const alerts = detectChargerFault(mkInput({ messages, chargepoints: [cp] }));
    expect(alerts).toHaveLength(1);
    expect(alerts[0].message).toContain("while still charging");
  });

  it("gives each code its own alert", () => {
    const messages = log(cp.id)
      .status(hoursAgo(3), "Faulted", "HighTemperature")
      .status(hoursAgo(2), "Faulted", "InternalError")
      .build();
    const alerts = detectChargerFault(mkInput({ messages, chargepoints: [cp] }));
    expect(alerts.map((a) => [a.errorCode, a.resolvedAt === null])).toEqual([
      ["InternalError", true],
      ["HighTemperature", false],
    ]);
  });

  it("raises for Faulted with no error code", () => {
    const messages = log(cp.id).status(minsAgo(5), "Faulted").build();
    const [a] = detectChargerFault(mkInput({ messages, chargepoints: [cp] }));
    expect(a.errorCode).toBeNull();
    expect(a.message).toBe("Connector 1 on charger CP-1 is faulted, with no error code from the charger.");
    expect(a.action).toBe("Physical inspection needed");
  });

  it("raises nothing for NoError", () => {
    const messages = log(cp.id).status(minsAgo(5), "Available").status(minsAgo(4), "Charging").build();
    expect(detectChargerFault(mkInput({ messages, chargepoints: [cp] }))).toEqual([]);
  });

  it("raises a new alert when one is marked resolved while the code is still reported", () => {
    const messages = log(cp.id).status(hoursAgo(5), "Faulted", "OtherError").build();
    const input = mkInput({ messages, chargepoints: [cp] });
    const [open] = detectChargerFault(input);
    const resolved = [resolvedAt(open, hoursAgo(1))];
    const all = runDetectors({ ...input, resolved });
    expect(all).toHaveLength(2);
    expect(all[0].raisedAt).toBe(hoursAgo(1));
    expect(all[0].resolvedAt).toBeNull();
    expect(all[0].id).not.toBe(open.id);
    expect(all[1].resolvedAt).toBe(hoursAgo(1));
  });
});

describe("detectRecurringFault", () => {
  const faults = (ages: number[], code: "ConnectorLockFailure" | "InternalError" = "ConnectorLockFailure") => {
    const b = log(cp.id);
    for (const d of ages) b.faultAndClear(daysAgo(d), code, 2);
    return b.build();
  };

  it("raises a Critical alert at 3 in 7 days", () => {
    const [a] = detectRecurringFault(mkInput({ messages: faults([6, 4, 1]), chargepoints: [cp] }));
    expect(a.severity).toBe("Critical");
    expect(a.resolvedAt).toBeNull();
    expect(a.raisedAt).toBe(daysAgo(1));
    expect(a.message).toBe(
      'Connector 2 on charger CP-1 reported "Connector lock failed" 3 times in the last 7 days.',
    );
    expect(a.action.startsWith("Keeps coming back — check it before it fails for good.")).toBe(true);
  });

  it("does not raise for 2 in 7 days, or 3 spread over more than 7", () => {
    expect(detectRecurringFault(mkInput({ messages: faults([4, 1]), chargepoints: [cp] }))).toEqual([]);
    expect(detectRecurringFault(mkInput({ messages: faults([20, 12, 1]), chargepoints: [cp] }))).toEqual([]);
  });

  it("never closes by itself, even once the faults age out", () => {
    const [a] = detectRecurringFault(
      mkInput({ messages: faults([20, 19, 18]), chargepoints: [cp] }),
    );
    expect(a.resolvedAt).toBeNull();
  });

  it("counts again from zero after it is marked resolved", () => {
    const input = mkInput({ messages: faults([6, 5, 4, 2, 1]), chargepoints: [cp] });
    const [open] = detectRecurringFault(input);
    const resolved = [resolvedAt(open, daysAgo(3))];
    expect(detectRecurringFault({ ...input, resolved })).toEqual([]);

    const more = mkInput({ messages: faults([6, 5, 4, 2, 1, 0.5]), chargepoints: [cp] });
    const [again] = detectRecurringFault({ ...more, resolved });
    expect(again.message).toContain("3 times");
    expect(again.id).not.toBe(open.id);
  });

  it("ignores Faulted with no code", () => {
    const b = log(cp.id);
    for (const d of [3, 2, 1]) b.status(daysAgo(d), "Faulted").status(daysAgo(d - 0.01), "Available");
    expect(detectRecurringFault(mkInput({ messages: b.build(), chargepoints: [cp] }))).toEqual([]);
  });
});

describe("detectCommunicationLost", () => {
  it("raises at 30 minutes of silence", () => {
    const messages = log(cp.id).disconnect(minsAgo(31)).build();
    const [a] = detectCommunicationLost(mkInput({ messages, chargepoints: [cp] }));
    expect(a.severity).toBe("Warning");
    expect(a.resolvedAt).toBeNull();
    expect(a.message).toBe("Charger CP-1 has been offline for 31 minutes.");
  });

  it("ignores shorter drops", () => {
    const messages = log(cp.id).disconnect(minsAgo(20)).build();
    expect(detectCommunicationLost(mkInput({ messages, chargepoints: [cp] }))).toEqual([]);
  });

  it("is Critical after 24 hours", () => {
    const messages = log(cp.id).disconnect(hoursAgo(25)).build();
    expect(detectCommunicationLost(mkInput({ messages, chargepoints: [cp] }))[0].severity).toBe("Critical");
  });

  it("resolves when the charger is back", () => {
    const messages = log(cp.id).outage(hoursAgo(5), 90).build();
    const [a] = detectCommunicationLost(mkInput({ messages, chargepoints: [cp] }));
    expect(a.resolvedAt).toBe(new Date(Date.parse(hoursAgo(5)) + 90 * 60_000).toISOString());
  });

  it("points at the server when most of the fleet dropped together", () => {
    const fleet = ["A", "B", "C"].map((id) => mkCharger(id));
    const messages = fleet.flatMap((c) => log(c.id).disconnect(hoursAgo(1)).build());
    const alerts = detectCommunicationLost(mkInput({ messages, chargepoints: fleet }));
    expect(alerts).toHaveLength(3);
    expect(alerts[0].action).toContain("Several chargers went offline together");
  });
});

describe("runDetectors", () => {
  it("lists newest first", () => {
    const messages = log(cp.id)
      .faultAndClear(daysAgo(2), "InternalError", 1)
      .status(hoursAgo(1), "Faulted", "GroundFailure", { connectorId: 2 })
      .build();
    const alerts = runDetectors(mkInput({ messages, chargepoints: [cp], nowMs: NOW }));
    expect(alerts.map((a) => a.errorCode)).toEqual(["GroundFailure", "InternalError"]);
    expect(NOW - Date.parse(alerts[1].raisedAt)).toBe(2 * DAY);
  });
});
