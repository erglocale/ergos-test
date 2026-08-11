"use client";

// Charger warnings (demo spec item 8): severity-led layout — total + severity
// chips, a warning-type breakdown, and a table where every row carries a
// recommended action. Predicted faults sit alongside real ones; they come from
// the same health model the charger Overview tab uses.

import { Card, DatePicker, Input, Select, Table, Tag, Typography } from "antd";
import type { TableProps } from "antd";
import dayjs from "dayjs";
import localizedFormat from "dayjs/plugin/localizedFormat";
import relativeTime from "dayjs/plugin/relativeTime";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { rangePresets } from "@/components/home/FleetAndChargerHostLayout";
import { useDb } from "@/data/store";
import {
  type ChargerWarningRow,
  SEVERITY_DOT_COLOR,
  SEVERITY_TAG_COLOR,
  TYPE_BAR_COLOR,
  type WarnSeverity,
  type WarnStatus,
  buildChargerWarningRows,
} from "./chargerWarningRows";
import WarningBreakdown, { type BreakdownRow } from "./WarningBreakdown";
import { DATE_FORMAT } from "@/lib/dateFormat";

dayjs.extend(relativeTime);
dayjs.extend(localizedFormat);

const { Text } = Typography;
const { RangePicker } = DatePicker;
const { Search } = Input;

const STATUS_TAG_COLOR: Record<WarnStatus, string> = {
  Active: "red",
  Watching: "blue",
  Resolved: "green",
};

const SEVERITY_ORDER: WarnSeverity[] = ["Critical", "Warning", "Predicted"];

export default function ChargerWarnings() {
  const router = useRouter();
  const db = useDb();
  const [currentPageNumber, setCurrentPageNumber] = useState(1);
  const [startDate, setStartDate] = useState(() =>
    dayjs().subtract(10, "day").startOf("day").toISOString(),
  );
  const [endDate, setEndDate] = useState(() => dayjs().toISOString());
  const [limit] = useState(10);
  const [statusFilter, setStatusFilter] = useState<"All" | WarnStatus>("All");
  const [severityFilter, setSeverityFilter] = useState<"All" | WarnSeverity>("All");
  const [hubFilter, setHubFilter] = useState<string | null>(null);
  const [searchText, setSearchText] = useState("");
  const [debouncedSearchText, setDebouncedSearchText] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchText(searchText);
      setCurrentPageNumber(1);
    }, 700);
    return () => clearTimeout(timer);
  }, [searchText]);

  /** Any filter change puts the table back on page 1. */
  function applyFilter(change: () => void) {
    change();
    setCurrentPageNumber(1);
  }

  const allRows = useMemo(
    () => buildChargerWarningRows(db.chargerWarnings, db.chargepoints, db.sessions),
    [db.chargerWarnings, db.chargepoints, db.sessions],
  );

  const hubOptions = useMemo(
    () => Array.from(new Set(db.chargepoints.map((c) => c.hub))).sort(),
    [db.chargepoints],
  );

  const rows = useMemo(() => {
    const start = dayjs(startDate).startOf("day");
    const end = dayjs(endDate).endOf("day");
    const search = debouncedSearchText.trim().toLowerCase();
    return allRows.filter((r) => {
      const t = dayjs(r.triggeredAt);
      if (t.isBefore(start) || t.isAfter(end)) return false;
      if (statusFilter !== "All" && r.status !== statusFilter) return false;
      if (severityFilter !== "All" && r.severity !== severityFilter) return false;
      if (hubFilter && r.hub !== hubFilter) return false;
      if (
        search &&
        !r.chargerName.toLowerCase().includes(search) &&
        !r.chargerId.toLowerCase().includes(search) &&
        !r.type.toLowerCase().includes(search)
      )
        return false;
      return true;
    });
  }, [allRows, startDate, endDate, statusFilter, severityFilter, hubFilter, debouncedSearchText]);

  const { severities, breakdown } = useMemo(() => {
    const sev: Record<WarnSeverity, number> = { Critical: 0, Warning: 0, Predicted: 0 };
    const types = new Map<string, number>();
    for (const r of rows) {
      sev[r.severity] += 1;
      types.set(r.type, (types.get(r.type) ?? 0) + 1);
    }
    const bars: BreakdownRow[] = Array.from(types.entries())
      .map(([label, count]) => ({
        label,
        count,
        color: TYPE_BAR_COLOR[label as keyof typeof TYPE_BAR_COLOR] ?? "#9ca3af",
      }))
      .sort((a, b) => b.count - a.count);
    return {
      severities: SEVERITY_ORDER.map((s) => ({
        label: s,
        count: sev[s],
        color: SEVERITY_DOT_COLOR[s],
      })),
      breakdown: bars,
    };
  }, [rows]);

  const columns: TableProps<ChargerWarningRow>["columns"] = [
    {
      title: "Charger",
      key: "charger",
      width: 200,
      render: (_, r) => (
        <div
          style={{ cursor: "pointer" }}
          onClick={() => router.push(`/chargingStations/${r.chargerId}`)}
        >
          <Text strong ellipsis={{ tooltip: r.chargerName }}>
            {r.chargerName}
          </Text>
          <br />
          <Text type="secondary" style={{ fontSize: 12 }}>
            {r.chargerId}
          </Text>
          <br />
          <Text type="secondary" style={{ fontSize: 11 }} ellipsis={{ tooltip: r.address }}>
            {r.hub}
          </Text>
        </div>
      ),
    },
    {
      title: "Severity",
      key: "severity",
      width: 110,
      render: (_, r) => <Tag color={SEVERITY_TAG_COLOR[r.severity]}>{r.severity}</Tag>,
    },
    {
      title: "Details",
      key: "details",
      width: 300,
      render: (_, r) => (
        <div>
          <div style={{ fontSize: 13 }}>{r.details}</div>
          <div
            style={{
              fontFamily: "var(--font-geist-mono, ui-monospace, monospace)",
              fontSize: 11,
              color: "#9ca3af",
              marginTop: 2,
            }}
          >
            {r.code}
          </div>
        </div>
      ),
    },
    {
      title: "Recommended Action",
      key: "action",
      width: 280,
      render: (_, r) => (
        <Text style={{ color: "#0d9488", fontSize: 13 }} ellipsis={{ tooltip: r.action }}>
          {r.action}
        </Text>
      ),
    },
    {
      title: "Triggered",
      key: "triggered",
      width: 150,
      sorter: (a, b) => dayjs(a.triggeredAt).valueOf() - dayjs(b.triggeredAt).valueOf(),
      render: (_, r) => (
        <div style={{ fontSize: 13 }}>
          {dayjs(r.triggeredAt).format("DD MMM YYYY")}
          <br />
          <Text type="secondary" style={{ fontSize: 12 }}>
            {dayjs(r.triggeredAt).format("hh:mm A")}
          </Text>
        </div>
      ),
    },
    {
      title: "Status",
      key: "status",
      width: 110,
      render: (_, r) => <Tag color={STATUS_TAG_COLOR[r.status]}>{r.status}</Tag>,
    },
  ];

  return (
    <>
      <div
        className="flex w-full flex-wrap items-center justify-start gap-4"
        style={{ marginBottom: 16 }}
      >
        <RangePicker
          style={{ width: 340 }}
          presets={rangePresets}
          value={[dayjs(startDate), dayjs(endDate)]}
          onChange={(value) => {
            if (value && value[0] && value[1]) {
              applyFilter(() => {
                setStartDate(value[0]!.toISOString());
                setEndDate(value[1]!.toISOString());
              });
            }
          }}
          format={DATE_FORMAT}
          allowClear={false}
        />

        <Search
          placeholder="Search charger name or ID..."
          allowClear
          onChange={(e) => setSearchText(e.target.value)}
          style={{ minWidth: 240, flex: 1 }}
        />

        <Select
          allowClear
          placeholder="Hub: All"
          style={{ minWidth: 160 }}
          value={hubFilter || undefined}
          onChange={(v: string | undefined) => applyFilter(() => setHubFilter(v || null))}
          options={hubOptions.map((h) => ({ label: h, value: h }))}
        />

        <Select
          style={{ minWidth: 150 }}
          value={severityFilter}
          onChange={(v) => applyFilter(() => setSeverityFilter(v))}
          options={[
            { label: "Severity: All", value: "All" },
            ...SEVERITY_ORDER.map((s) => ({ label: s, value: s })),
          ]}
        />

        <Select
          style={{ minWidth: 150 }}
          value={statusFilter}
          onChange={(v) => applyFilter(() => setStatusFilter(v))}
          options={[
            { label: "Status: All", value: "All" },
            { label: "Active", value: "Active" },
            { label: "Watching", value: "Watching" },
            { label: "Resolved", value: "Resolved" },
          ]}
        />
      </div>

      <WarningBreakdown
        totalLabel="Total warnings"
        total={rows.length}
        severities={severities}
        rows={breakdown}
      />

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
        <Table<ChargerWarningRow>
          columns={columns}
          dataSource={rows}
          rowKey="id"
          pagination={{
            pageSize: limit,
            total: rows.length,
            current: currentPageNumber,
            onChange: (page) => setCurrentPageNumber(page),
            showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} warnings`,
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
