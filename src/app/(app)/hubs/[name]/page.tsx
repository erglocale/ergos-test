"use client";

import { SettingOutlined } from "@ant-design/icons";
import { Button, Card, Empty, Table, Tag, Typography } from "antd";
import type { TableProps } from "antd";
import dayjs from "dayjs";
import ReactECharts from "echarts-for-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import ChargingPlanCard from "@/components/hubs/ChargingPlanCard";
import ForecastPowerCard from "@/components/hubs/ForecastPowerCard";
import HubRateSettings from "@/components/hubs/HubRateSettings";
import VehiclePhoto from "@/components/vehicles/vehiclePhoto";
import { useDb, useEnergyHubLimits, useSimStates } from "@/data/store";
import type { ChargingSession, Vehicle } from "@/data/types";

const { Title, Text } = Typography;
const GREEN = "#16a34a";
const GRAY = "#d1d5db";
const RED = "#ef4444";

// Hub page (demo spec items 3 + 5): chargers + vehicles inside one hub,
// occupancy and site power on the first row, the charging plan with its energy
// price settings, and analytics (exact chart specs arrive later per the doc).

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
  const sim = useSimStates();
  const [settingsOpen, setSettingsOpen] = useState(false);

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

  // Ongoing sessions at this hub, labelled for the optimizer forecast chart.
  const sessionLabels = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of hubSessions) if (!s.endTime) map.set(s.id, s.vehicleReg);
    return map;
  }, [hubSessions]);

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
  const gridLimits = useEnergyHubLimits();
  const gridLimitKw = gridLimits[hubName];

  const powerSeries = useMemo(() => {
    const points: [number, number][] = [];
    const powerOf = (s: ChargingSession) => {
      const cp = chargers.find((c) => c.id === s.chargerId);
      return cp?.connectors.find((cn) => cn.id === s.connectorId)?.powerKw ?? 3;
    };
    // Last 12 hours on a 15-minute grid. The window ends at the actual current
    // moment, not at the top of the hour: a session that started a few minutes
    // ago (energy-brain's live ones often have) would otherwise fall past the
    // last bucket and draw nothing.
    const STEP_MS = 15 * 60_000;
    const now = dayjs();
    const nowMs = now.valueOf();
    const startMs = now.subtract(12, "hour").startOf("hour").valueOf();
    const stamps: number[] = [];
    for (let ts = startMs; ts < nowMs; ts += STEP_MS) stamps.push(ts);
    stamps.push(nowMs);
    // The last bucket is "now", where the simulator knows the actual draw — an
    // optimizer may be holding a vehicle at 0 kW rather than letting it pull
    // the connector's full rating. Earlier buckets keep the rating estimate.
    const liveFrom = nowMs - STEP_MS;
    for (const ts of stamps) {
      let kw = 0;
      for (const s of hubSessions) {
        const sStart = dayjs(s.startTime).valueOf();
        // Ongoing sessions have no end — they must still count in the "now"
        // bucket, so they can't be treated as ending at nowMs.
        const sEnd = s.endTime ? dayjs(s.endTime).valueOf() : Infinity;
        if (sStart > ts || ts >= sEnd) continue;
        kw +=
          !s.endTime && ts >= liveFrom
            ? // Before the first simulation tick there is no live reading yet;
              // fall back to the connector rating rather than showing nothing.
              (sim.get(s.id)?.powerKw ?? powerOf(s))
            : powerOf(s);
      }
      // Connector ratings oversubscribe the site: historical buckets are an
      // estimate, and the estimate can never have exceeded the grid connection.
      if (gridLimitKw) kw = Math.min(kw, gridLimitKw);
      points.push([ts, Math.round(kw * 100) / 100]);
    }
    return points;
  }, [hubSessions, chargers, sim, gridLimitKw]);

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
    yAxis: {
      type: "value",
      axisLabel: { fontSize: 10 },
      // The grid limit is the ceiling of the site, so it is also the top of the
      // axis — nothing can be drawn above it.
      max: gridLimitKw ?? undefined,
    },
    series: [
      {
        type: "line",
        step: "end",
        showSymbol: false,
        lineStyle: { color: "#3b82f6", width: 1.5 },
        areaStyle: { color: "rgba(59,130,246,0.15)" },
        data: powerSeries,
        markLine: gridLimitKw
          ? {
              silent: true,
              symbol: "none",
              lineStyle: { color: "#ef4444", type: "dashed", width: 1 },
              // Sits on the top axis line now, so the label goes inside.
              label: {
                formatter: `Grid limit ${Math.round(gridLimitKw)} kW`,
                fontSize: 10,
                position: "insideEndBottom",
              },
              data: [{ yAxis: gridLimitKw }],
            }
          : undefined,
      },
    ],
  };

  const energyOption = {
    grid: { top: 10, right: 10, bottom: 22, left: 46 },
    tooltip: { valueFormatter: (v: number) => `${Number(v).toFixed(2)} kWh` },
    xAxis: {
      type: "category",
      data: dailyEnergy.map((d) => d.day),
      axisLabel: { fontSize: 11 },
    },
    yAxis: {
      type: "value",
      name: "Energy (kWh)",
      nameLocation: "middle",
      nameGap: 34,
      nameTextStyle: { fontSize: 11, color: "#888" },
      axisLabel: { fontSize: 11 },
    },
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

  const vehicleColumns: TableProps<Vehicle>["columns"] = [
    {
      title: "Vehicle",
      key: "reg",
      render: (_, v) => (
        <div className="flex items-center gap-2.5">
          <VehiclePhoto vehicle={v} width={52} height={36} radius={6} />
          <Link href={`/vehicles/${v.id}`} style={{ color: "#f97417" }}>
            {v.reg}
          </Link>
        </div>
      ),
    },
    {
      title: "Model",
      key: "model",
      render: (_, v) => `${v.make} ${v.model}`.trim(),
    },
    {
      title: "Status",
      key: "status",
      render: (_, v) => vehicleStatusTag(v),
    },
    {
      title: "SoC",
      key: "soc",
      align: "right",
      render: (_, v) => (
        <span style={{ color: v.soc < 25 ? RED : GREEN, fontWeight: 600 }}>
          {Math.round(v.soc)}%
        </span>
      ),
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

      {/* First row: occupancy + site power only. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
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

        <StatCard title="Site power (last 12 h)">
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 22, fontWeight: 700, color: "#2563eb" }}>
              {currentKw.toFixed(1)} kW
            </span>
            {gridLimitKw && (
              <span style={{ fontSize: 12, color: "#888" }}>
                of {Math.round(gridLimitKw)} kW grid limit
              </span>
            )}
          </div>
          <ReactECharts option={powerOption} style={{ height: 130 }} />
        </StatCard>
      </div>

      {/* Chargers and vehicles side by side. */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <StatCard title="Chargers">
          <Table
            columns={chargerColumns}
            dataSource={chargers}
            rowKey="id"
            size="small"
            pagination={false}
          />
        </StatCard>
        <StatCard title="Vehicles">
          <Table
            columns={vehicleColumns}
            dataSource={vehicles}
            rowKey="id"
            size="small"
            pagination={false}
            locale={{ emptyText: "No vehicles in this hub." }}
          />
        </StatCard>
      </div>

      <Card
        style={{ borderRadius: 12, border: "1px solid #f0f0f0", marginTop: 16 }}
        styles={{ body: { padding: 16 } }}
      >
        <ChargingPlanCard
          hub={hubName}
          vehicles={vehicles}
          extra={
            <Button icon={<SettingOutlined />} onClick={() => setSettingsOpen(true)}>
              Energy prices
            </Button>
          }
        />
      </Card>

      {/* Preliminary analytics — exact specs land later per the doc. */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <StatCard title="Daily energy output (last 10 days)">
          <ReactECharts option={energyOption} style={{ height: 200 }} />
        </StatCard>
        <StatCard title="Expected power consumption (next 24 h)">
          <ForecastPowerCard sessionLabels={sessionLabels} />
        </StatCard>
      </div>

      <HubRateSettings hub={hubName} open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
