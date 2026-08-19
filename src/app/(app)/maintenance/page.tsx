"use client";

import {
  Button,
  Card,
  Col,
  Input,
  message,
  Popconfirm,
  Row,
  Segmented,
  Table,
  Tabs,
  Tooltip,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { format } from "date-fns";
import dayjs from "dayjs";
import {
  AlertTriangle,
  CalendarClock,
  Check,
  CheckCircle2,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import CompleteTaskModal, {
  CompleteTaskPayload,
} from "@/components/maintenance/CompleteTaskModal";
import {
  deriveMaintenance,
  deriveRecords,
  type DueStatus,
  type EnrichedMaintenanceRecord,
  type EnrichedMaintenanceTask,
  type MaintenanceEv,
} from "@/components/maintenance/derive";
import TaskFormModal, {
  TaskFormPayload,
} from "@/components/maintenance/TaskFormModal";
import WorkOrderCell from "@/components/workOrders/WorkOrderCell";
import { closeWorkOrdersForSource } from "@/components/workOrders/workOrderUtils";
import { createRow, nextId, removeRow, updateRow, useDb } from "@/data/store";
import type {
  MaintenanceRecord,
  MaintenanceTask,
  WorkOrderPriority,
} from "@/data/types";

const { Title } = Typography;

const STATUS_META: Record<
  DueStatus,
  { label: string; color: string; bg: string }
> = {
  OVERDUE: { label: "Overdue", color: "#dc2626", bg: "#fef2f2" },
  DUE_SOON: { label: "Due soon", color: "#d97706", bg: "#fffbeb" },
  ON_TRACK: { label: "On track", color: "#16a34a", bg: "#f0fdf4" },
  UNKNOWN: { label: "Needs odometer", color: "#64748b", bg: "#f8fafc" },
};

const SUMMARY_CARDS = [
  {
    key: "overdue",
    label: "Overdue",
    icon: AlertTriangle,
    color: "#dc2626",
    bg: "#fef2f2",
  },
  {
    key: "dueSoon",
    label: "Due soon",
    icon: CalendarClock,
    color: "#d97706",
    bg: "#fffbeb",
  },
  {
    key: "onTrack",
    label: "On track",
    icon: CheckCircle2,
    color: "#16a34a",
    bg: "#f0fdf4",
  },
] as const;

function StatusPill({ dueStatus }: { dueStatus: DueStatus }) {
  const meta = STATUS_META[dueStatus];
  if (!meta) return "—";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        backgroundColor: meta.bg,
        color: meta.color,
        borderRadius: 999,
        padding: "2px 10px",
        fontSize: 12,
        fontWeight: 600,
        whiteSpace: "nowrap",
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          backgroundColor: meta.color,
        }}
      />
      {meta.label}
    </span>
  );
}

function VehicleCell({ ev }: { ev: MaintenanceEv | null }) {
  if (!ev) return "—";
  return (
    <Link href={`/vehicles/${ev.id}`} style={{ color: "inherit" }}>
      <div style={{ fontWeight: 600, color: "#1e293b" }}>
        {ev.licensePlate || `EV #${ev.id}`}
      </div>
      {ev.make && (
        <div style={{ fontSize: 12, color: "#94a3b8" }}>
          {ev.make} {ev.model}
        </div>
      )}
    </Link>
  );
}

// How urgent the job is when it is handed to someone: already late is this
// week's work, due soon is next week's, everything else is planning.
const WORK_PRIORITY: Record<DueStatus, WorkOrderPriority> = {
  OVERDUE: "High",
  DUE_SOON: "Medium",
  ON_TRACK: "Low",
  UNKNOWN: "Low",
};

const formatKm = (value: number | null | undefined) =>
  value != null ? `${Math.round(Number(value)).toLocaleString()} km` : null;

function VehicleStatusTab({
  tasks,
  isLoading,
  onComplete,
  onEdit,
  onDelete,
  deleting,
}: {
  tasks: EnrichedMaintenanceTask[];
  isLoading: boolean;
  onComplete: (row: EnrichedMaintenanceTask) => void;
  onEdit: (row: EnrichedMaintenanceTask) => void;
  onDelete: (row: EnrichedMaintenanceTask) => void;
  deleting: boolean;
}) {
  const columns: ColumnsType<EnrichedMaintenanceTask> = [
    {
      title: "Vehicle",
      key: "vehicle",
      render: (_, row) => <VehicleCell ev={row.Ev} />,
    },
    {
      title: "Type",
      key: "type",
      render: (_, row) => (
        <div>
          <div style={{ fontWeight: 500 }}>{row.title}</div>
          <div style={{ fontSize: 12, color: "#94a3b8" }}>
            {row.taskType === "OEM_SERVICE" ? "OEM service" : "Fleet task"}
          </div>
        </div>
      ),
    },
    {
      title: "Recurring",
      key: "recurring",
      render: (_, row) => (row.isRecurring ? "Yes" : "—"),
    },
    {
      title: "Due (km)",
      key: "dueKm",
      render: (_, row) => {
        if (row.dueKm == null) return "—";
        const over = row.kmRemaining != null && row.kmRemaining < 0;
        return (
          <div>
            <div style={{ fontWeight: 500 }}>{formatKm(row.dueKm)}</div>
            <div
              style={{
                fontSize: 12,
                color: over ? "#dc2626" : "#94a3b8",
              }}
            >
              {row.kmRemaining == null
                ? row.telemetryStale
                  ? "km estimate unavailable"
                  : "no odometer reading"
                : over
                  ? `${formatKm(-row.kmRemaining)} over`
                  : `${formatKm(row.kmRemaining)} left`}
            </div>
          </div>
        );
      },
    },
    {
      title: "Due (date)",
      key: "dueDate",
      render: (_, row) => {
        if (!row.dueDate) return "—";
        const over = row.daysRemaining != null && row.daysRemaining < 0;
        return (
          <div>
            <div style={{ fontWeight: 500 }}>
              {format(new Date(row.dueDate), "dd MMM yyyy")}
            </div>
            <div style={{ fontSize: 12, color: over ? "#dc2626" : "#94a3b8" }}>
              {over
                ? `${-row.daysRemaining!} days over`
                : `${row.daysRemaining} days left`}
            </div>
          </div>
        );
      },
    },
    {
      title: "Status",
      key: "status",
      render: (_, row) => <StatusPill dueStatus={row.dueStatus} />,
    },
    {
      title: "Assigned",
      key: "assigned",
      render: (_, row) => (
        <WorkOrderCell
          prefill={{
            source: "MAINTENANCE_TASK",
            sourceId: row.id,
            subject: row.Ev?.licensePlate ?? `EV #${row.evId}`,
            subjectHref: `/vehicles/${row.evId}`,
            hub: null,
            title: row.title,
            details:
              row.description ??
              `Book the vehicle in and log the service against ${row.title.toLowerCase()}.`,
            priority: WORK_PRIORITY[row.dueStatus],
            dueDate: row.dueDate,
          }}
        />
      ),
    },
    {
      title: "Actions",
      key: "actions",
      align: "right",
      render: (_, row) => (
        <div
          style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}
          onClick={(e) => e.stopPropagation()}
        >
          <Tooltip title="Mark complete">
            <Button
              size="small"
              type="text"
              icon={<Check size={15} color="#16a34a" />}
              onClick={() => onComplete(row)}
            />
          </Tooltip>
          <Tooltip title="Edit">
            <Button
              size="small"
              type="text"
              icon={<Pencil size={14} color="#64748b" />}
              onClick={() => onEdit(row)}
            />
          </Tooltip>
          <Popconfirm
            title="Delete this task?"
            okText="Delete"
            okButtonProps={{ danger: true, loading: deleting }}
            onConfirm={() => onDelete(row)}
          >
            <Button
              size="small"
              type="text"
              icon={<Trash2 size={14} color="#dc2626" />}
            />
          </Popconfirm>
        </div>
      ),
    },
  ];

  return (
    <Table
      rowKey="id"
      columns={columns}
      dataSource={tasks}
      loading={isLoading}
      pagination={{ pageSize: 10, hideOnSinglePage: true }}
      size="middle"
    />
  );
}

function HistoryTab({
  records,
  isLoading,
}: {
  records: EnrichedMaintenanceRecord[];
  isLoading: boolean;
}) {
  const columns: ColumnsType<EnrichedMaintenanceRecord> = [
    {
      title: "Vehicle",
      key: "vehicle",
      render: (_, row) => <VehicleCell ev={row.Ev} />,
    },
    {
      title: "Service",
      key: "service",
      render: (_, row) => (
        <div>
          <div style={{ fontWeight: 500 }}>{row.Task?.title || "—"}</div>
          {row.Task && (
            <div style={{ fontSize: 12, color: "#94a3b8" }}>
              {row.Task.taskType === "OEM_SERVICE"
                ? "OEM service"
                : "Fleet task"}
            </div>
          )}
        </div>
      ),
    },
    {
      title: "Date",
      dataIndex: "serviceDate",
      key: "serviceDate",
      render: (value) => (value ? format(new Date(value), "dd MMM yyyy") : "—"),
    },
    {
      title: "Odometer",
      dataIndex: "odometerKm",
      key: "odometerKm",
      render: (value) => formatKm(value) || "—",
    },
    {
      title: "Cost",
      dataIndex: "cost",
      key: "cost",
      render: (value) => (value != null ? Number(value).toLocaleString() : "—"),
    },
    {
      title: "Vendor",
      dataIndex: "vendor",
      key: "vendor",
      render: (value) => value || "—",
    },
    {
      title: "Notes",
      dataIndex: "notes",
      key: "notes",
      ellipsis: true,
      render: (value) => value || "—",
    },
  ];

  return (
    <Table
      rowKey="id"
      columns={columns}
      dataSource={records}
      loading={isLoading}
      pagination={{ pageSize: 10, hideOnSinglePage: true }}
      size="middle"
    />
  );
}

export default function Maintenance() {
  const db = useDb();
  const [messageApi, contextHolder] = message.useMessage();
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("All");
  const [activeTab, setActiveTab] = useState("status");
  const [taskFormOpen, setTaskFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<EnrichedMaintenanceTask | null>(
    null,
  );
  const [completeTarget, setCompleteTarget] =
    useState<EnrichedMaintenanceTask | null>(null);

  const { tasks, counts } = useMemo(() => deriveMaintenance(db), [db]);
  const records = useMemo(() => deriveRecords(db), [db]);
  const vehicles = useMemo(
    () =>
      db.vehicles.map((v) => ({
        id: v.id,
        licensePlate: v.reg,
        make: v.make,
        model: v.model,
        odometerKm: v.odometerKm,
      })),
    [db],
  );

  const matchesSearch = (ev: MaintenanceEv | null) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      ev?.licensePlate?.toLowerCase().includes(q) ||
      ev?.make?.toLowerCase().includes(q) ||
      ev?.model?.toLowerCase().includes(q)
    );
  };

  const filteredTasks = useMemo(
    () =>
      tasks.filter((t) => {
        if (typeFilter === "OEM" && t.taskType !== "OEM_SERVICE") return false;
        if (typeFilter === "Fleet" && t.taskType !== "FLEET_TASK") return false;
        return matchesSearch(t.Ev);
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tasks, typeFilter, searchQuery],
  );

  const filteredRecords = useMemo(
    () => records.filter((r) => matchesSearch(r.Ev)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [records, searchQuery],
  );

  const handleSubmitTask = (payload: TaskFormPayload) => {
    if (editTarget) {
      updateRow("maintenanceTasks", editTarget.id, {
        evId: payload.evId,
        taskType: payload.taskType,
        title: payload.title,
        description: payload.description,
        isRecurring: payload.isRecurring,
        intervalKm: payload.intervalKm,
        intervalMonths: payload.intervalMonths,
        dueKm: payload.dueKm,
        dueDate: payload.dueDate,
      });
      messageApi.success("Task updated");
    } else {
      // Derive the first due point from the intervals when it was left blank,
      // the same way the production create endpoint does: km counts forward
      // from the odometer anchor, the date from today. A km interval on a
      // vehicle with no reading yet stays underived — there is nothing to
      // count from.
      const anchorKm =
        payload.currentOdometerKm ??
        db.vehicles.find((v) => v.id === payload.evId)?.odometerKm ??
        null;
      const dueKm =
        payload.dueKm ??
        (payload.intervalKm != null && anchorKm != null
          ? Math.round((anchorKm + payload.intervalKm) * 10) / 10
          : null);
      const dueDate =
        payload.dueDate ??
        (payload.intervalMonths != null
          ? dayjs().add(payload.intervalMonths, "month").format("YYYY-MM-DD")
          : null);
      if (dueKm == null && dueDate == null) {
        messageApi.error(
          "Task needs a due point: give a due km or date, or an interval " +
            "(km intervals also need an odometer reading).",
        );
        return;
      }
      const row: MaintenanceTask = {
        id: nextId("maintenanceTasks", "mt"),
        evId: payload.evId,
        taskType: payload.taskType,
        title: payload.title,
        description: payload.description,
        isRecurring: payload.isRecurring,
        intervalKm: payload.intervalKm,
        intervalMonths: payload.intervalMonths,
        dueKm,
        dueDate,
        status: "ACTIVE",
        createdAt: new Date().toISOString(),
      };
      createRow("maintenanceTasks", row);
      // Production recalibrates the vehicle odometer from this anchor.
      if (payload.currentOdometerKm != null) {
        updateRow("vehicles", payload.evId, {
          odometerKm: payload.currentOdometerKm,
        });
      }
      messageApi.success("Task created");
    }
    setTaskFormOpen(false);
    setEditTarget(null);
  };

  const handleComplete = (payload: CompleteTaskPayload) => {
    if (!completeTarget) return;
    const task = completeTarget;
    const record: MaintenanceRecord = {
      id: nextId("maintenanceRecords", "mr"),
      evId: task.evId,
      taskId: task.id,
      taskTitle: task.title,
      taskType: task.taskType,
      serviceDate: payload.serviceDate,
      odometerKm: payload.odometerKm,
      cost: payload.cost,
      vendor: payload.vendor,
      notes: payload.notes,
    };
    createRow("maintenanceRecords", record);
    // Keep km tracking calibrated, like the production backend.
    if (
      payload.odometerKm != null &&
      (task.currentKm == null || payload.odometerKm > task.currentKm)
    ) {
      updateRow("vehicles", task.evId, { odometerKm: payload.odometerKm });
    }
    // The job is done, so anything still assigned against it is done too —
    // otherwise the board keeps showing work that has already been carried out.
    closeWorkOrdersForSource(task.id, "Closed automatically — service logged");
    if (task.isRecurring) {
      // Roll the next due point forward from the service just logged.
      const anchorKm = payload.odometerKm ?? task.currentKm ?? 0;
      updateRow("maintenanceTasks", task.id, {
        dueKm: task.intervalKm != null ? anchorKm + task.intervalKm : null,
        dueDate: task.intervalMonths
          ? dayjs(payload.serviceDate)
              .add(task.intervalMonths, "month")
              .format("YYYY-MM-DD")
          : null,
        status: "ACTIVE",
      });
      messageApi.success("Service logged — next occurrence scheduled");
    } else {
      updateRow("maintenanceTasks", task.id, { status: "COMPLETED" });
      messageApi.success("Service logged");
    }
    setCompleteTarget(null);
  };

  const handleDelete = (row: EnrichedMaintenanceTask) => {
    closeWorkOrdersForSource(row.id, "Closed automatically — task deleted");
    removeRow("maintenanceTasks", row.id);
    messageApi.success("Task deleted");
  };

  return (
    <div style={{ padding: "0 16px" }}>
      {contextHolder}

      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 20,
        }}
      >
        <Title level={3} style={{ marginBottom: 0 }}>
          Maintenance
        </Title>
        <Button
          type="primary"
          icon={<Plus size={15} style={{ marginBottom: -2 }} />}
          onClick={() => {
            setEditTarget(null);
            setTaskFormOpen(true);
          }}
        >
          New task
        </Button>
      </div>

      {/* Summary cards */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        {SUMMARY_CARDS.map((card) => {
          const IconComp = card.icon;
          return (
            <Col span={8} key={card.key}>
              <Card
                style={{
                  borderRadius: 12,
                  border: "1px solid #f0f0f0",
                  height: "100%",
                }}
                styles={{
                  body: {
                    padding: "20px 24px",
                    display: "flex",
                    alignItems: "center",
                    gap: 16,
                  },
                }}
              >
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 12,
                    backgroundColor: card.bg,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <IconComp size={24} color={card.color} />
                </div>
                <div>
                  <p
                    style={{
                      margin: 0,
                      fontSize: 13,
                      color: "#94a3b8",
                      fontWeight: 500,
                    }}
                  >
                    {card.label}
                  </p>
                  <p
                    style={{
                      margin: 0,
                      fontSize: 28,
                      fontWeight: 700,
                      color: card.color,
                      lineHeight: 1.2,
                    }}
                  >
                    {counts[card.key] ?? 0}
                  </p>
                </div>
              </Card>
            </Col>
          );
        })}
      </Row>

      {/* Search + type filter */}
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
          placeholder="Search vehicle, make or model..."
          prefix={<Search size={16} color="#94a3b8" />}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          allowClear
          style={{ maxWidth: 360, borderRadius: 8, height: 40 }}
        />
        {activeTab === "status" && (
          <Segmented
            options={["All", "OEM", "Fleet"]}
            value={typeFilter}
            onChange={setTypeFilter}
          />
        )}
      </div>

      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          {
            key: "status",
            label: "Vehicle status",
            children: (
              <VehicleStatusTab
                tasks={filteredTasks}
                isLoading={false}
                onComplete={setCompleteTarget}
                onEdit={(row) => {
                  setEditTarget(row);
                  setTaskFormOpen(true);
                }}
                onDelete={handleDelete}
                deleting={false}
              />
            ),
          },
          {
            key: "history",
            label: "History",
            children: (
              <HistoryTab records={filteredRecords} isLoading={false} />
            ),
          },
        ]}
      />

      <TaskFormModal
        open={taskFormOpen}
        onClose={() => {
          setTaskFormOpen(false);
          setEditTarget(null);
        }}
        onSubmit={handleSubmitTask}
        task={editTarget}
        vehicles={vehicles}
        loading={false}
      />

      <CompleteTaskModal
        open={!!completeTarget}
        onClose={() => setCompleteTarget(null)}
        onSubmit={handleComplete}
        task={completeTarget}
        loading={false}
      />
    </div>
  );
}
