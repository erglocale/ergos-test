"use client";

// Work orders — the one object behind "assign this to someone".
//
// A charger fault and an overdue service are the same job from the fleet
// manager's side, so both raise the same row rather than two parallel systems.
// Everything that mutates one goes through here so the activity trail is
// written in exactly one place and can never drift from the status it records.

import dayjs from "dayjs";
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
    [status === "Done" ? "Marked done" : `Status changed to ${status}`],
  );
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
