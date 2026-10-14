"use client";

// Replica of prod's Components/Home/ChargerAlertsList.jsx: raised as soon as a charger reports a
// problem, closed as soon as it stops. Recurring faults are closed by hand from the ⋯ menu.

import {
  Button,
  Card,
  DatePicker,
  Dropdown,
  Empty,
  Input,
  Select,
  Table,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import type { TableProps } from "antd";
import dayjs from "dayjs";
import { Ellipsis } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { rangePresets } from "@/components/home/FleetAndChargerHostLayout";
import WorkOrderCell from "@/components/workOrders/WorkOrderCell";
import { useDb } from "@/data/store";
import type { DetectedAlertType } from "@/lib/ocppDetectors";
import { message, modal } from "@/lib/antdStatic";
import { fmtDateTime } from "./alertUtils";
import { DATE_FORMAT } from "@/lib/dateFormat";
import { resolveChargerAlert, useResolvedChargerAlerts } from "./chargerAlertResolutions";
import {
  CHARGER_ALERT_TYPES,
  type ChargerWarningRow,
  alertTypeLabel,
  buildChargerWarningRows,
  connectorLabel,
} from "./chargerWarningRows";
import WarningBreakdown, { type BreakdownRow } from "./WarningBreakdown";

const { Text } = Typography;
const { RangePicker } = DatePicker;
const { Search } = Input;

const PAGE_SIZE = 10;

type AlertState = "all" | "open" | "resolved";

/** The charger alert rows the tab and its badge both read, with resolutions applied. */
export function useChargerAlertRows(): ChargerWarningRow[] {
  const db = useDb();
  const resolved = useResolvedChargerAlerts();
  return useMemo(
    () =>
      buildChargerWarningRows({
        chargepoints: db.chargepoints,
        sessions: db.sessions,
        chargerWarnings: db.chargerWarnings,
        resolved,
      }),
    [db.chargepoints, db.sessions, db.chargerWarnings, resolved],
  );
}

// Local replica of Components/HubManagement/HubFilter — hubs derived from the dummy store.
function HubFilter({
  value,
  onChange,
  style,
}: {
  value: string | null;
  onChange: (hub: string | null) => void;
  style?: React.CSSProperties;
}) {
  const db = useDb();
  const hubs = useMemo(
    () =>
      Array.from(
        new Set([...db.vehicles.map((v) => v.hub), ...db.chargepoints.map((c) => c.hub)]),
      ).sort(),
    [db.vehicles, db.chargepoints],
  );
  return (
    <Select
      allowClear
      showSearch
      placeholder="Hub"
      value={value || undefined}
      onChange={(v) => onChange(v || null)}
      optionFilterProp="label"
      style={style}
      options={hubs.map((h) => ({ label: h, value: h }))}
    />
  );
}

export default function ChargerWarnings() {
  const router = useRouter();
  const allRows = useChargerAlertRows();
  const [startDate, setStartDate] = useState(() =>
    dayjs().subtract(7, "day").startOf("day").toISOString(),
  );
  const [endDate, setEndDate] = useState(() => dayjs().toISOString());
  const [hubLocationId, setHubLocationId] = useState<string | null>(null);
  const [type, setType] = useState<"All" | DetectedAlertType>("All");
  // Opens on everything, so alerts marked resolved stay in view
  const [state, setState] = useState<AlertState>("all");
  const [searchText, setSearchText] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchText);
      setPage(1);
    }, 700);
    return () => clearTimeout(timer);
  }, [searchText]);

  /** Any filter change puts the table back on page 1. */
  const applyFilter = (change: () => void) => {
    change();
    setPage(1);
  };

  const alerts = useMemo(() => {
    const start = dayjs(startDate);
    // The whole end day counts, so an alert raised after the page opened still shows
    const end = dayjs(endDate).endOf("day");
    const q = search.trim().toLowerCase();
    return allRows.filter((r) => {
      const t = dayjs(r.raisedAt);
      if (t.isBefore(start) || t.isAfter(end)) return false;
      if (state === "open" && r.resolvedAt) return false;
      if (state === "resolved" && !r.resolvedAt) return false;
      if (type !== "All" && r.type !== type) return false;
      if (hubLocationId && r.hub !== hubLocationId) return false;
      if (
        q &&
        ![r.chargerName, r.chargerId, r.errorCode ?? "", r.message].some((s) =>
          s.toLowerCase().includes(q),
        )
      )
        return false;
      return true;
    });
  }, [allRows, startDate, endDate, state, type, hubLocationId, search]);

  const breakdown = useMemo<BreakdownRow[]>(() => {
    const counts = new Map<DetectedAlertType, number>();
    alerts.forEach((a) => counts.set(a.type, (counts.get(a.type) ?? 0) + 1));
    return Array.from(counts.entries())
      .map(([key, count]) => ({
        label: alertTypeLabel(key),
        count,
        color: CHARGER_ALERT_TYPES[key]?.color ?? "#9ca3af",
      }))
      .sort((a, b) => b.count - a.count);
  }, [alerts]);

  const askToResolve = (r: ChargerWarningRow) =>
    modal.confirm({
      title: "Mark this alert as resolved?",
      content: r.message,
      okText: "Mark as resolved",
      onOk: () => {
        resolveChargerAlert(r);
        message.success("Alert marked as resolved");
      },
    });

  const columns: TableProps<ChargerWarningRow>["columns"] = [
    {
      title: "Charger",
      key: "charger",
      width: 170,
      render: (_, r) => (
        <div
          style={{ cursor: "pointer", lineHeight: 1.35 }}
          onClick={() => router.push(`/chargingStations/${r.chargerId}`)}
        >
          <Text strong style={{ fontSize: 13 }}>
            {r.chargerName}
          </Text>
          <div>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {connectorLabel(r.connectorId)}
            </Text>
          </div>
          <Text type="secondary" style={{ fontSize: 11 }}>
            {r.hub}
          </Text>
        </div>
      ),
    },
    {
      title: "Alert",
      key: "alert",
      render: (_, r) => (
        <div style={{ lineHeight: 1.35 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Text style={{ fontSize: 12, color: "#64748b" }}>{alertTypeLabel(r.type)}</Text>
            {r.severity === "Critical" && <Tag color="red">Critical</Tag>}
          </div>
          <div style={{ fontSize: 13, whiteSpace: "normal" }}>{r.message}</div>
          {r.errorCode && (
            <Text style={{ fontFamily: "monospace", fontSize: 11, color: "#9ca3af" }}>
              {r.errorCode}
            </Text>
          )}
        </div>
      ),
    },
    {
      title: "What to do",
      key: "action",
      width: 240,
      render: (_, r) => (
        <div style={{ lineHeight: 1.35 }}>
          <Text style={{ color: "#0d9488", fontSize: 13 }}>{r.action}</Text>
          <div style={{ marginTop: 4 }}>
            <WorkOrderCell
              prefill={{
                source: "CHARGER_WARNING",
                sourceId: r.id,
                subject: r.chargerName,
                subjectHref: `/chargingStations/${r.chargerId}`,
                hub: r.hub,
                title: CHARGER_ALERT_TYPES[r.type]?.workTitle ?? "",
                details: r.action,
                priority: "High",
              }}
              inline
            />
          </div>
        </div>
      ),
    },
    {
      title: "Triggered",
      key: "raisedAt",
      width: 130,
      render: (_, r) => (
        <div style={{ lineHeight: 1.35 }}>
          <Text style={{ fontSize: 12 }}>{fmtDateTime(r.raisedAt)}</Text>
          <div style={{ marginTop: 4 }}>
            {r.resolvedAt ? (
              <Tooltip title={`Resolved ${fmtDateTime(r.resolvedAt)}`}>
                <Tag color="green">Resolved</Tag>
              </Tooltip>
            ) : (
              <Tag color="red">Active</Tag>
            )}
          </div>
        </div>
      ),
    },
    {
      title: "",
      key: "actions",
      width: 48,
      align: "center",
      render: (_, r) =>
        r.resolvedAt ? null : (
          <Dropdown
            trigger={["click"]}
            menu={{
              items: [{ key: "resolve", label: "Mark as resolved" }],
              onClick: () => askToResolve(r),
            }}
          >
            <Button type="text" size="small" icon={<Ellipsis style={{ width: 16 }} />} />
          </Dropdown>
        ),
    },
  ];

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
              applyFilter(() => {
                setStartDate(value[0]!.toISOString());
                setEndDate(value[1]!.toISOString());
              });
            }
          }}
          format={DATE_FORMAT}
          allowClear={false}
        />

        <HubFilter
          value={hubLocationId}
          onChange={(v) => applyFilter(() => setHubLocationId(v))}
          style={{ width: 140, minWidth: 140 }}
        />

        <Search
          placeholder="Search charger, error code..."
          allowClear
          onChange={(e) => setSearchText(e.target.value)}
          style={{ minWidth: 240, flex: 1 }}
        />

        <Select
          style={{ minWidth: 190 }}
          value={type}
          onChange={(v) => applyFilter(() => setType(v))}
          options={[
            { label: "All alert types", value: "All" },
            ...Object.entries(CHARGER_ALERT_TYPES).map(([value, t]) => ({
              label: t.label,
              value: value as DetectedAlertType,
            })),
          ]}
        />

        <Select
          style={{ minWidth: 140 }}
          value={state}
          onChange={(v) => applyFilter(() => setState(v))}
          options={[
            { label: "All Statuses", value: "all" },
            { label: "Active", value: "open" },
            { label: "Resolved", value: "resolved" },
          ]}
        />
      </div>

      <WarningBreakdown
        totalLabel="Total Alerts"
        total={alerts.length}
        severities={[]}
        note="Raised as soon as a charger reports a problem, closed as soon as it stops."
        rows={breakdown}
        breakdownLabel="Alert Type Breakdown"
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
          dataSource={alerts}
          rowKey="id"
          pagination={{
            current: page,
            pageSize,
            total: alerts.length,
            showSizeChanger: true,
            pageSizeOptions: ["10", "20", "50", "100"],
            onChange: (nextPage, nextSize) => {
              setPage(nextSize !== pageSize ? 1 : nextPage);
              setPageSize(nextSize);
            },
            showTotal: (count, range) => `${range[0]}-${range[1]} of ${count} alerts`,
            placement: ["bottomCenter"],
          }}
          bordered={false}
          locale={{
            emptyText: (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={
                  state === "open"
                    ? "No alerts. Every charger is reporting normally."
                    : "No alerts for these filters"
                }
              />
            ),
          }}
          rowClassName={() => "custom-table-row"}
          className="styled-warnings-table"
        />
      </Card>
    </>
  );
}
