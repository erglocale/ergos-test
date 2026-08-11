"use client";

import { DownloadOutlined } from "@ant-design/icons";
import { Badge, Button, Card, Col, DatePicker, Row, Select, Table, Tabs, Tag, Tooltip, Typography } from "antd";
import type { TableProps } from "antd";
import dayjs, { type Dayjs } from "dayjs";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useDb } from "@/data/store";
import type { ChargingSession } from "@/data/types";
import {
  downloadCsv,
  fmtDateTime,
  getDurationString,
  hubForSession,
  sessionAvgPowerKw,
} from "./sessionUtils";
import { DATE_FORMAT } from "@/lib/dateFormat";

const { Text } = Typography;
const { RangePicker } = DatePicker;

function isSessionOngoing(session: ChargingSession) {
  return session.endTime === null || session.socEnd === null;
}

function getSessionLocation(session: ChargingSession, address: string | undefined) {
  const parts: string[] = [];
  if (session.chargerName) parts.push(session.chargerName);
  if (address) parts.push(address);
  return parts.join(", ");
}

/** What the filter bar currently selects — shared with the live section. */
export interface SessionFilters {
  /** null = all hubs (the default). */
  hub: string | null;
  /** Empty = every vehicle. */
  plates: string[];
}

export default function SessionsList({
  hideHeader = false,
  renderLive,
}: {
  hideHeader?: boolean;
  /**
   * Rendered between the filter bar and the sessions table. Demo spec item 6:
   * the filters moved above the live charging block so ongoing sessions can be
   * narrowed to one hub — on a large fleet there are many at once.
   */
  renderLive?: (filters: SessionFilters) => React.ReactNode;
}) {
  const db = useDb();
  const [limit] = useState(20);
  const [currentPageNumber, setCurrentPageNumber] = useState(1);

  // --- Internal state for date range (default: last 10 days) ---
  const [internalRange, setInternalRange] = useState<[Dayjs, Dayjs]>([dayjs().subtract(10, "day"), dayjs()]);
  const [vehicleNumberPlates, setVehicleNumberPlates] = useState<string[]>([]);
  const [sessionTypeActiveTabKey, setSessionTypeActiveTabKey] = useState("FLEET_CHARGING");

  const numberPlateOptions = useMemo(
    () =>
      db.vehicles
        .filter((v) => v.reg)
        .map((v) => ({ label: v.reg, value: v.reg }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [db.vehicles],
  );

  const hubOptions = useMemo(() => {
    const hubs = [...new Set(db.chargepoints.map((c) => c.hub))];
    return hubs.map((h) => ({ label: h, value: h }));
  }, [db.chargepoints]);

  const [hubFilter, setHubFilter] = useState<string | null>(null);

  const filteredSessions = useMemo(() => {
    const [start, end] = internalRange;
    return db.sessions.filter((s) => {
      const t = dayjs(s.startTime);
      if (t.isBefore(start.startOf("day")) || t.isAfter(end.endOf("day"))) return false;
      if (vehicleNumberPlates.length && !vehicleNumberPlates.includes(s.vehicleReg)) return false;
      // Hub is where the charging happened, not where the vehicle is based —
      // a Six Mile van plugged in at Beltola belongs to Beltola's sessions.
      if (hubFilter && hubForSession(s, db.chargepoints) !== hubFilter) return false;
      return true;
    });
  }, [db.sessions, db.chargepoints, internalRange, vehicleNumberPlates, hubFilter]);

  // No sessionType in the fixtures — treat driverless vehicles' sessions as admin charging.
  const fleetSessions = useMemo(
    () => filteredSessions.filter((s) => s.driverName !== "—"),
    [filteredSessions],
  );
  const adminSessions = useMemo(
    () => filteredSessions.filter((s) => s.driverName === "—"),
    [filteredSessions],
  );

  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [selectedRows, setSelectedRows] = useState<ChargingSession[]>([]);

  const rowSelection: TableProps<ChargingSession>["rowSelection"] = {
    selectedRowKeys,
    onChange: (keys, rows) => {
      setSelectedRowKeys(keys);
      setSelectedRows((prev) => {
        const prevMap = new Map(prev.map((r) => [r.id, r]));
        rows.forEach((r) => prevMap.set(r.id, r));
        return Array.from(prevMap.values()).filter((r) => keys.includes(r.id));
      });
    },
    preserveSelectedRowKeys: true,
  };

  useEffect(() => {
    setCurrentPageNumber(1);
  }, [internalRange, vehicleNumberPlates, hubFilter]);

  const handleDateChange: React.ComponentProps<typeof RangePicker>["onChange"] = (dates) => {
    if (dates && dates[0] && dates[1]) {
      setInternalRange([dates[0], dates[1]]);
    } else {
      setInternalRange([dayjs().subtract(10, "day"), dayjs()]);
    }
  };

  function exportSessions(rows: ChargingSession[]) {
    downloadCsv(
      `charging-sessions-${internalRange[0].format("YYYY-MM-DD")}-${internalRange[1].format("YYYY-MM-DD")}.csv`,
      ["Session Id", "Vehicle", "Energy (kWh)", "Duration", "Location", "Start Time", "End Time", "Cost (INR)", "Status"],
      rows.map((s) => [
        s.id,
        s.vehicleReg,
        s.energyKwh,
        s.endTime ? getDurationString(s.startTime, s.endTime) : "Ongoing",
        hubForSession(s, db.chargepoints),
        fmtDateTime(s.startTime),
        s.endTime ? fmtDateTime(s.endTime) : "Ongoing",
        s.cost,
        s.status,
      ]),
    );
  }

  const columns: TableProps<ChargingSession>["columns"] = [
    {
      title: "Session Id",
      dataIndex: "id",
      key: "sessionId",
      width: 200,
      render: (_, session) => {
        const isSessionActive = isSessionOngoing(session);
        return (
          <Tooltip title="This charging session is done at ergLocale managed charging hub">
            <div className="flex flex-col items-start gap-1">
              <div className="flex w-full items-center gap-1">
                {isSessionActive ? <Badge status="processing" color="#52c41a" /> : null}

                <Link href={`/chargingSessions/${session.id}`}>
                  <Text style={{ color: "#f97417" }}>{session.id}</Text>
                </Link>

                <div className="ml-1 rounded-md border border-gray-300 px-1" style={{ fontSize: "10px" }}>
                  <span style={{ color: "#f97417", fontWeight: 600 }}>erg</span>
                  <span style={{ color: "black", fontWeight: 600 }}>Locale</span>
                </div>
              </div>
            </div>
          </Tooltip>
        );
      },
    },
    {
      title: "Vehicle",
      dataIndex: "vehicleReg",
      key: "vehiclePlate",
      width: 150,
      render: (_, session) => session.vehicleReg || <Tag color="orange">N/A</Tag>,
    },
    {
      title: "Energy Consumed",
      dataIndex: "energyKwh",
      key: "energyConsumed",
      width: 140,
      render: (_, session) =>
        session.energyKwh === null ? <Tag color="orange">N/A</Tag> : <>{session.energyKwh.toFixed(3)} kWh</>,
    },
    {
      title: "Avg Power",
      dataIndex: "avgPower",
      key: "avgPower",
      width: 120,
      render: (_, session) => {
        const kw = sessionAvgPowerKw(session);
        return kw === null ? <Tag color="orange">N/A</Tag> : <>{kw.toFixed(2)} kW</>;
      },
    },
    {
      title: "Duration",
      dataIndex: "duration",
      key: "duration",
      width: 150,
      render: (_, session) => (
        <>
          {session.endTime !== null ? (
            getDurationString(session.startTime, session.endTime)
          ) : (
            <Tag color="orange">N/A</Tag>
          )}
        </>
      ),
    },
    {
      title: "Location",
      dataIndex: "location",
      key: "location",
      width: 180,
      render: (_, session) => <Tag color="magenta">{hubForSession(session, db.chargepoints)}</Tag>,
    },
    {
      title: "Start Time",
      dataIndex: "startTime",
      key: "normalizedStartTime",
      width: 260,
      sorter: (a, b) => dayjs(a.startTime).valueOf() - dayjs(b.startTime).valueOf(),
      render: (_, session) => <>{fmtDateTime(session.startTime)}</>,
    },
    {
      title: "End Time",
      dataIndex: "endTime",
      key: "normalizedEndTime",
      width: 260,
      sorter: (a, b) => dayjs(a.endTime ?? 0).valueOf() - dayjs(b.endTime ?? 0).valueOf(),
      render: (_, session) =>
        session.endTime !== null ? fmtDateTime(session.endTime) : <Tag color="orange">N/A</Tag>,
    },
    {
      title: "Session Location",
      dataIndex: "sessionLocation",
      key: "sessionLocation",
      width: 400,
      render: (_, session) => {
        const cp = db.chargepoints.find((c) => c.id === session.chargerId);
        const loc = getSessionLocation(session, cp?.address);
        return loc || <Tag color="orange">N/A</Tag>;
      },
    },
  ];

  // Original default column selection hides Session Location in the list view.
  const visibleColumns = columns.filter((col) => col.key !== "sessionLocation");

  const renderTable = (dataSource: ChargingSession[], extraHiddenKeys: string[] = []) => (
    <Card
      style={{
        width: "100%",
        borderRadius: "12px",
        boxShadow: "0 2px 6px rgba(0, 0, 0, 0.04)",
        overflow: "hidden",
        border: "1px solid #f0f0f0",
      }}
      styles={{ body: { padding: 0 } }}
      hoverable
    >
      <Table<ChargingSession>
        rowSelection={rowSelection}
        columns={visibleColumns.filter((col) => !extraHiddenKeys.includes(String(col.key)))}
        dataSource={dataSource}
        rowKey="id"
        size="small"
        pagination={{
          pageSize: limit,
          total: dataSource.length,
          current: currentPageNumber,
          onChange: (page) => setCurrentPageNumber(page),
          showSizeChanger: false,
          showTotal: (total, r) => `${r[0]}-${r[1]} of ${total} sessions`,
          style: { marginRight: "16px" },
        }}
        scroll={{ x: "max-content", y: "70vh" }}
        bordered={false}
        rowClassName={() => "custom-table-row"}
        className="styled-drivers-table"
      />
    </Card>
  );

  return (
    <>
      <div style={{ marginBottom: "16px" }}>
        <Row gutter={[16, 16]} align="bottom">
          <Col xs={24} sm={12} md={8} lg={6}>
            <RangePicker value={internalRange} onChange={handleDateChange} style={{ width: "100%" }} format={DATE_FORMAT} />
          </Col>
          <Col xs={24} sm={12} md={8} lg={12}>
            <div style={{ display: "flex", gap: 8 }}>
              <Select
                value={hubFilter}
                onChange={(hub: string | null | undefined) => setHubFilter(hub ?? null)}
                placeholder="All hubs"
                style={{ width: 160, minWidth: 160 }}
                options={hubOptions}
                allowClear
              />
              <Select
                mode="multiple"
                style={{ flex: 1, minWidth: 0 }}
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
            </div>
          </Col>
          <Col xs={24} sm={12} md={24} lg={4} style={{ textAlign: "right" }}>
            {selectedRowKeys.length > 0 ? (
              <Button
                type="primary"
                icon={<DownloadOutlined />}
                size="middle"
                style={{ width: "100%" }}
                onClick={() => {
                  exportSessions(selectedRows);
                  setSelectedRowKeys([]);
                  setSelectedRows([]);
                }}
              >
                Download Selected ({selectedRowKeys.length})
              </Button>
            ) : (
              <Button
                type="primary"
                icon={<DownloadOutlined />}
                size="middle"
                style={{ width: "100%", maxWidth: "200px" }}
                onClick={() =>
                  exportSessions(sessionTypeActiveTabKey === "FLEET_CHARGING" ? fleetSessions : adminSessions)
                }
                disabled={!filteredSessions.length}
              >
                Export as Excel
              </Button>
            )}
          </Col>
          {selectedRowKeys.length > 0 && (
            <Col xs={24} sm={12} md={24} lg={2}>
              <Button
                size="middle"
                style={{ width: "100%" }}
                onClick={() => {
                  setSelectedRowKeys([]);
                  setSelectedRows([]);
                }}
              >
                Reset
              </Button>
            </Col>
          )}
        </Row>
      </div>

      {renderLive?.({ hub: hubFilter, plates: vehicleNumberPlates })}

      {!hideHeader && (
        <div style={{ marginTop: "20px", marginBottom: "8px" }}>
          <Text style={{ fontSize: "18px", fontWeight: 600 }}>Charging Sessions</Text>
        </div>
      )}

      <Tabs
        activeKey={sessionTypeActiveTabKey}
        onChange={(key) => {
          setSessionTypeActiveTabKey(key);
          setSelectedRowKeys([]);
          setSelectedRows([]);
        }}
        items={[
          {
            key: "FLEET_CHARGING",
            label: "Fleet Charging",
            children: renderTable(fleetSessions),
          },
          {
            key: "ERGOS_ADMIN_CHARGING",
            label: "Admin Charging",
            children: renderTable(adminSessions, ["vehiclePlate"]),
          },
        ]}
      />
    </>
  );
}
