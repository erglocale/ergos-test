export type ConnectorStatus = "Available" | "Charging" | "Faulted" | "Unavailable";

export interface Connector {
  id: number;
  type: "IEC60309" | "Type2" | "CCS2" | "3PIN";
  powerKw: number;
  status: ConnectorStatus;
}

export interface Chargepoint {
  id: string;
  name: string;
  hub: string;
  serial: string;
  model: string;
  vendor: string;
  status: "Online" | "Offline";
  connectors: Connector[];
  address: string;
  lat: number;
  lng: number;
  tariffPerKwh: number;
  createdAt: string;
  /** Production gates its "Smart Charger" tag on this; the demo fleet has none. */
  isSmartCharger?: boolean;
}

export interface ChargingSession {
  id: string;
  chargerId: string;
  chargerName: string;
  connectorId: number;
  vehicleReg: string;
  driverName: string;
  startTime: string;
  endTime: string | null;
  energyKwh: number;
  socStart: number;
  socEnd: number | null;
  cost: number;
  status: "Ongoing" | "Completed" | "Faulted";
  stopReason: string | null;
  /**
   * How the session was seen. "OCPP" is a transaction one of our own chargers
   * reported; "TELEMATICS" is a charge the vehicle's own pack revealed, which
   * is the only way charging away from our hubs is ever visible — there is no
   * charger, connector, meter register or transaction id for one of those.
   * Absent means OCPP, so existing rows need no migration.
   */
  detectionSource?: "OCPP" | "TELEMATICS";
  /**
   * Where a telematics session happened. Null/absent for our own chargers.
   * `name` is set when the spot resolves to a known public charging location —
   * production tags those differently from a charge it can only place by
   * coordinates (see the Location column rule).
   */
  location?: { name?: string | null; address: string; lat: number; lng: number } | null;
}

export interface Vehicle {
  id: string;
  reg: string;
  make: string;
  model: string;
  category: "3W Cargo" | "3W Passenger" | "2W" | "4W";
  batteryKwh: number;
  /** Charge acceptance in kW. Absent for fixtures, which use the connector. */
  maxChargeKw?: number;
  soc: number;
  socCapPct: number;
  status: "Idle" | "Driving" | "Charging" | "Offline";
  odometerKm: number;
  driverId: string | null;
  hub: string;
  lat: number;
  lng: number;
  imei: string;
  createdAt: string;
}

export interface Driver {
  id: string;
  name: string;
  phone: string;
  email: string;
  licenseNo: string;
  vehicleReg: string | null;
  status: "Active" | "Inactive";
  joinedAt: string;
  address: string;
  city: string;
  state: string;
  pin: string;
}

export interface Trip {
  id: string;
  vehicleReg: string;
  driverName: string;
  startTime: string;
  endTime: string;
  distanceKm: number;
  startSoc: number;
  endSoc: number;
  energyKwh: number;
  avgSpeedKmh: number;
}

// Mirrors production's telemetry vehicle alerts (utils/alerts.js): the same
// eight alert types, with the per-type payloads getAlertSummary() reads.
export type AlertType =
  | "excessive_idle"
  | "low_aux_battery"
  | "low_soc_level_1"
  | "low_soc_level_2"
  | "low_soc_level_3"
  | "overspeed"
  | "overspeed_low_soc"
  | "repeated_fast_charging";

export interface Alert {
  id: string;
  alertType: AlertType;
  severity: "critical" | "warning" | "info";
  vehicleLicensePlate: string;
  payload: Record<string, number>;
  createdAt: string;
  resolved: boolean;
  resolvedAt: string | null;
}

// Mirrors the production charger-warnings feed (ChargerWarningsList /
// ChargerWarning): nested charger/connector/warningObject rows.
export interface ChargerWarning {
  id: string;
  charger: { id: string; name: string; hub: string };
  connector: {
    connectorId: number;
    status: ConnectorStatus;
    updatedAt: string;
  } | null;
  warningObject: {
    type: "ChargerOffline" | "ConnectorFaulted";
    status: "New" | "Ignore" | "Fixed";
    createdAt: string;
    offlineForHours: number | null;
    lastChecked: string | null;
    resolution: string;
  };
}

export interface PortalUser {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: "Admin" | "Fleet Manager" | "Viewer" | "Technician";
  status: "Active" | "Invited" | "Disabled";
  lastLoginAt: string | null;
}

export interface Wallet {
  id: string;
  userName: string;
  phone: string;
  balance: number;
  lastTopUpAt: string;
  txnCount: number;
}

export interface Suggestion {
  id: string;
  vehicleReg: string;
  currentCapPct: number;
  suggestedCapPct: number;
  unsafeDaysPct: number;
  estMonthlySavingPct: number;
  windowFrom: string;
  windowTo: string;
  status: "New" | "Applied" | "Dismissed";
}

// A vehicle sent away for service. A service is rarely instant — the van is
// off the road for days — so the task sits in this state between "due" and
// "done", and the fleet manager can see how long it has been gone.
export interface ServiceVisit {
  startedAt: string; // YYYY-MM-DD
  /** When it is expected back. Null when nobody would commit to a date. */
  expectedReturn: string | null;
  note: string | null;
}

export interface MaintenanceTask {
  id: string;
  evId: string; // Vehicle.id
  title: string;
  description: string | null;
  isRecurring: boolean;
  intervalKm: number | null;
  intervalMonths: number | null;
  dueKm: number | null;
  dueDate: string | null; // YYYY-MM-DD
  status: "ACTIVE" | "IN_SERVICE" | "COMPLETED";
  /** Set while the vehicle is away; cleared when the service is logged. */
  visit: ServiceVisit | null;
  createdAt: string;
}

export interface MaintenanceRecord {
  id: string;
  evId: string; // Vehicle.id
  taskId: string | null;
  taskTitle: string | null;
  serviceDate: string; // YYYY-MM-DD
  odometerKm: number | null;
  cost: number | null;
  notes: string | null;
  /** How long the vehicle was off the road, when it was booked in first. */
  daysOffRoad: number | null;
}

// A unit of work a fleet manager hands to someone. A charger fault and an
// overdue service are the same thing from their side — "this needs fixing, you
// do it, tell me when it's done" — so both raise the same object rather than
// two parallel systems. `source`/`sourceId` point back at whatever raised it.
export type WorkOrderSource = "CHARGER_WARNING" | "MAINTENANCE_TASK" | "MANUAL";
export type WorkOrderStatus = "Open" | "In progress" | "Blocked" | "Done";
export type WorkOrderPriority = "Low" | "Medium" | "High" | "Critical";

export interface WorkOrderEvent {
  at: string;
  /** Who acted — a portal user's name, or the signed-in demo user. */
  by: string;
  text: string;
}

export interface WorkOrder {
  id: string;
  /** Human reference, e.g. "WO-1042" — what people say out loud. */
  ref: string;
  source: WorkOrderSource;
  /** ChargerWarningRow.id / MaintenanceTask.id, or null when raised by hand. */
  sourceId: string | null;
  /** What the work is on: "CP-2, Kapashera" or "HR55AX1290". */
  subject: string;
  /** Deep link to the subject, when there is one. */
  subjectHref: string | null;
  hub: string | null;
  title: string;
  details: string | null;
  priority: WorkOrderPriority;
  /** PortalUser.id, or null while unassigned. */
  assigneeId: string | null;
  status: WorkOrderStatus;
  dueDate: string | null; // YYYY-MM-DD
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  activity: WorkOrderEvent[];
}

export interface Profile {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  company: string;
  zone: { zone: string; currency: string; currencySymbol: string };
  timeFormat: "12" | "24";
}

export interface Db {
  profile: Profile;
  chargepoints: Chargepoint[];
  sessions: ChargingSession[];
  vehicles: Vehicle[];
  drivers: Driver[];
  trips: Trip[];
  alerts: Alert[];
  chargerWarnings: ChargerWarning[];
  users: PortalUser[];
  wallets: Wallet[];
  suggestions: Suggestion[];
  maintenanceTasks: MaintenanceTask[];
  maintenanceRecords: MaintenanceRecord[];
  workOrders: WorkOrder[];
}

export type CollectionKey = Exclude<keyof Db, "profile">;
