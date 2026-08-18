"use client";

// The work orders board — everything that has been handed to someone, wherever
// it was raised from. Charger faults and vehicle servicing land in the same
// list because they are the same question for a fleet manager: what is
// outstanding, who has it, and what is late.

import { Button, Card, Col, Input, Row, Select, Table, Tag, Typography } from "antd";
import type { TableProps } from "antd";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { AlertTriangle, CheckCircle2, Plus, Search, UserX, Wrench } from "lucide-react";
import { useMemo, useState } from "react";
import AssignWorkModal from "@/components/workOrders/AssignWorkModal";
import WorkOrderDrawer from "@/components/workOrders/WorkOrderDrawer";
import {
  assigneeName,
  createWorkOrder,
  isOverdue,
  PRIORITY_TAG_COLOR,
  SOURCE_LABEL,
  STATUS_TAG_COLOR,
  WORK_ORDER_STATUSES,
} from "@/components/workOrders/workOrderUtils";
import { useDb } from "@/data/store";
import type { WorkOrder, WorkOrderStatus } from "@/data/types";
import { message } from "@/lib/antdStatic";

dayjs.extend(relativeTime);

const { Title, Text } = Typography;

const TILES = [
  { key: "open", label: "Open", icon: Wrench, color: "#2563eb", bg: "#eff6ff" },
  { key: "overdue", label: "Overdue", icon: AlertTriangle, color: "#dc2626", bg: "#fef2f2" },
  { key: "unassigned", label: "Unassigned", icon: UserX, color: "#d97706", bg: "#fffbeb" },
  {
    key: "doneThisWeek",
    label: "Done this week",
    icon: CheckCircle2,
    color: "#16a34a",
    bg: "#f0fdf4",
  },
] as const;

export default function WorkOrders() {
  const db = useDb();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"All" | "Outstanding" | WorkOrderStatus>(
    "Outstanding",
  );
  const [assigneeFilter, setAssigneeFilter] = useState<string | null>(null);
  const [hubFilter, setHubFilter] = useState<string | null>(null);
  const [open, setOpen] = useState<WorkOrder | null>(null);
  const [newOpen, setNewOpen] = useState(false);

  const counts = useMemo(() => {
    const weekAgo = dayjs().subtract(7, "day");
    return {
      open: db.workOrders.filter((o) => o.status !== "Done").length,
      overdue: db.workOrders.filter((o) => isOverdue(o)).length,
      unassigned: db.workOrders.filter((o) => o.status !== "Done" && !o.assigneeId).length,
      doneThisWeek: db.workOrders.filter(
        (o) => o.status === "Done" && o.closedAt && dayjs(o.closedAt).isAfter(weekAgo),
      ).length,
    };
  }, [db.workOrders]);

  const hubOptions = useMemo(
    () => Array.from(new Set(db.workOrders.map((o) => o.hub).filter(Boolean) as string[])).sort(),
    [db.workOrders],
  );

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return db.workOrders
      .filter((o) => {
        if (statusFilter === "Outstanding" && o.status === "Done") return false;
        if (
          statusFilter !== "All" &&
          statusFilter !== "Outstanding" &&
          o.status !== statusFilter
        )
          return false;
        if (assigneeFilter === "__none" && o.assigneeId) return false;
        if (assigneeFilter && assigneeFilter !== "__none" && o.assigneeId !== assigneeFilter)
          return false;
        if (hubFilter && o.hub !== hubFilter) return false;
        if (
          q &&
          !o.ref.toLowerCase().includes(q) &&
          !o.title.toLowerCase().includes(q) &&
          !o.subject.toLowerCase().includes(q)
        )
          return false;
        return true;
      })
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  }, [db.workOrders, search, statusFilter, assigneeFilter, hubFilter]);

  const columns: TableProps<WorkOrder>["columns"] = [
    {
      title: "Ref",
      key: "ref",
      width: 100,
      render: (_, o) => <Text strong>{o.ref}</Text>,
    },
    {
      title: "Work",
      key: "work",
      render: (_, o) => (
        <div>
          <div style={{ fontWeight: 500 }}>{o.title}</div>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {o.subject}
            {o.hub ? ` · ${o.hub}` : ""}
          </Text>
        </div>
      ),
    },
    {
      title: "Raised from",
      key: "source",
      width: 150,
      render: (_, o) => (
        <Text type="secondary" style={{ fontSize: 12 }}>
          {SOURCE_LABEL[o.source]}
        </Text>
      ),
    },
    {
      title: "Assigned to",
      key: "assignee",
      width: 160,
      render: (_, o) => assigneeName(o, db.users) ?? <Text type="secondary">Unassigned</Text>,
    },
    {
      title: "Priority",
      key: "priority",
      width: 110,
      render: (_, o) => <Tag color={PRIORITY_TAG_COLOR[o.priority]}>{o.priority}</Tag>,
    },
    {
      title: "Due",
      key: "due",
      width: 130,
      sorter: (a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""),
      render: (_, o) =>
        o.dueDate ? (
          <div style={{ fontSize: 13 }}>
            {dayjs(o.dueDate).format("DD MMM YYYY")}
            {isOverdue(o) && (
              <div style={{ fontSize: 11, color: "#dc2626" }}>
                {dayjs(o.dueDate).fromNow(true)} over
              </div>
            )}
          </div>
        ) : (
          "—"
        ),
    },
    {
      title: "Status",
      key: "status",
      width: 120,
      render: (_, o) => <Tag color={STATUS_TAG_COLOR[o.status]}>{o.status}</Tag>,
    },
    {
      title: "Updated",
      key: "updated",
      width: 130,
      render: (_, o) => (
        <Text type="secondary" style={{ fontSize: 12 }}>
          {dayjs(o.updatedAt).fromNow()}
        </Text>
      ),
    },
  ];

  return (
    <div style={{ padding: "0 16px" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 20,
        }}
      >
        <Title level={3} style={{ marginBottom: 0 }}>
          Work Orders
        </Title>
        <Button
          type="primary"
          icon={<Plus size={15} style={{ marginBottom: -2 }} />}
          onClick={() => setNewOpen(true)}
        >
          New work order
        </Button>
      </div>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        {TILES.map((tile) => {
          const Icon = tile.icon;
          return (
            <Col span={6} key={tile.key}>
              <Card
                style={{ borderRadius: 12, border: "1px solid #f0f0f0", height: "100%" }}
                styles={{
                  body: { padding: "20px 24px", display: "flex", alignItems: "center", gap: 16 },
                }}
              >
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 12,
                    backgroundColor: tile.bg,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <Icon size={24} color={tile.color} />
                </div>
                <div>
                  <p style={{ margin: 0, fontSize: 13, color: "#94a3b8", fontWeight: 500 }}>
                    {tile.label}
                  </p>
                  <p
                    style={{
                      margin: 0,
                      fontSize: 28,
                      fontWeight: 700,
                      color: tile.color,
                      lineHeight: 1.2,
                    }}
                  >
                    {counts[tile.key]}
                  </p>
                </div>
              </Card>
            </Col>
          );
        })}
      </Row>

      <div
        style={{
          marginBottom: 16,
          display: "flex",
          gap: 12,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <Input
          placeholder="Search reference, work or subject..."
          prefix={<Search size={16} color="#94a3b8" />}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          allowClear
          style={{ maxWidth: 320, borderRadius: 8, height: 40 }}
        />
        <Select
          style={{ minWidth: 170 }}
          value={statusFilter}
          onChange={(v) => setStatusFilter(v as typeof statusFilter)}
          options={[
            { label: "Outstanding", value: "Outstanding" },
            { label: "Status: All", value: "All" },
            ...WORK_ORDER_STATUSES.map((s) => ({ label: s, value: s })),
          ]}
        />
        <Select
          allowClear
          placeholder="Assignee: All"
          style={{ minWidth: 190 }}
          value={assigneeFilter || undefined}
          onChange={(v: string | undefined) => setAssigneeFilter(v || null)}
          options={[
            { label: "Unassigned", value: "__none" },
            ...db.users
              .filter((u) => db.workOrders.some((o) => o.assigneeId === u.id))
              .map((u) => ({ label: u.name, value: u.id })),
          ]}
        />
        <Select
          allowClear
          placeholder="Hub: All"
          style={{ minWidth: 160 }}
          value={hubFilter || undefined}
          onChange={(v: string | undefined) => setHubFilter(v || null)}
          options={hubOptions.map((h) => ({ label: h, value: h }))}
        />
      </div>

      <Card
        style={{
          width: "100%",
          borderRadius: 12,
          boxShadow: "0 2px 6px rgba(0, 0, 0, 0.04)",
          overflow: "hidden",
          border: "1px solid #f0f0f0",
        }}
        styles={{ body: { padding: 0 } }}
      >
        <Table<WorkOrder>
          columns={columns}
          dataSource={rows}
          rowKey="id"
          onRow={(o) => ({ onClick: () => setOpen(o), style: { cursor: "pointer" } })}
          pagination={{
            pageSize: 10,
            showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} work orders`,
            placement: ["bottomCenter"],
            hideOnSinglePage: true,
          }}
          scroll={{ x: "max-content" }}
          rowClassName={() => "custom-table-row"}
        />
      </Card>

      <WorkOrderDrawer order={open} onClose={() => setOpen(null)} />

      <AssignWorkModal
        open={newOpen}
        onClose={() => setNewOpen(false)}
        users={db.users}
        prefill={{
          source: "MANUAL",
          sourceId: null,
          subject: null,
          subjectHref: null,
          hub: null,
          title: "",
          details: null,
          priority: "Medium",
        }}
        onSubmit={({ subject, ...rest }) => {
          const created = createWorkOrder({
            source: "MANUAL",
            sourceId: null,
            subject: subject ?? "—",
            subjectHref: null,
            hub: null,
            ...rest,
          });
          setNewOpen(false);
          message.success(`${created.ref} raised`);
        }}
      />
    </div>
  );
}
