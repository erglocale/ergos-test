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
}

export interface EnrichedMaintenanceRecord extends MaintenanceRecord {
  Ev: MaintenanceEv | null;
  Task: { title: string; taskType: MaintenanceRecord["taskType"] } | null;
}

export interface MaintenanceCounts {
  overdue: number;
  dueSoon: number;
  onTrack: number;
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
    .filter((t) => t.status === "ACTIVE")
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
      return { ...t, Ev: ev, currentKm, kmRemaining, daysRemaining, dueStatus };
    });

  const counts: MaintenanceCounts = {
    overdue: tasks.filter((t) => t.dueStatus === "OVERDUE").length,
    dueSoon: tasks.filter((t) => t.dueStatus === "DUE_SOON").length,
    onTrack: tasks.filter((t) => t.dueStatus === "ON_TRACK").length,
  };

  return { tasks, counts };
}

export function deriveRecords(db: Db): EnrichedMaintenanceRecord[] {
  return db.maintenanceRecords
    .map((r) => ({
      ...r,
      Ev: joinEv(db, r.evId).ev,
      Task:
        r.taskTitle != null
          ? { title: r.taskTitle, taskType: r.taskType }
          : null,
    }))
    .sort((a, b) => (a.serviceDate < b.serviceDate ? 1 : -1));
}
