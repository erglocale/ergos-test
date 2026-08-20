"use client";

// The "assign this" control that sits on a charger alert or maintenance row.
// Unassigned rows show a link; assigned ones show the work order's reference,
// who has it and where it has got to — clicking either opens the same drawer
// the Work Orders board uses, so there is one place the state lives.

import { Button, Tag, Tooltip, Typography } from "antd";
import { UserPlus } from "lucide-react";
import { useState } from "react";
import { useDb } from "@/data/store";
import { message } from "@/lib/antdStatic";
import AssignWorkModal, { type AssignPrefill } from "./AssignWorkModal";
import WorkOrderDrawer from "./WorkOrderDrawer";
import {
  assigneeName,
  createWorkOrder,
  isOverdue,
  primaryWorkOrder,
  STATUS_TAG_COLOR,
  statusLabel,
} from "./workOrderUtils";

const { Text } = Typography;

/** "Ravi Kalita" -> "Ravi K." so the chip fits in a table cell. */
function shortName(name: string): string {
  const [first, ...rest] = name.split(" ");
  return rest.length ? `${first} ${rest[rest.length - 1][0]}.` : first;
}

export default function WorkOrderCell({
  prefill,
  compact = false,
  inline = false,
}: {
  /** What would be raised if there is nothing here yet. */
  prefill: AssignPrefill;
  /** Icon-only, for rows that already have a crowded actions column. */
  compact?: boolean;
  /** Chip and name on one line, for sitting underneath other cell content. */
  inline?: boolean;
}) {
  const db = useDb();
  const [assignOpen, setAssignOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const order = prefill.sourceId ? primaryWorkOrder(db.workOrders, prefill.sourceId) : null;
  const who = order ? assigneeName(order, db.users) : null;

  const modal = (
    <AssignWorkModal
      open={assignOpen}
      onClose={() => setAssignOpen(false)}
      prefill={prefill}
      users={db.users}
      onSubmit={({ subject, ...rest }) => {
        const created = createWorkOrder({
          source: prefill.source,
          sourceId: prefill.sourceId,
          subject: subject ?? prefill.subject ?? "—",
          subjectHref: prefill.subjectHref,
          hub: prefill.hub,
          ...rest,
        });
        setAssignOpen(false);
        message.success(rest.assigneeId ? `${created.ref} assigned` : `${created.ref} raised`);
      }}
    />
  );

  if (!order) {
    return (
      <>
        {compact ? (
          <Tooltip title="Assign work">
            <Button
              size="small"
              type="text"
              icon={<UserPlus size={14} color="#64748b" />}
              onClick={(e) => {
                e.stopPropagation();
                setAssignOpen(true);
              }}
            />
          </Tooltip>
        ) : (
          <Button
            size="small"
            type="link"
            style={{ paddingLeft: 0 }}
            icon={<UserPlus size={13} style={{ marginBottom: -2 }} />}
            onClick={() => setAssignOpen(true)}
          >
            Assign
          </Button>
        )}
        {modal}
      </>
    );
  }

  const chip = (
    <Tag
      color={STATUS_TAG_COLOR[order.status]}
      // The chip only has room for the reference, so the state it is coloured
      // by is spelled out on hover — in this subject's words.
      title={`${order.title} — ${statusLabel(order)}`}
      style={{ cursor: "pointer", marginInlineEnd: 0 }}
      onClick={(e) => {
        e.stopPropagation();
        setDrawerOpen(true);
      }}
    >
      {order.ref}
    </Tag>
  );

  return (
    <>
      {compact ? (
        <Tooltip
          title={`${order.ref} · ${statusLabel(order)}${who ? ` · ${who}` : ""}`}
        >
          {chip}
        </Tooltip>
      ) : inline ? (
        <div
          style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}
          onClick={() => setDrawerOpen(true)}
        >
          {chip}
          <Text style={{ fontSize: 12 }}>{who ? shortName(who) : "Unassigned"}</Text>
          {isOverdue(order) && (
            <Text style={{ fontSize: 11, color: "#dc2626" }}>Overdue</Text>
          )}
        </div>
      ) : (
        <div
          style={{ cursor: "pointer", lineHeight: 1.4 }}
          onClick={() => setDrawerOpen(true)}
        >
          {chip}
          <div style={{ marginTop: 4 }}>
            <Text style={{ fontSize: 12 }}>{who ? shortName(who) : "Unassigned"}</Text>
            {isOverdue(order) && (
              <Text style={{ fontSize: 11, color: "#dc2626", marginLeft: 6 }}>Overdue</Text>
            )}
          </div>
        </div>
      )}
      <WorkOrderDrawer
        order={drawerOpen ? order : null}
        onClose={() => setDrawerOpen(false)}
      />
    </>
  );
}
