"use client";

import { Alert, Button, Card, DatePicker, Segmented, Space } from "antd";
import dayjs, { Dayjs } from "dayjs";
import ReactECharts from "echarts-for-react";
import { useMemo, useState } from "react";
import { useDb } from "@/data/store";
import type { Trip } from "@/data/types";
import VehicleSelectionModal from "./VehicleSelectionModal";
import { DateRange, downloadCsv } from "./shared";
import { DATE_FORMAT } from "@/lib/dateFormat";
import {
  costPerDistanceLabel,
  money,
  perDistance as formatRate,
  setUnitSystem,
  toDistance,
  useUnits,
  type UnitConfig,
} from "@/lib/units";

const { RangePicker } = DatePicker;
const MAX_WIDTH = 1200;
const MIN_DAYS = 7;

// ─── helpers ──────────────────────────────────────────────────────────────────

function getYesterday(): Dayjs {
  return dayjs().subtract(1, "day").endOf("day");
}

function getPresetRanges(): { label: string; value: DateRange }[] {
  const now = dayjs();
  return [
    {
      label: "Last 7 days",
      value: [now.subtract(7, "day").startOf("day"), now.subtract(1, "day").endOf("day")],
    },
    {
      label: "Last 30 days",
      value: [now.subtract(30, "day").startOf("day"), now.subtract(1, "day").endOf("day")],
    },
    {
      label: "Previous Week",
      value: [
        now.subtract(1, "week").startOf("week"),
        now.subtract(1, "week").endOf("week"),
      ],
    },
    {
      label: "Previous Month",
      value: [
        now.subtract(1, "month").startOf("month"),
        now.subtract(1, "month").endOf("month"),
      ],
    },
    {
      label: "Previous 3 Months",
      value: [
        now.subtract(3, "month").startOf("month"),
        now.subtract(1, "month").endOf("month"),
      ],
    },
    {
      label: "MTD",
      value: [now.startOf("month"), now.subtract(1, "day").endOf("day")],
    },
    {
      label: "YTD",
      value: [now.startOf("year"), now.subtract(1, "day").endOf("day")],
    },
  ];
}

const DEFAULT_DATE_RANGE = getPresetRanges()[0].value;

function getPreviousPeriod([start, end]: DateRange): DateRange {
  const days = end.startOf("day").diff(start.startOf("day"), "day") + 1;
  return [
    start.subtract(days, "day").startOf("day"),
    end.subtract(days, "day").endOf("day"),
  ];
}

function correctDateRange(rawStart: Dayjs, rawEnd: Dayjs): DateRange | null {
  const yesterday = getYesterday();
  let start = rawStart.startOf("day");
  let end = rawEnd.endOf("day");

  if (end.isAfter(yesterday)) end = yesterday;
  if (start.isAfter(yesterday)) return null;

  const span = end.startOf("day").diff(start.startOf("day"), "day") + 1;
  if (span < MIN_DAYS) {
    start = end.subtract(MIN_DAYS - 1, "day").startOf("day");
  }

  return [start, end];
}

interface Delta {
  pct: string;
  up: boolean;
  positive: boolean;
}

function formatDelta(
  current: number | null,
  previous: number | null,
  invert = false,
): Delta | null {
  if (previous == null || previous === 0 || current == null) return null;
  const pct = ((current - previous) / Math.abs(previous)) * 100;
  const up = pct > 0;
  return { pct: Math.abs(pct).toFixed(1), up, positive: invert ? up : !up };
}

// ─── sub-components ───────────────────────────────────────────────────────────

function DeltaBadge({ delta }: { delta: Delta | null }) {
  if (!delta) return null;
  const color = delta.positive ? "#16A34A" : "#DC2626";
  const arrow = delta.up ? "↑" : "↓";
  return (
    <span style={{ fontSize: 11, color, marginTop: 2, display: "block" }}>
      {arrow} {delta.pct}% vs prev period
    </span>
  );
}

function DownloadIconButton({
  onClick,
  disabled,
}: {
  onClick: () => void;
  disabled?: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      style={{ position: "relative", display: "inline-block" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        onClick={onClick}
        disabled={disabled}
        style={{
          width: 32,
          height: 32,
          borderRadius: 6,
          border:
            hovered && !disabled ? "1px solid #EA580C" : "1px solid #D1D5DB",
          background: "#FFFFFF",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.4 : 1,
          boxShadow:
            hovered && !disabled ? "0 0 0 3px rgba(234,88,12,0.18)" : "none",
          transition: "border 0.15s, box-shadow 0.15s",
          padding: 0,
        }}
      >
        <svg
          width="15"
          height="15"
          viewBox="0 0 16 16"
          fill="none"
          stroke={hovered && !disabled ? "#EA580C" : "#6B7280"}
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ transition: "stroke 0.15s" }}
        >
          <line x1="8" y1="2" x2="8" y2="10" />
          <polyline points="5,7 8,11 11,7" />
          <polyline points="2,13 2,14 14,14 14,13" />
        </svg>
      </button>
      {hovered && !disabled && (
        <div
          style={{
            position: "absolute",
            bottom: "calc(100% + 7px)",
            left: "50%",
            transform: "translateX(-50%)",
            background: "#111827",
            color: "#fff",
            fontSize: 11,
            fontWeight: 500,
            padding: "4px 9px",
            borderRadius: 5,
            whiteSpace: "nowrap",
            pointerEvents: "none",
            zIndex: 10,
          }}
        >
          Download report (CSV)
        </div>
      )}
    </div>
  );
}

// ─── data derivation ──────────────────────────────────────────────────────────

interface VehicleAgg {
  license_plate: string;
  total_cost_rs: number;
  total_distance_km: number;
  rs_per_km: number | null;
  daily: { date: string; cost_rs: number; distance_km: number }[];
}

/**
 * Cost is derived from trip energy at the retail price for the active
 * currency — the fixtures carry no per-trip tariff. Distances stay in km here
 * and are converted for display, so switching units never rewrites the data.
 */
function aggregateTrips(
  trips: Trip[],
  range: DateRange | null,
  pricePerKwh: number,
): VehicleAgg[] {
  if (!range) return [];
  const [start, end] = range;
  const byPlate: Record<string, Record<string, { cost: number; dist: number }>> = {};
  for (const t of trips) {
    const ts = dayjs(t.startTime);
    if (ts.isBefore(start) || ts.isAfter(end)) continue;
    const date = ts.format("YYYY-MM-DD");
    const plate = t.vehicleReg;
    const bucket = ((byPlate[plate] ??= {})[date] ??= { cost: 0, dist: 0 });
    bucket.cost += (t.energyKwh || 0) * pricePerKwh;
    bucket.dist += t.distanceKm || 0;
  }
  return Object.entries(byPlate).map(([plate, days]) => {
    const daily = Object.entries(days)
      .map(([date, v]) => ({
        date,
        cost_rs: Math.round(v.cost * 100) / 100,
        distance_km: Math.round(v.dist * 100) / 100,
      }))
      .sort((a, b) => (a.date < b.date ? -1 : 1));
    const totalCost = daily.reduce((s, d) => s + d.cost_rs, 0);
    const totalDist = daily.reduce((s, d) => s + d.distance_km, 0);
    return {
      license_plate: plate,
      total_cost_rs: totalCost,
      total_distance_km: totalDist,
      rs_per_km: totalDist > 0 ? totalCost / totalDist : null,
      daily,
    };
  });
}

// ─── main component ───────────────────────────────────────────────────────────

export default function CostPerDistanceAnalysis() {
  const db = useDb();
  const vehicles = db.vehicles;
  const units = useUnits();

  const [dateRange, setDateRange] = useState<DateRange>(DEFAULT_DATE_RANGE);
  const [selectedVehicleIds, setSelectedVehicleIds] = useState<string[]>(() =>
    vehicles.map((v) => v.id),
  );
  const [modalOpen, setModalOpen] = useState(false);
  const [reportParams, setReportParams] = useState<DateRange | null>(
    () => DEFAULT_DATE_RANGE,
  );
  const [prevReportParams, setPrevReportParams] = useState<DateRange | null>(
    () => getPreviousPeriod(DEFAULT_DATE_RANGE),
  );
  const [isWeeklyView, setIsWeeklyView] = useState(true);
  const [pendingStart, setPendingStart] = useState<Dayjs | null>(null);

  const selectedDays = useMemo(() => {
    const [start, end] = dateRange;
    if (!start || !end) return 0;
    return end.startOf("day").diff(start.startOf("day"), "day") + 1;
  }, [dateRange]);

  const isRangeTooShort = selectedDays > 0 && selectedDays < MIN_DAYS;

  const disabledDate = (current: Dayjs) => {
    if (!pendingStart || !current) return false;
    const diff = Math.abs(current.startOf("day").diff(pendingStart, "day"));
    return diff < MIN_DAYS - 1;
  };

  const handleCalendarChange = (dates: (Dayjs | null)[] | null) => {
    if (!dates) return;
    if (dates[0] && !dates[1]) {
      setPendingStart(dates[0].startOf("day"));
      return;
    }
    if (dates[0] && dates[1]) {
      const corrected = correctDateRange(dates[0], dates[1]);
      setDateRange(corrected ?? DEFAULT_DATE_RANGE);
      setPendingStart(null);
    }
  };

  const handleDateChange = (dates: (Dayjs | null)[] | null) => {
    if (!dates || !dates[0]) {
      setDateRange(DEFAULT_DATE_RANGE);
      setPendingStart(null);
      return;
    }
    if (dates[0] && dates[1]) {
      const corrected = correctDateRange(dates[0], dates[1]);
      setDateRange(corrected ?? DEFAULT_DATE_RANGE);
      setPendingStart(null);
    }
  };

  // ── id → plate ─────────────────────────────────────────────────────────────
  const vehicleIdToPlate = useMemo(
    () => Object.fromEntries(vehicles.map((v) => [v.id, v.reg])),
    [vehicles],
  );

  const selectedPlates = useMemo(() => {
    if (!selectedVehicleIds.length) return null;
    return new Set(
      selectedVehicleIds.map((id) => vehicleIdToPlate[id]).filter(Boolean),
    );
  }, [selectedVehicleIds, vehicleIdToPlate]);

  // ── datasets ("queries" resolve instantly from the store) ──────────────────
  const rawData = useMemo(
    () => aggregateTrips(db.trips, reportParams, units.energyPricePerKwh),
    [db.trips, reportParams, units.energyPricePerKwh],
  );
  const prevRawData = useMemo(
    () => aggregateTrips(db.trips, prevReportParams, units.energyPricePerKwh),
    [db.trips, prevReportParams, units.energyPricePerKwh],
  );

  const filteredData = useMemo(() => {
    if (!rawData.length) return [];
    if (!selectedPlates) return rawData;
    return rawData.filter((row) => selectedPlates.has(row.license_plate));
  }, [rawData, selectedPlates]);

  const prevFilteredData = useMemo(() => {
    if (!prevRawData.length) return [];
    if (!selectedPlates) return prevRawData;
    return prevRawData.filter((row) => selectedPlates.has(row.license_plate));
  }, [prevRawData, selectedPlates]);

  // ── KPIs ───────────────────────────────────────────────────────────────────
  const vehicleCount = useMemo(() => {
    const plates = new Set(filteredData.map((r) => r.license_plate));
    return plates.size || 1;
  }, [filteredData]);

  const summaryKpis = useMemo(() => {
    let totalCost = 0,
      totalDistance = 0;
    for (const row of filteredData) {
      totalCost += row.total_cost_rs || 0;
      totalDistance += row.total_distance_km || 0;
    }
    const tCost = Math.round(totalCost * 100) / 100;
    const tDist = Math.round(totalDistance * 100) / 100;
    return {
      avgRsPerKm:
        totalDistance > 0
          ? Math.round((totalCost / totalDistance) * 10000) / 10000
          : null,
      totalCost: tCost,
      totalDistance: tDist,
      avgCostPerVehicle: Math.round((tCost / vehicleCount) * 100) / 100,
      avgDistancePerVehicle: Math.round((tDist / vehicleCount) * 100) / 100,
    };
  }, [filteredData, vehicleCount]);

  const prevKpis = useMemo(() => {
    let totalCost = 0,
      totalDistance = 0;
    for (const row of prevFilteredData) {
      totalCost += row.total_cost_rs || 0;
      totalDistance += row.total_distance_km || 0;
    }
    return {
      avgRsPerKm: totalDistance > 0 ? totalCost / totalDistance : null,
      totalCost: Math.round(totalCost * 100) / 100,
      totalDistance: Math.round(totalDistance * 100) / 100,
    };
  }, [prevFilteredData]);

  const deltas = useMemo(
    () => ({
      rsPerKm: formatDelta(summaryKpis.avgRsPerKm, prevKpis.avgRsPerKm, false),
      cost: formatDelta(summaryKpis.totalCost, prevKpis.totalCost, false),
      distance: formatDelta(
        summaryKpis.totalDistance,
        prevKpis.totalDistance,
        true,
      ),
    }),
    [summaryKpis, prevKpis],
  );

  // Everything is stored per km; these two convert at the display boundary.
  const toRate = (costPerKm: number | null | undefined) =>
    costPerKm == null ? null : costPerKm / units.kmFactor;
  const dist = (km: number) => toDistance(km, units);

  // ── vehicle rows ───────────────────────────────────────────────────────────
  const vehicleRows = useMemo(
    () =>
      filteredData
        .filter((v) => v.rs_per_km != null)
        .map((v) => ({
          plate: v.license_plate,
          dist: Math.round(v.total_distance_km * 100) / 100,
          cost: Math.round(v.total_cost_rs * 100) / 100,
          rsPerKm: v.rs_per_km as number,
        }))
        .sort((a, b) => a.rsPerKm - b.rsPerKm),
    [filteredData],
  );

  // ── trend ──────────────────────────────────────────────────────────────────
  const trendData = useMemo(() => {
    const rangeStart = reportParams ? reportParams[0].startOf("day") : null;
    const rangeEnd = reportParams ? reportParams[1].startOf("day") : null;

    const trendMap: Record<
      string,
      { label: string; cost: number; dist: number; sortKey: number }
    > = {};

    // Pre-seed every weekly bucket so all weeks show on the x-axis. The first
    // partial week is clamped to rangeStart (exact-range mode; the original's
    // full-week preset expansion is not replicated in the sandbox).
    if (isWeeklyView && rangeStart && rangeEnd) {
      let cursor = rangeStart;
      while (!cursor.isAfter(rangeEnd)) {
        const weekSunday = cursor.startOf("week");
        const bucketStart = weekSunday.isBefore(rangeStart)
          ? rangeStart
          : weekSunday;
        const bucket = bucketStart.format("DD MMM");
        if (!trendMap[bucket]) {
          trendMap[bucket] = {
            label: bucket,
            cost: 0,
            dist: 0,
            sortKey: bucketStart.valueOf(),
          };
        }
        cursor = weekSunday.add(7, "day");
      }
    }

    for (const vehicle of filteredData) {
      for (const day of vehicle.daily) {
        if (!day.distance_km || day.distance_km <= 0) continue;

        const rowDate = dayjs(day.date, "YYYY-MM-DD");
        if (rangeStart && rowDate.isBefore(rangeStart)) continue;
        if (rangeEnd && rowDate.isAfter(rangeEnd)) continue;

        let bucket: string;
        let sortKey: number;
        if (isWeeklyView) {
          const weekSunday = rowDate.startOf("week");
          const bucketStart =
            rangeStart && weekSunday.isBefore(rangeStart)
              ? rangeStart
              : weekSunday;
          bucket = bucketStart.format("DD MMM");
          sortKey = bucketStart.valueOf();
        } else {
          bucket = day.date.slice(0, 7); // "YYYY-MM"
          sortKey = rowDate.valueOf();
        }

        if (!trendMap[bucket]) {
          trendMap[bucket] = { label: bucket, cost: 0, dist: 0, sortKey };
        }
        trendMap[bucket].cost += day.cost_rs || 0;
        trendMap[bucket].dist += day.distance_km || 0;
      }
    }

    return Object.values(trendMap)
      .sort((a, b) => a.sortKey - b.sortKey)
      .map((row) => ({
        label: row.label,
        rs_per_km:
          row.dist > 0
            ? Math.round((row.cost / row.dist) * 10000) / 10000
            : null,
      }));
  }, [filteredData, isWeeklyView, reportParams]);

  // ── echarts ────────────────────────────────────────────────────────────────
  const trendOption = useMemo(
    () => ({
      tooltip: {
        trigger: "axis",
        backgroundColor: "#1C1917",
        borderColor: "#44403C",
        textStyle: { color: "#E7E5E4", fontSize: 13 },
        formatter: (params: { name: string; value: number | null }[]) => {
          const p = params[0];
          return `<div style="font-weight:600;margin-bottom:4px;">${p.name}</div>
                <span style="color:#FB923C;">${costPerDistanceLabel(units)}: </span>
                <span style="font-weight:700;">${formatRate(p.value)}</span>`;
        },
      },
      grid: { top: 32, right: 24, bottom: 40, left: 64 },
      xAxis: {
        type: "category",
        data: trendData.map((r) => r.label),
        axisLine: { lineStyle: { color: "#E7E5E4" } },
        axisTick: { show: false },
        axisLabel: { color: "#78716C", fontSize: 12 },
      },
      yAxis: {
        type: "value",
        name: costPerDistanceLabel(units),
        nameTextStyle: { color: "#78716C", fontSize: 12 },
        splitLine: { lineStyle: { color: "#F5F5F4", type: "dashed" } },
        axisLabel: {
          color: "#78716C",
          fontSize: 12,
          formatter: (v: number) => `${units.currencySymbol}${formatRate(v)}`,
        },
      },
      series: [
        {
          type: "line",
          smooth: 0.5,
          symbol: "circle",
          symbolSize: 7,
          lineStyle: { width: 3, color: "#EA580C" },
          itemStyle: { color: "#EA580C" },
          areaStyle: {
            color: {
              type: "linear",
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: "rgba(251,146,60,0.15)" },
                { offset: 1, color: "rgba(251,146,60,0)" },
              ],
            },
          },
          data: trendData.map((r) =>
            r.rs_per_km == null ? null : Number((r.rs_per_km / units.kmFactor).toFixed(4)),
          ),
          markLine: {
            silent: true,
            symbol: "none",
            lineStyle: { color: "#F59E0B", type: "dashed", width: 1.5 },
            label: {
              color: "#F59E0B",
              fontSize: 11,
              formatter: (p: { value: number }) =>
                `Avg ${units.currencySymbol}${formatRate(Number(p.value))}`,
            },
            data: [{ type: "average", name: "Fleet avg" }],
          },
        },
      ],
    }),
    [trendData, units],
  );

  // ── actions ────────────────────────────────────────────────────────────────
  const handleGenerateReport = () => {
    if (isRangeTooShort) return;
    const [start, end] = dateRange;
    if (!start || !end) return;
    setReportParams([start, end]);
    setPrevReportParams(getPreviousPeriod(dateRange));
  };

  const handleDownloadTable = () => {
    if (!vehicleRows.length) return;
    const headers = [
      "#",
      "Vehicle",
      `Distance (${units.distanceUnit})`,
      `Cost (${units.currencyCode})`,
      `${units.currencyCode} / ${units.distanceUnit}`,
    ];
    const rows = vehicleRows.map((row, i) => [
      i + 1,
      row.plate,
      Math.round(dist(row.dist) * 100) / 100,
      row.cost,
      toRate(row.rsPerKm)?.toFixed(4) ?? "",
    ]);
    downloadCsv([headers, ...rows], "cost_per_distance.csv");
  };

  // ── KPI tile config ────────────────────────────────────────────────────────
  const kpiTiles = [
    {
      icon: "💰",
      label: "Amount Spent",
      value: money(summaryKpis.totalCost, units),
      avg: `Avg ${money(summaryKpis.avgCostPerVehicle, units)} / vehicle`,
      delta: deltas.cost,
      delay: "0.2s",
    },
    {
      icon: "📍",
      label: "Distance Travelled",
      value: `${Math.round(dist(summaryKpis.totalDistance)).toLocaleString()} ${units.distanceUnit}`,
      avg: `Avg ${Math.round(dist(summaryKpis.avgDistancePerVehicle)).toLocaleString()} ${units.distanceUnit} / vehicle`,
      delta: deltas.distance,
      delay: "0.35s",
    },
  ];

  const css = `
    @keyframes slideInKpi {
      from { opacity: 0; transform: translateX(24px); }
      to   { opacity: 1; transform: translateX(0); }
    }
    @keyframes fadeUpHero {
      from { opacity: 0; transform: translateY(14px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    .rs-hero-main { animation: fadeUpHero 0.55s ease forwards; }
    .rs-kpi-tile  { opacity: 0; animation: slideInKpi 0.45s ease forwards; }
    .rs-vehicle-row { transition: background 0.12s ease; }
    .rs-pill-toggle .ant-segmented {
      background: #FFF7ED; border: 1px solid #FED7AA;
      border-radius: 999px; padding: 3px;
    }
    .rs-pill-toggle .ant-segmented-group { border-radius: 999px; }
    .rs-pill-toggle .ant-segmented-item  { border-radius: 999px; transition: color 0.2s; }
    .rs-pill-toggle .ant-segmented-item-label {
      font-size: 13px; border-radius: 999px; padding: 0 14px;
    }
    .rs-pill-toggle .ant-segmented-item-selected {
      background: #EA580C !important; color: #fff !important;
      border-radius: 999px !important;
    }
    .rs-pill-toggle .ant-segmented-thumb {
      background: #EA580C !important; border-radius: 999px !important;
    }
  `;

  return (
    <div style={{ maxWidth: MAX_WIDTH, margin: "0 auto" }}>
      <style>{css}</style>

      <Space orientation="vertical" style={{ width: "100%" }} size="middle">
        {/* ── Filter bar ──────────────────────────────────────────────────── */}
        <Card>
          <Space wrap align="center">
            <RangePicker
              format={DATE_FORMAT}
              value={dateRange}
              onChange={handleDateChange}
              onCalendarChange={handleCalendarChange}
              disabledDate={disabledDate}
              allowClear={false}
              presets={getPresetRanges()}
              status={isRangeTooShort ? "error" : undefined}
            />
            <Button onClick={() => setModalOpen(true)}>
              Select Vehicles ({selectedVehicleIds.length})
            </Button>
            {/* Units follow the customer, not the build (demo spec item 9). */}
            <Segmented
              value={units.system}
              onChange={(val) => setUnitSystem(val as UnitConfig["system"])}
              options={[
                { label: "₹ / km", value: "metric" },
                { label: "$ / mi", value: "imperial" },
              ]}
            />
            <Button
              type="primary"
              onClick={handleGenerateReport}
              disabled={isRangeTooShort || !dateRange[0] || !dateRange[1]}
              style={
                !isRangeTooShort
                  ? { background: "#EA580C", borderColor: "#EA580C" }
                  : {}
              }
            >
              Generate Report
            </Button>
          </Space>

          <div style={{ marginTop: 8, fontSize: 12, color: "#78716C" }}>
            ⓘ Minimum 7 days required.
            {isRangeTooShort && (
              <span style={{ color: "#DC2626", marginLeft: 8 }}>
                ⚠ {selectedDays} day{selectedDays !== 1 ? "s" : ""} selected —
                please extend to at least 7 days.
              </span>
            )}
          </div>
        </Card>

        {reportParams && (
          <>
            {/* ── Hero card ─────────────────────────────────────────────── */}
            <Card
              style={{
                borderRadius: 20,
                border: "1px solid #FED7AA",
                boxShadow: "0 4px 24px rgba(234,88,12,0.10)",
              }}
              styles={{ body: { padding: "32px 36px" } }}
            >
              <div style={{ display: "flex", gap: 32, alignItems: "stretch" }}>
                <div
                  style={{
                    flex: "1.9",
                    position: "relative",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      fontSize: 12,
                      fontWeight: 700,
                      color: "#EA580C",
                      letterSpacing: "0.8px",
                    }}
                  >
                    Fleet Average · {costPerDistanceLabel(units)}
                  </div>

                  <span
                    className="rs-hero-main"
                    style={{
                      fontSize: 80,
                      fontWeight: 800,
                      color: "#1C1917",
                      lineHeight: 1,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {formatRate(toRate(summaryKpis.avgRsPerKm))}
                  </span>
                  <span style={{ fontSize: 20, color: "#78716C", fontWeight: 500 }}>
                    {costPerDistanceLabel(units)}
                  </span>
                  <DeltaBadge delta={deltas.rsPerKm} />
                </div>

                <div
                  style={{
                    flex: "0.85",
                    display: "flex",
                    flexDirection: "column",
                    gap: 14,
                  }}
                >
                  {kpiTiles.map((kpi) => (
                    <div
                      key={kpi.label}
                      className="rs-kpi-tile"
                      style={{
                        background: "#FFF7ED",
                        border: "1px solid #FED7AA",
                        borderRadius: 14,
                        padding: "14px 16px 14px 12px",
                        animationDelay: kpi.delay,
                        boxShadow: "0 4px 14px rgba(234,88,12,0.10)",
                        flex: 1,
                      }}
                    >
                      <div
                        style={{
                          fontSize: 12,
                          color: "#9A3412",
                          marginBottom: 4,
                          fontWeight: 600,
                        }}
                      >
                        {kpi.icon} {kpi.label}
                      </div>
                      <div
                        style={{
                          fontSize: 22,
                          fontWeight: 800,
                          color: "#1C1917",
                          marginBottom: 2,
                        }}
                      >
                        {kpi.value}
                      </div>
                      <DeltaBadge delta={kpi.delta} />
                      <div
                        style={{
                          borderTop: "1px solid #FED7AA",
                          margin: "6px 0 4px",
                        }}
                      />
                      <div style={{ fontSize: 11, color: "#78716C" }}>
                        {kpi.avg}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Card>

            {/* ── Trend chart ──────────────────────────────────────────── */}
            <Card
              style={{ borderRadius: 16 }}
              title={
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    flexWrap: "wrap",
                    gap: 8,
                  }}
                >
                  <span style={{ fontSize: 14, fontWeight: 600 }}>
                    {isWeeklyView ? "Weekly" : "Monthly"} Fleet Trend ·{" "}
                    {costPerDistanceLabel(units)}
                  </span>
                  <div className="rs-pill-toggle">
                    <Segmented
                      size="small"
                      value={isWeeklyView ? "Weekly" : "Monthly"}
                      onChange={(val) => setIsWeeklyView(val === "Weekly")}
                      options={["Weekly", "Monthly"]}
                    />
                  </div>
                </div>
              }
            >
              {trendData.length > 0 ? (
                <ReactECharts option={trendOption} style={{ height: 420 }} />
              ) : (
                <div
                  style={{
                    height: 420,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#94A3B8",
                    fontSize: 14,
                  }}
                >
                  No trend data for this period
                </div>
              )}
            </Card>

            {/* ── Vehicle breakdown ─────────────────────────────────────── */}
            {vehicleRows.length > 0 && (
              <Card
                title={
                  <span style={{ fontSize: 14, fontWeight: 600 }}>
                    Vehicle Breakdown · sorted by {costPerDistanceLabel(units)}
                  </span>
                }
                extra={<DownloadIconButton onClick={handleDownloadTable} />}
                style={{ borderRadius: 16 }}
              >
                <div style={{ overflowX: "auto" }}>
                  <table
                    style={{
                      width: "100%",
                      borderCollapse: "collapse",
                      fontSize: 13,
                      tableLayout: "fixed",
                    }}
                  >
                    <colgroup>
                      <col style={{ width: "6%" }} />
                      <col style={{ width: "24%" }} />
                      <col style={{ width: "23.33%" }} />
                      <col style={{ width: "23.33%" }} />
                      <col style={{ width: "23.33%" }} />
                    </colgroup>
                    <thead>
                      <tr style={{ borderBottom: "1px solid #E7E5E4" }}>
                        {[
                          { label: "#", align: "left" as const },
                          { label: "Vehicle", align: "left" as const },
                          { label: "Distance", align: "right" as const },
                          { label: `Cost (${units.currencySymbol})`, align: "right" as const },
                          { label: costPerDistanceLabel(units), align: "right" as const },
                        ].map((col) => (
                          <th
                            key={col.label}
                            style={{
                              padding: "10px 12px",
                              textAlign: col.align,
                              color: "#78716C",
                              fontWeight: 600,
                              fontSize: 12,
                              letterSpacing: "0.4px",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            {col.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {vehicleRows.map((row, i) => (
                        <tr
                          key={row.plate}
                          className="rs-vehicle-row"
                          style={{ borderBottom: "1px solid #F5F5F4" }}
                        >
                          <td
                            style={{
                              padding: "10px 12px",
                              color: "#A8A29E",
                              fontSize: 12,
                            }}
                          >
                            {i + 1}
                          </td>
                          <td
                            style={{
                              padding: "10px 12px",
                              fontWeight: 600,
                              color: "#1C1917",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {row.plate}
                          </td>
                          <td
                            style={{
                              padding: "10px 12px",
                              textAlign: "right",
                              color: "#57534E",
                            }}
                          >
                            {Math.round(dist(row.dist)).toLocaleString()} {units.distanceUnit}
                          </td>
                          <td
                            style={{
                              padding: "10px 12px",
                              textAlign: "right",
                              color: "#57534E",
                            }}
                          >
                            {money(row.cost, units)}
                          </td>
                          <td
                            style={{
                              padding: "10px 12px",
                              textAlign: "right",
                              fontWeight: 700,
                              fontVariantNumeric: "tabular-nums",
                              color: "#1C1917",
                            }}
                          >
                            {formatRate(toRate(row.rsPerKm))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </>
        )}

        {!reportParams && (
          <Alert type="info" message="Generate a report to see the analysis" showIcon />
        )}
      </Space>

      <VehicleSelectionModal
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onConfirm={(ids) => {
          setSelectedVehicleIds(ids ?? []);
          setModalOpen(false);
        }}
        selectedVehicleIds={selectedVehicleIds}
      />
    </div>
  );
}
