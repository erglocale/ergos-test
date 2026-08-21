"use client";

import {
  Button,
  Card,
  Col,
  Dropdown,
  Input,
  message,
  Row,
  Table,
  Tabs,
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
  MoreVertical,
  Search,
  Trash2,
  Wrench,
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
import StartServiceModal, {
  StartServicePayload,
} from "@/components/maintenance/StartServiceModal";
import {
  cancelServiceVisit,
  completeTask,
  startServiceVisit,
} from "@/components/maintenance/taskActions";
import TaskFormModal, {
  TaskFormPayload,
} from "@/components/maintenance/TaskFormModal";
import WorkOrderCell from "@/components/workOrders/WorkOrderCell";
import {
  addWorkOrderNote,
  closeWorkOrdersForSource,
  primaryWorkOrder,
  setWorkOrderStatus,
} from "@/components/workOrders/workOrderUtils";
import {
  createRow,
  isEnergyBrainVehicle,
  nextId,
  removeRow,
  updateRow,
  useDb,
} from "@/data/store";
import { modal } from "@/lib/antdStatic";
import type { MaintenanceTask, WorkOrderPriority } from "@/data/types";

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
  {
    key: "inService",
    label: "In service",
    icon: Wrench,
    color: "#7c3aed",
    bg: "#f5f3ff",
  },
] as const;

const IN_SERVICE_META = { label: "In service", color: "#7c3aed", bg: "#f5f3ff" };

/**
 * The due status, unless the vehicle is actually away being serviced — then
 * that is the answer to "what is happening with this", and how many days it
 * has been gone matters more than how many km it had left when it went in.
 */
function TaskStatusCell({ row }: { row: EnrichedMaintenanceTask }) {
  if (row.status !== "IN_SERVICE" || !row.visit) {
    return <StatusPill dueStatus={row.dueStatus} />;
  }
  const days = row.daysInService ?? 0;
  return (
    <div>
      <Pill meta={IN_SERVICE_META} />
      <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>
        {days === 0 ? "Sent in today" : `Day ${days + 1}`}
      </div>
      {row.visit.expectedReturn && (
        <div
          style={{
            fontSize: 12,
            marginTop: 2,
            color: row.returnOverdue ? "#dc2626" : "#94a3b8",
            fontWeight: row.returnOverdue ? 600 : 400,
          }}
        >
          {row.returnOverdue ? "Overdue back — due " : "Back "}
          {format(new Date(row.visit.expectedReturn), "dd MMM")}
        </div>
      )}
    </div>
  );
}

function StatusPill({ dueStatus }: { dueStatus: DueStatus }) {
  const meta = STATUS_META[dueStatus];
  if (!meta) return "—";
  return <Pill meta={meta} />;
}

function Pill({ meta }: { meta: { label: string; color: string; bg: string } }) {
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
  // Model only for the fixture fleet, as on the dashboard: the manufacturer's
  // legal name ("Piaggio Vehicles Pvt Ltd") is three times the width of the
  // thing that identifies the van. energy-brain names its own and is left be.
  const subtitle = isEnergyBrainVehicle(ev.id)
    ? [ev.make, ev.model].filter(Boolean).join(" ")
    : ev.model;
  return (
    <Link href={`/vehicles/${ev.id}`} style={{ color: "inherit" }}>
      <div style={{ fontWeight: 600, color: "#1e293b" }}>
        {ev.licensePlate || `EV #${ev.id}`}
      </div>
      {subtitle && (
        <div style={{ fontSize: 12, color: "#94a3b8" }}>{subtitle}</div>
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

/** "every 10,000 km", "every 6 months", or nothing for a one-off task. */
function recurrenceLabel(task: EnrichedMaintenanceTask): string {
  if (!task.isRecurring) return "";
  const parts = [
    task.intervalKm != null ? `${task.intervalKm.toLocaleString()} km` : null,
    task.intervalMonths != null
      ? `${task.intervalMonths} ${task.intervalMonths === 1 ? "month" : "months"}`
      : null,
  ].filter(Boolean);
  return parts.length ? `every ${parts.join(" / ")}` : "recurring";
}

const formatKm = (value: number | null | undefined) =>
  value != null ? `${Math.round(Number(value)).toLocaleString()} km` : null;

function VehicleStatusTab({
  tasks,
  isLoading,
  onComplete,
  onStartService,
  onEdit,
  onDelete,
  deleting,
}: {
  tasks: EnrichedMaintenanceTask[];
  isLoading: boolean;
  onComplete: (row: EnrichedMaintenanceTask) => void;
  onStartService: (row: EnrichedMaintenanceTask) => void;
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
      title: "Task",
      key: "task",
      render: (_, row) => {
        // The recurrence had a column of its own that only ever said "Yes" or
        // a dash; the interval belongs with the task it repeats.
        const recurrence = recurrenceLabel(row);
        return (
          <div>
            <div style={{ fontWeight: 500 }}>{row.title}</div>
            {recurrence && (
              <div style={{ fontSize: 12, color: "#94a3b8" }}>{recurrence}</div>
            )}
          </div>
        );
      },
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
      render: (_, row) => <TaskStatusCell row={row} />,
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
      title: "",
      key: "actions",
      align: "right",
      width: 56,
      // Four icons per row on a table this wide is noise; the row's own state
      // already says what is happening, so the verbs live behind one control.
      render: (_, row) => {
        const inService = row.status === "IN_SERVICE";
        return (
          <div onClick={(e) => e.stopPropagation()}>
            <Dropdown
              trigger={["click"]}
              placement="bottomRight"
              menu={{
                items: [
                  {
                    key: "service",
                    icon: <Wrench size={14} />,
                    label: inService ? "Update service visit" : "Send for service",
                    onClick: () => onStartService(row),
                  },
                  {
                    key: "complete",
                    icon: <Check size={14} />,
                    label: inService
                      ? "Back on road — log service"
                      : "Mark complete",
                    onClick: () => onComplete(row),
                  },
                  { key: "d1", type: "divider" },
                  {
                    key: "edit",
                    icon: <Pencil size={14} />,
                    label: "Edit task",
                    onClick: () => onEdit(row),
                  },
                  {
                    key: "delete",
                    icon: <Trash2 size={14} />,
                    label: "Delete task",
                    danger: true,
                    onClick: () =>
                      modal.confirm({
                        title: "Delete this task?",
                        content: `${row.title}${
                          row.Ev?.licensePlate ? ` — ${row.Ev.licensePlate}` : ""
                        }. Anything assigned against it is closed too.`,
                        okText: "Delete",
                        okButtonProps: { danger: true, loading: deleting },
                        onOk: () => onDelete(row),
                      }),
                  },
                ],
              }}
            >
              <Button
                size="small"
                type="text"
                icon={<MoreVertical size={16} color="#64748b" />}
              />
            </Dropdown>
          </div>
        );
      },
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
      rowClassName={(row) =>
        row.status === "IN_SERVICE" ? "maintenance-in-service-row" : ""
      }
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
        <div style={{ fontWeight: 500 }}>{row.Task?.title || "—"}</div>
      ),
    },
    {
      title: "Date",
      key: "serviceDate",
      render: (_, row) => (
        <div>
          <div>
            {row.serviceDate
              ? format(new Date(row.serviceDate), "dd MMM yyyy")
              : "—"}
          </div>
          {row.daysOffRoad != null && (
            <div style={{ fontSize: 12, color: "#94a3b8" }}>
              {row.daysOffRoad === 0
                ? "Same-day service"
                : `${row.daysOffRoad} ${row.daysOffRoad === 1 ? "day" : "days"} off road`}
            </div>
          )}
        </div>
      ),
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
  const [activeTab, setActiveTab] = useState("status");
  const [taskFormOpen, setTaskFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<EnrichedMaintenanceTask | null>(
    null,
  );
  const [completeTarget, setCompleteTarget] =
    useState<EnrichedMaintenanceTask | null>(null);
  const [serviceTarget, setServiceTarget] =
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
    () => tasks.filter((t) => matchesSearch(t.Ev)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tasks, searchQuery],
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
        title: payload.title,
        description: payload.description,
        isRecurring: payload.isRecurring,
        intervalKm: payload.intervalKm,
        intervalMonths: payload.intervalMonths,
        dueKm,
        dueDate,
        status: "ACTIVE",
        visit: null,
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

  /** Send the vehicle away for service, or revise a visit already open. */
  const handleStartService = (payload: StartServicePayload) => {
    if (!serviceTarget) return;
    const task = serviceTarget;
    const reopening = task.status !== "IN_SERVICE";
    startServiceVisit(task, {
      startedAt: payload.startedAt,
      expectedReturn: payload.expectedReturn,
      note: payload.note,
    });
    // The work is under way, so whoever it was handed to shouldn't still be
    // looking at an open ticket — keep the two in step.
    const order = primaryWorkOrder(db.workOrders, task.id);
    if (order) {
      const back = payload.expectedReturn
        ? `, expected back ${dayjs(payload.expectedReturn).format("DD MMM YYYY")}`
        : "";
      if (reopening) {
        setWorkOrderStatus(order, "In progress");
        addWorkOrderNote(order, `Vehicle sent for service${back}`);
      } else {
        addWorkOrderNote(order, `Service visit updated${back}`);
      }
    }
    messageApi.success(
      reopening
        ? `${task.Ev?.licensePlate ?? "Vehicle"} marked in service`
        : "Service visit updated",
    );
    setServiceTarget(null);
  };

  /** The vehicle came back without the work being done. */
  const handleCancelVisit = () => {
    if (!serviceTarget) return;
    const task = serviceTarget;
    cancelServiceVisit(task);
    const order = primaryWorkOrder(db.workOrders, task.id);
    if (order && order.status !== "Done") {
      setWorkOrderStatus(order, "Open");
      addWorkOrderNote(order, "Service visit cancelled — vehicle back without work done");
    }
    messageApi.info("Service visit cancelled");
    setServiceTarget(null);
  };

  const handleComplete = (payload: CompleteTaskPayload) => {
    if (!completeTarget) return;
    const task = completeTarget;
    // The job is done, so anything still assigned against it is done too —
    // otherwise the board keeps showing work that has already been carried out.
    closeWorkOrdersForSource(task.id, "Closed automatically — service logged");
    completeTask(task, payload);
    messageApi.success(
      task.isRecurring
        ? "Service logged — next occurrence scheduled"
        : "Service logged",
    );
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
            <Col xs={24} sm={12} xl={6} key={card.key}>
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

      {/* Search */}
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
                onStartService={setServiceTarget}
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

      <StartServiceModal
        open={!!serviceTarget}
        onClose={() => setServiceTarget(null)}
        onSubmit={handleStartService}
        onCancelVisit={handleCancelVisit}
        task={serviceTarget}
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
