"use client";

// Work orders — the one object behind "assign this to someone".
//
// A charger fault and an overdue service are the same job from the fleet
// manager's side, so both raise the same row rather than two parallel systems.
// Everything that mutates one goes through here so the activity trail is
// written in exactly one place and can never drift from the status it records.

import dayjs from "dayjs";
import {
  cancelServiceVisit,
  completeTask,
  findTask,
  startServiceVisit,
} from "@/components/maintenance/taskActions";
import { createRow, getDb, nextId, updateRow } from "@/data/store";
import type {
  Db,
  PortalUser,
  WorkOrder,
  WorkOrderPriority,
  WorkOrderSource,
  WorkOrderStatus,
} from "@/data/types";

export const WORK_ORDER_STATUSES: WorkOrderStatus[] = [
  "Open",
  "In progress",
  "Blocked",
  "Done",
];

export const WORK_ORDER_PRIORITIES: WorkOrderPriority[] = [
  "Critical",
  "High",
  "Medium",
  "Low",
];

export const STATUS_TAG_COLOR: Record<WorkOrderStatus, string> = {
  Open: "blue",
  "In progress": "gold",
  Blocked: "volcano",
  Done: "green",
};

export const PRIORITY_TAG_COLOR: Record<WorkOrderPriority, string> = {
  Critical: "red",
  High: "orange",
  Medium: "blue",
  Low: "default",
};

/**
 * The same four states, in the words the subject uses. A charger is "in
 * progress" while someone works on it; a van is "in service", which is what
 * the maintenance page and the vehicle badge already say. The words are not
 * interchangeable either way round — a charger that is "in service" reads as
 * one that is working, the opposite of what the state means.
 */
const STATUS_LABEL_BY_SOURCE: Partial<
  Record<WorkOrderSource, Partial<Record<WorkOrderStatus, string>>>
> = {
  MAINTENANCE_TASK: {
    "In progress": "In service",
    Blocked: "Awaiting parts",
    Done: "Serviced",
  },
  CHARGER_WARNING: {
    "In progress": "On site",
    Done: "Fixed",
  },
};

/** What this order's status is called, given what it is on. */
export function statusLabel(
  order: Pick<WorkOrder, "source" | "status">,
): string {
  return STATUS_LABEL_BY_SOURCE[order.source]?.[order.status] ?? order.status;
}

/** Segmented/Select options for one order, in its own vocabulary. */
export function statusOptions(
  source: WorkOrderSource,
): { value: WorkOrderStatus; label: string }[] {
  return WORK_ORDER_STATUSES.map((value) => ({
    value,
    label: STATUS_LABEL_BY_SOURCE[source]?.[value] ?? value,
  }));
}

/** Every name a state goes by, for the board's filter across all sources. */
export function statusFilterLabel(status: WorkOrderStatus): string {
  const names = new Set<string>([status]);
  for (const map of Object.values(STATUS_LABEL_BY_SOURCE)) {
    if (map?.[status]) names.add(map[status]!);
  }
  return Array.from(names).join(" / ");
}

export const SOURCE_LABEL: Record<WorkOrderSource, string> = {
  CHARGER_WARNING: "Charger alert",
  MAINTENANCE_TASK: "Maintenance task",
  MANUAL: "Raised manually",
};

/** Who can be given work: technicians first, then anyone who can act on it. */
export function assignableUsers(users: PortalUser[]): PortalUser[] {
  const rank = (u: PortalUser) =>
    u.role === "Technician" ? 0 : u.role === "Fleet Manager" ? 1 : 2;
  return users
    .filter((u) => u.status !== "Disabled" && u.role !== "Viewer")
    .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

export function assigneeName(
  order: Pick<WorkOrder, "assigneeId">,
  users: PortalUser[],
): string | null {
  if (!order.assigneeId) return null;
  return users.find((u) => u.id === order.assigneeId)?.name ?? null;
}

/** The signed-in demo user — the "by" on anything done from the UI. */
export function actorName(db: Db): string {
  const name = `${db.profile.firstName} ${db.profile.lastName}`.trim();
  return name || "Fleet manager";
}

/** Open work orders raised from a given warning row or maintenance task. */
export function workOrdersForSource(
  orders: WorkOrder[],
  sourceId: string,
): WorkOrder[] {
  return orders.filter((o) => o.sourceId === sourceId);
}

/** The one to show on a source row: the live one, else the most recent. */
export function primaryWorkOrder(
  orders: WorkOrder[],
  sourceId: string,
): WorkOrder | null {
  const mine = workOrdersForSource(orders, sourceId);
  if (!mine.length) return null;
  const open = mine.filter((o) => o.status !== "Done");
  const pool = open.length ? open : mine;
  return pool.reduce((latest, o) => (o.createdAt > latest.createdAt ? o : latest));
}

/** Past its due date and not finished. */
export function isOverdue(order: WorkOrder, now: dayjs.Dayjs = dayjs()): boolean {
  if (!order.dueDate || order.status === "Done") return false;
  return dayjs(order.dueDate).isBefore(now, "day");
}

function nextRef(orders: WorkOrder[]): string {
  const max = orders.reduce((m, o) => {
    const n = Number(o.ref.replace(/^\D+/, ""));
    return Number.isFinite(n) && n > m ? n : m;
  }, 1040);
  return `WO-${max + 1}`;
}

export interface NewWorkOrder {
  source: WorkOrderSource;
  sourceId: string | null;
  subject: string;
  subjectHref: string | null;
  hub: string | null;
  title: string;
  details: string | null;
  priority: WorkOrderPriority;
  assigneeId: string | null;
  dueDate: string | null;
  /** Optional first note from the person raising it. */
  note?: string | null;
}

/** Raise a work order and record who raised and assigned it. */
export function createWorkOrder(input: NewWorkOrder): WorkOrder {
  const db = getDb();
  const by = actorName(db);
  const at = new Date().toISOString();
  const assignee = input.assigneeId
    ? db.users.find((u) => u.id === input.assigneeId)
    : undefined;
  const activity = [
    {
      at,
      by,
      text:
        input.source === "MANUAL"
          ? "Work order raised"
          : `Work order raised from ${SOURCE_LABEL[input.source].toLowerCase()}`,
    },
  ];
  if (assignee) activity.push({ at, by, text: `Assigned to ${assignee.name}` });
  if (input.note?.trim()) activity.push({ at, by, text: input.note.trim() });

  const order: WorkOrder = {
    id: nextId("workOrders", "wo"),
    ref: nextRef(db.workOrders),
    source: input.source,
    sourceId: input.sourceId,
    subject: input.subject,
    subjectHref: input.subjectHref,
    hub: input.hub,
    title: input.title,
    details: input.details,
    priority: input.priority,
    assigneeId: input.assigneeId,
    status: "Open",
    dueDate: input.dueDate,
    createdAt: at,
    updatedAt: at,
    closedAt: null,
    activity,
  };
  createRow("workOrders", order);
  return order;
}

/** Append to the trail and stamp updatedAt. All mutations go through this. */
function amend(
  order: WorkOrder,
  patch: Partial<WorkOrder>,
  entries: string[],
): void {
  const at = new Date().toISOString();
  const by = actorName(getDb());
  updateRow("workOrders", order.id, {
    ...patch,
    updatedAt: at,
    activity: [...order.activity, ...entries.map((text) => ({ at, by, text }))],
  });
}

export function setWorkOrderStatus(order: WorkOrder, status: WorkOrderStatus): void {
  if (order.status === status) return;
  amend(
    order,
    {
      status,
      closedAt: status === "Done" ? new Date().toISOString() : null,
    },
    [
      status === "Done"
        ? `Marked ${statusLabel({ source: order.source, status })}`
        : `Status changed to ${statusLabel({ source: order.source, status })}`,
    ],
  );
  mirrorOntoMaintenance(order, status);
}

/**
 * Push a status change back onto the maintenance task it was raised from.
 * Without this the board and the maintenance page contradict each other: a
 * work order marked done leaves the van sitting there overdue, and one moved
 * to "in service" leaves it looking like it is still on the road.
 *
 * Each branch is a no-op when the task is already in that state, so the
 * maintenance page driving the work order does not bounce back.
 */
function mirrorOntoMaintenance(order: WorkOrder, status: WorkOrderStatus): void {
  if (order.source !== "MAINTENANCE_TASK" || !order.sourceId) return;
  const task = findTask(order.sourceId);
  if (!task || task.status === "COMPLETED") return;

  if (status === "In progress") {
    if (task.status === "IN_SERVICE") return;
    startServiceVisit(task, {
      startedAt: dayjs().format("YYYY-MM-DD"),
      // Whatever the work order promised is the date to chase the garage on.
      expectedReturn: order.dueDate,
      vendor: null,
      note: `Booked in from ${order.ref}`,
    });
    return;
  }

  if (status === "Open") {
    // Reopened: the vehicle is not with anyone, so it is back on the road.
    cancelServiceVisit(task);
    return;
  }

  if (status === "Done") {
    // "Serviced" has to mean serviced on both screens, so log the record with
    // what is known — the garage that had it and today's odometer.
    completeTask(task, {
      serviceDate: dayjs().format("YYYY-MM-DD"),
      odometerKm:
        getDb().vehicles.find((v) => v.id === task.evId)?.odometerKm ?? null,
      cost: null,
      vendor: task.visit?.vendor ?? null,
      notes: `Logged from ${order.ref}`,
    });
  }
  // "Blocked" / "Awaiting parts" leaves the visit alone: waiting on a part is
  // something that happens while the vehicle is still up on the ramp.
}

export function reassignWorkOrder(order: WorkOrder, assigneeId: string | null): void {
  if (order.assigneeId === assigneeId) return;
  const name = assigneeId
    ? (getDb().users.find((u) => u.id === assigneeId)?.name ?? "someone else")
    : null;
  amend(order, { assigneeId }, [name ? `Assigned to ${name}` : "Unassigned"]);
}

export function setWorkOrderPriority(order: WorkOrder, priority: WorkOrderPriority): void {
  if (order.priority === priority) return;
  amend(order, { priority }, [`Priority set to ${priority}`]);
}

export function setWorkOrderDueDate(order: WorkOrder, dueDate: string | null): void {
  if (order.dueDate === dueDate) return;
  amend(order, { dueDate }, [
    dueDate ? `Due date set to ${dayjs(dueDate).format("DD MMM YYYY")}` : "Due date cleared",
  ]);
}

export function addWorkOrderNote(order: WorkOrder, note: string): void {
  const text = note.trim();
  if (!text) return;
  amend(order, {}, [text]);
}

/**
 * Close whatever is open against a source, used when the underlying task is
 * completed elsewhere — logging a service shouldn't leave its work order open.
 */
export function closeWorkOrdersForSource(sourceId: string, reason: string): void {
  const at = new Date().toISOString();
  const by = actorName(getDb());
  for (const o of getDb().workOrders) {
    if (o.sourceId !== sourceId || o.status === "Done") continue;
    updateRow("workOrders", o.id, {
      status: "Done",
      closedAt: at,
      updatedAt: at,
      activity: [...o.activity, { at, by, text: reason }],
    });
  }
}
