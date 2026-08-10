import dayjs from "dayjs";
import type {
  Alert,
  Chargepoint,
  ChargerWarning,
  ChargingSession,
  Db,
  Driver,
  MaintenanceRecord,
  MaintenanceTask,
  PortalUser,
  Suggestion,
  Trip,
  Vehicle,
  Wallet,
} from "./types";

// Deterministic PRNG so the demo data is identical on every reset.
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;

const HUBS = [
  { name: "Beltola Hub", lat: 26.1158, lng: 91.789, address: "Beltola Main Rd, Guwahati, Assam 781028" },
  { name: "Six Mile Depot", lat: 26.1284, lng: 91.8034, address: "GS Rd, Six Mile, Guwahati, Assam 781022" },
];

const DRIVER_NAMES = [
  "Ranjit Das",
  "Pranab Kalita",
  "Dipak Boro",
  "Manoj Sharma",
  "Bikash Deka",
];

const MAKES = [
  { make: "Mahindra", model: "Treo Zor", category: "3W Cargo" as const, batteryKwh: 8, imeiBase: 861100066 },
  { make: "Piaggio", model: "Ape E-City", category: "3W Passenger" as const, batteryKwh: 7.5, imeiBase: 861100077 },
  { make: "Euler", model: "HiLoad EV", category: "3W Cargo" as const, batteryKwh: 12.4, imeiBase: 861100088 },
  { make: "OSM", model: "Rage+ Frost", category: "3W Cargo" as const, batteryKwh: 10.8, imeiBase: 861100099 },
];

export function makeFixtures(now = dayjs()): Db {
  const rand = mulberry32(20260803);
  const pick = <T,>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];
  const between = (lo: number, hi: number) => lo + rand() * (hi - lo);
  const int = (lo: number, hi: number) => Math.floor(between(lo, hi + 1));

  // ---- chargepoints -------------------------------------------------------
  // Modeled on the real fleet's chargers: slow 3.3 kW single-connector EVRE
  // AC units ("CP-1, Six Mile" naming), 3-pin sockets, no smart chargers.
  const chargepoints: Chargepoint[] = [];
  const cpModels = [
    { model: "AC001", vendor: "EVRE", powerKw: 3, type: "3PIN" as const },
    { model: "HALO", vendor: "EVRE", powerKw: 3, type: "3PIN" as const },
  ];
  // One charger per hub: Beltola's has 3 connectors (one faulted — feeds the
  // charger-warnings feed), Six Mile keeps a single-connector unit.
  const cpSpecs = [
    { hub: HUBS[0], connectorCount: 3, faultedConnectorId: 3 },
    { hub: HUBS[1], connectorCount: 1, faultedConnectorId: null },
  ];
  cpSpecs.forEach((spec, i) => {
    const place = spec.hub.name.replace(/ (Hub|Depot)$/, "");
    const m = cpModels[i % cpModels.length];
    chargepoints.push({
      id: `CP-${String(i + 1).padStart(3, "0")}`,
      name: `CP-1, ${place}`,
      hub: spec.hub.name,
      serial: `ERG${2024000 + (i + 1) * 17}`,
      model: m.model,
      vendor: m.vendor,
      status: "Online",
      connectors: Array.from({ length: spec.connectorCount }, (_, ci) => ({
        id: ci + 1,
        type: m.type,
        powerKw: m.powerKw,
        status:
          ci + 1 === spec.faultedConnectorId
            ? ("Faulted" as const)
            : ("Available" as const),
      })),
      address: spec.hub.address,
      lat: round2(spec.hub.lat + between(-0.002, 0.002)),
      lng: round2(spec.hub.lng + between(-0.002, 0.002)),
      tariffPerKwh: 9.5,
      createdAt: now.subtract(int(200, 400), "day").toISOString(),
    });
  });

  // ---- vehicles + drivers -------------------------------------------------
  const vehicles: Vehicle[] = [];
  const drivers: Driver[] = [];
  for (let i = 0; i < 6; i += 1) {
    const spec = MAKES[i % MAKES.length];
    const hub = HUBS[i % HUBS.length];
    const reg = `AS01SC${String(300 + i * 7).padStart(4, "0")}`;
    const driver = i < DRIVER_NAMES.length ? DRIVER_NAMES[i] : null;
    const status = pick(["Idle", "Idle", "Driving", "Driving", "Charging", "Idle"] as const);
    vehicles.push({
      id: `veh-${i + 1}`,
      reg,
      make: spec.make,
      model: spec.model,
      category: spec.category,
      batteryKwh: spec.batteryKwh,
      soc: int(18, 96),
      socCapPct: pick([80, 85, 90, 100, 100]),
      status,
      odometerKm: int(4000, 26000),
      driverId: driver ? `drv-${i + 1}` : null,
      hub: hub.name,
      lat: round2(hub.lat + between(-0.03, 0.03)),
      lng: round2(hub.lng + between(-0.03, 0.03)),
      imei: String(spec.imeiBase * 10000 + int(1000, 9999)),
      createdAt: now.subtract(int(120, 400), "day").toISOString(),
    });
    if (driver) {
      drivers.push({
        id: `drv-${i + 1}`,
        name: driver,
        phone: `+91 98${int(10000000, 99999999)}`,
        email: `${driver.toLowerCase().replace(" ", ".")}@erglocale.com`,
        licenseNo: `AS01 ${int(2015, 2023)}00${int(10000, 99999)}`,
        vehicleReg: reg,
        status: i === 4 ? "Inactive" : "Active",
        joinedAt: now.subtract(int(100, 500), "day").toISOString(),
        address: `House ${int(2, 88)}, ${pick(["Beltola Tiniali", "Six Mile", "Hatigaon Rd", "Ganeshguri", "Dispur Last Gate"])}`,
        city: "Guwahati",
        state: "Assam",
        pin: pick(["781028", "781022", "781038", "781006"]),
      });
    }
  }

  // ---- trips (last 14 days) ----------------------------------------------
  const trips: Trip[] = [];
  let tripId = 0;
  for (let d = 14; d >= 0; d -= 1) {
    const day = now.subtract(d, "day");
    for (const v of vehicles) {
      if (rand() < 0.35) continue; // day off
      const nTrips = rand() < 0.7 ? 1 : 2;
      let cursor = day.hour(int(8, 10)).minute(int(0, 59));
      for (let t = 0; t < nTrips; t += 1) {
        tripId += 1;
        const durMin = int(45, 9 * 60);
        const end = cursor.add(durMin, "minute");
        if (d === 0 && end.isAfter(now)) break;
        const distance = round1(between(6, 60));
        const startSoc = int(55, 100);
        const usedPct = Math.min(startSoc - 5, Math.round((distance / (v.batteryKwh * 9)) * 100));
        trips.push({
          id: `trip-${tripId}`,
          vehicleReg: v.reg,
          driverName: drivers.find((dr) => dr.vehicleReg === v.reg)?.name ?? "—",
          startTime: cursor.toISOString(),
          endTime: end.toISOString(),
          distanceKm: distance,
          startSoc,
          endSoc: Math.max(5, startSoc - usedPct),
          energyKwh: round2((usedPct / 100) * v.batteryKwh),
          avgSpeedKmh: round1(Math.min(45, (distance / durMin) * 60)),
        });
        cursor = end.add(int(40, 150), "minute");
      }
    }
  }
  trips.sort((a, b) => (a.startTime < b.startTime ? 1 : -1));

  // ---- charging sessions (last 14 days) ----------------------------------
  // Value ranges taken from the real fleet's OCPP sessions: slow 3.3 kW
  // top-ups of small batteries — mostly 0.4–4.5 kWh over 15 min–2.5 h, the
  // odd plug-in that draws ~nothing, stop reason almost always
  // "EVDisconnected", and no billing amounts (fleet charging is unbilled).
  const sessions: ChargingSession[] = [];
  let sesId = 0;
  const usableCps = chargepoints.filter(
    (c) => c.status === "Online" && c.connectors.some((cn) => cn.status === "Available"),
  );
  // Older history may sit on any online charger and any connector (the fault
  // is recent); current sessions stick to available connectors.
  const onlineCps = chargepoints.filter((c) => c.status === "Online");
  const availableConnector = (c: Chargepoint) =>
    pick(c.connectors.filter((cn) => cn.status === "Available"));
  for (let d = 14; d >= 0; d -= 1) {
    const day = now.subtract(d, "day");
    for (const v of vehicles) {
      if (rand() < 0.45) continue;
      sesId += 1;
      const cp = pick(d >= 2 ? onlineCps : usableCps);
      const connector = d >= 2 ? pick(cp.connectors) : availableConnector(cp);
      const start = day.hour(pick([20, 21, 22, 13])).minute(int(0, 59));
      // Never fabricate sessions that haven't started yet — a "tonight 8 pm"
      // slot on day 0 would otherwise appear as a future ongoing session.
      if (d === 0 && start.isAfter(now)) continue;
      const socStart = int(20, 65);
      const dud = rand() < 0.08; // plugged in but drew ~nothing
      const maxEnergy = Math.min(4.5, ((v.socCapPct - socStart) / 100) * v.batteryKwh);
      const energy = dud ? round2(between(0, 0.05)) : round2(between(0.4, maxEnergy));
      const socEnd = Math.min(
        v.socCapPct,
        socStart + Math.round((energy / v.batteryKwh) * 100),
      );
      const durMin = Math.round((energy / connector.powerKw) * 60) + int(8, 35);
      const end = start.add(durMin, "minute");
      const ongoing = d === 0 && end.isAfter(now);
      const faulted = !ongoing && rand() < 0.04;
      sessions.push({
        id: `CS-${String(sesId).padStart(5, "0")}`,
        chargerId: cp.id,
        chargerName: cp.name,
        connectorId: connector.id,
        vehicleReg: v.reg,
        driverName: drivers.find((dr) => dr.vehicleReg === v.reg)?.name ?? "—",
        startTime: start.toISOString(),
        endTime: ongoing ? null : end.toISOString(),
        energyKwh: ongoing ? round2(energy * 0.4) : faulted ? round2(energy * 0.2) : energy,
        socStart,
        socEnd: ongoing ? null : faulted ? socStart + int(1, 4) : socEnd,
        cost: 0,
        status: ongoing ? "Ongoing" : faulted ? "Faulted" : "Completed",
        stopReason: ongoing ? null : faulted ? "PowerLoss" : pick(["EVDisconnected", "EVDisconnected", "EVDisconnected", "Remote"]),
      });
    }
  }
  // Completed sessions that ended shortly before now on every online charger,
  // so the schedule calendar shows recent history without scrolling. Ends are
  // placed first (25 min / ~2 h ago), then the start is derived from duration.
  const recentEndMinsAgo = [() => int(25, 75), () => int(110, 200)];
  for (const cp of onlineCps) {
    for (const endMinsAgo of recentEndMinsAgo) {
      sesId += 1;
      const v = pick(vehicles);
      const connector = availableConnector(cp);
      const energy = round2(between(0.6, 3.5));
      const durMin = Math.round((energy / connector.powerKw) * 60) + int(8, 25);
      const end = now.subtract(endMinsAgo(), "minute");
      const start = end.subtract(durMin, "minute");
      const socStart = int(25, 60);
      sessions.push({
        id: `CS-${String(sesId).padStart(5, "0")}`,
        chargerId: cp.id,
        chargerName: cp.name,
        connectorId: connector.id,
        vehicleReg: v.reg,
        driverName: drivers.find((dr) => dr.vehicleReg === v.reg)?.name ?? "—",
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        energyKwh: energy,
        socStart,
        socEnd: Math.min(v.socCapPct, socStart + Math.round((energy / v.batteryKwh) * 100)),
        cost: 0,
        status: "Completed",
        stopReason: pick(["EVDisconnected", "EVDisconnected", "Remote"]),
      });
    }
  }
  // One guaranteed live session on a healthy charger, so the ongoing badge,
  // live-status card and calendar always have a fixture example too.
  {
    sesId += 1;
    const cp = usableCps[0];
    const connector = availableConnector(cp);
    const v = vehicles[1];
    const elapsedMin = int(25, 50);
    const start = now.subtract(elapsedMin, "minute");
    const socStart = int(25, 50);
    // SoC gained so far must match the elapsed time at the connector's power.
    const gainedPct = Math.round(
      (((connector.powerKw * elapsedMin) / 60) / v.batteryKwh) * 100,
    );
    sessions.push({
      id: `CS-${String(sesId).padStart(5, "0")}`,
      chargerId: cp.id,
      chargerName: cp.name,
      connectorId: connector.id,
      vehicleReg: v.reg,
      driverName: drivers.find((dr) => dr.vehicleReg === v.reg)?.name ?? "—",
      startTime: start.toISOString(),
      endTime: null,
      energyKwh: round2((connector.powerKw * elapsedMin) / 60),
      socStart,
      socEnd: null,
      cost: 0,
      status: "Ongoing",
      stopReason: null,
    });
    // Keep the vehicle's state consistent with its live session.
    v.status = "Charging";
    v.soc = Math.min(v.socCapPct, socStart + gainedPct);
  }
  sessions.sort((a, b) => (a.startTime < b.startTime ? 1 : -1));

  // ---- alerts (telemetry vehicle alerts) ----------------------------------
  // Only the five alert types the real system actually fires, in roughly the
  // real proportions (overspeed dominates by an order of magnitude:
  // 607 / 49 / 15 / 12 / 6 in production at the time of writing). Payload
  // fields are the ones production's getAlertSummary() renders per type.
  const alertSpecs: Array<{
    alertType: Alert["alertType"];
    severity: Alert["severity"];
    weight: number;
    payload: () => Record<string, number>;
  }> = [
    {
      alertType: "overspeed",
      severity: "warning",
      weight: 607,
      payload: () => ({
        max_speed: int(48, 64),
        threshold: 45,
        duration_seconds: int(30, 600),
      }),
    },
    {
      alertType: "low_soc_level_1",
      severity: "info",
      weight: 49,
      payload: () => ({ threshold: 30 }),
    },
    {
      alertType: "low_soc_level_2",
      severity: "warning",
      weight: 15,
      payload: () => ({ threshold: 20 }),
    },
    {
      alertType: "overspeed_low_soc",
      severity: "critical",
      weight: 12,
      payload: () => ({
        max_speed: int(48, 60),
        overspeed_threshold: 45,
        start_soc: int(8, 25),
        low_soc_threshold: 30,
      }),
    },
    {
      alertType: "excessive_idle",
      severity: "warning",
      weight: 6,
      payload: () => ({ duration_hours: round1(between(2.5, 9)), threshold_hours: 2 }),
    },
  ];
  const totalWeight = alertSpecs.reduce((s, a) => s + a.weight, 0);
  const pickAlertSpec = () => {
    let roll = rand() * totalWeight;
    for (const spec of alertSpecs) {
      roll -= spec.weight;
      if (roll <= 0) return spec;
    }
    return alertSpecs[0];
  };
  const alerts: Alert[] = Array.from({ length: 30 }, (_, i) => {
    // First pass guarantees every real type appears at least once (the
    // weighted draw alone can leave the rare ones out); rest follow the
    // real overspeed-heavy distribution.
    const spec = i < alertSpecs.length ? alertSpecs[i] : pickAlertSpec();
    const v = pick(vehicles);
    const createdAt = now.subtract(int(1, 7 * 24), "hour");
    const resolved = rand() < 0.35;
    return {
      id: `al-${i + 1}`,
      alertType: spec.alertType,
      severity: spec.severity,
      vehicleLicensePlate: v.reg,
      payload: spec.payload(),
      createdAt: createdAt.toISOString(),
      resolved,
      resolvedAt: resolved
        ? createdAt.add(int(20, 600), "minute").toISOString()
        : null,
    };
  }).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  // ---- charger warnings ---------------------------------------------------
  // Derived from the charger fleet's actual state: the offline unit and the
  // faulted connector each raise one warning, shaped like the production feed.
  const chargerWarnings: ChargerWarning[] = [];
  for (const cp of chargepoints) {
    if (cp.status === "Offline") {
      const hours = int(6, 48);
      chargerWarnings.push({
        id: `cw-${chargerWarnings.length + 1}`,
        charger: { id: cp.id, name: cp.name, hub: cp.hub },
        connector: null,
        warningObject: {
          type: "ChargerOffline",
          status: "New",
          createdAt: now.subtract(hours, "hour").toISOString(),
          offlineForHours: hours,
          lastChecked: now.subtract(hours, "hour").toISOString(),
          resolution: "Check the charger's power supply and network connection, then power-cycle it.",
        },
      });
    }
    const faulted = cp.connectors.find((cn) => cn.status === "Faulted");
    if (faulted) {
      const since = int(3, 30);
      chargerWarnings.push({
        id: `cw-${chargerWarnings.length + 1}`,
        charger: { id: cp.id, name: cp.name, hub: cp.hub },
        connector: {
          connectorId: faulted.id,
          status: faulted.status,
          updatedAt: now.subtract(since, "hour").toISOString(),
        },
        warningObject: {
          type: "ConnectorFaulted",
          status: "New",
          createdAt: now.subtract(since, "hour").toISOString(),
          offlineForHours: null,
          lastChecked: null,
          resolution: "Unplug any vehicle, then reset the connector from the charger controls.",
        },
      });
    }
  }

  // ---- portal users + wallets --------------------------------------------
  const users: PortalUser[] = [
    { name: "Aarav Mehta", role: "Admin" as const, status: "Active" as const },
    { name: "Priya Sharma", role: "Fleet Manager" as const, status: "Active" as const },
    { name: "Rohan Barua", role: "Fleet Manager" as const, status: "Active" as const },
    { name: "Sneha Dutta", role: "Viewer" as const, status: "Active" as const },
    { name: "Vikram Singh", role: "Viewer" as const, status: "Invited" as const },
    { name: "Nilim Hazarika", role: "Fleet Manager" as const, status: "Disabled" as const },
  ].map((u, i) => ({
    id: `usr-${i + 1}`,
    name: u.name,
    email: `${u.name.toLowerCase().replace(" ", ".")}@erglocale.com`,
    phone: `+91 97${int(10000000, 99999999)}`,
    role: u.role,
    status: u.status,
    lastLoginAt: u.status === "Invited" ? null : now.subtract(int(1, 200), "hour").toISOString(),
  }));

  const wallets: Wallet[] = users.slice(0, 5).map((u, i) => ({
    id: `wal-${i + 1}`,
    userName: u.name,
    phone: u.phone,
    balance: round2(between(50, 4000)),
    lastTopUpAt: now.subtract(int(1, 40), "day").toISOString(),
    txnCount: int(3, 60),
  }));

  // ---- SOC cap suggestions ------------------------------------------------
  const suggestions: Suggestion[] = vehicles.map((v, i) => {
    const suggested = pick([70, 75, 80, 85, 90]);
    return {
      id: `sug-${i + 1}`,
      vehicleReg: v.reg,
      currentCapPct: v.socCapPct,
      suggestedCapPct: suggested,
      unsafeDaysPct: round1(between(0, 4.9)),
      estMonthlySavingPct: round1(Math.max(0, (v.socCapPct - suggested) * between(0.3, 0.6))),
      windowFrom: now.subtract(90, "day").format("YYYY-MM-DD"),
      windowTo: now.format("YYYY-MM-DD"),
      status: i % 5 === 3 ? "Applied" : "New",
    };
  });

  // ---- maintenance tasks + service history --------------------------------
  // Mix of overdue / due-soon / on-track so the board's summary cards and
  // status pills all have data. dueKm compares against vehicle.odometerKm.
  const maintenanceTasks: MaintenanceTask[] = [];
  const maintenanceRecords: MaintenanceRecord[] = [];
  const TASK_TEMPLATES: {
    title: string;
    taskType: "FLEET_TASK" | "OEM_SERVICE";
    isRecurring: boolean;
    intervalKm: number | null;
    intervalMonths: number | null;
  }[] = [
    { title: "Full service", taskType: "OEM_SERVICE", isRecurring: true, intervalKm: 10000, intervalMonths: 6 },
    { title: "Brake inspection", taskType: "FLEET_TASK", isRecurring: true, intervalKm: 5000, intervalMonths: 3 },
    { title: "Tyre rotation", taskType: "FLEET_TASK", isRecurring: true, intervalKm: 8000, intervalMonths: null },
    { title: "Coolant top-up", taskType: "OEM_SERVICE", isRecurring: false, intervalKm: null, intervalMonths: null },
    { title: "Battery health check", taskType: "OEM_SERVICE", isRecurring: true, intervalKm: null, intervalMonths: 12 },
    { title: "Wheel alignment", taskType: "FLEET_TASK", isRecurring: false, intervalKm: null, intervalMonths: null },
  ];
  const VENDORS = ["Sai Motors", "Kamakhya Auto Works", "GS Road Service Centre", "EV Care Guwahati"];
  let taskIdx = 0;
  let recordIdx = 0;
  for (let i = 0; i < 9; i += 1) {
    const v = vehicles[(i * 5 + 1) % vehicles.length];
    const tpl = TASK_TEMPLATES[i % TASK_TEMPLATES.length];
    taskIdx += 1;
    // Spread due points around "now": ~1/3 overdue, ~1/3 due soon, rest on track.
    const bucket = i % 3;
    const kmOffset = bucket === 0 ? -int(150, 900) : bucket === 1 ? int(150, 450) : int(1500, 6000);
    const dayOffset = bucket === 0 ? -int(3, 25) : bucket === 1 ? int(2, 13) : int(30, 120);
    maintenanceTasks.push({
      id: `mt-${taskIdx}`,
      evId: v.id,
      taskType: tpl.taskType,
      title: tpl.title,
      description: null,
      isRecurring: tpl.isRecurring,
      intervalKm: tpl.intervalKm,
      intervalMonths: tpl.intervalMonths,
      dueKm: i % 4 === 3 ? null : v.odometerKm + kmOffset,
      dueDate: i % 5 === 4 ? null : now.add(dayOffset, "day").format("YYYY-MM-DD"),
      status: "ACTIVE",
      createdAt: now.subtract(int(20, 180), "day").toISOString(),
    });
    if (rand() < 0.7) {
      recordIdx += 1;
      const daysAgo = int(15, 170);
      maintenanceRecords.push({
        id: `mr-${recordIdx}`,
        evId: v.id,
        taskId: `mt-${taskIdx}`,
        taskTitle: tpl.title,
        taskType: tpl.taskType,
        serviceDate: now.subtract(daysAgo, "day").format("YYYY-MM-DD"),
        odometerKm: Math.max(500, v.odometerKm - int(800, 6000)),
        cost: int(4, 60) * 100,
        vendor: pick(VENDORS),
        notes: pick(["", "", "Replaced worn parts", "Routine check, all OK", "Minor adjustment done"]) || null,
      });
    }
  }

  return {
    profile: {
      firstName: "Demo",
      lastName: "User",
      email: "demo@erglocale.com",
      phone: "+91 9876543210",
      company: "ergLocale (UI sandbox)",
      zone: { zone: "IN", currency: "INR", currencySymbol: "₹" },
      timeFormat: "12",
    },
    chargepoints,
    sessions,
    vehicles,
    drivers,
    trips,
    alerts,
    chargerWarnings,
    users,
    wallets,
    suggestions,
    maintenanceTasks,
    maintenanceRecords,
  };
}
