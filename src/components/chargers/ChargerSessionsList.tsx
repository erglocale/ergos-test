"use client";

import { DownloadOutlined } from "@ant-design/icons";
import {
  Button,
  Card,
  Col,
  Input,
  Row,
  Select,
  Table,
  Tag,
  Tooltip,
} from "antd";
import type { TableColumnType } from "antd";
import dayjs from "dayjs";
import { useMemo, useState } from "react";
import { MdViewColumn } from "react-icons/md";
import { useDb } from "@/data/store";
import type { ChargingSession } from "@/data/types";

const { Search } = Input;

const fmt = (iso: string | null) =>
  iso ? dayjs(iso).format("DD MMM YYYY, hh:mm A") : "";

function durationString(start: string, end: string | null) {
  const endTime = end ? dayjs(end) : dayjs();
  const mins = Math.max(0, endTime.diff(dayjs(start), "minute"));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default function ChargerSessionsList({ chargerId }: { chargerId: string }) {
  const db = useDb();
  const [search, setSearch] = useState("");
  const [currentPageNumber, setCurrentPageNumber] = useState(1);

  const defaultSessionsTableColumns: TableColumnType<ChargingSession>[] = useMemo(
    () => [
      {
        title: "Session Id",
        dataIndex: "id",
        width: 200,
        render: (text: string, session) => (
          <>
            {session.endTime === null ? (
              <Tooltip title="Session is still ongoing">
                <span
                  style={{
                    display: "inline-block",
                    height: 12,
                    width: 12,
                    borderRadius: "50%",
                    backgroundColor: "#52c41a",
                    marginRight: 6,
                  }}
                />
              </Tooltip>
            ) : null}
            <span style={{ color: "#f97417" }}>{text}</span>
          </>
        ),
      },
      {
        title: "Connector Id",
        dataIndex: "connectorId",
        width: 130,
      },
      {
        title: "Vehicle",
        dataIndex: "vehicleReg",
        width: 160,
      },
      {
        title: "Driver",
        dataIndex: "driverName",
        width: 160,
      },
      {
        title: "Energy Consumed",
        dataIndex: "energyKwh",
        width: 160,
        render: (v: number) => <>{Number(v).toFixed(3)} kWh</>,
      },
      {
        title: "Duration",
        dataIndex: "duration",
        width: 130,
        render: (_: unknown, session) =>
          durationString(session.startTime, session.endTime),
      },
      {
        title: "Start Time",
        dataIndex: "startTime",
        width: 210,
        render: (v: string) => fmt(v),
      },
      {
        title: "End Time",
        dataIndex: "endTime",
        width: 210,
        render: (v: string | null) => fmt(v),
      },
      {
        title: "Cost",
        dataIndex: "cost",
        width: 110,
        render: (v: number) => <>₹{Number(v).toFixed(2)}</>,
      },
      {
        title: "Status",
        dataIndex: "status",
        width: 120,
        render: (v: ChargingSession["status"]) => (
          <Tag color={v === "Ongoing" ? "green" : v === "Completed" ? "blue" : "red"}>
            {v}
          </Tag>
        ),
      },
      {
        title: "Stop Reason",
        dataIndex: "stopReason",
        width: 160,
        render: (v: string | null) => v ?? "-",
      },
    ],
    [],
  );

  const [selectedColumnKeys, setSelectedColumnKeys] = useState<string[]>(() =>
    defaultSessionsTableColumns.map((c) => String(c.dataIndex)),
  );

  const selectedColumns = defaultSessionsTableColumns.filter((c) =>
    selectedColumnKeys.includes(String(c.dataIndex)),
  );

  const sessions = useMemo(() => {
    const rows = db.sessions.filter((s) => s.chargerId === chargerId);
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter(
      (s) =>
        s.id.toLowerCase().includes(q) ||
        s.vehicleReg.toLowerCase().includes(q) ||
        s.driverName.toLowerCase().includes(q),
    );
  }, [db.sessions, chargerId, search]);

  function downloadSessionsAsCsv() {
    const header = [
      "Session Id",
      "Charger Id",
      "Connector Id",
      "Vehicle",
      "Driver",
      "Energy (kWh)",
      "Start Time",
      "End Time",
      "Cost",
      "Status",
    ];
    const lines = sessions.map((s) =>
      [
        s.id,
        s.chargerId,
        s.connectorId,
        s.vehicleReg,
        s.driverName,
        s.energyKwh,
        `"${fmt(s.startTime)}"`,
        `"${fmt(s.endTime)}"`,
        s.cost,
        s.status,
      ].join(","),
    );
    const blob = new Blob([[header.join(","), ...lines].join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `charging-sessions-${chargerId}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <Card
      title={`Charging Sessions #${chargerId}`}
      styles={{ body: { paddingLeft: "10px", paddingRight: "10px" } }}
    >
      <Row gutter={[6, 6]} style={{ marginBottom: "20px" }}>
        <Col span={8}>
          <Tooltip title="Columns">
            <Select
              mode="multiple"
              style={{ width: "100%" }}
              suffixIcon={<MdViewColumn />}
              maxTagCount={2}
              placeholder="Please select"
              value={selectedColumnKeys}
              onChange={(val: string[]) => setSelectedColumnKeys(val)}
              options={defaultSessionsTableColumns.map((columnDetails) => ({
                value: String(columnDetails.dataIndex),
                label: String(columnDetails.title),
                disabled: columnDetails.dataIndex === "id",
              }))}
            />
          </Tooltip>
        </Col>
        <Col span={12}>
          <Search
            placeholder="input search text"
            allowClear
            style={{ width: "100%" }}
            onChange={(e) => setSearch(e.target.value)}
          />
        </Col>
        <Col span={4}>
          <Button
            type="primary"
            icon={<DownloadOutlined />}
            size="middle"
            style={{ width: "100%" }}
            onClick={() => downloadSessionsAsCsv()}
          >
            Export as CSV
          </Button>
        </Col>
      </Row>

      <Table
        columns={selectedColumns}
        dataSource={sessions}
        rowKey="id"
        size="small"
        scroll={{ x: "100vw", y: "70vh" }}
        pagination={{
          pageSize: 14,
          total: sessions.length,
          onChange: (page) => setCurrentPageNumber(page),
          current: currentPageNumber,
        }}
      />
    </Card>
  );
}
