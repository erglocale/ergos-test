// Live data from the local energy-brain FastAPI (proxied via /energy-api so it
// stays same-origin). Rows are mapped into the sandbox's own types and merged
// on top of the fixtures by the store — if energy-brain isn't running, the
// fetch fails silently and the UI shows fixtures only.
import type { Chargepoint, ChargingSession, Connector, Vehicle } from "./types";

const API = "/energy-api/api/v1";

interface EbVehicle {
  id: string;
  name: string;
  vin: string | null;
  license_plate: string;
  battery_capacity: number;
  max_charging_power: number;
  soc: number | null;
  target_soc: number;
}

interface EbConnector {
  id: string;
  connector_id: number;
  connector_type: string;
  current_type: string;
  max_capacity: number;
  is_smart_charging_capable: boolean;
}

interface EbChargePoint {
  id: string;
  name: string;
  description: string | null;
  max_capacity: number;
  network_id: string;
  connectors: EbConnector[];
}

interface EbNetwork {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  /** Grid connection capacity in kW — the site's real ceiling. */
  max_capacity: number;
  solar_capacity: number;
}

interface EbSession {
  id: string;
  created_at: string | null;
  idTag: string | null;
  energy_to_charge: number | null;
  start_time: string | null;
  end_time: string | null;
  charge_point_id: string;
  connector_id: string;
  vehicle_id: string;
}

export interface EnergyOverlay {
  vehicles: Vehicle[];
  chargepoints: Chargepoint[];
  sessions: ChargingSession[];
  /**
   * Hub name -> the network's grid connection limit in kW. This is the site
   * ceiling the optimizer plans against; it is NOT the sum of the charge
   * points, which can be (and usually is) oversubscribed.
   */
  hubGridLimitKw: Record<string, number>;
}

export interface PredictedPoint {
  time: string;
  limit: number; // kW the optimizer allocated for this interval
  source: "solar" | "grid";
}

/** Predicted charging schedule per session, keyed by the overlay session id. */
export interface PredictedSchedule {
  sessionId: string;
  points: PredictedPoint[];
}

/**
 * Runs energy-brain's optimizer for every network and returns the planned
 * charging profile of each ongoing session. Heavier than the overlay poll
 * (the backend runs the allocator + forecasts) — callers should poll slowly.
 */
export async function fetchPredictedSchedules(): Promise<PredictedSchedule[]> {
  try {
    const networks = await getJson<EbNetwork[]>("/networks");
    const all: PredictedSchedule[] = [];
    for (const net of networks) {
      try {
        const opts = await getJson<{ id: string; data_points: PredictedPoint[] }[]>(
          `/optimizations?network_id=${net.id}`,
        );
        for (const o of opts) {
          all.push({ sessionId: `EB-${o.id.slice(0, 8)}`, points: o.data_points });
        }
      } catch {
        // network with no sessions / failed forecast — skip
      }
    }
    return all;
  } catch {
    return [];
  }
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res.json() as Promise<T>;
}

function mapConnectorType(t: string): Connector["type"] {
  const s = (t || "").toUpperCase().replace(/\s+/g, "");
  if (s.includes("CCS")) return "CCS2";
  if (s.includes("TYPE2")) return "Type2";
  if (s.includes("IEC")) return "IEC60309";
  return "3PIN";
}

const FALLBACK_LATLNG = { lat: 26.1158, lng: 91.789 }; // Guwahati

export async function fetchEnergyOverlay(): Promise<EnergyOverlay | null> {
  try {
    // No trailing slashes: Next 308-redirects them; the proxy route handler
    // follows FastAPI's own trailing-slash redirect server-side instead.
    const [ebVehicles, ebChargePoints, ebNetworks, ebSessions] = await Promise.all([
      getJson<EbVehicle[]>("/vehicles"),
      getJson<EbChargePoint[]>("/charge_points"),
      getJson<EbNetwork[]>("/networks"),
      getJson<EbSession[]>("/charging_sessions"),
    ]);

    const networkById = new Map(ebNetworks.map((n) => [n.id, n]));
    const cpById = new Map(ebChargePoints.map((cp) => [cp.id, cp]));
    const vehicleById = new Map(ebVehicles.map((v) => [v.id, v]));

    const chargepoints: Chargepoint[] = ebChargePoints.map((cp) => {
      const net = networkById.get(cp.network_id);
      return {
        id: cp.id,
        name: cp.name,
        hub: net?.name ?? "—",
        serial: cp.id.replace(/-/g, "").slice(0, 10).toUpperCase(),
        model: "—",
        vendor: "—",
        status: "Online",
        connectors: cp.connectors.map((cn) => ({
          id: cn.connector_id,
          type: mapConnectorType(cn.connector_type),
          powerKw: cn.max_capacity,
          status: "Available" as const,
        })),
        address: net?.name ?? "—",
        lat: net?.latitude ?? FALLBACK_LATLNG.lat,
        lng: net?.longitude ?? FALLBACK_LATLNG.lng,
        tariffPerKwh: 0,
        createdAt: new Date().toISOString(),
        isSmartCharger: cp.connectors.some((cn) => cn.is_smart_charging_capable),
      };
    });

    const sessions: ChargingSession[] = ebSessions.map((s) => {
      const cp = cpById.get(s.charge_point_id);
      const conn = cp?.connectors.find((cn) => cn.id === s.connector_id);
      const veh = vehicleById.get(s.vehicle_id);
      const ongoing = s.end_time === null;
      return {
        id: `EB-${s.id.slice(0, 8)}`,
        chargerId: s.charge_point_id,
        chargerName: cp?.name ?? "—",
        connectorId: conn?.connector_id ?? 1,
        vehicleReg: veh?.license_plate ?? "—",
        driverName: veh?.name ?? "—",
        startTime: s.start_time ?? s.created_at ?? new Date().toISOString(),
        endTime: s.end_time,
        energyKwh: s.energy_to_charge ?? 0,
        socStart: Math.round(veh?.soc ?? 0),
        socEnd: ongoing ? null : Math.round(veh?.target_soc ?? 0),
        cost: 0,
        status: ongoing ? "Ongoing" : "Completed",
        stopReason: ongoing ? null : "EVDisconnected",
      };
    });

    // A charging vehicle sits at its charger's network; idle vehicles fall
    // back to the first network (energy-brain has no vehicle location field).
    const ongoingByVehicle = new Map(
      ebSessions.filter((s) => s.end_time === null).map((s) => [s.vehicle_id, s]),
    );
    const anyNet = ebNetworks[0];
    const vehicles: Vehicle[] = ebVehicles.map((v) => {
      const [make, ...rest] = (v.name || "EV").split(" ");
      const ongoing = ongoingByVehicle.get(v.id);
      const sessionNet = ongoing
        ? networkById.get(cpById.get(ongoing.charge_point_id)?.network_id ?? "")
        : undefined;
      const site = sessionNet ?? anyNet;
      return {
        id: v.id,
        reg: v.license_plate,
        make,
        model: rest.join(" ") || "—",
        category: "3W Cargo",
        batteryKwh: v.battery_capacity,
        soc: Math.round(v.soc ?? 0),
        socCapPct: Math.round(v.target_soc),
        status: ongoing ? "Charging" : "Idle",
        odometerKm: 0,
        driverId: null,
        hub: site?.name ?? "—",
        lat: site?.latitude ?? FALLBACK_LATLNG.lat,
        lng: site?.longitude ?? FALLBACK_LATLNG.lng,
        imei: "",
        createdAt: new Date().toISOString(),
      };
    });

    const hubGridLimitKw: Record<string, number> = {};
    for (const net of ebNetworks) {
      if (typeof net.max_capacity === "number") hubGridLimitKw[net.name] = net.max_capacity;
    }

    return { vehicles, chargepoints, sessions, hubGridLimitKw };
  } catch {
    return null;
  }
}
