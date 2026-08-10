"use client";

import {
  Button,
  Card,
  Empty,
  InputNumber,
  message,
  Radio,
  Table,
  Tag,
  Typography,
} from "antd";
import type { TableProps } from "antd";
import dayjs from "dayjs";
import ReactECharts from "echarts-for-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useDb } from "@/data/store";
import type { ChargingSession, Vehicle } from "@/data/types";

const { Title, Text } = Typography;
const GREEN = "#16a34a";
const ORANGE = "#f97316";
const GRAY = "#d1d5db";
const RED = "#ef4444";

// Hub page (demo spec item 3): chargers + vehicles inside one hub, occupancy,
// site power, per-vehicle charging inputs (ready time / required SoC — the
// hook for energy-brain's algo choice), and preliminary analytics charts
// (exact chart specs arrive later per the doc).

interface PlanRow {
  readyTime: string; // "HH:mm"
  targetSoc: number;
}
type HubPlan = { mode: "fifo" | "ready-times"; rows: Record<string, PlanRow> };

function planKey(hub: string) {
  return `ergos-test:hub-plan:${hub}`;
}

function StatCard({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <Card
      style={{ borderRadius: 12, border: "1px solid #f0f0f0" }}
      styles={{ body: { padding: 16 } }}
    >
      <Text strong style={{ display: "block", marginBottom: 10 }}>
        {title}
      </Text>
      {children}
    </Card>
  );
}

export default function HubPage() {
  const params = useParams<{ name: string }>();
  const hubName = decodeURIComponent(params.name);
  const db = useDb();

  const chargers = useMemo(
    () => db.chargepoints.filter((cp) => cp.hub === hubName),
    [db.chargepoints, hubName],
  );
  const vehicles = useMemo(
    () => db.vehicles.filter((v) => v.hub === hubName),
    [db.vehicles, hubName],
  );
  const chargerIds = useMemo(() => new Set(chargers.map((c) => c.id)), [chargers]);
  const hubSessions = useMemo(
    () => db.sessions.filter((s) => chargerIds.has(s.chargerId)),
    [db.sessions, chargerIds],
  );
  const ongoing = hubSessions.filter((s) => s.endTime === null);

  // ---- occupancy ----------------------------------------------------------
  const occupancy = useMemo(() => {
    let inUse = 0;
    let available = 0;
    let offline = 0;
    for (const cp of chargers) {
      const busy = Math.min(
        cp.connectors.length,
        ongoing.filter((s) => s.chargerId === cp.id).length,
      );
      for (const [i, cn] of cp.connectors.entries()) {
        if (cp.status === "Offline" || cn.status === "Faulted" || cn.status === "Unavailable") {
          offline += 1;
        } else if (i < busy) {
          inUse += 1;
        } else {
          available += 1;
        }
      }
    }
    return { inUse, available, offline };
  }, [chargers, ongoing]);

  // ---- site power (sum of connector kW over active sessions, 15-min grid) --
  const powerSeries = useMemo(() => {
    const points: [number, number][] = [];
    const start = dayjs().subtract(24, "hour").startOf("hour");
    const powerOf = (s: ChargingSession) => {
      const cp = chargers.find((c) => c.id === s.chargerId);
      return cp?.connectors.find((cn) => cn.id === s.connectorId)?.powerKw ?? 3;
    };
    for (let t = start; t.isBefore(dayjs()); t = t.add(15, "minute")) {
      const ts = t.valueOf();
      let kw = 0;
      for (const s of hubSessions) {
        const sStart = dayjs(s.startTime).valueOf();
        const sEnd = s.endTime ? dayjs(s.endTime).valueOf() : Date.now();
        if (sStart <= ts && ts < sEnd) kw += powerOf(s);
      }
      points.push([ts, Math.round(kw * 100) / 100]);
    }
    return points;
  }, [hubSessions, chargers]);
  const currentKw = powerSeries.length ? powerSeries[powerSeries.length - 1][1] : 0;

  // ---- daily energy (last 10 days) ---------------------------------------
  const dailyEnergy = useMemo(() => {
    const days: { day: string; kwh: number }[] = [];
    for (let d = 9; d >= 0; d -= 1) {
      const day = dayjs().subtract(d, "day");
      const kwh = hubSessions
        .filter((s) => dayjs(s.startTime).isSame(day, "day"))
        .reduce((sum, s) => sum + s.energyKwh, 0);
      days.push({ day: day.format("D MMM"), kwh: Math.round(kwh * 100) / 100 });
    }
    return days;
  }, [hubSessions]);

  // ---- charging inputs (spec: ready time / FIFO + required SoC) ----------
  const [mode, setMode] = useState<HubPlan["mode"]>("ready-times");
  const [rows, setRows] = useState<Record<string, PlanRow>>({});

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(planKey(hubName));
      if (raw) {
        const plan = JSON.parse(raw) as HubPlan;
        setMode(plan.mode);
        setRows(plan.rows);
      }
    } catch {
      // ignore corrupt plan
    }
  }, [hubName]);

  const rowFor = (v: Vehicle): PlanRow =>
    rows[v.reg] ?? { readyTime: "09:00", targetSoc: v.socCapPct };

  const savePlan = () => {
    const plan: HubPlan = { mode, rows };
    window.localStorage.setItem(planKey(hubName), JSON.stringify(plan));
    message.success(
      mode === "fifo"
        ? "Saved — FIFO: vehicles charge in plug-in order."
        : "Saved — ready times will drive the energy-brain schedule.",
    );
  };

  if (!chargers.length && !vehicles.length) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Empty description={`No chargers or vehicles found for "${hubName}"`} />
      </div>
    );
  }

  const address = chargers[0]?.address ?? "—";

  const occupancyOption = {
    tooltip: { trigger: "item" },
    series: [
      {
        type: "pie",
        radius: ["55%", "80%"],
        label: { show: false },
        data: [
          { name: "In use", value: occupancy.inUse, itemStyle: { color: GREEN } },
          { name: "Available", value: occupancy.available, itemStyle: { color: "#93c5fd" } },
          { name: "Offline", value: occupancy.offline, itemStyle: { color: GRAY } },
        ],
      },
    ],
  };

  const powerOption = {
    grid: { top: 10, right: 10, bottom: 20, left: 35 },
    tooltip: {
      trigger: "axis",
      valueFormatter: (v: number) => `${Number(v).toFixed(2)} kW`,
    },
    xAxis: {
      type: "time",
      axisLabel: { fontSize: 10, formatter: (v: number) => dayjs(v).format("h a") },
    },
    yAxis: { type: "value", axisLabel: { fontSize: 10 } },
    series: [
      {
        type: "line",
        step: "end",
        showSymbol: false,
        lineStyle: { color: "#3b82f6", width: 1.5 },
        areaStyle: { color: "rgba(59,130,246,0.15)" },
        data: powerSeries,
      },
    ],
  };

  const energyOption = {
    grid: { top: 10, right: 10, bottom: 22, left: 35 },
    tooltip: { valueFormatter: (v: number) => `${Number(v).toFixed(2)} kWh` },
    xAxis: {
      type: "category",
      data: dailyEnergy.map((d) => d.day),
      axisLabel: { fontSize: 10 },
    },
    yAxis: { type: "value", axisLabel: { fontSize: 10 } },
    series: [
      {
        type: "bar",
        data: dailyEnergy.map((d) => d.kwh),
        itemStyle: { color: "#2563eb", borderRadius: [3, 3, 0, 0] },
      },
    ],
  };

  const vehicleStatusTag = (v: Vehicle) => {
    if (v.status === "Charging") return <Tag color="green">Charging</Tag>;
    if (v.status === "Driving") return <Tag color="blue">Away</Tag>;
    if (v.status === "Offline") return <Tag>Offline</Tag>;
    return <Tag color="default">In hub</Tag>;
  };

  const chargerColumns: TableProps<(typeof chargers)[number]>["columns"] = [
    {
      title: "Charger",
      key: "name",
      render: (_, cp) => (
        <Link href={`/chargingStations/${cp.id}`} style={{ color: "#f97417" }}>
          {cp.name}
        </Link>
      ),
    },
    {
      title: "Status",
      key: "status",
      render: (_, cp) =>
        cp.status === "Online" ? <Tag color="green">Online</Tag> : <Tag color="red">Offline</Tag>,
    },
    {
      title: "Connectors",
      key: "connectors",
      render: (_, cp) => {
        const busy = Math.min(
          cp.connectors.length,
          ongoing.filter((s) => s.chargerId === cp.id).length,
        );
        const faulted = cp.connectors.filter((cn) => cn.status === "Faulted").length;
        return (
          <>
            {busy > 0 && <Tag color="green">{busy} in use</Tag>}
            <Tag>{cp.connectors.length - busy - faulted} available</Tag>
            {faulted > 0 && <Tag color="red">{faulted} faulted</Tag>}
          </>
        );
      },
    },
    {
      title: "Power",
      key: "power",
      render: (_, cp) => `${Math.max(0, ...cp.connectors.map((cn) => cn.powerKw))} kW`,
    },
  ];

  return (
    <div className="min-h-screen p-4">
      <div style={{ marginBottom: 4 }}>
        <Title level={3} style={{ marginBottom: 0 }}>
          {hubName}
        </Title>
        <Text type="secondary">{address}</Text>
      </div>
      <div style={{ marginBottom: 16 }}>
        <Tag>{chargers.length} charger{chargers.length === 1 ? "" : "s"}</Tag>
        <Tag>{vehicles.length} vehicle{vehicles.length === 1 ? "" : "s"}</Tag>
        <Tag color={ongoing.length ? "green" : "default"}>
          {ongoing.length} charging now
        </Tag>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <StatCard title="Occupancy">
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <ReactECharts option={occupancyOption} style={{ height: 130, width: 130 }} />
            <div style={{ fontSize: 13 }}>
              <div>
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: GREEN }} />{" "}
                In use <b>{occupancy.inUse}</b>
              </div>
              <div>
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: "#93c5fd" }} />{" "}
                Available <b>{occupancy.available}</b>
              </div>
              <div>
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: GRAY }} />{" "}
                Offline <b>{occupancy.offline}</b>
              </div>
            </div>
          </div>
        </StatCard>

        <StatCard title="Site power">
          <div style={{ fontSize: 22, fontWeight: 700, color: "#2563eb", marginBottom: 4 }}>
            {currentKw.toFixed(1)} kW
          </div>
          <ReactECharts option={powerOption} style={{ height: 110 }} />
        </StatCard>

        <StatCard title="Vehicles">
          <div style={{ maxHeight: 170, overflowY: "auto" }}>
            {vehicles.length === 0 && <Text type="secondary">No vehicles in this hub.</Text>}
            {vehicles.map((v) => (
              <div
                key={v.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "4px 0",
                  borderBottom: "1px solid #f5f5f5",
                  fontSize: 13,
                }}
              >
                <Link href={`/vehicles/${v.id}`} style={{ color: "#374151", fontWeight: 600 }}>
                  {v.reg}
                </Link>
                {vehicleStatusTag(v)}
                <span style={{ color: v.soc < 25 ? RED : GREEN, fontWeight: 600 }}>
                  {Math.round(v.soc)}%
                </span>
              </div>
            ))}
          </div>
        </StatCard>
      </div>

      <Card
        style={{ borderRadius: 12, border: "1px solid #f0f0f0", marginTop: 16 }}
        styles={{ body: { padding: 16 } }}
      >
        <Text strong>Chargers</Text>
        <Table
          columns={chargerColumns}
          dataSource={chargers}
          rowKey="id"
          size="small"
          pagination={false}
          style={{ marginTop: 8 }}
        />
      </Card>

      {/* Charging inputs — per the spec note: ready-time per vehicle or FIFO,
          plus required SoC; ready-times feed the energy-brain algo. */}
      <Card
        style={{ borderRadius: 12, border: "1px solid #f0f0f0", marginTop: 16 }}
        styles={{ body: { padding: 16 } }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <Text strong>Charging plan</Text>
            <div style={{ fontSize: 12, color: "#888" }}>
              {mode === "fifo"
                ? "First-in-first-out: vehicles charge in the order they plug in."
                : "Each vehicle charges to its required SoC before its ready time (energy-brain schedule)."}
            </div>
          </div>
          <Radio.Group
            value={mode}
            onChange={(e) => setMode(e.target.value)}
            optionType="button"
            buttonStyle="solid"
            options={[
              { label: "Ready times", value: "ready-times" },
              { label: "FIFO", value: "fifo" },
            ]}
          />
        </div>

        {mode === "ready-times" && (
          <Table
            style={{ marginTop: 12 }}
            size="small"
            pagination={false}
            rowKey="id"
            dataSource={vehicles}
            columns={[
              { title: "Vehicle", dataIndex: "reg", key: "reg" },
              {
                title: "SoC now",
                key: "soc",
                render: (_, v: Vehicle) => `${Math.round(v.soc)}%`,
              },
              {
                title: "Ready by",
                key: "ready",
                render: (_, v: Vehicle) => (
                  <input
                    type="time"
                    value={rowFor(v).readyTime}
                    onChange={(e) =>
                      setRows((r) => ({
                        ...r,
                        [v.reg]: { ...rowFor(v), readyTime: e.target.value },
                      }))
                    }
                    style={{
                      border: "1px solid #d9d9d9",
                      borderRadius: 6,
                      padding: "2px 6px",
                      fontSize: 13,
                    }}
                  />
                ),
              },
              {
                title: "Required SoC",
                key: "target",
                render: (_, v: Vehicle) => (
                  <InputNumber
                    min={20}
                    max={100}
                    size="small"
                    value={rowFor(v).targetSoc}
                    formatter={(val) => `${val}%`}
                    parser={(val) => Number((val ?? "").replace("%", ""))}
                    onChange={(val) =>
                      setRows((r) => ({
                        ...r,
                        [v.reg]: { ...rowFor(v), targetSoc: Number(val ?? 100) },
                      }))
                    }
                  />
                ),
              },
            ]}
          />
        )}

        <div style={{ marginTop: 12, textAlign: "right" }}>
          <Button type="primary" style={{ background: ORANGE }} onClick={savePlan}>
            Save plan
          </Button>
        </div>
      </Card>

      {/* Preliminary analytics — exact specs land later per the doc. */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <StatCard title="Daily energy output (last 10 days)">
          <ReactECharts option={energyOption} style={{ height: 200 }} />
        </StatCard>
        <StatCard title="Power output (last 24 h)">
          <ReactECharts option={powerOption} style={{ height: 200 }} />
        </StatCard>
      </div>
    </div>
  );
}
