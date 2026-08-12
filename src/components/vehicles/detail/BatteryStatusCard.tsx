"use client";

import { EditOutlined, InfoCircleOutlined, ThunderboltFilled } from "@ant-design/icons";
import { Button, Card, DatePicker, Segmented } from "antd";
import dayjs, { type Dayjs } from "dayjs";
import ReactECharts from "echarts-for-react";
import { useMemo, useState } from "react";
import { useDb } from "@/data/store";
import type { Vehicle } from "@/data/types";
import { SectionLabel, SURFACE_CARD_STYLE } from "./ui";
import {
  chargeWindowsFor,
  deriveLastTelemetryTs,
  deriveSocAuxHistory,
  fmtDateTime,
  getRelativeTime,
  hasTelemetry,
  type SocAuxPoint,
} from "./vehicleDetailUtils";
import { DATE_FORMAT } from "@/lib/dateFormat";

const { RangePicker } = DatePicker;

// One chart for one metric. Used twice so SoC and Aux Battery render on
// independent y-axes (their scales differ — 0-100% vs ~12V). Area +
// gradient fill and an optional reference line (Smart Charge Limit).
// Production used recharts; the sandbox mirrors the look with echarts.
function MetricChart({
  data,
  dataKey,
  label,
  color,
  unit,
  height,
  yDomain,
  relativeTicks,
  referenceLine,
}: {
  data: SocAuxPoint[];
  dataKey: "soc" | "aux";
  label: string;
  color: string;
  unit: string;
  height: number;
  yDomain: [number | "auto", number | "auto"];
  relativeTicks: boolean;
  referenceLine?: { value: number; label: string; color: string } | null;
}) {
  const option = useMemo(() => {
    const series = data.map((d) => [d.ts, d[dataKey]] as [number, number]);
    return {
      grid: { top: 12, right: 20, bottom: 24, left: 40 },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "line", lineStyle: { color, width: 1, type: "dashed" } },
        backgroundColor: "#fff",
        borderColor: "#e5e7eb",
        borderWidth: 1,
        extraCssText: "box-shadow: 0 4px 12px rgba(0,0,0,0.08); border-radius: 8px;",
        textStyle: { fontSize: 12 },
        formatter: (params: { value: [number, number] }[]) => {
          const p = params[0];
          if (!p) return "";
          return `<div style="font-size:11px;color:#6b7280">${fmtDateTime(p.value[0])}</div>
            <div style="margin-top:4px;display:flex;align-items:center;gap:6px">
            <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color}"></span>
            <span style="font-weight:600;color:#1f2937">${Number(p.value[1]).toFixed(2)} ${unit}</span>
            <span style="font-size:11px;color:#9ca3af">${label}</span></div>`;
        },
      },
      xAxis: {
        type: "time",
        axisLabel: {
          fontSize: 10,
          color: "#94a3b8",
          hideOverlap: true,
          formatter: (val: number) =>
            relativeTicks ? getRelativeTime(val) : dayjs(val).format("DD MMM HH:mm"),
        },
        axisLine: { lineStyle: { color: "#e5e7eb" } },
        axisTick: { show: false },
        splitLine: { show: false },
      },
      yAxis: {
        type: "value",
        min: yDomain[0] === "auto" ? undefined : yDomain[0],
        max: yDomain[1] === "auto" ? undefined : yDomain[1],
        scale: yDomain[0] === "auto",
        axisLabel: {
          fontSize: 10,
          color: "#94a3b8",
          formatter: (v: number) => (unit === "%" ? Math.round(v) : v.toFixed(1)),
        },
        splitLine: { lineStyle: { type: "dashed" as const, color: "#f1f5f9" } },
      },
      dataZoom: [{ type: "inside" }],
      series: [
        {
          name: label,
          type: "line",
          showSymbol: false,
          smooth: false,
          lineStyle: { color, width: 2 },
          itemStyle: { color },
          areaStyle: {
            color: {
              type: "linear",
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: `${color}40` },
                { offset: 1, color: `${color}05` },
              ],
            },
          },
          markLine:
            referenceLine && referenceLine.value != null
              ? {
                  silent: true,
                  symbol: "none",
                  label: { show: false },
                  lineStyle: {
                    color: referenceLine.color || "#f97417",
                    type: "dashed" as const,
                    width: 1.5,
                  },
                  data: [{ yAxis: referenceLine.value }],
                }
              : undefined,
          data: series,
        },
      ],
    };
  }, [data, dataKey, label, color, unit, yDomain, relativeTicks, referenceLine]);

  return (
    <div className="rounded-lg border bg-white" style={{ borderColor: "#f0f0f0" }}>
      <div className="flex items-center justify-between px-3 pt-3">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: color }} />
          <span>{label}</span>
          <span className="font-normal normal-case tracking-normal text-gray-400">({unit})</span>
        </div>
        {referenceLine && referenceLine.value != null && (
          <div
            className="rounded px-2 py-0.5 text-[10px] font-semibold"
            style={{ background: "#fff7ed", color: "#f97417", border: "1px solid #fed7aa" }}
          >
            {referenceLine.label}: {referenceLine.value}%
          </div>
        )}
      </div>
      <ReactECharts option={option} style={{ height, width: "100%" }} notMerge lazyUpdate />
    </div>
  );
}

function SocAndAuxChart({ vehicle, maxSocLimit }: { vehicle: Vehicle; maxSocLimit: number | null }) {
  const db = useDb();
  const [rangePreset, setRangePreset] = useState<string | number>("24h");
  const [customRange, setCustomRange] = useState<[Dayjs, Dayjs]>([
    dayjs().subtract(1, "day"),
    dayjs(),
  ]);

  // "Last 24h" has to follow the clock rather than freeze at mount: a live
  // session keeps charging while the page is open, and a fixed window would
  // stop short of it. Rounded to the minute so the series is not rebuilt on
  // every simulation tick.
  const nowMinuteMs = dayjs().startOf("minute").valueOf();
  const range = useMemo<[Dayjs, Dayjs]>(
    () =>
      rangePreset === "24h"
        ? [dayjs(nowMinuteMs).subtract(1, "day"), dayjs(nowMinuteMs)]
        : customRange,
    [rangePreset, nowMinuteMs, customRange],
  );

  const handleRangePresetChange = (next: string | number) => {
    setRangePreset(next);
    // 'custom' keeps whatever the user picked in the RangePicker
  };

  // The charges this vehicle actually went through, live one included, so the
  // chart tells the same story as the sessions table.
  const charges = useMemo(
    () => chargeWindowsFor(db.sessions, vehicle),
    [db.sessions, vehicle],
  );

  const data = useMemo(
    () => deriveSocAuxHistory(vehicle, range[0], range[1], charges),
    [vehicle, range, charges],
  );

  return (
    <div style={{ width: "100%" }}>
      <div className="flex w-full items-center justify-end gap-2">
        <Segmented
          size="small"
          value={rangePreset}
          onChange={handleRangePresetChange}
          options={[
            { label: "Last 24h", value: "24h" },
            { label: "Custom", value: "custom" },
          ]}
        />
        {rangePreset === "custom" && (
          <RangePicker
            allowClear={false}
            size="small"
            style={{ width: 260 }}
            value={range}
            onChange={(values) => {
              if (!values?.[0] || !values?.[1]) return;
              setCustomRange([values[0], values[1]]);
            }}
            format={DATE_FORMAT}
          />
        )}
      </div>

      {!data || data.length === 0 ? (
        <div className="flex h-[340px] w-full items-center justify-center text-gray-400">
          No data available
        </div>
      ) : (
        <div className="mt-2 flex flex-col gap-3">
          <MetricChart
            data={data}
            dataKey="soc"
            label="Battery SoC"
            color="#22c55e"
            unit="%"
            relativeTicks={rangePreset === "24h"}
            yDomain={[0, 100]}
            height={180}
            referenceLine={
              maxSocLimit != null
                ? { value: maxSocLimit, label: "Smart Charge Limit", color: "#f97417" }
                : null
            }
          />
          <MetricChart
            data={data}
            dataKey="aux"
            label="Aux Battery"
            color="#275388"
            unit="V"
            relativeTicks={rangePreset === "24h"}
            yDomain={["auto", "auto"]}
            height={140}
          />
        </div>
      )}
    </div>
  );
}

function SmartChargeBanner({ maxSoc, onEdit }: { maxSoc: number | null; onEdit: () => void }) {
  if (maxSoc == null) return null;
  // Tints derived from the antd colorPrimary (#f97417) so the banner
  // stays in step with the rest of the dashboard.
  const BRAND_ORANGE = "#f97417";
  return (
    <div
      className="mt-3 flex items-center justify-between rounded-lg border px-3 py-2"
      style={{ background: "#fff7ed", borderColor: "#fed7aa" }}
    >
      <div className="flex items-center gap-2">
        <span
          className="flex h-7 w-7 items-center justify-center rounded"
          style={{ background: BRAND_ORANGE, color: "#fff" }}
        >
          <ThunderboltFilled style={{ fontSize: 14 }} />
        </span>
        <div className="leading-tight">
          <div className="text-[13px] font-semibold text-gray-800">Smart Charge Limit</div>
          <div className="text-[11px] text-gray-500">
            Set by ergOS to reduce costs &amp; extend battery life
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xl font-bold" style={{ color: BRAND_ORANGE }}>
          {maxSoc}%
        </span>
        <Button size="small" color="primary" variant="outlined" icon={<EditOutlined />} onClick={onEdit}>
          Edit
        </Button>
      </div>
    </div>
  );
}

// Battery card — aux/last-update telemetry charts plus the Smart Charge
// Limit banner. The SoC ring lives in the header.
export default function BatteryStatusCard({
  vehicle,
  onEditSocLimit,
}: {
  vehicle: Vehicle;
  onEditSocLimit: () => void;
}) {
  const telemetryOn = hasTelemetry(vehicle);
  const maxSoc = vehicle.socCapPct ?? null;
  const lastUpdate = telemetryOn ? deriveLastTelemetryTs(vehicle) : null;

  return (
    <Card style={SURFACE_CARD_STYLE} styles={{ body: { padding: 16 } }}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ background: "#22c55e", animation: "pulse 2s infinite" }}
          />
          <SectionLabel>Battery State of Charge</SectionLabel>
        </div>
        {telemetryOn && (
          <div
            className="text-[11px] text-gray-500"
            title={lastUpdate ? fmtDateTime(lastUpdate.toISOString()) : undefined}
          >
            Last updated:{" "}
            <span className="font-medium text-gray-700">
              {lastUpdate ? getRelativeTime(lastUpdate.toDate()) : "—"}
            </span>
          </div>
        )}
      </div>

      {telemetryOn ? (
        <div className="mt-2">
          <SocAndAuxChart vehicle={vehicle} maxSocLimit={maxSoc} />
        </div>
      ) : (
        <div className="mt-3 flex items-center justify-center rounded-md bg-gray-50 px-3 py-8 text-xs text-gray-500">
          <InfoCircleOutlined className="mr-2" />
          Telematics not connected for this vehicle
        </div>
      )}

      <SmartChargeBanner maxSoc={maxSoc} onEdit={onEditSocLimit} />
    </Card>
  );
}
