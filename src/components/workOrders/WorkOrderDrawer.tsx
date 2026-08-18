"use client";

// One work order, opened from wherever it was raised or from the board. Status,
// assignee, priority and due date are all editable in place — every change is
// appended to the activity trail below, so the drawer doubles as the audit log.

import { Button, DatePicker, Drawer, Input, Segmented, Select, Tag, Typography } from "antd";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import Link from "next/link";
import { useState } from "react";
import { useDb } from "@/data/store";
import type { WorkOrder, WorkOrderPriority, WorkOrderStatus } from "@/data/types";
import { DATE_FORMAT } from "@/lib/dateFormat";
import {
  addWorkOrderNote,
  assignableUsers,
  isOverdue,
  PRIORITY_TAG_COLOR,
  reassignWorkOrder,
  setWorkOrderDueDate,
  setWorkOrderPriority,
  setWorkOrderStatus,
  SOURCE_LABEL,
  STATUS_TAG_COLOR,
  WORK_ORDER_PRIORITIES,
  WORK_ORDER_STATUSES,
} from "./workOrderUtils";

dayjs.extend(relativeTime);

const { Text, Title } = Typography;
const { TextArea } = Input;

/** Where the work order came from, as a link back to that page. */
function sourceHref(order: WorkOrder): string | null {
  if (order.source === "CHARGER_WARNING") return "/alerts";
  if (order.source === "MAINTENANCE_TASK") return "/maintenance";
  return null;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 6 }}>
        {label}
      </Text>
      {children}
    </div>
  );
}

export default function WorkOrderDrawer({
  order,
  onClose,
}: {
  order: WorkOrder | null;
  onClose: () => void;
}) {
  const db = useDb();
  const [note, setNote] = useState("");

  // The row in the drawer must follow the store, not the snapshot it was
  // opened with, or an edit made here would not show until it is reopened.
  const live = order ? (db.workOrders.find((o) => o.id === order.id) ?? order) : null;

  return (
    <Drawer
      open={!!live}
      onClose={onClose}
      width={520}
      title={
        live && (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span>{live.ref}</span>
            <Tag color={STATUS_TAG_COLOR[live.status]}>{live.status}</Tag>
            {isOverdue(live) && <Tag color="red">Overdue</Tag>}
          </div>
        )
      }
    >
      {live && (
        <>
          <Title level={5} style={{ marginTop: 0 }}>
            {live.title}
          </Title>
          {live.details && (
            <Text type="secondary" style={{ display: "block", marginBottom: 16 }}>
              {live.details}
            </Text>
          )}

          <Field label="On">
            {live.subjectHref ? (
              <Link href={live.subjectHref}>{live.subject}</Link>
            ) : (
              <Text strong>{live.subject}</Text>
            )}
            {live.hub && (
              <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
                {live.hub}
              </Text>
            )}
          </Field>

          <Field label="Raised from">
            {sourceHref(live) ? (
              <Link href={sourceHref(live)!}>{SOURCE_LABEL[live.source]}</Link>
            ) : (
              SOURCE_LABEL[live.source]
            )}
            <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
              {dayjs(live.createdAt).format("DD MMM YYYY, h:mm A")}
            </Text>
          </Field>

          <Field label="Status">
            <Segmented
              value={live.status}
              options={WORK_ORDER_STATUSES}
              onChange={(v) => setWorkOrderStatus(live, v as WorkOrderStatus)}
              block
            />
          </Field>

          <div style={{ display: "flex", gap: 12 }}>
            <div style={{ flex: 1 }}>
              <Field label="Assigned to">
                <Select
                  style={{ width: "100%" }}
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  placeholder="Unassigned"
                  value={live.assigneeId ?? undefined}
                  onChange={(v) => reassignWorkOrder(live, v ?? null)}
                  options={assignableUsers(db.users).map((u) => ({
                    value: u.id,
                    label: `${u.name} · ${u.role}`,
                  }))}
                />
              </Field>
            </div>
            <div style={{ width: 150 }}>
              <Field label="Priority">
                <Select
                  style={{ width: "100%" }}
                  value={live.priority}
                  onChange={(v) => setWorkOrderPriority(live, v as WorkOrderPriority)}
                  options={WORK_ORDER_PRIORITIES.map((p) => ({
                    value: p,
                    label: <Tag color={PRIORITY_TAG_COLOR[p]}>{p}</Tag>,
                  }))}
                />
              </Field>
            </div>
          </div>

          <Field label="Due by">
            <DatePicker
              style={{ width: "100%" }}
              format={DATE_FORMAT}
              value={live.dueDate ? dayjs(live.dueDate) : null}
              onChange={(d) => setWorkOrderDueDate(live, d ? d.format("YYYY-MM-DD") : null)}
            />
          </Field>

          <div
            style={{
              borderTop: "1px solid #f0f0f0",
              marginTop: 8,
              paddingTop: 16,
            }}
          >
            <Text type="secondary" style={{ fontSize: 12 }}>
              Activity
            </Text>
            <div style={{ marginTop: 12 }}>
              {[...live.activity].reverse().map((e, i) => (
                <div
                  key={`${e.at}-${i}`}
                  style={{
                    display: "flex",
                    gap: 10,
                    paddingBottom: 12,
                    alignItems: "flex-start",
                  }}
                >
                  <span
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: "50%",
                      background: "#d1d5db",
                      marginTop: 6,
                      flexShrink: 0,
                    }}
                  />
                  <div>
                    <div style={{ fontSize: 13 }}>{e.text}</div>
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      {e.by} · {dayjs(e.at).format("DD MMM, h:mm A")}
                    </Text>
                  </div>
                </div>
              ))}
            </div>

            <TextArea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add a note..."
            />
            <Button
              style={{ marginTop: 8 }}
              disabled={!note.trim()}
              onClick={() => {
                addWorkOrderNote(live, note);
                setNote("");
              }}
            >
              Add note
            </Button>
          </div>
        </>
      )}
    </Drawer>
  );
}
