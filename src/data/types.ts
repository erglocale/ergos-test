export type ConnectorStatus = "Available" | "Charging" | "Faulted" | "Unavailable";

export interface Connector {
  id: number;
  type: "IEC60309" | "Type2" | "CCS2" | "3-pin";
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
}

export interface Vehicle {
  id: string;
  reg: string;
  make: string;
  model: string;
  category: "3W Cargo" | "3W Passenger" | "2W" | "4W";
  batteryKwh: number;
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

export interface Alert {
  id: string;
  severity: "Critical" | "Warning" | "Info";
  type: string;
  message: string;
  source: string;
  time: string;
  acknowledged: boolean;
}

export interface PortalUser {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: "Admin" | "Fleet Manager" | "Viewer";
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

export interface MaintenanceTask {
  id: string;
  evId: string; // Vehicle.id
  taskType: "FLEET_TASK" | "OEM_SERVICE";
  title: string;
  description: string | null;
  isRecurring: boolean;
  intervalKm: number | null;
  intervalMonths: number | null;
  dueKm: number | null;
  dueDate: string | null; // YYYY-MM-DD
  status: "ACTIVE" | "COMPLETED";
  createdAt: string;
}

export interface MaintenanceRecord {
  id: string;
  evId: string; // Vehicle.id
  taskId: string | null;
  taskTitle: string | null;
  taskType: "FLEET_TASK" | "OEM_SERVICE" | null;
  serviceDate: string; // YYYY-MM-DD
  odometerKm: number | null;
  cost: number | null;
  vendor: string | null;
  notes: string | null;
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
  users: PortalUser[];
  wallets: Wallet[];
  suggestions: Suggestion[];
  maintenanceTasks: MaintenanceTask[];
  maintenanceRecords: MaintenanceRecord[];
}

export type CollectionKey = Exclude<keyof Db, "profile">;
