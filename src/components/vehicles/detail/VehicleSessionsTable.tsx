"use client";

import { DownloadOutlined } from "@ant-design/icons";
import { Badge, Button, Card, DatePicker, Table, Tag, Tooltip, Typography } from "antd";
import type { TableProps } from "antd";
import dayjs, { type Dayjs } from "dayjs";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  downloadCsv,
  fmtDateTime,
  getDurationString,
  hubForSession,
  sessionAvgPowerKw,
} from "@/components/charging-sessions/sessionUtils";
import { useDb } from "@/data/store";
import type { ChargingSession, Vehicle } from "@/data/types";

const { Text } = Typography;
const { RangePicker } = DatePicker;

function isSessionOngoing(session: ChargingSession) {
  return session.endTime === null || session.socEnd === null;
}

// Charging Sessions tab — production renders <ChargingSessions evId hideHeader />;
// the sandbox filters db.sessions by the vehicle's reg with matching columns.
export default function VehicleSessionsTable({ vehicle }: { vehicle: Vehicle }) {
  const db = useDb();
  const [limit] = useState(20);
  const [currentPageNumber, setCurrentPageNumber] = useState(1);
  const [range, setRange] = useState<[Dayjs, Dayjs]>([dayjs().subtract(30, "day"), dayjs()]);

  const sessions = useMemo(
    () =>
      db.sessions.filter(
        (s) =>
          s.vehicleReg === vehicle.reg &&
          !dayjs(s.startTime).isBefore(range[0].startOf("day")) &&
          !dayjs(s.startTime).isAfter(range[1].endOf("day")),
      ),
    [db.sessions, vehicle.reg, range],
  );

  function exportSessions(rows: ChargingSession[]) {
    downloadCsv(
      `charging-sessions-${vehicle.reg}.csv`,
      ["Session Id", "Vehicle", "Energy (kWh)", "Duration", "Hub", "Start Time", "End Time", "Cost", "Status"],
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
      title: "Charger Id",
      dataIndex: "chargerId",
      key: "chargerId",
      width: 150,
      render: (_, session) => (
        <Text style={{ color: "#f97417" }}>{session.chargerName || session.chargerId}</Text>
      ),
    },
    {
      title: "Connector Id",
      dataIndex: "connectorId",
      key: "connectorId",
      width: 110,
      render: (_, session) => <>{session.connectorId}</>,
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
      width: 220,
      sorter: (a, b) => dayjs(a.startTime).valueOf() - dayjs(b.startTime).valueOf(),
      render: (_, session) => <>{fmtDateTime(session.startTime)}</>,
    },
    {
      title: "End Time",
      dataIndex: "endTime",
      key: "normalizedEndTime",
      width: 220,
      sorter: (a, b) => dayjs(a.endTime ?? 0).valueOf() - dayjs(b.endTime ?? 0).valueOf(),
      render: (_, session) =>
        session.endTime !== null ? fmtDateTime(session.endTime) : <Tag color="orange">N/A</Tag>,
    },
  ];

  return (
    <>
      <div className="mb-4 flex w-full items-center justify-between">
        <RangePicker
          value={range}
          onChange={(v) => {
            if (!v?.[0] || !v?.[1]) return;
            setRange([v[0], v[1]]);
            setCurrentPageNumber(1);
          }}
          allowClear={false}
        />
        <Button
          type="primary"
          icon={<DownloadOutlined />}
          size="middle"
          onClick={() => exportSessions(sessions)}
          disabled={!sessions.length}
        >
          Export as Excel
        </Button>
      </div>

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
          columns={columns}
          dataSource={sessions}
          rowKey="id"
          size="small"
          pagination={{
            pageSize: limit,
            total: sessions.length,
            current: currentPageNumber,
            onChange: (page) => setCurrentPageNumber(page),
            showSizeChanger: false,
            showTotal: (total, r) => `${r[0]}-${r[1]} of ${total} sessions`,
            style: { marginRight: "16px" },
          }}
          scroll={{ x: "max-content" }}
          bordered={false}
          rowClassName={() => "custom-table-row"}
          className="styled-drivers-table"
        />
      </Card>
    </>
  );
}
