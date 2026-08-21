"use client";

// Everything that changes the state of a maintenance task lives here, so the
// maintenance page and the work orders board cannot drive them apart. Closing
// a work order and ticking the task off are the same act described from two
// screens; they must land on the same rows.
//
// This module deliberately knows nothing about work orders — the dependency
// runs the other way, from workOrderUtils into here.

import dayjs from "dayjs";
import { createRow, getDb, nextId, updateRow } from "@/data/store";
import type {
  MaintenanceRecord,
  MaintenanceTask,
  ServiceVisit,
} from "@/data/types";

export function findTask(taskId: string): MaintenanceTask | undefined {
  return getDb().maintenanceTasks.find((t) => t.id === taskId);
}

/** Send the vehicle away for service, or revise a visit already open. */
export function startServiceVisit(
  task: MaintenanceTask,
  visit: ServiceVisit,
): void {
  updateRow("maintenanceTasks", task.id, { status: "IN_SERVICE", visit });
}

/** The vehicle came back without the work being done. */
export function cancelServiceVisit(task: MaintenanceTask): void {
  if (task.status !== "IN_SERVICE") return;
  updateRow("maintenanceTasks", task.id, { status: "ACTIVE", visit: null });
}

export interface CompleteTaskInput {
  serviceDate: string; // YYYY-MM-DD
  odometerKm: number | null;
  cost: number | null;
  notes: string | null;
}

/**
 * Log the service and close the task off. Recurring tasks roll their next due
 * point forward from the reading given here rather than being retired.
 */
export function completeTask(
  task: MaintenanceTask,
  input: CompleteTaskInput,
): void {
  const db = getDb();
  const currentKm = db.vehicles.find((v) => v.id === task.evId)?.odometerKm ?? null;

  const record: MaintenanceRecord = {
    id: nextId("maintenanceRecords", "mr"),
    evId: task.evId,
    taskId: task.id,
    taskTitle: task.title,
    serviceDate: input.serviceDate,
    odometerKm: input.odometerKm,
    cost: input.cost,
    notes: input.notes,
    daysOffRoad: task.visit
      ? Math.max(
          0,
          dayjs(input.serviceDate)
            .startOf("day")
            .diff(dayjs(task.visit.startedAt).startOf("day"), "day"),
        )
      : null,
  };
  createRow("maintenanceRecords", record);

  // Keep km tracking calibrated, like the production backend.
  if (
    input.odometerKm != null &&
    (currentKm == null || input.odometerKm > currentKm)
  ) {
    updateRow("vehicles", task.evId, { odometerKm: input.odometerKm });
  }

  if (task.isRecurring) {
    // Roll the next due point forward from the service just logged.
    const anchorKm = input.odometerKm ?? currentKm ?? 0;
    updateRow("maintenanceTasks", task.id, {
      dueKm: task.intervalKm != null ? anchorKm + task.intervalKm : null,
      dueDate: task.intervalMonths
        ? dayjs(input.serviceDate)
            .add(task.intervalMonths, "month")
            .format("YYYY-MM-DD")
        : null,
      status: "ACTIVE",
      // Back on the road — the next occurrence starts from a clean sheet.
      visit: null,
    });
  } else {
    updateRow("maintenanceTasks", task.id, {
      status: "COMPLETED",
      visit: null,
    });
  }
}
