"use client";

import { DatePicker, Empty, Segmented, Tooltip, Typography } from "antd";
import dayjs, { Dayjs } from "dayjs";
import { useMemo, useState } from "react";
import { useDb } from "@/data/store";
import { DATE_FORMAT } from "@/lib/dateFormat";

const { RangePicker } = DatePicker;
const { Title } = Typography;

// ── Brand palette (matches Vehicle Analytics) ──────────────────────
const BRAND = {
  orange: "#f97417",
  green: "#22c55e",
  teal: "#14b8a6",
  amber: "#f59e0b",
  red: "#ef4444",
  redDeep: "#b91c1c",
  border: "#e5e5e0",
  textPrimary: "#1a1f2e",
  textSecondary: "#6b7280",
  textMuted: "#9ca3af",
};

const CARD_STYLE: React.CSSProperties = {
  background: "#ffffff",
  border: `1px solid ${BRAND.border}`,
  borderRadius: 12,
  padding: 24,
};

const X_AXIS_HEIGHT = 26;
const MAX_BARS = 60;

interface SessionUnit {
  startKey: string;
  endKey: string;
  spanDays: number;
  kwh: number;
  hours: number;
  count: number;
}

interface UptimeUnit {
  startKey: string;
  endKey: string;
  spanDays: number;
  spanHours: number;
  uptimeSeconds: number;
  totalSeconds: number;
  pct: number;
}

// ── Utilities ──────────────────────────────────────────────────────
const niceMax = (max: number, fallback = 1) => {
  if (!max || max <= 0) return fallback;
  const exp = Math.pow(10, Math.floor(Math.log10(max)));
  for (const m of [1, 2, 2.5, 5, 10]) {
    const candidate = m * exp;
    if (candidate >= max) return candidate;
  }
  return Math.ceil(max / exp) * exp;
};

const pickLabelIndices = (count: number) => {
  if (count <= 1) return new Set([0]);
  const target = Math.min(7, count);
  const idx = new Set<number>();
  for (let i = 0; i < target; i += 1) {
    idx.add(Math.round((i * (count - 1)) / (target - 1)));
  }
  return idx;
};

const formatUnitLabel = (u: SessionUnit | UptimeUnit) => {
  const start = dayjs(u.startKey);
  if (u.spanDays >= 28) return start.format("MMM 'YY");
  if ("spanHours" in u && u.spanHours) return start.format("D MMM HH:mm");
  return start.format("D MMM");
};

const colorForUptimePct = (pct: number) => {
  if (pct > 75) return BRAND.green;
  if (pct > 50) return BRAND.amber;
  if (pct > 25) return BRAND.orange;
  if (pct > 10) return BRAND.red;
  return BRAND.redDeep;
};

// ── Date controls ──────────────────────────────────────────────────
const PRESETS: { label: string; value: number | "all" }[] = [
  { label: "Last 7 days", value: 7 },
  { label: "Last 30 days", value: 30 },
  { label: "Last 90 days", value: 90 },
  { label: "All time", value: "all" },
];

const rangeForPreset = (preset: number | "all"): [Dayjs, Dayjs] => {
  const end = dayjs();
  if (preset === "all") return [end.subtract(364, "day"), end];
  return [end.subtract(preset - 1, "day"), end];
};

function DateControls({
  presetValue,
  onPresetChange,
  range,
  onRangeChange,
}: {
  presetValue: number | "all" | null;
  onPresetChange: (v: number | "all") => void;
  range: [Dayjs, Dayjs];
  onRangeChange: (v: [Dayjs, Dayjs]) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Segmented
        size="middle"
        value={presetValue ?? undefined}
        onChange={(v) => onPresetChange(v as number | "all")}
        options={PRESETS.map((p) => ({ label: p.label, value: p.value }))}
      />
      <RangePicker
        format={DATE_FORMAT}
        allowClear={false}
        size="middle"
        style={{ width: 280 }}
        value={range}
        onChange={(next) => {
          if (!next?.[0] || !next?.[1]) return;
          onRangeChange([next[0], next[1]]);
        }}
      />
    </div>
  );
}

// ── KPI summary card ───────────────────────────────────────────────
function SummaryCard({
  label,
  value,
  unit,
  sub,
  accent,
}: {
  label: string;
  value: string | number;
  unit?: string;
  sub?: string;
  accent?: string;
}) {
  return (
    <div
      style={{
        background: "#fff",
        border: `1px solid ${BRAND.border}`,
        borderRadius: 10,
        padding: "12px 14px",
        flex: 1,
        minWidth: 160,
        ...(accent ? { borderLeft: `3px solid ${accent}` } : {}),
      }}
    >
      <div
        style={{
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: 0.5,
          color: BRAND.textMuted,
          fontWeight: 500,
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 22,
          fontWeight: 700,
          color: BRAND.textPrimary,
          lineHeight: 1.1,
        }}
      >
        {value}
        {unit && (
          <span
            style={{
              fontSize: 12,
              fontWeight: 500,
              color: BRAND.textSecondary,
              marginLeft: 3,
            }}
          >
            {unit}
          </span>
        )}
      </div>
      {sub && (
        <div
          style={{
            fontSize: 13,
            color: BRAND.textSecondary,
            marginTop: 6,
            lineHeight: 1.4,
            fontWeight: 500,
          }}
        >
          {sub}
        </div>
      )}
    </div>
  );
}

// ── Tooltip bodies ─────────────────────────────────────────────────
function buildSessionTooltip(u: SessionUnit) {
  const start = dayjs(u.startKey);
  const end = dayjs(u.endKey);
  const header =
    u.spanDays > 1
      ? `${start.format("D MMM")} – ${end.format("D MMM YYYY")}`
      : start.format("D MMM YYYY");
  return (
    <div style={{ minWidth: 180 }}>
      <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 12 }}>
        {header}
      </div>
      <div style={{ fontSize: 12, padding: "2px 0" }}>
        {u.count} session{u.count === 1 ? "" : "s"}
      </div>
      <div style={{ fontSize: 12, padding: "2px 0" }}>{u.kwh.toFixed(2)} kWh</div>
      <div style={{ fontSize: 12, padding: "2px 0" }}>
        {u.hours.toFixed(2)} hrs
      </div>
    </div>
  );
}

function buildUptimeTooltip(u: UptimeUnit) {
  const start = dayjs(u.startKey);
  const end = dayjs(u.endKey);
  const header =
    u.spanHours && u.spanHours <= 24
      ? start.format("D MMM YYYY, HH:mm")
      : u.spanDays > 1
        ? `${start.format("D MMM HH:mm")} – ${end.format("D MMM YYYY HH:mm")}`
        : start.format("D MMM YYYY, HH:mm");
  const hours = u.uptimeSeconds / 3600;
  return (
    <div style={{ minWidth: 200 }}>
      <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 12 }}>
        {header}
      </div>
      <div style={{ fontSize: 12, padding: "2px 0" }}>
        Uptime: {u.pct.toFixed(0)}%
      </div>
      <div style={{ fontSize: 12, padding: "2px 0" }}>
        {hours.toFixed(2)} hrs of {(u.totalSeconds / 3600).toFixed(0)} hrs
      </div>
    </div>
  );
}

// ── Chart shell (y-axis, grid, x-axis) ─────────────────────────────
function ChartShell({
  units,
  yMax,
  height,
  children,
}: {
  units: SessionUnit[];
  yMax: number;
  height: number;
  children: (args: { innerHeight: number }) => React.ReactNode;
}) {
  const innerHeight = height - X_AXIS_HEIGHT;
  const yTicks = [0, 0.25, 0.5, 0.75, 1];
  const yLabels = yTicks
    .slice()
    .sort((a, b) => b - a)
    .map((t) => Math.round(yMax * t));
  const labelIdx = useMemo(() => pickLabelIndices(units.length), [units.length]);

  return (
    <div style={{ position: "relative", height, marginTop: 16 }}>
      {/* Y axis */}
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: X_AXIS_HEIGHT,
          width: 32,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
        }}
      >
        {yLabels.map((y, i) => (
          <span
            key={i}
            style={{ fontSize: 10, color: BRAND.textMuted, textAlign: "right" }}
          >
            {y}
          </span>
        ))}
      </div>

      {/* Grid */}
      <div
        style={{
          position: "absolute",
          left: 36,
          top: 0,
          right: 0,
          bottom: X_AXIS_HEIGHT,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          pointerEvents: "none",
        }}
      >
        {yTicks.map((_, i) => (
          <div key={i} style={{ borderBottom: "1px solid #f0f0ed" }} />
        ))}
      </div>

      {/* Bars area (children render the actual bars) */}
      <div
        style={{
          position: "absolute",
          left: 40,
          top: 0,
          right: 8,
          bottom: X_AXIS_HEIGHT,
          display: "flex",
          alignItems: "flex-end",
          gap: 0,
        }}
      >
        {children({ innerHeight })}
      </div>

      {/* X axis */}
      <div
        style={{
          position: "absolute",
          left: 40,
          right: 8,
          bottom: 0,
          height: X_AXIS_HEIGHT,
          display: "flex",
        }}
      >
        {units.map((u, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              minWidth: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 10,
              color: BRAND.textSecondary,
              whiteSpace: "nowrap",
              overflow: "visible",
            }}
          >
            {labelIdx.has(i) ? formatUnitLabel(u) : ""}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Trend bar chart (Energy / Sessions / Duration) ─────────────────
function TrendBarChart({
  units,
  getValue,
  color,
  yMax,
  height = 280,
}: {
  units: SessionUnit[];
  getValue: (u: SessionUnit) => number;
  color: string;
  yMax: number;
  height?: number;
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  return (
    <ChartShell units={units} yMax={yMax} height={height}>
      {({ innerHeight }) =>
        units.map((u, unitIdx) => {
          const v = getValue(u) || 0;
          const isHover = hoverIdx === unitIdx;
          return (
            <Tooltip key={unitIdx} title={buildSessionTooltip(u)} mouseEnterDelay={0}>
              <div
                onMouseEnter={() => setHoverIdx(unitIdx)}
                onMouseLeave={() =>
                  setHoverIdx((prev) => (prev === unitIdx ? null : prev))
                }
                style={{
                  flex: 1,
                  minWidth: 0,
                  display: "flex",
                  alignItems: "flex-end",
                  justifyContent: "center",
                  alignSelf: "stretch",
                  padding: "0 2px",
                  background: isHover ? "rgba(249, 116, 23, 0.08)" : "transparent",
                  borderRadius: 4,
                  transition: "background 0.12s",
                  cursor: "default",
                }}
              >
                {v <= 0 ? (
                  <div
                    style={{
                      width: "60%",
                      maxWidth: 28,
                      height: 2,
                      background: "#e5e5e0",
                      borderRadius: 1,
                    }}
                  />
                ) : (
                  <div
                    style={{
                      flex: 1,
                      minWidth: 0,
                      maxWidth: 16,
                      height: Math.max(2, (v / yMax) * innerHeight),
                      background: color,
                      borderRadius: "4px 4px 1px 1px",
                      transition: "all 0.2s",
                    }}
                  />
                )}
              </div>
            </Tooltip>
          );
        })
      }
    </ChartShell>
  );
}

// ── Uptime bar chart (color-coded by % uptime) ─────────────────────
function UptimeBarChart({
  units,
  height = 280,
}: {
  units: UptimeUnit[];
  height?: number;
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const yMax = 100;
  const innerHeight = height - X_AXIS_HEIGHT;
  const yTicks = [0, 0.25, 0.5, 0.75, 1];
  const yLabels = yTicks
    .slice()
    .sort((a, b) => b - a)
    .map((t) => Math.round(yMax * t));
  const labelIdx = useMemo(() => pickLabelIndices(units.length), [units.length]);

  return (
    <div style={{ position: "relative", height, marginTop: 16 }}>
      {/* Y axis with % suffix */}
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: X_AXIS_HEIGHT,
          width: 36,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
        }}
      >
        {yLabels.map((y, i) => (
          <span
            key={i}
            style={{ fontSize: 10, color: BRAND.textMuted, textAlign: "right" }}
          >
            {y}%
          </span>
        ))}
      </div>

      {/* Grid */}
      <div
        style={{
          position: "absolute",
          left: 40,
          top: 0,
          right: 0,
          bottom: X_AXIS_HEIGHT,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          pointerEvents: "none",
        }}
      >
        {yTicks.map((_, i) => (
          <div key={i} style={{ borderBottom: "1px solid #f0f0ed" }} />
        ))}
      </div>

      {/* Bars */}
      <div
        style={{
          position: "absolute",
          left: 44,
          top: 0,
          right: 8,
          bottom: X_AXIS_HEIGHT,
          display: "flex",
          alignItems: "flex-end",
          gap: 0,
        }}
      >
        {units.map((u, unitIdx) => {
          const isHover = hoverIdx === unitIdx;
          const color = colorForUptimePct(u.pct);
          return (
            <Tooltip key={unitIdx} title={buildUptimeTooltip(u)} mouseEnterDelay={0}>
              <div
                onMouseEnter={() => setHoverIdx(unitIdx)}
                onMouseLeave={() =>
                  setHoverIdx((prev) => (prev === unitIdx ? null : prev))
                }
                style={{
                  flex: 1,
                  minWidth: 0,
                  display: "flex",
                  alignItems: "flex-end",
                  justifyContent: "center",
                  alignSelf: "stretch",
                  padding: "0 2px",
                  background: isHover ? "rgba(0, 0, 0, 0.04)" : "transparent",
                  borderRadius: 4,
                  transition: "background 0.12s",
                  cursor: "default",
                }}
              >
                {u.pct <= 0 ? (
                  <div
                    style={{
                      width: "60%",
                      maxWidth: 28,
                      height: 2,
                      background: "#e5e5e0",
                      borderRadius: 1,
                    }}
                  />
                ) : (
                  <div
                    style={{
                      flex: 1,
                      minWidth: 0,
                      maxWidth: 16,
                      height: Math.max(2, (u.pct / yMax) * innerHeight),
                      background: color,
                      borderRadius: "4px 4px 1px 1px",
                      transition: "all 0.2s",
                    }}
                  />
                )}
              </div>
            </Tooltip>
          );
        })}
      </div>

      {/* X axis */}
      <div
        style={{
          position: "absolute",
          left: 44,
          right: 8,
          bottom: 0,
          height: X_AXIS_HEIGHT,
          display: "flex",
        }}
      >
        {units.map((u, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              minWidth: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 10,
              color: BRAND.textSecondary,
              whiteSpace: "nowrap",
              overflow: "visible",
            }}
          >
            {labelIdx.has(i) ? formatUnitLabel(u) : ""}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Legend for uptime thresholds ───────────────────────────────────
function UptimeLegend() {
  const items = [
    { label: "> 75%", color: BRAND.green },
    { label: "50–75%", color: BRAND.amber },
    { label: "25–50%", color: BRAND.orange },
    { label: "10–25%", color: BRAND.red },
    { label: "≤ 10%", color: BRAND.redDeep },
  ];
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 14,
        fontSize: 11,
        color: BRAND.textSecondary,
      }}
    >
      {items.map((it) => (
        <span
          key={it.label}
          style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
        >
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: 2,
              background: it.color,
              display: "inline-block",
            }}
          />
          {it.label}
        </span>
      ))}
    </div>
  );
}

// Deterministic pseudo-random hourly uptime for the sandbox (the production
// API serves real uptime telemetry; fixtures have none).
function fakeUptimeSeconds(cpid: string, hourIndex: number): number {
  let h = 0;
  const s = `${cpid}:${hourIndex}`;
  for (let i = 0; i < s.length; i += 1) {
    h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  }
  const r = ((h >>> 0) % 1000) / 1000;
  if (r < 0.06) return Math.round(3600 * r * 5); // occasional bad hour
  return 3600 - Math.round(r * 120);
}

// ── Main ───────────────────────────────────────────────────────────
export default function ChargerAnalytics({ cpid }: { cpid: string }) {
  const db = useDb();
  const [presetValue, setPresetValue] = useState<number | "all" | null>(30);
  const [range, setRange] = useState<[Dayjs, Dayjs]>(() => rangeForPreset(30));
  const [metric, setMetric] = useState<"kwh" | "sessions" | "duration">("kwh");

  const handlePresetChange = (next: number | "all") => {
    setPresetValue(next);
    setRange(rangeForPreset(next));
  };
  const handleRangeChange = (next: [Dayjs, Dayjs]) => {
    setRange(next);
    setPresetValue(null);
  };

  const [aStart, aEnd] = range;

  // Daily session bucketing → ≤60 buckets
  const sessionUnits = useMemo<SessionUnit[]>(() => {
    const start = aStart.startOf("day");
    const end = aEnd.startOf("day");
    const totalDays = Math.max(1, end.diff(start, "day") + 1);
    const days: { key: string; kwh: number; hours: number; count: number }[] = [];
    for (let i = 0; i < totalDays; i += 1) {
      days.push({
        key: start.add(i, "day").format("YYYY-MM-DD"),
        kwh: 0,
        hours: 0,
        count: 0,
      });
    }
    const idx = Object.fromEntries(days.map((d, i) => [d.key, i]));
    for (const s of db.sessions) {
      if (s.chargerId !== cpid) continue;
      const k = dayjs(s.startTime).format("YYYY-MM-DD");
      const i = idx[k];
      if (i == null) continue;
      days[i].kwh += Number(s.energyKwh) || 0;
      const endTime = s.endTime ? dayjs(s.endTime) : dayjs();
      days[i].hours += Math.max(0, endTime.diff(dayjs(s.startTime), "minute")) / 60;
      days[i].count += 1;
    }
    const bucketSize = Math.max(1, Math.ceil(days.length / MAX_BARS));
    const out: SessionUnit[] = [];
    for (let i = 0; i < days.length; i += bucketSize) {
      const slice = days.slice(i, i + bucketSize);
      out.push({
        startKey: slice[0].key,
        endKey: slice[slice.length - 1].key,
        spanDays: slice.length,
        kwh: slice.reduce((s, d) => s + d.kwh, 0),
        hours: slice.reduce((s, d) => s + d.hours, 0),
        count: slice.reduce((s, d) => s + d.count, 0),
      });
    }
    return out;
  }, [aStart, aEnd, db.sessions, cpid]);

  // Uptime bucketing — hourly entries with uptime in seconds (0..3600/hour).
  const uptimeUnits = useMemo<UptimeUnit[]>(() => {
    const start = aStart.startOf("day");
    const totalHours = Math.min(
      24 * 365,
      Math.max(1, aEnd.endOf("day").diff(start, "hour")),
    );
    const rows: { ts: Dayjs; uptime: number }[] = [];
    for (let i = 0; i < totalHours; i += 1) {
      const ts = start.add(i, "hour");
      if (ts.isAfter(dayjs())) break;
      rows.push({
        ts,
        uptime: fakeUptimeSeconds(cpid, Math.floor(ts.valueOf() / 3600000)),
      });
    }
    if (rows.length === 0) return [];

    const bucketCount = Math.min(MAX_BARS, rows.length);
    const bucketSize = Math.ceil(rows.length / bucketCount);
    const out: UptimeUnit[] = [];
    for (let i = 0; i < rows.length; i += bucketSize) {
      const slice = rows.slice(i, i + bucketSize);
      const startTs = slice[0].ts;
      const endTs = slice[slice.length - 1].ts;
      const uptimeSeconds = slice.reduce((s, r) => s + r.uptime, 0);
      const totalSeconds = slice.length * 3600;
      const pct = totalSeconds > 0 ? (uptimeSeconds / totalSeconds) * 100 : 0;
      out.push({
        startKey: startTs.toISOString(),
        endKey: endTs.toISOString(),
        spanDays: Math.max(1, endTs.startOf("day").diff(startTs.startOf("day"), "day") + 1),
        spanHours: slice.length,
        uptimeSeconds,
        totalSeconds,
        pct: Math.max(0, Math.min(100, pct)),
      });
    }
    return out;
  }, [aStart, aEnd, cpid]);

  const sessionTotals = useMemo(
    () => ({
      kwh: sessionUnits.reduce((s, b) => s + b.kwh, 0),
      hours: sessionUnits.reduce((s, b) => s + b.hours, 0),
      count: sessionUnits.reduce((s, b) => s + b.count, 0),
    }),
    [sessionUnits],
  );

  const avgUptimePct = useMemo(() => {
    if (uptimeUnits.length === 0) return 0;
    const sumUptime = uptimeUnits.reduce((s, u) => s + u.uptimeSeconds, 0);
    const sumTotal = uptimeUnits.reduce((s, u) => s + u.totalSeconds, 0);
    return sumTotal > 0 ? (sumUptime / sumTotal) * 100 : 0;
  }, [uptimeUnits]);

  const periodHours = useMemo(() => {
    const start = aStart.startOf("day");
    const end = aEnd.startOf("day");
    const totalDays = Math.max(1, end.diff(start, "day") + 1);
    return totalDays * 24;
  }, [aStart, aEnd]);

  const avgUtilizationPct = useMemo(() => {
    if (periodHours <= 0) return 0;
    return Math.min(100, (sessionTotals.hours / periodHours) * 100);
  }, [sessionTotals.hours, periodHours]);

  const metricConfig = {
    kwh: { label: "Energy", getValue: (u: SessionUnit) => u.kwh, color: BRAND.orange },
    sessions: {
      label: "Sessions",
      getValue: (u: SessionUnit) => u.count,
      color: BRAND.orange,
    },
    duration: {
      label: "Duration",
      getValue: (u: SessionUnit) => u.hours,
      color: BRAND.orange,
    },
  };

  const trendYMax = niceMax(
    sessionUnits.reduce((m, u) => Math.max(m, metricConfig[metric].getValue(u)), 0),
    1,
  );
  const hasSessions = sessionUnits.some(
    (u) => u.count > 0 || u.kwh > 0 || u.hours > 0,
  );
  const hasUptime = uptimeUnits.length > 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <DateControls
        presetValue={presetValue}
        onPresetChange={handlePresetChange}
        range={range}
        onRangeChange={handleRangeChange}
      />

      {/* KPI cards */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <SummaryCard
          label="Avg Uptime"
          value={avgUptimePct.toFixed(0)}
          unit="%"
          accent={colorForUptimePct(avgUptimePct)}
        />
        <SummaryCard
          label="Avg Utilization"
          value={avgUtilizationPct.toFixed(1)}
          unit="%"
          sub={
            periodHours > 0
              ? `${sessionTotals.hours.toFixed(1)} of ${periodHours.toFixed(0)} hrs in use`
              : ""
          }
          accent={BRAND.teal}
        />
        <SummaryCard
          label="Total Sessions"
          value={sessionTotals.count.toLocaleString("en-IN")}
          accent={BRAND.orange}
        />
        <SummaryCard
          label="Total Energy"
          value={sessionTotals.kwh.toFixed(1)}
          unit="kWh"
          sub={
            sessionTotals.count > 0
              ? `${(sessionTotals.kwh / sessionTotals.count).toFixed(2)} kWh/session avg`
              : ""
          }
        />
        <SummaryCard
          label="Total Duration"
          value={sessionTotals.hours.toFixed(1)}
          unit="hrs"
          sub={
            sessionTotals.count > 0
              ? `${((sessionTotals.hours / sessionTotals.count) * 60).toFixed(0)} min/session avg`
              : ""
          }
        />
      </div>

      {/* Uptime chart */}
      <div style={CARD_STYLE}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 12,
            marginBottom: 8,
          }}
        >
          <Title level={5} style={{ margin: 0, color: BRAND.textPrimary }}>
            Charger Uptime
          </Title>
          <UptimeLegend />
        </div>
        {!hasUptime ? (
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              height: 280,
            }}
          >
            <Empty description="No uptime data in this window" />
          </div>
        ) : (
          <UptimeBarChart units={uptimeUnits} height={280} />
        )}
      </div>

      {/* Trend chart with metric toggle */}
      <div style={CARD_STYLE}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <Title level={5} style={{ margin: 0, color: BRAND.textPrimary }}>
            Charging Sessions
          </Title>
          <Segmented
            value={metric}
            onChange={(v) => setMetric(v as "kwh" | "sessions" | "duration")}
            options={[
              { label: "Energy", value: "kwh" },
              { label: "Sessions", value: "sessions" },
              { label: "Duration", value: "duration" },
            ]}
          />
        </div>
        {!hasSessions ? (
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              height: 280,
            }}
          >
            <Empty description="No charging activity in this window" />
          </div>
        ) : (
          <TrendBarChart
            units={sessionUnits}
            getValue={metricConfig[metric].getValue}
            color={metricConfig[metric].color}
            yMax={trendYMax}
            height={280}
          />
        )}
      </div>
    </div>
  );
}
