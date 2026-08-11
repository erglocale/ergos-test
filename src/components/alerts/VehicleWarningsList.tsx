"use client";

import { Card, DatePicker, Select, Table, Tag, Tooltip, Typography } from "antd";
import type { TableProps } from "antd";
import dayjs from "dayjs";
import localizedFormat from "dayjs/plugin/localizedFormat";
import relativeTime from "dayjs/plugin/relativeTime";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { HiMiniBellAlert } from "react-icons/hi2";
import { rangePresets } from "@/components/home/FleetAndChargerHostLayout";
import { useDb } from "@/data/store";
import type { Alert } from "@/data/types";
import {
  ALERT_TYPE_COLORS,
  ALERT_TYPE_OPTIONS,
  SEVERITY_COLORS,
  fmtDateTime,
  formatAlertType,
  getAlertSummary,
} from "./alertUtils";
import { type ActionContext, recommendedAction } from "./recommendedActions";
import WarningBreakdown, { type BreakdownRow } from "./WarningBreakdown";
import { DATE_FORMAT } from "@/lib/dateFormat";

dayjs.extend(relativeTime);
dayjs.extend(localizedFormat);

const { Text } = Typography;
const { RangePicker } = DatePicker;

const PAGE_SIZE = 10;

// Local replica of Components/HubManagement/HubFilter — hubs derived from
// the dummy store instead of the hubs API.
function HubFilter({
  value,
  onChange,
  placeholder = "Filter by hub",
  style,
}: {
  value: string | null;
  onChange: (hub: string | null) => void;
  placeholder?: string;
  style?: React.CSSProperties;
}) {
  const db = useDb();
  const hubs = useMemo(
    () =>
      Array.from(
        new Set([
          ...db.vehicles.map((v) => v.hub),
          ...db.chargepoints.map((c) => c.hub),
        ]),
      ).sort(),
    [db.vehicles, db.chargepoints],
  );

  return (
    <Select
      allowClear
      showSearch
      placeholder={placeholder}
      value={value || undefined}
      onChange={(v) => onChange(v || null)}
      optionFilterProp="label"
      style={{ minWidth: 180, ...(style || {}) }}
      options={hubs.map((h) => ({ label: h, value: h }))}
    />
  );
}

function SummaryCards({ alerts, totalCount }: { alerts: Alert[]; totalCount: number }) {
  const { severityCounts, alertBreakdown } = useMemo(() => {
    const sevMap: Record<string, number> = { critical: 0, warning: 0, info: 0 };
    const typeMap: Record<string, number> = {};

    for (const a of alerts) {
      if (a.severity && sevMap[a.severity] !== undefined) sevMap[a.severity]++;
      const t = a.alertType;
      if (t) typeMap[t] = (typeMap[t] || 0) + 1;
    }

    const breakdown: BreakdownRow[] = Object.entries(typeMap)
      .map(([type, count]) => ({
        label: formatAlertType(type),
        count,
        color: ALERT_TYPE_COLORS[type] || "#9ca3af",
      }))
      .sort((a, b) => b.count - a.count);

    return { severityCounts: sevMap, alertBreakdown: breakdown };
  }, [alerts]);

  return (
    <WarningBreakdown
      totalLabel="Total alerts"
      total={totalCount}
      severities={[
        { label: "Critical", count: severityCounts.critical, color: "#ef4444" },
        { label: "Warning", count: severityCounts.warning, color: "#f59e0b" },
        { label: "Info", count: severityCounts.info, color: "#3b82f6" },
      ]}
      rows={alertBreakdown}
      breakdownLabel="Alert type breakdown"
    />
  );
}


export default function VehicleWarnings() {
  const router = useRouter();
  const db = useDb();

  const [startDate, setStartDate] = useState(() =>
    dayjs().subtract(7, "day").startOf("day").toISOString(),
  );
  const [endDate, setEndDate] = useState(() => dayjs().toISOString());
  const [vehicleNumberPlates, setVehicleNumberPlates] = useState<string[]>([]);
  const [alertTypes, setAlertTypes] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "resolved">("all");
  const [hubQuickFilter, setHubQuickFilter] = useState<string | null>(null);

  const handleHubQuickSelect = (hubId: string | null) => {
    setHubQuickFilter(hubId);
    if (!hubId) {
      setVehicleNumberPlates([]);
      return;
    }
    const platesInHub = db.vehicles
      .filter((v) => v.hub === hubId)
      .map((v) => v.reg)
      .filter(Boolean);
    setVehicleNumberPlates(platesInHub);
  };

  // Store-backed replica of useTelemetryAlerts (date window, plates, types
  // are "server-side" filters in production).
  const allAlerts = useMemo(() => {
    const start = dayjs(startDate).startOf("day");
    const end = dayjs(endDate).endOf("day");
    return db.alerts.filter((a) => {
      const t = dayjs(a.createdAt);
      if (t.isBefore(start) || t.isAfter(end)) return false;
      if (vehicleNumberPlates.length && !vehicleNumberPlates.includes(a.vehicleLicensePlate))
        return false;
      if (alertTypes.length && !alertTypes.includes(a.alertType)) return false;
      return true;
    });
  }, [db.alerts, startDate, endDate, vehicleNumberPlates, alertTypes]);

  // Actions read the fleet's own data (range, nearest charger) and count
  // repeat offences, so they are derived from every alert in the window.
  const actionCtx: ActionContext = useMemo(
    () => ({
      vehicles: db.vehicles,
      chargepoints: db.chargepoints,
      sessions: db.sessions,
      allAlerts: db.alerts,
    }),
    [db.vehicles, db.chargepoints, db.sessions, db.alerts],
  );

  const columns: TableProps<Alert>["columns"] = [
    {
      title: "Vehicle",
      key: "vehicle",
      width: 180,
      render: (_, record) => {
        const ev = db.vehicles.find((v) => v.reg === record.vehicleLicensePlate);
        return (
          <div
            style={{ cursor: ev?.id ? "pointer" : "default" }}
            onClick={() => {
              if (ev?.id) router.push(`/vehicles/${ev.id}`);
            }}
          >
            <Text strong>{record.vehicleLicensePlate || "No Plate"}</Text>
            {ev?.model && (
              <>
                <br />
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {ev.model}
                </Text>
              </>
            )}
          </div>
        );
      },
    },
    {
      title: "Alert Type",
      dataIndex: "alertType",
      key: "alert_type",
      width: 200,
      render: (alertType: string, record) => (
        <div className="flex flex-col gap-1">
          <Tag color={SEVERITY_COLORS[record.severity] || "default"}>
            {formatAlertType(alertType)}
          </Tag>
          <Text type="secondary" style={{ fontSize: 11, textTransform: "capitalize" }}>
            {record.severity}
          </Text>
        </div>
      ),
    },
    {
      title: "Details",
      key: "details",
      render: (_, record) => (
        <Text
          style={{ maxWidth: 420 }}
          ellipsis={{
            tooltip: getAlertSummary(record.alertType, record.payload),
          }}
        >
          {getAlertSummary(record.alertType, record.payload)}
        </Text>
      ),
    },
    {
      title: "Recommended Action",
      key: "recommended_action",
      width: 320,
      render: (_, record) => {
        const action = recommendedAction(record, actionCtx);
        return (
          <Text style={{ color: "#0d9488" }} ellipsis={{ tooltip: action }}>
            {action}
          </Text>
        );
      },
    },
    {
      title: "Triggered At",
      dataIndex: "createdAt",
      key: "triggered_at",
      width: 220,
      render: (triggeredAt: string) => (
        <div className="flex items-center gap-1">
          <HiMiniBellAlert className="h-4 w-4 flex-shrink-0" color="#aa7714" />
          <Text>{triggeredAt ? fmtDateTime(triggeredAt) : "N/A"}</Text>
        </div>
      ),
    },
    {
      title: "Status",
      key: "status",
      width: 130,
      render: (_, record) => {
        if (record.resolved) {
          const resolvedLabel = record.resolvedAt
            ? `Resolved ${fmtDateTime(record.resolvedAt)}`
            : "Resolved";
          return (
            <Tooltip title={resolvedLabel}>
              <Tag color="green">Resolved</Tag>
            </Tooltip>
          );
        }
        return <Tag color="orange">Active</Tag>;
      },
    },
  ];

  const alerts = useMemo(() => {
    if (statusFilter === "active") return allAlerts.filter((a) => !a.resolved);
    if (statusFilter === "resolved") return allAlerts.filter((a) => a.resolved);
    return allAlerts;
  }, [allAlerts, statusFilter]);
  const totalCount = alerts.length;

  const seenPlatesRef = useRef(new Set<string>());
  const numberPlateOptions = useMemo(() => {
    for (const a of alerts) {
      if (a.vehicleLicensePlate) seenPlatesRef.current.add(a.vehicleLicensePlate);
    }
    return [...seenPlatesRef.current].sort().map((p) => ({ label: p, value: p }));
  }, [alerts]);

  return (
    <>
      <div
        className="flex w-full flex-wrap items-center justify-start gap-4"
        style={{ marginBottom: 16 }}
      >
        <RangePicker
          presets={rangePresets}
          value={[dayjs(startDate), dayjs(endDate)]}
          style={{ width: 340 }}
          onChange={(value) => {
            if (value && value[0] && value[1]) {
              setStartDate(value[0].toISOString());
              setEndDate(value[1].toISOString());
            }
          }}
          format={DATE_FORMAT}
          allowClear={false}
        />

        <HubFilter
          value={hubQuickFilter}
          onChange={handleHubQuickSelect}
          placeholder="Hub"
          style={{ width: 140, minWidth: 140 }}
        />

        <Select
          mode="multiple"
          style={{ minWidth: 240, flex: 1 }}
          placeholder="Filter by number plate"
          value={vehicleNumberPlates}
          onChange={setVehicleNumberPlates}
          options={numberPlateOptions}
          allowClear
          maxTagCount="responsive"
          showSearch
          filterOption={(input, option) =>
            (option?.label ?? "").toLowerCase().includes(input.toLowerCase())
          }
        />

        <Select
          mode="multiple"
          style={{ minWidth: 260 }}
          placeholder="Filter by alert type"
          value={alertTypes}
          onChange={setAlertTypes}
          options={ALERT_TYPE_OPTIONS}
          allowClear
          maxTagCount="responsive"
        />

        <Select
          style={{ minWidth: 140 }}
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { label: "All Statuses", value: "all" },
            { label: "Active", value: "active" },
            { label: "Resolved", value: "resolved" },
          ]}
        />
      </div>

      <SummaryCards alerts={alerts} totalCount={totalCount} />

      <Card
        style={{
          width: "100%",
          borderRadius: 12,
          boxShadow: "0 2px 6px rgba(0, 0, 0, 0.04)",
          overflow: "hidden",
          border: "1px solid #f0f0f0",
        }}
        styles={{ body: { padding: 0 } }}
        hoverable
      >
        <Table<Alert>
          columns={columns}
          dataSource={alerts}
          rowKey="id"
          pagination={{
            defaultPageSize: PAGE_SIZE,
            showSizeChanger: true,
            pageSizeOptions: ["10", "20", "50", "100"],
            showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} alerts`,
            position: ["bottomCenter"],
          }}
          scroll={{ x: "max-content" }}
          bordered={false}
          rowClassName={() => "custom-table-row"}
          className="styled-warnings-table"
        />
      </Card>
    </>
  );
}
