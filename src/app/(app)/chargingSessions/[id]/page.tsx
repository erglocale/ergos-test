"use client";

import { Empty, Tag, Typography } from "antd";
import dayjs from "dayjs";
import ReactECharts from "echarts-for-react";
import { useParams } from "next/navigation";
import { useMemo } from "react";
import { BsLightningChargeFill, BsSpeedometer } from "react-icons/bs";
import { IoCarSport } from "react-icons/io5";
import { LuTimer } from "react-icons/lu";
import {
  chargerOcppId,
  deriveSocSeries,
  fmtDate,
  fmtDateTime,
  getDurationString,
  hubForSession,
  sessionAvgPowerKw,
  sessionBillingId,
  sessionMeterValues,
  sessionTransactionId,
  vehicleVin,
} from "@/components/charging-sessions/sessionUtils";
import ChargerLocationMap from "@/components/maps/ChargerLocationMap";
import { useDb } from "@/data/store";

const { Title, Text } = Typography;

// Restyled per demo-spec item 4 ("improve the look of the charging sessions
// page"): hero band with headline stats, grouped detail cards, softer borders.
// All production fields are retained.

function renderValue(value: string | number | null | undefined, unit = "") {
  if (value === null || value === undefined || value === "") {
    return <span className="text-gray-400">N/A</span>;
  }
  return `${value}${unit}`;
}

function StatTile({
  icon,
  label,
  value,
  color,
  bg,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  color: string;
  bg: string;
}) {
  return (
    <div
      className="flex items-center gap-3 rounded-xl px-4 py-3"
      style={{ background: bg, minWidth: 170 }}
    >
      <div
        className="flex h-9 w-9 items-center justify-center rounded-lg"
        style={{ background: "white", color, fontSize: 18 }}
      >
        {icon}
      </div>
      <div>
        <div style={{ fontSize: 11, color: "#6b7280" }}>{label}</div>
        <div style={{ fontSize: 17, fontWeight: 700, color }}>{value}</div>
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5">
      <span style={{ color: "#6b7280", fontSize: 13 }}>{label}</span>
      <span style={{ fontWeight: 600, fontSize: 13, textAlign: "right" }}>{value}</span>
    </div>
  );
}

export default function SessionDetail() {
  const params = useParams<{ id: string }>();
  const sessionId = decodeURIComponent(params.id);
  const db = useDb();

  const session = db.sessions.find((s) => s.id === sessionId);
  const vehicle = session ? db.vehicles.find((v) => v.reg === session.vehicleReg) : undefined;
  const chargepoint = session ? db.chargepoints.find((c) => c.id === session.chargerId) : undefined;
  const driver = session ? db.drivers.find((d) => d.vehicleReg === session.vehicleReg) : undefined;

  const socSeries = useMemo(
    () => (session ? deriveSocSeries(session, vehicle?.soc) : []),
    [session, vehicle?.soc],
  );

  if (!session) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Empty description={`Charging session ${sessionId} not found`} />
      </div>
    );
  }

  const connector =
    chargepoint?.connectors.find((cn) => cn.id === session.connectorId) ??
    chargepoint?.connectors[0];
  const { meterStart, meterStop } = sessionMeterValues(session);
  const hubName = hubForSession(session, db.chargepoints);
  const mapChargepoint = chargepoint ?? db.chargepoints[0];
  const ongoing = session.endTime === null;
  const avgKw = sessionAvgPowerKw(session);

  const chartOption = {
    grid: { top: 50, right: 30, bottom: 60, left: 45 },
    legend: { top: 0, icon: "circle", itemWidth: 12, data: ["Battery SoC (%)"] },
    tooltip: {
      trigger: "axis",
      valueFormatter: (v: number) => `${Number(v).toFixed(1)}%`,
    },
    xAxis: {
      type: "time",
      axisLabel: {
        fontSize: 12,
        rotate: 45,
        formatter: (val: number) => dayjs(val).format("h:mm A"),
      },
      splitLine: { show: true, lineStyle: { type: "dashed", color: "#50585c2c" } },
    },
    yAxis: {
      type: "value",
      min: 0,
      max: 100,
      axisLabel: { formatter: "{value}%" },
      splitLine: { lineStyle: { type: "dashed", color: "#50585c2c" } },
    },
    series: [
      {
        name: "Battery SoC (%)",
        type: "line",
        showSymbol: false,
        smooth: true,
        lineStyle: { color: "#f59e0b", width: 2.5 },
        itemStyle: { color: "#f59e0b" },
        areaStyle: { color: "rgba(245,158,11,0.08)" },
        data: socSeries,
      },
    ],
  };

  return (
    <div className="min-h-screen p-4" style={{ background: "#fafafa" }}>
      {/* Hero band */}
      <div
        className="mb-4 rounded-2xl bg-white p-5"
        style={{ border: "1px solid #f0f0f0" }}
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <Text type="secondary" style={{ fontSize: 12 }}>
              Charging Session · {sessionId}
            </Text>
            <Title level={3} style={{ margin: "2px 0 6px" }}>
              {renderValue(chargepoint?.name ?? session.chargerName)}
            </Title>
            <span>
              <Tag color={ongoing ? "green" : "default"}>
                {ongoing ? "Charging" : "Completed"}
              </Tag>
              <Tag>{connector ? `AC ${connector.powerKw} kW` : "AC"}</Tag>
              <Tag color="magenta">{hubName}</Tag>
            </span>
          </div>
          <div className="flex flex-wrap gap-3">
            <StatTile
              icon={<BsLightningChargeFill />}
              label="Energy Consumed"
              value={`${session.energyKwh.toFixed(2)} kWh`}
              color="#f97316"
              bg="#fff7ed"
            />
            <StatTile
              icon={<LuTimer />}
              label="Duration"
              value={
                ongoing
                  ? "Ongoing"
                  : getDurationString(session.startTime, session.endTime as string)
              }
              color="#2563eb"
              bg="#eff6ff"
            />
            <StatTile
              icon={<BsSpeedometer />}
              label="Avg Power"
              value={avgKw === null ? "—" : `${avgKw.toFixed(2)} kW`}
              color="#16a34a"
              bg="#f0fdf4"
            />
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row">
        {/* Session details */}
        <div
          className="w-full overflow-hidden rounded-2xl bg-white lg:w-1/2"
          style={{ border: "1px solid #f0f0f0" }}
        >
          <div className="border-b px-4 py-3" style={{ background: "#fafafa" }}>
            <Text strong>Session details</Text>
          </div>
          <div className="divide-y divide-gray-100">
            <DetailRow label="Date" value={renderValue(fmtDate(session.startTime))} />
            <DetailRow label="Start Time" value={renderValue(fmtDateTime(session.startTime))} />
            <DetailRow
              label="End Time"
              value={session.endTime ? renderValue(fmtDateTime(session.endTime)) : "Ongoing"}
            />
            <DetailRow label="Connector Type" value={renderValue(connector?.type)} />
            <DetailRow label="Charger Type" value={renderValue(connector ? "AC" : null)} />
            <DetailRow label="Charger Capacity" value={renderValue(connector?.powerKw, " kW")} />
            <DetailRow label="Charger Id" value={renderValue(chargerOcppId(chargepoint))} />
            <DetailRow label="Connector Id" value={renderValue(session.connectorId)} />
            <DetailRow label="Transaction Id" value={renderValue(sessionTransactionId(session))} />
            <DetailRow label="Billing Id" value={renderValue(sessionBillingId(session))} />
            <DetailRow label="Initiated by" value={renderValue(session.driverName)} />
            <DetailRow
              label="Stopped by"
              value={session.endTime ? renderValue(session.driverName) : renderValue(null)}
            />
            <DetailRow label="Meter Start" value={renderValue(meterStart)} />
            <DetailRow label="Meter Stop" value={renderValue(meterStop)} />
          </div>
        </div>

        {/* Vehicle & driver */}
        <div
          className="flex w-full flex-col overflow-hidden rounded-2xl bg-white lg:w-1/2"
          style={{ border: "1px solid #f0f0f0" }}
        >
          <div className="flex items-center gap-4 border-b p-4" style={{ background: "#fafafa" }}>
            <div
              className="flex items-center justify-center"
              style={{ width: 110, height: 100, background: "#f3f4f6", borderRadius: 12 }}
            >
              <IoCarSport style={{ fontSize: 48, color: "#9ca3af" }} />
            </div>
            <div>
              <h3 className="text-lg font-semibold">
                {renderValue(vehicle?.make)} {renderValue(vehicle?.model)}
              </h3>
              <p className="text-sm text-gray-500">{renderValue(session.vehicleReg)}</p>
              {vehicle && (
                <Tag color={vehicle.soc < 25 ? "red" : "green"} style={{ marginTop: 4 }}>
                  SoC {Math.round(vehicle.soc)}%
                </Tag>
              )}
            </div>
          </div>
          <div className="divide-y divide-gray-100">
            <DetailRow label="Driver" value={renderValue(driver?.name)} />
            <DetailRow label="Phone Number" value={renderValue(driver?.phone)} />
            <DetailRow label="Email Id" value={renderValue(driver?.email)} />
            <DetailRow label="Battery Capacity" value={renderValue(vehicle?.batteryKwh, " kWh")} />
            <DetailRow label="VIN" value={renderValue(vehicleVin(vehicle))} />
            <DetailRow
              label="Range"
              value={
                <>Upto {renderValue(vehicle ? Math.round(vehicle.batteryKwh * 11.9) : null, " kms")}</>
              }
            />
          </div>
          <div className="flex flex-grow flex-col p-4">
            <Text type="secondary" style={{ fontSize: 12, marginBottom: 8 }}>
              Charging Location · {hubName}
            </Text>
            {mapChargepoint ? (
              <ChargerLocationMap
                points={[
                  {
                    lat: mapChargepoint.lat,
                    lng: mapChargepoint.lng,
                    label: `${mapChargepoint.name} — ${mapChargepoint.address}`,
                  },
                ]}
                height={240}
              />
            ) : (
              <div className="flex h-60 items-center justify-center rounded-xl bg-gray-100">
                <span className="text-gray-500">Map data unavailable</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Chart */}
      <div
        className="mb-6 mt-4 rounded-2xl bg-white p-6"
        style={{ border: "1px solid #f0f0f0" }}
      >
        <Title level={4} style={{ marginTop: 0, marginBottom: 4 }}>
          Meter Values vs. Time
        </Title>
        {socSeries.length > 0 ? (
          <ReactECharts option={chartOption} style={{ height: 384 }} notMerge />
        ) : (
          <div className="flex h-64 items-center justify-center">
            <Text type="secondary">No data available for this session.</Text>
          </div>
        )}
      </div>
    </div>
  );
}
