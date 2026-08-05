"use client";

import { Empty, Tag, Typography } from "antd";
import dayjs from "dayjs";
import ReactECharts from "echarts-for-react";
import { useParams } from "next/navigation";
import { useMemo } from "react";
import { IoCarSport } from "react-icons/io5";
import {
  deriveSocSeries,
  fmtDate,
  fmtDateTime,
  getDurationString,
  hubForSession,
} from "@/components/charging-sessions/sessionUtils";
import ChargerLocationMap from "@/components/maps/ChargerLocationMap";
import { useDb } from "@/data/store";

const { Title, Text } = Typography;

function renderValue(value: string | number | null | undefined, unit = "") {
  if (value === null || value === undefined || value === "") {
    return <span className="text-gray-400">N/A</span>;
  }
  return `${value}${unit}`;
}

export default function SessionDetail() {
  const params = useParams<{ id: string }>();
  const sessionId = decodeURIComponent(params.id);
  const db = useDb();

  const session = db.sessions.find((s) => s.id === sessionId);
  const vehicle = session ? db.vehicles.find((v) => v.reg === session.vehicleReg) : undefined;
  const chargepoint = session ? db.chargepoints.find((c) => c.id === session.chargerId) : undefined;

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

  const isOngoing = !session.endTime;
  const durationHours = session.endTime
    ? dayjs(session.endTime).diff(dayjs(session.startTime), "minute") / 60
    : null;
  const chargingPower =
    durationHours && durationHours > 0 ? (session.energyKwh / durationHours).toFixed(2) : null;
  const hubName = hubForSession(session, db.chargepoints);
  // Chargepoint for the location map — fall back to the first chargepoint
  // when the session's charger is not in the store.
  const mapChargepoint = chargepoint ?? db.chargepoints[0];

  const chartOption = {
    grid: { top: 50, right: 30, bottom: 60, left: 45 },
    legend: {
      top: 0,
      icon: "circle",
      itemWidth: 12,
      data: ["Battery SoC (%)"],
    },
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
    dataZoom: [{ type: "inside" }, { type: "slider", height: 18, bottom: 8 }],
    series: [
      {
        name: "Battery SoC (%)",
        type: "line",
        showSymbol: false,
        smooth: true,
        lineStyle: { color: "#f59e0b", width: 2.5 },
        itemStyle: { color: "#f59e0b" },
        data: socSeries,
      },
    ],
  };

  return (
    <div className="min-h-screen p-4">
      <Title level={3} style={{ marginBottom: "16px", textAlign: "left" }}>
        Charging Session: {sessionId}
      </Title>

      <div className="flex flex-col gap-4 md:flex-row">
        {/* Left Panel - Session Details */}
        <div
          className="flex w-full flex-col overflow-hidden rounded-lg bg-white shadow-sm md:w-1/2"
          style={{ boxShadow: "0 4px 12px rgba(0, 0, 0, 0.1)" }}
        >
          <div className="flex items-center gap-4 border-b p-4">
            <div>
              <h3 className="text-lg font-semibold">{hubName || "Outside Hub Charging Session"}</h3>
            </div>
          </div>
          <div className="grid flex-grow grid-cols-2 text-sm">
            <div className="border-b border-r px-4 py-3">
              <div className="text-gray-500">Duration</div>
              <div className="flex items-center font-medium">
                {session.endTime ? renderValue(getDurationString(session.startTime, session.endTime)) : null}
                <Tag
                  color={session.endTime ? "default" : "green"}
                  style={{
                    marginLeft: session.endTime ? "8px" : "0px",
                    fontSize: "0.7rem",
                    padding: "0 4px",
                  }}
                >
                  {session.endTime ? (session.status === "Faulted" ? "Faulted" : "Completed") : "Charging"}
                </Tag>
              </div>
            </div>
            <div className="border-b px-4 py-3">
              <div className="text-gray-500">Date</div>
              <div className="font-medium">{renderValue(fmtDate(session.startTime))}</div>
            </div>
            <div className="border-b border-r px-4 py-3">
              <div className="text-gray-500">Energy Consumed</div>
              <div className="font-medium">{renderValue(session.energyKwh?.toFixed(2), " kWh")}</div>
            </div>
            <div className="border-b px-4 py-3">
              <div className="text-gray-500">Charging Power</div>
              <div className="font-medium">{renderValue(chargingPower, " kW")}</div>
            </div>
            <div className="border-b border-r px-4 py-3">
              <div className="text-gray-500">Start SoC</div>
              <div className="font-medium">{renderValue(session.socStart.toFixed(1), "%")}</div>
            </div>
            <div className="border-b px-4 py-3">
              <div className="text-gray-500">End SoC</div>
              <div className="font-medium">
                {session.socEnd != null ? renderValue(session.socEnd.toFixed(1), "%") : renderValue(null)}
              </div>
            </div>
            <div className="border-b border-r px-4 py-3">
              <div className="text-gray-500">Start Time</div>
              <div className="font-medium">{renderValue(fmtDateTime(session.startTime))}</div>
            </div>
            <div className="border-b px-4 py-3">
              <div className="text-gray-500">End Time</div>
              <div className="font-medium">
                {session.endTime ? renderValue(fmtDateTime(session.endTime)) : "Ongoing"}
              </div>
            </div>
            <div className="border-b border-r px-4 py-3">
              <div className="text-gray-500">Location</div>
              <div className="font-medium">{renderValue(chargepoint?.address ?? hubName)}</div>
            </div>
            <div className="border-b px-4 py-3">
              <div className="text-gray-500">Charging Cost</div>
              <div className="font-medium">{renderValue(`₹${session.cost.toFixed(2)}`)}</div>
            </div>
            <div className="border-b border-r px-4 py-3">
              <div className="text-gray-500">Charger</div>
              <div className="font-medium">
                {renderValue(`${session.chargerName} (${session.chargerId})`)}
              </div>
            </div>
            <div className="border-b px-4 py-3">
              <div className="text-gray-500">Stop Reason</div>
              <div className="font-medium">{renderValue(session.stopReason)}</div>
            </div>
          </div>
        </div>

        {/* Right Panel - Vehicle Details */}
        <div className="w-full md:w-1/2" style={{ boxShadow: "0 4px 12px rgba(0, 0, 0, 0.1)" }}>
          <div className="flex h-full flex-col overflow-hidden rounded-lg bg-white shadow-sm">
            <div className="flex items-center gap-4 border-b p-4">
              <div
                className="flex items-center justify-center rounded-lg"
                style={{ width: "140px", height: "132px", background: "#f3f4f6", borderRadius: "7px" }}
              >
                <IoCarSport style={{ fontSize: 56, color: "#9ca3af" }} />
              </div>
              <div>
                <h3 className="text-lg font-semibold">
                  {renderValue(vehicle?.make)} {renderValue(vehicle?.model)}
                </h3>
                <p className="text-sm text-gray-500">{renderValue(session.vehicleReg)}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 text-sm">
              <div className="border-b border-r px-4 py-3">
                <div className="text-gray-500">Battery Capacity</div>
                <div className="font-medium">{renderValue(vehicle?.batteryKwh, " kWh")}</div>
              </div>
              <div className="border-b px-4 py-3">
                <div className="text-gray-500">Range</div>
                <div className="font-medium">
                  Upto {renderValue(vehicle ? Math.round(vehicle.batteryKwh * 10) : null, " kms")}
                </div>
              </div>
              <div className="border-b border-r px-4 py-3">
                <div className="text-gray-500">Plate Number</div>
                <div className="font-medium">{renderValue(session.vehicleReg)}</div>
              </div>
              <div className="border-b px-4 py-3">
                <div className="text-gray-500">IMEI</div>
                <div className="font-medium">{renderValue(vehicle?.imei)}</div>
              </div>
            </div>
            <div className="flex flex-grow flex-col p-4">
              <p className="mb-2 text-sm text-gray-500">Charging Location</p>
              {mapChargepoint ? (
                <ChargerLocationMap
                  points={[
                    {
                      lat: mapChargepoint.lat,
                      lng: mapChargepoint.lng,
                      label: `${mapChargepoint.name} — ${mapChargepoint.address}`,
                    },
                  ]}
                  height={260}
                />
              ) : (
                <div
                  className="flex items-center justify-center rounded-lg"
                  style={{ height: "260px", background: "#e8e4e0", border: "1px solid #d6d3d1" }}
                >
                  <span style={{ color: "#6b7280" }}>Map unavailable</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* SoC Chart Section */}
      <div
        className="mb-6 mt-4 rounded-lg bg-white p-6 shadow-sm"
        style={{ boxShadow: "0 4px 12px rgba(0, 0, 0, 0.1)" }}
      >
        <div className="mb-4 flex justify-between">
          <Title level={4} style={{ marginTop: 0, marginBottom: "4px" }}>
            Battery SoC vs. Time
          </Title>
          {isOngoing && <Tag color="green">Live</Tag>}
        </div>
        {socSeries.length > 0 ? (
          <ReactECharts option={chartOption} style={{ height: 384 }} notMerge />
        ) : (
          <div className="flex h-64 items-center justify-center">
            <Text type="secondary">No SoC data available for this session.</Text>
          </div>
        )}
      </div>
    </div>
  );
}
