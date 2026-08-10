"use client";

import { Card, Col, DatePicker, Row, Select, Table, Tag, Tooltip, Typography } from "antd";
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
import { DATE_FORMAT } from "@/lib/dateFormat";

dayjs.extend(relativeTime);
dayjs.extend(localizedFormat);

const { Text, Title } = Typography;
const { RangePicker } = DatePicker;

const PAGE_SIZE = 10;

interface BreakdownItem {
  type: string;
  count: number;
  color: string;
}

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

function DonutChart({ breakdown, totalCount }: { breakdown: BreakdownItem[]; totalCount: number }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const cx = 60,
    cy = 60,
    outerR = 56,
    innerR = 34;

  const segments = useMemo(() => {
    const total = breakdown.reduce((s, b) => s + b.count, 0);
    if (!total) return [];
    let cum = -Math.PI / 2;
    return breakdown.map((item) => {
      const angle = (item.count / total) * 2 * Math.PI;
      const start = cum;
      cum += angle;
      const end = cum;
      const pct = ((item.count / total) * 100).toFixed(1);
      return { ...item, start, end, pct };
    });
  }, [breakdown]);

  function arcPath(s: number, e: number) {
    if (e - s >= 2 * Math.PI - 0.001) e = s + 2 * Math.PI - 0.001;
    const lg = e - s > Math.PI ? 1 : 0;
    return [
      `M${cx + outerR * Math.cos(s)},${cy + outerR * Math.sin(s)}`,
      `A${outerR},${outerR} 0 ${lg} 1 ${cx + outerR * Math.cos(e)},${cy + outerR * Math.sin(e)}`,
      `L${cx + innerR * Math.cos(e)},${cy + innerR * Math.sin(e)}`,
      `A${innerR},${innerR} 0 ${lg} 0 ${cx + innerR * Math.cos(s)},${cy + innerR * Math.sin(s)}`,
      "Z",
    ].join(" ");
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
      <div style={{ position: "relative", width: 120, height: 120, flexShrink: 0 }}>
        <svg viewBox="0 0 120 120" width={120} height={120}>
          {segments.length === 0 ? (
            <>
              <circle cx={cx} cy={cy} r={outerR} fill="#e5e7eb" />
              <circle cx={cx} cy={cy} r={innerR} fill="#fff" />
            </>
          ) : (
            segments.map((seg, i) => (
              <path
                key={seg.type}
                d={arcPath(seg.start, seg.end)}
                fill={seg.color}
                stroke="#fff"
                strokeWidth={1.5}
                style={{
                  cursor: "pointer",
                  transition: "opacity 0.15s",
                  opacity: hovered !== null && hovered !== i ? 0.4 : 1,
                }}
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
              />
            ))
          )}
        </svg>
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            textAlign: "center",
            pointerEvents: "none",
          }}
        >
          <Text strong style={{ fontSize: 20, lineHeight: 1.1 }}>
            {totalCount}
          </Text>
          <br />
          <Text type="secondary" style={{ fontSize: 11 }}>
            total
          </Text>
        </div>
        {hovered !== null && segments[hovered] && (
          <div
            style={{
              position: "absolute",
              bottom: "105%",
              left: "50%",
              transform: "translateX(-50%)",
              background: "rgba(0,0,0,0.82)",
              color: "#fff",
              padding: "5px 12px",
              borderRadius: 6,
              fontSize: 12,
              whiteSpace: "nowrap",
              pointerEvents: "none",
              zIndex: 10,
              boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
            }}
          >
            <span
              style={{
                display: "inline-block",
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: segments[hovered].color,
                marginRight: 6,
                verticalAlign: "middle",
              }}
            />
            {formatAlertType(segments[hovered].type)}: {segments[hovered].count}{" "}
            ({segments[hovered].pct}%)
          </div>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {breakdown.map((item, i) => (
          <div
            key={item.type}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              cursor: "pointer",
              opacity: hovered !== null && hovered !== i ? 0.4 : 1,
              transition: "opacity 0.15s",
            }}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
          >
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: item.color,
                flexShrink: 0,
              }}
            />
            <Text style={{ fontSize: 13 }}>
              {formatAlertType(item.type)}{" "}
              <Text type="secondary" style={{ fontSize: 12 }}>
                ({item.count})
              </Text>
            </Text>
          </div>
        ))}
        {breakdown.length === 0 && (
          <Text type="secondary" style={{ fontSize: 13 }}>
            No data
          </Text>
        )}
      </div>
    </div>
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

    const breakdown: BreakdownItem[] = Object.entries(typeMap)
      .map(([type, count]) => ({
        type,
        count,
        color: ALERT_TYPE_COLORS[type] || "#9ca3af",
      }))
      .sort((a, b) => b.count - a.count);

    return { severityCounts: sevMap, alertBreakdown: breakdown };
  }, [alerts]);

  return (
    <Row gutter={16} style={{ marginBottom: 16 }}>
      <Col xs={24} md={10}>
        <Card
          style={{ borderRadius: 12, height: "100%", border: "1px solid #f0f0f0" }}
          styles={{ body: { padding: "20px 24px" } }}
        >
          <Text type="secondary" style={{ fontSize: 13 }}>
            Total Alerts
          </Text>
          <Title level={2} style={{ margin: "4px 0 16px" }}>
            {totalCount}
          </Title>

          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            <SeverityBadge label="Critical" count={severityCounts.critical} color="#ef4444" />
            <SeverityBadge label="Warning" count={severityCounts.warning} color="#f59e0b" />
            <SeverityBadge label="Info" count={severityCounts.info} color="#3b82f6" />
          </div>
        </Card>
      </Col>

      <Col xs={24} md={14}>
        <Card
          style={{ borderRadius: 12, height: "100%", border: "1px solid #f0f0f0" }}
          styles={{ body: { padding: "20px 24px" } }}
        >
          <Text type="secondary" style={{ fontSize: 13, marginBottom: 12, display: "block" }}>
            Alert Type Breakdown
          </Text>
          <DonutChart breakdown={alertBreakdown} totalCount={totalCount} />
        </Card>
      </Col>
    </Row>
  );
}

function SeverityBadge({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 14px",
        borderRadius: 8,
        background: `${color}0D`,
        border: `1px solid ${color}33`,
      }}
    >
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
      <Text style={{ fontSize: 13, color }}>
        {label}: <strong>{count}</strong>
      </Text>
    </div>
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
