// Replaces the backend enrichment that production's /host/maintenance
// endpoint performed: joins vehicles onto tasks/records and computes
// km/date remaining + due status client-side from the dummy store.
import dayjs from "dayjs";
import type { Db, MaintenanceRecord, MaintenanceTask } from "@/data/types";

export interface MaintenanceEv {
  id: string;
  licensePlate: string;
  make: string;
  model: string;
}

export type DueStatus = "OVERDUE" | "DUE_SOON" | "ON_TRACK" | "UNKNOWN";

export interface EnrichedMaintenanceTask extends MaintenanceTask {
  Ev: MaintenanceEv | null;
  currentKm: number | null;
  kmRemaining: number | null;
  daysRemaining: number | null;
  dueStatus: DueStatus;
  telemetryStale?: boolean;
  /** Days the vehicle has been off the road, while a visit is open. */
  daysInService: number | null;
  /** Still away past the date it was due back. */
  returnOverdue: boolean;
}

export interface EnrichedMaintenanceRecord extends MaintenanceRecord {
  Ev: MaintenanceEv | null;
  Task: { title: string } | null;
}

export interface MaintenanceCounts {
  overdue: number;
  dueSoon: number;
  onTrack: number;
  inService: number;
}

function joinEv(db: Db, evId: string): {
  ev: MaintenanceEv | null;
  currentKm: number | null;
} {
  const v = db.vehicles.find((vehicle) => vehicle.id === evId);
  if (!v) return { ev: null, currentKm: null };
  return {
    ev: { id: v.id, licensePlate: v.reg, make: v.make, model: v.model },
    currentKm: v.odometerKm,
  };
}

export function deriveMaintenance(db: Db): {
  tasks: EnrichedMaintenanceTask[];
  counts: MaintenanceCounts;
} {
  const today = dayjs().startOf("day");
  const tasks: EnrichedMaintenanceTask[] = db.maintenanceTasks
    // A task with the vehicle away for service is still outstanding work — it
    // stays on the board until the service is logged.
    .filter((t) => t.status === "ACTIVE" || t.status === "IN_SERVICE")
    .map((t) => {
      const { ev, currentKm } = joinEv(db, t.evId);
      const kmRemaining =
        t.dueKm != null && currentKm != null ? t.dueKm - currentKm : null;
      const daysRemaining =
        t.dueDate != null
          ? dayjs(t.dueDate).startOf("day").diff(today, "day")
          : null;
      let dueStatus: DueStatus;
      if (
        (kmRemaining != null && kmRemaining < 0) ||
        (daysRemaining != null && daysRemaining < 0)
      ) {
        dueStatus = "OVERDUE";
      } else if (
        (kmRemaining != null && kmRemaining <= 500) ||
        (daysRemaining != null && daysRemaining <= 14)
      ) {
        dueStatus = "DUE_SOON";
      } else if (kmRemaining != null || daysRemaining != null) {
        dueStatus = "ON_TRACK";
      } else {
        dueStatus = "UNKNOWN";
      }
      const daysInService =
        t.visit != null ? today.diff(dayjs(t.visit.startedAt).startOf("day"), "day") : null;
      const returnOverdue =
        t.visit?.expectedReturn != null &&
        dayjs(t.visit.expectedReturn).startOf("day").isBefore(today);
      return {
        ...t,
        Ev: ev,
        currentKm,
        kmRemaining,
        daysRemaining,
        dueStatus,
        daysInService,
        returnOverdue,
      };
    });

  const counts: MaintenanceCounts = {
    overdue: tasks.filter((t) => t.dueStatus === "OVERDUE").length,
    dueSoon: tasks.filter((t) => t.dueStatus === "DUE_SOON").length,
    onTrack: tasks.filter((t) => t.dueStatus === "ON_TRACK").length,
    inService: tasks.filter((t) => t.status === "IN_SERVICE").length,
  };

  return { tasks, counts };
}

export function deriveRecords(db: Db): EnrichedMaintenanceRecord[] {
  return db.maintenanceRecords
    .map((r) => ({
      ...r,
      Ev: joinEv(db, r.evId).ev,
      Task: r.taskTitle != null ? { title: r.taskTitle } : null,
    }))
    .sort((a, b) => (a.serviceDate < b.serviceDate ? 1 : -1));
}

/** What is showing on a vehicle that is away being serviced. */
export interface VehicleServiceInfo {
  taskId: string;
  title: string;
  expectedReturn: string | null;
  daysInService: number;
  returnOverdue: boolean;
}

/**
 * Vehicles currently away for service, keyed by vehicle id. Derived from the
 * maintenance tasks rather than stored on the vehicle: `Vehicle.status` is what
 * telematics reports, and overwriting it would break the running/idle counts
 * and the map. Being off the road is a fleet fact layered on top of that.
 */
export function vehiclesInService(db: Db): Map<string, VehicleServiceInfo> {
  const today = dayjs().startOf("day");
  const out = new Map<string, VehicleServiceInfo>();
  for (const t of db.maintenanceTasks) {
    if (t.status !== "IN_SERVICE" || !t.visit) continue;
    const info: VehicleServiceInfo = {
      taskId: t.id,
      title: t.title,
      expectedReturn: t.visit.expectedReturn,
      daysInService: today.diff(dayjs(t.visit.startedAt).startOf("day"), "day"),
      returnOverdue:
        t.visit.expectedReturn != null &&
        dayjs(t.visit.expectedReturn).startOf("day").isBefore(today),
    };
    // Two open jobs on one van: show the one that has been in longest.
    const seen = out.get(t.evId);
    if (!seen || info.daysInService > seen.daysInService) out.set(t.evId, info);
  }
  return out;
}
