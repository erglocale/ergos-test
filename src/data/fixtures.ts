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

// The two customer fleets the demo is built around, replicated from their real
// setup: Etash Delivery Technologies runs out of Six Mile and Azara in
// Guwahati, Eco Mobility out of Kapashera in Delhi. Names, coordinates, charger
// inventory and fleet composition mirror production; every telemetry value
// below (SoC, odometer, trips, sessions, IMEIs) is dummy.
const HUBS = [
  {
    name: "Six Mile",
    lat: 26.1299,
    lng: 91.8092,
    address: "GS Rd, Six Mile, Guwahati, Assam 781022",
    city: "Guwahati",
    state: "Assam",
    pins: ["781022", "781006", "781038"],
    localities: ["Six Mile", "Hatigaon Rd", "Ganeshguri", "Dispur Last Gate"],
  },
  {
    name: "Azara",
    lat: 26.1286,
    lng: 91.6217,
    address: "Azara, Guwahati, Assam 781017",
    city: "Guwahati",
    state: "Assam",
    pins: ["781017", "781015"],
    localities: ["Azara", "Dharapur", "Garal Gaon"],
  },
  {
    name: "Kapashera",
    lat: 28.5225,
    lng: 77.0405,
    address: "Kapashera, New Delhi 110037",
    city: "New Delhi",
    state: "Delhi",
    pins: ["110037", "110097"],
    localities: ["Kapashera", "Bijwasan", "Samalkha"],
  },
];

const DRIVER_NAMES = [
  "Ranjit Das",
  "Pranab Kalita",
  "Dipak Boro",
  "Manoj Sharma",
  "Bikash Deka",
  "Hemanta Nath",
  "Jitu Rabha",
  "Simanta Baruah",
  "Naresh Yadav",
  "Sunil Kumar",
];

// Etash's Piaggio/Mahindra 3W cargo fleet and Eco Mobility's MG cars, with the
// battery sizes and SoC caps their real records carry.
const FLEET = [
  { reg: "AS01NC4701", make: "Piaggio Vehicles Pvt Ltd", model: "Ape E-Xtra FX Max", category: "3W Cargo" as const, batteryKwh: 8, socCapPct: 90, hub: 0, imeiPrefix: "350317175" },
  { reg: "AS01PC2313", make: "Piaggio Vehicles Pvt Ltd", model: "Ape E-Xtra FX Max", category: "3W Cargo" as const, batteryKwh: 8, socCapPct: 90, hub: 0, imeiPrefix: "350317175" },
  { reg: "AS01QC4734", make: "Piaggio Vehicles Pvt Ltd", model: "Ape E-Xtra FX Max", category: "3W Cargo" as const, batteryKwh: 8, socCapPct: 90, hub: 0, imeiPrefix: "353691840" },
  { reg: "AS01SC0339", make: "Mahindra Electric Mobility Ltd", model: "ZOR grand DV", category: "3W Cargo" as const, batteryKwh: 10.24, socCapPct: 90, hub: 0, imeiPrefix: "353691841" },
  { reg: "AS01SC7409", make: "Piaggio Vehicles Pvt Ltd", model: "Ape E-Xtra FX Max", category: "3W Cargo" as const, batteryKwh: 8, socCapPct: 90, hub: 0, imeiPrefix: "350317175" },
  { reg: "AS01SC7432", make: "Piaggio Vehicles Pvt Ltd", model: "Ape E-Xtra FX Max", category: "3W Cargo" as const, batteryKwh: 8, socCapPct: 90, hub: 1, imeiPrefix: "350317175" },
  { reg: "AS01SC7438", make: "Piaggio Vehicles Pvt Ltd", model: "Ape E-Xtra FX Max", category: "3W Cargo" as const, batteryKwh: 8, socCapPct: 85, hub: 1, imeiPrefix: "350317175" },
  { reg: "AS01SC7492", make: "Piaggio Vehicles Pvt Ltd", model: "Ape E-Xtra FX Max", category: "3W Cargo" as const, batteryKwh: 8, socCapPct: 90, hub: 1, imeiPrefix: "350544507" },
  { reg: "AS01SC7619", make: "Piaggio Vehicles Pvt Ltd", model: "Ape E-Xtra FX Max", category: "3W Cargo" as const, batteryKwh: 8, socCapPct: 90, hub: 0, imeiPrefix: "350317175" },
  { reg: "AS01TC1046", make: "Piaggio Vehicles Pvt Ltd", model: "Ape E-Xtra FX Max", category: "3W Cargo" as const, batteryKwh: 8, socCapPct: 90, hub: 0, imeiPrefix: "350317175" },
  { reg: "AS01TC1083", make: "Piaggio Vehicles Pvt Ltd", model: "Ape E-Xtra FX Max", category: "3W Cargo" as const, batteryKwh: 8, socCapPct: 90, hub: 0, imeiPrefix: "350317175" },
  { reg: "AS01TC1084", make: "Piaggio Vehicles Pvt Ltd", model: "Ape E-Xtra FX Max", category: "3W Cargo" as const, batteryKwh: 8, socCapPct: 90, hub: 0, imeiPrefix: "350317175" },
  { reg: "HR55AX9090", make: "MG", model: "ZS EV EXECUTIVE", category: "4W" as const, batteryKwh: 50, socCapPct: 100, hub: 2, imeiPrefix: "353691844" },
  { reg: "HR55AX1925", make: "MG", model: "ZS EV EXECUTIVE", category: "4W" as const, batteryKwh: 50, socCapPct: 100, hub: 2, imeiPrefix: "353691844" },
  { reg: "HR55AX1290", make: "MG", model: "ZS EV EXECUTIVE", category: "4W" as const, batteryKwh: 50, socCapPct: 100, hub: 2, imeiPrefix: "353691844" },
];

export function makeFixtures(now = dayjs()): Db {
  const rand = mulberry32(20260803);
  const pick = <T,>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];
  const between = (lo: number, hi: number) => lo + rand() * (hi - lo);
  const int = (lo: number, hi: number) => Math.floor(between(lo, hi + 1));

  // ---- chargepoints -------------------------------------------------------
  // The real inventory: EVRE AC001 units share 10 kW across three 3-pin sockets
  // (~3.3 kW per port) and the HALO is a single 3 kW socket. Azara's unit is
  // enabled but every socket reads Faulted — the electrical work there is still
  // pending, which is what feeds the charger-warnings page.
  const chargepoints: Chargepoint[] = [];
  const cpSpecs = [
    { hub: 0, name: "CP-1, Six Mile", model: "AC001", connectorCount: 3, powerKw: 3.3, allFaulted: false },
    { hub: 0, name: "CP-2, Six Mile", model: "HALO", connectorCount: 1, powerKw: 3, allFaulted: false },
    { hub: 0, name: "CP-3, Six Mile", model: "AC001", connectorCount: 3, powerKw: 3.3, allFaulted: false },
    { hub: 1, name: "CP-1, Azara", model: "AC001", connectorCount: 3, powerKw: 3.3, allFaulted: true },
    { hub: 2, name: "CP-1, Kapashera", model: "AC001", connectorCount: 1, powerKw: 3.3, allFaulted: false },
    { hub: 2, name: "CP-2, Kapashera", model: "AC001", connectorCount: 1, powerKw: 3.3, allFaulted: false },
  ];
  cpSpecs.forEach((spec, i) => {
    const hub = HUBS[spec.hub];
    chargepoints.push({
      id: `CP-${String(i + 1).padStart(3, "0")}`,
      name: spec.name,
      hub: hub.name,
      serial: `ERG${2024000 + (i + 1) * 17}`,
      model: spec.model,
      vendor: "EVRE",
      status: "Online",
      connectors: Array.from({ length: spec.connectorCount }, (_, ci) => ({
        id: ci + 1,
        type: "3PIN" as const,
        powerKw: spec.powerKw,
        status: spec.allFaulted ? ("Faulted" as const) : ("Available" as const),
      })),
      address: hub.address,
      lat: round2(hub.lat + between(-0.002, 0.002)),
      lng: round2(hub.lng + between(-0.002, 0.002)),
      tariffPerKwh: 9.5,
      createdAt: now.subtract(int(200, 400), "day").toISOString(),
    });
  });

  // ---- vehicles + drivers -------------------------------------------------
  const vehicles: Vehicle[] = [];
  const drivers: Driver[] = [];
  // Plates, makes, battery sizes, SoC caps and home hubs come from the two real
  // fleets; SoC, odometer, IMEI and the driver roster are generated. Not every
  // vehicle has a driver — the rest read as "vehicle is not used", exactly as
  // production does when nobody has checked in.
  FLEET.forEach((spec, i) => {
    const hub = HUBS[spec.hub];
    const driver = i < DRIVER_NAMES.length ? DRIVER_NAMES[i] : null;
    // Never seed "Charging" here — that status is derived from whether the
    // vehicle actually has a live session, so a stored flag would drift out of
    // sync with the session list (see normalizeChargingStatus in store.ts).
    const status = pick(["Idle", "Idle", "Driving", "Driving", "Idle", "Idle"] as const);
    vehicles.push({
      id: `veh-${i + 1}`,
      reg: spec.reg,
      make: spec.make,
      model: spec.model,
      category: spec.category,
      batteryKwh: spec.batteryKwh,
      soc: int(18, 96),
      socCapPct: spec.socCapPct,
      status,
      odometerKm: int(4000, 26000),
      driverId: driver ? `drv-${i + 1}` : null,
      hub: hub.name,
      lat: round2(hub.lat + between(-0.03, 0.03)),
      lng: round2(hub.lng + between(-0.03, 0.03)),
      imei: `${spec.imeiPrefix}${int(100000, 999999)}`,
      createdAt: now.subtract(int(120, 400), "day").toISOString(),
    });
    if (driver) {
      const rto = hub.state === "Delhi" ? "DL" : "AS01";
      drivers.push({
        id: `drv-${i + 1}`,
        name: driver,
        phone: `+91 98${int(10000000, 99999999)}`,
        email: `${driver.toLowerCase().replace(" ", ".")}@erglocale.com`,
        licenseNo: `${rto} ${int(2015, 2023)}00${int(10000, 99999)}`,
        vehicleReg: spec.reg,
        status: i === 4 ? "Inactive" : "Active",
        joinedAt: now.subtract(int(100, 500), "day").toISOString(),
        address: `House ${int(2, 88)}, ${pick(hub.localities)}`,
        city: hub.city,
        state: hub.state,
        pin: pick(hub.pins),
      });
    }
  });

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
  const onlineCps = chargepoints.filter((c) => c.status === "Online");
  const availableConnector = (c: Chargepoint) =>
    pick(c.connectors.filter((cn) => cn.status === "Available"));
  // A vehicle only ever plugs in at its own hub — the two fleets are 1,800 km
  // apart. Azara has no usable socket (the electrical work is still pending),
  // so its vans have no charging history at all, which is the real situation.
  const cpsAtHub = (list: Chargepoint[], hub: string) => list.filter((c) => c.hub === hub);
  for (let d = 14; d >= 0; d -= 1) {
    const day = now.subtract(d, "day");
    for (const v of vehicles) {
      if (rand() < 0.45) continue;
      const candidates = cpsAtHub(usableCps, v.hub);
      if (!candidates.length) continue;
      sesId += 1;
      const cp = pick(candidates);
      const connector = availableConnector(cp);
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
      // History is history: only the one guaranteed session below is live, so
      // every page agrees on how many vehicles are charging right now.
      if (end.isAfter(now)) continue;
      const faulted = rand() < 0.04;
      sessions.push({
        id: `CS-${String(sesId).padStart(5, "0")}`,
        chargerId: cp.id,
        chargerName: cp.name,
        connectorId: connector.id,
        vehicleReg: v.reg,
        driverName: drivers.find((dr) => dr.vehicleReg === v.reg)?.name ?? "—",
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        energyKwh: faulted ? round2(energy * 0.2) : energy,
        socStart,
        socEnd: faulted ? socStart + int(1, 4) : socEnd,
        cost: 0,
        status: faulted ? "Faulted" : "Completed",
        stopReason: faulted ? "PowerLoss" : pick(["EVDisconnected", "EVDisconnected", "EVDisconnected", "Remote"]),
      });
    }
  }
  // Azara's sockets read Faulted *now* — the warning it raises is hours old,
  // not days — so the hub has history right up to the point they failed and
  // nothing since. Without it the site reports zero sessions in every report,
  // which reads as a hub nobody uses rather than one that just went down.
  const azaraCp = chargepoints.find((c) => c.hub === HUBS[1].name);
  if (azaraCp) {
    const connector = azaraCp.connectors[0];
    const azaraVehicles = vehicles.filter((v) => v.hub === azaraCp.hub);
    // Stops at d = 2: the fault is at most 30 h old, so a session that ended
    // two days ago is safely on the working side of it.
    for (let d = 14; d >= 2; d -= 1) {
      const day = now.subtract(d, "day");
      for (const v of azaraVehicles) {
        if (rand() < 0.4) continue;
        sesId += 1;
        const start = day.hour(pick([20, 21, 22, 13])).minute(int(0, 59));
        const socStart = int(20, 65);
        const maxEnergy = Math.min(4.5, ((v.socCapPct - socStart) / 100) * v.batteryKwh);
        const energy = round2(between(0.4, Math.max(0.5, maxEnergy)));
        const durMin = Math.round((energy / connector.powerKw) * 60) + int(8, 35);
        sessions.push({
          id: `CS-${String(sesId).padStart(5, "0")}`,
          chargerId: azaraCp.id,
          chargerName: azaraCp.name,
          connectorId: connector.id,
          vehicleReg: v.reg,
          driverName: drivers.find((dr) => dr.vehicleReg === v.reg)?.name ?? "—",
          startTime: start.toISOString(),
          endTime: start.add(durMin, "minute").toISOString(),
          energyKwh: energy,
          socStart,
          socEnd: Math.min(
            v.socCapPct,
            socStart + Math.round((energy / v.batteryKwh) * 100),
          ),
          cost: 0,
          status: "Completed",
          stopReason: pick(["EVDisconnected", "EVDisconnected", "Remote"]),
        });
      }
    }
  }

  // Completed sessions that ended shortly before now on every online charger,
  // so the schedule calendar shows recent history without scrolling. Ends are
  // placed first (25 min / ~2 h ago), then the start is derived from duration.
  const recentEndMinsAgo = [() => int(25, 75), () => int(110, 200)];
  for (const cp of onlineCps) {
    const hubVehicles = vehicles.filter((veh) => veh.hub === cp.hub);
    if (!hubVehicles.length || !cp.connectors.some((cn) => cn.status === "Available")) continue;
    for (const endMinsAgo of recentEndMinsAgo) {
      sesId += 1;
      const v = pick(hubVehicles);
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
    // The vehicle has to belong to the hub it is plugged into, or the hub page
    // lists a vehicle that is charging somewhere else.
    const v = vehicles.find((veh) => veh.hub === cp.hub) ?? vehicles[0];
    // Only just plugged in: a reset should leave plenty of room to watch the
    // simulation climb rather than dropping you in near the target SoC.
    const elapsedMin = int(4, 12);
    const start = now.subtract(elapsedMin, "minute");
    const socStart = int(22, 34);
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
  // The alert types the real system fires, in roughly the real proportions
  // (overspeed dominates by an order of magnitude: 607 / 49 / 15 / 12 / 6 in
  // production at the time of writing, with repeated fast charging rarer
  // still). Payload fields are the ones production's getAlertSummary() renders
  // per type.
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
    {
      // 12 V auxiliary battery: the DC-DC converter only tops it up while the
      // vehicle runs or charges, so these fire on vehicles left standing.
      alertType: "low_aux_battery",
      severity: "warning",
      weight: 8,
      payload: () => ({
        lowest_voltage: round1(between(10.4, 11.7)),
        threshold: 11.8,
        duration_seconds: int(15, 180) * 60,
      }),
    },
    {
      // 10 kW is roughly 1C on these 8–12 kWh 3W packs, so anything above it is
      // a swap-station style top-up rather than the depot's 3 kW overnight AC.
      alertType: "repeated_fast_charging",
      severity: "warning",
      weight: 5,
      payload: () => ({
        consecutive_fast_charge_count: int(3, 6),
        required_fast_charge_count: 3,
        fast_charging_power_threshold_kw: 10,
      }),
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
  });

  // The first page of the alerts table should show the range of what the fleet
  // raises, not ten overspeeds in a row: one alert of each type is pulled to
  // the front by giving it one of the most recent timestamps. The rest keep the
  // real, overspeed-heavy distribution behind them.
  alertSpecs.forEach((spec, i) => {
    const first = alerts.find((a) => a.alertType === spec.alertType);
    if (!first) return;
    const createdAt = now.subtract(i + 1, "hour");
    first.createdAt = createdAt.toISOString();
    first.resolvedAt = first.resolved
      ? createdAt.add(int(10, 45), "minute").toISOString()
      : null;
  });
  alerts.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

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
  // Service vendors follow the vehicle's city — Guwahati for Etash's 3Ws,
  // Delhi/NCR for Eco Mobility's cars.
  const VENDORS = ["Sai Motors", "Kamakhya Auto Works", "GS Road Service Centre", "EV Care Guwahati"];
  const NCR_VENDORS = ["MG Service Gurugram", "Kapashera Auto Care", "Dwarka EV Workshop"];
  const vendorFor = (v: Vehicle) => pick(v.reg.startsWith("HR") ? NCR_VENDORS : VENDORS);
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
        vendor: vendorFor(v),
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
