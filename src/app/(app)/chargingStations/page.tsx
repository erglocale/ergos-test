"use client";

import { Button, Popconfirm, QRCode, Select, Table, Tabs, Tag, Typography } from "antd";
import type { TableColumnsType } from "antd";
import dayjs from "dayjs";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import ChargerScheduleCalendar from "@/components/chargers/ChargerScheduleCalendar";
import { deriveCharger, qrUrlForCharger } from "@/components/chargers/derive";
import { useDb } from "@/data/store";
import type { Chargepoint } from "@/data/types";
import { message } from "@/lib/antdStatic";

const { Title } = Typography;

function OnlineDot({ online }: { online: boolean }) {
  return (
    <span
      style={{
        display: "inline-block",
        height: "12px",
        width: "12px",
        borderRadius: "50%",
        backgroundColor: online ? "#52c41a" : "#ff4d4f",
        marginRight: "8px",
      }}
    />
  );
}

export default function Chargepoints() {
  const db = useDb();
  const [hubFilter, setHubFilter] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("1");

  const hubs = useMemo(
    () => Array.from(new Set(db.chargepoints.map((cp) => cp.hub))),
    [db.chargepoints],
  );

  const data = useMemo(
    () =>
      hubFilter
        ? db.chargepoints.filter((cp) => cp.hub === hubFilter)
        : db.chargepoints,
    [db.chargepoints, hubFilter],
  );

  const columns: TableColumnsType<Chargepoint> = [
    {
      title: "Chargepoint Id",
      dataIndex: "id",
      width: 220,
      render: (_: unknown, station) => {
        const derived = deriveCharger(station);
        return (
          <>
            <OnlineDot online={station.status === "Online"} />
            <Link href={`/chargingStations/${station.id}`}>{station.id}</Link>
          </>
        );
      },
      key: "id",
    },
    {
      title: "Name",
      dataIndex: "name",
      key: "name",
      width: 300,
    },
    {
      title: "Type",
      dataIndex: "type",
      width: 80,
      key: "type",
      render: (_: unknown, station) => deriveCharger(station).type,
    },
    {
      title: "Capacity",
      dataIndex: "kw",
      width: 100,
      key: "kw",
      render: (_: unknown, station) => <>{deriveCharger(station).kw} kW</>,
    },
    {
      title: "Address",
      key: "address",
      width: 200,
      render: (_: unknown, station) => {
        const derived = deriveCharger(station);
        return (
          <span>
            {derived.city || "-"} , {derived.region || "-"}
          </span>
        );
      },
    },
    {
      title: "Created At",
      dataIndex: "createdAt",
      key: "createdAt",
      width: 230,
      render: (text: string) => <>{dayjs(text).format("DD MMM YYYY, hh:mm A")}</>,
    },
    {
      title: "QR Code",
      dataIndex: "qrCode",
      key: "qrCode",
      fixed: "right",
      width: 120,
      render: (_: unknown, station) => (
        <Popconfirm
          title={`QR Code :: ${station.id}`}
          placement="left"
          description={
            <div style={{ marginRight: "20px" }}>
              <div id={`charger-qr-code-${station.id}`}>
                <QRCode
                  value={qrUrlForCharger(station.id)}
                  bgColor="#fff"
                  size={300}
                  errorLevel="H"
                  type="svg"
                />
              </div>
            </div>
          }
          onConfirm={() => message.info("Not available in the sandbox")}
          okText="Download"
          showCancel={false}
        >
          <Button
            type="primary"
            size="small"
            style={{
              backgroundColor: "white",
              color: "#F26E21",
              fontSize: "14px",
              fontWeight: 280,
              padding: "14px 14px",
              borderRadius: "6px",
              border: "1px solid #CCCCCC",
              width: "100%",
              cursor: "pointer",
              transition: "background-color 0.2s",
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.backgroundColor = "#f8f8f8";
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.backgroundColor = "white";
            }}
          >
            View QR Code
          </Button>
        </Popconfirm>
      ),
    },
  ];

  const tabItems = [
    {
      key: "1",
      label: "All",
      children: <ChargerScheduleCalendar chargers={data} />,
    },
    {
      key: "2",
      label: "Online",
      children: (
        <Table
          columns={columns}
          dataSource={data.filter((station) => station.status === "Online")}
          rowKey="id"
          pagination={false}
          size="small"
          scroll={{ x: 1500, y: "70vh" }}
        />
      ),
    },
    {
      key: "3",
      label: "Offline",
      children: (
        <Table
          size="small"
          columns={columns}
          dataSource={data.filter((station) => station.status === "Offline")}
          rowKey="id"
          pagination={false}
          scroll={{ x: 1500, y: "70vh" }}
        />
      ),
    },
  ];

  useEffect(() => {
    const url = new URL(window.location.href);
    const statusParam = url.searchParams.get("status");
    if (statusParam === "online") {
      setActiveTab("2");
    } else if (statusParam === "offline") {
      setActiveTab("3");
    } else {
      setActiveTab("1");
    }
  }, []);

  return (
    <div style={{ marginLeft: 16, marginRight: 16 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Title level={3} style={{ marginBottom: "0px" }}>
          Chargepoints
        </Title>
        <Button
          type="primary"
          onClick={() => message.info("Not available in the sandbox")}
          style={{
            backgroundColor: "#F26E21",
            color: "white",
            fontSize: "15px",
            fontWeight: 380,
            padding: "4px 4px",
            borderRadius: "6px",
            border: "1px solid #CCCCCC",
            width: "190px",
            cursor: "pointer",
            transition: "background-color 0.2s",
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.backgroundColor = "#F7955D";
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.backgroundColor = "#F26E21";
          }}
        >
          Download all QR codes
        </Button>
      </div>
      <div
        style={{
          marginTop: 12,
          marginBottom: 8,
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <Select
          allowClear
          showSearch
          placeholder="Filter by hub"
          value={hubFilter || undefined}
          onChange={(v: string | undefined) => setHubFilter(v || null)}
          optionFilterProp="label"
          style={{ minWidth: 180 }}
          options={hubs.map((h) => ({ label: h, value: h }))}
        />
      </div>
      <div style={{ marginTop: "0px" }}>
        <Tabs
          defaultActiveKey="1"
          items={tabItems}
          onChange={(key) => setActiveTab(key)}
          activeKey={activeTab}
        />
      </div>
    </div>
  );
}
