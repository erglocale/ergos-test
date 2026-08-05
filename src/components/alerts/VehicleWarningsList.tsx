"use client";

import { Card, Col, DatePicker, Row, Select, Table, Tag, Tooltip, Typography } from "antd";
import type { TableProps } from "antd";
import dayjs, { type Dayjs } from "dayjs";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { HiMiniBellAlert } from "react-icons/hi2";
import { useDb } from "@/data/store";
import type { Alert } from "@/data/types";
import {
  ALERT_TYPE_COLORS,
  SEVERITY_COLORS,
  fmtDateTime,
  isVehicleAlert,
  rangePresets,
} from "./alertUtils";

const { Text, Title } = Typography;
const { RangePicker } = DatePicker;

const PAGE_SIZE = 10;

interface BreakdownItem {
  type: string;
  count: number;
  color: string;
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
            {segments[hovered].type}: {segments[hovered].count} ({segments[hovered].pct}%)
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
              {item.type}{" "}
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

function SummaryCards({ alerts, totalCount }: { alerts: Alert[]; totalCount: number }) {
  const { severityCounts, alertBreakdown } = useMemo(() => {
    const sevMap: Record<string, number> = { Critical: 0, Warning: 0, Info: 0 };
    const typeMap: Record<string, number> = {};

    for (const a of alerts) {
      if (sevMap[a.severity] !== undefined) sevMap[a.severity] += 1;
      typeMap[a.type] = (typeMap[a.type] || 0) + 1;
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
            <SeverityBadge label="Critical" count={severityCounts.Critical} color="#ef4444" />
            <SeverityBadge label="Warning" count={severityCounts.Warning} color="#f59e0b" />
            <SeverityBadge label="Info" count={severityCounts.Info} color="#3b82f6" />
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

export default function VehicleWarningsList() {
  const db = useDb();

  const [range, setRange] = useState<[Dayjs, Dayjs]>([dayjs().subtract(7, "day").startOf("day"), dayjs()]);
  const [vehicleNumberPlates, setVehicleNumberPlates] = useState<string[]>([]);
  const [alertTypes, setAlertTypes] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "resolved">("all");

  const vehicleAlerts = useMemo(() => db.alerts.filter(isVehicleAlert), [db.alerts]);

  const alerts = useMemo(() => {
    const [start, end] = range;
    return vehicleAlerts.filter((a) => {
      const t = dayjs(a.time);
      if (t.isBefore(start) || t.isAfter(end.endOf("day"))) return false;
      if (vehicleNumberPlates.length && !vehicleNumberPlates.includes(a.source)) return false;
      if (alertTypes.length && !alertTypes.includes(a.type)) return false;
      if (statusFilter === "active" && a.acknowledged) return false;
      if (statusFilter === "resolved" && !a.acknowledged) return false;
      return true;
    });
  }, [vehicleAlerts, range, vehicleNumberPlates, alertTypes, statusFilter]);

  const totalCount = alerts.length;

  const seenPlatesRef = useRef(new Set<string>());
  const numberPlateOptions = useMemo(() => {
    for (const a of vehicleAlerts) {
      if (a.source) seenPlatesRef.current.add(a.source);
    }
    return [...seenPlatesRef.current].sort().map((p) => ({ label: p, value: p }));
  }, [vehicleAlerts]);

  const alertTypeOptions = useMemo(() => {
    const types = new Set(vehicleAlerts.map((a) => a.type));
    return [...types].sort().map((t) => ({ label: t, value: t }));
  }, [vehicleAlerts]);

  const columns: TableProps<Alert>["columns"] = [
    {
      title: "Vehicle",
      key: "vehicle",
      width: 180,
      render: (_, record) => {
        const vehicle = db.vehicles.find((v) => v.reg === record.source);
        return (
          <Link href="/vehicles" style={{ color: "inherit" }}>
            <Text strong>{record.source || "No Plate"}</Text>
            {vehicle?.model && (
              <>
                <br />
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {vehicle.model}
                </Text>
              </>
            )}
          </Link>
        );
      },
    },
    {
      title: "Alert Type",
      dataIndex: "type",
      key: "type",
      width: 200,
      render: (type: string, record) => (
        <div className="flex flex-col gap-1">
          <Tag color={SEVERITY_COLORS[record.severity] || "default"}>{type}</Tag>
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
        <Text style={{ maxWidth: 420 }} ellipsis={{ tooltip: record.message }}>
          {record.message}
        </Text>
      ),
    },
    {
      title: "Triggered At",
      dataIndex: "time",
      key: "time",
      width: 220,
      render: (time: string) => (
        <div className="flex items-center gap-1">
          <HiMiniBellAlert className="h-4 w-4 flex-shrink-0" color="#aa7714" />
          <Text>{fmtDateTime(time)}</Text>
        </div>
      ),
    },
    {
      title: "Status",
      key: "status",
      width: 200,
      render: (_, record) => {
        if (record.acknowledged) {
          return (
            <Tooltip title="This alert has been acknowledged">
              <Tag color="green">Resolved</Tag>
            </Tooltip>
          );
        }
        return <Tag color="orange">Active</Tag>;
      },
    },
  ];

  return (
    <>
      <div className="flex w-full flex-wrap items-center justify-start gap-4" style={{ marginBottom: 16 }}>
        <RangePicker
          presets={rangePresets}
          value={range}
          style={{ width: 340 }}
          onChange={(value) => {
            if (value && value[0] && value[1]) setRange([value[0], value[1]]);
          }}
          allowClear={false}
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
          options={alertTypeOptions}
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
            showTotal: (total, r) => `${r[0]}-${r[1]} of ${total} alerts`,
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
