"use client";

import { Empty, Tag, Typography } from "antd";
import dayjs from "dayjs";
import ReactECharts from "echarts-for-react";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { BsLightningChargeFill, BsSpeedometer } from "react-icons/bs";
import { IoCarSport } from "react-icons/io5";
import { LuTimer } from "react-icons/lu";
import {
  chargerOcppId,
  deriveMeterSeries,
  fmtDate,
  fmtDateTime,
  getDurationString,
  hubForSession,
  isTelematicsSession,
  sessionAvgPowerKw,
  sessionLocationTag,
  sessionBillingId,
  sessionMeterValues,
  sessionTransactionId,
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

  // Which measurands are shown. Kept in React state because the chart is
  // rebuilt (notMerge) on every simulation tick — echarts' own legend state
  // would be thrown away each time, so a line switched off came straight back.
  const [legendSelected, setLegendSelected] = useState<Record<string, boolean>>({});

  const session = db.sessions.find((s) => s.id === sessionId);
  const vehicle = session ? db.vehicles.find((v) => v.reg === session.vehicleReg) : undefined;
  const chargepoint = session ? db.chargepoints.find((c) => c.id === session.chargerId) : undefined;
  const driver = session ? db.drivers.find((d) => d.vehicleReg === session.vehicleReg) : undefined;

  // Mirrors the production meter-values feed: one point per 30 s carrying
  // energy / power / current / voltage, plus SoC from telematics.
  const meterSeries = useMemo(() => {
    if (!session) return [];
    const cp = db.chargepoints.find((c) => c.id === session.chargerId);
    const conn =
      cp?.connectors.find((cn) => cn.id === session.connectorId) ?? cp?.connectors[0];
    // A telematics session has no connector to rate the curve against, so its
    // own average power stands in — a shade above it, since a charge that
    // tapers has to peak higher than its mean to average out there.
    const ratedKw = conn?.powerKw ?? Math.max(3, (sessionAvgPowerKw(session) ?? 3) * 1.3);
    return deriveMeterSeries(session, ratedKw, vehicle?.soc);
  }, [session, db.chargepoints, vehicle?.soc]);

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
  // Charging our own chargers never saw: no transaction, no connector, no
  // meter register — only the vehicle's pack filling up somewhere else. The
  // page drops to what telemetry can actually support.
  const telematics = isTelematicsSession(session);
  const locationTag = sessionLocationTag(session, db.chargepoints);
  const mapPoint = chargepoint
    ? { lat: chargepoint.lat, lng: chargepoint.lng, label: `${chargepoint.name} — ${chargepoint.address}` }
    : session.location
      ? { lat: session.location.lat, lng: session.location.lng, label: session.location.address }
      : null;
  const ongoing = session.endTime === null;
  // A live session has no recorded end SoC, so fall back to the pack's level now.
  const endSoc = session.socEnd ?? (ongoing ? (vehicle?.soc ?? null) : null);
  const avgKw = sessionAvgPowerKw(session);

  // Same five measurands, colours and units as the production chart; the
  // legend toggles a line off, which is how the big cumulative energy
  // register is kept out of the way there too.
  const METRICS: {
    name: string;
    color: string;
    unit: string;
    pick: (p: (typeof meterSeries)[number]) => number | null;
  }[] = telematics
    ? // Nothing metered the session, so current, voltage and the cumulative
      // register would be invented. The pack level is the one thing the
      // vehicle itself reported.
      [{ name: "Battery SoC (%)", color: "#f59e0b", unit: "%", pick: (p) => p.socPct }]
    : [
        { name: "Battery SoC (%)", color: "#f59e0b", unit: "%", pick: (p) => p.socPct },
        { name: "Energy (kWh)", color: "#22c55e", unit: "kWh", pick: (p) => p.energyKwh },
        { name: "Current (A)", color: "#60A5FA", unit: "A", pick: (p) => p.currentA },
        { name: "Voltage (V)", color: "#A78BFA", unit: "V", pick: (p) => p.voltageV },
        { name: "Power (kW)", color: "#75331e", unit: "kW", pick: (p) => p.powerKw },
      ];
  const unitByName = Object.fromEntries(METRICS.map((m) => [m.name, m.unit]));

  const chartOption = {
    color: METRICS.map((m) => m.color),
    grid: { top: 60, right: 30, bottom: 60, left: 55 },
    legend: {
      top: 0,
      icon: "roundRect",
      itemWidth: 14,
      itemHeight: 14,
      itemGap: 20,
      data: METRICS.map((m) => m.name),
      // Any combination, including none — leave one line on its own if that is
      // all you want to read.
      selectedMode: "multiple",
      selected: legendSelected,
    },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "line" },
      formatter: (params: { seriesName: string; value: [number, number]; marker: string }[]) => {
        if (!params.length) return "";
        const head = dayjs(params[0].value[0]).format("h:mm A");
        const rows = params
          .map(
            (p) =>
              `${p.marker}${p.seriesName.replace(/ \(.*\)$/, "")}: <b>${Number(
                p.value[1],
              ).toFixed(2)} ${unitByName[p.seriesName]}</b>`,
          )
          .join("<br/>");
        return `${head}<br/>${rows}`;
      },
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
      // Production keeps every measurand on one axis starting at zero.
      type: "value",
      min: 0,
      splitLine: { lineStyle: { type: "dashed", color: "#50585c2c" } },
    },
    series: METRICS.map((m) => ({
      name: m.name,
      type: "line",
      showSymbol: false,
      lineStyle: { width: 2.5 },
      data: meterSeries.map((p) => [p.t, m.pick(p)]),
    })),
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
              {telematics
                ? (session.location?.name ?? "Outside Hub Charging Session")
                : renderValue(chargepoint?.name ?? session.chargerName)}
            </Title>
            <span>
              <Tag color={ongoing ? "green" : "default"}>
                {ongoing ? "Charging" : "Completed"}
              </Tag>
              {telematics ? (
                <Tag color="geekblue">Detected by telematics</Tag>
              ) : (
                <Tag>{connector ? `AC ${connector.powerKw} kW` : "AC"}</Tag>
              )}
              <Tag color={locationTag.color}>{locationTag.label}</Tag>
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
            {telematics ? (
              // What production's telemetry session shows, and no more: the
              // OCPP fields below simply do not exist for a charge away from
              // our chargers.
              <>
                <DetailRow
                  label="Energy Consumed"
                  value={renderValue(session.energyKwh.toFixed(2), " kWh")}
                />
                <DetailRow
                  label="Charging Power"
                  value={renderValue(avgKw === null ? null : avgKw.toFixed(2), " kW")}
                />
                <DetailRow label="Location" value={renderValue(session.location?.address)} />
                <DetailRow
                  label="Charging Cost"
                  value={renderValue(session.cost ? `₹ ${session.cost.toFixed(2)}` : null)}
                />
                <DetailRow label="Detected by" value="Vehicle telematics" />
              </>
            ) : (
              <>
                <DetailRow label="Connector Type" value={renderValue(connector?.type)} />
                <DetailRow label="Charger Type" value={renderValue(connector ? "AC" : null)} />
                <DetailRow
                  label="Charger Capacity"
                  value={renderValue(connector?.powerKw, " kW")}
                />
                <DetailRow label="Charger Id" value={renderValue(chargerOcppId(chargepoint))} />
                <DetailRow label="Connector Id" value={renderValue(session.connectorId)} />
                <DetailRow
                  label="Transaction Id"
                  value={renderValue(sessionTransactionId(session))}
                />
                <DetailRow label="Billing Id" value={renderValue(sessionBillingId(session))} />
                <DetailRow label="Initiated by" value={renderValue(session.driverName)} />
                <DetailRow
                  label="Stopped by"
                  value={session.endTime ? renderValue(session.driverName) : renderValue(null)}
                />
                <DetailRow label="Meter Start" value={renderValue(meterStart)} />
                <DetailRow label="Meter Stop" value={renderValue(meterStop)} />
              </>
            )}
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
            </div>
          </div>
          <div className="divide-y divide-gray-100">
            <DetailRow label="Driver" value={renderValue(driver?.name)} />
            <DetailRow label="Battery Capacity" value={renderValue(vehicle?.batteryKwh, " kWh")} />
            {/* SoC for THIS session, not the vehicle's live pack level. */}
            <DetailRow label="Start SoC" value={renderValue(Math.round(session.socStart), "%")} />
            <DetailRow
              label={ongoing ? "Current SoC" : "End SoC"}
              value={renderValue(
                endSoc === null || endSoc === undefined ? null : Math.round(endSoc),
                "%",
              )}
            />
          </div>
          <div className="flex flex-grow flex-col p-4">
            <Text type="secondary" style={{ fontSize: 12, marginBottom: 8 }}>
              Charging Location · {telematics ? (session.location?.address ?? hubName) : hubName}
            </Text>
            {mapPoint ? (
              <ChargerLocationMap points={[mapPoint]} height={240} />
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
          {telematics ? "Battery SoC vs. Time" : "Meter Values vs. Time"}
        </Title>
        {meterSeries.length > 0 ? (
          <ReactECharts
            option={chartOption}
            style={{ height: 384 }}
            notMerge
            onEvents={{
              legendselectchanged: (e: { selected: Record<string, boolean> }) =>
                setLegendSelected(e.selected),
            }}
          />
        ) : (
          <div className="flex h-64 items-center justify-center">
            <Text type="secondary">No data available for this session.</Text>
          </div>
        )}
      </div>
    </div>
  );
}
