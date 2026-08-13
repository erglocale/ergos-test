"use client";

import { DatePicker, Empty, Segmented, Tooltip, Typography } from "antd";
import dayjs, { type Dayjs } from "dayjs";
import { useMemo, useState } from "react";
import { useDb } from "@/data/store";
import { hubForSession, sessionDurationHours } from "./sessionUtils";
import { DATE_FORMAT } from "@/lib/dateFormat";

const { RangePicker } = DatePicker;
const { Title } = Typography;

// ── Brand palette (matches Vehicle Analytics) ──────────────────────
const BRAND = {
  orange: "#f97417",
  green: "#22c55e",
  teal: "#14b8a6",
  blue: "#3b82f6",
  purple: "#8b5cf6",
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

const X_AXIS_HEIGHT = 30;
const MAX_BARS = 60;
// Left gutter: rotated axis title, then the tick numbers.
const Y_TITLE_W = 20;
const Y_AXIS_W = 42;
const PLOT_LEFT = Y_TITLE_W + Y_AXIS_W;

interface Unit {
  startKey: string;
  endKey: string;
  spanDays: number;
  kwh: number;
  hours: number;
  count: number;
}

// ── Utilities ───────────────────────────────────────────────────────
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

const formatUnitLabel = (u: Unit) => {
  if (!u) return "";
  const start = dayjs(u.startKey);
  if (u.spanDays >= 28) return start.format("MMM 'YY");
  return start.format("D MMM");
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
        onChange={(v) => {
          if (v && v[0] && v[1]) onRangeChange([v[0], v[1]]);
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
          fontSize: 12,
          textTransform: "uppercase",
          letterSpacing: 0.5,
          color: BRAND.textMuted,
          fontWeight: 500,
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 700, color: BRAND.textPrimary, lineHeight: 1.1 }}>
        {value}
        {unit && (
          <span style={{ fontSize: 13, fontWeight: 500, color: BRAND.textSecondary, marginLeft: 3 }}>
            {unit}
          </span>
        )}
      </div>
      {sub && <div style={{ fontSize: 12, color: BRAND.textMuted, marginTop: 4, lineHeight: 1.4 }}>{sub}</div>}
    </div>
  );
}

// ── Tooltip body ───────────────────────────────────────────────────
function buildUnitTooltip(u: Unit) {
  const start = dayjs(u.startKey);
  const end = dayjs(u.endKey);
  const header =
    u.spanDays > 1 ? `${start.format("D MMM")} – ${end.format("D MMM YYYY")}` : start.format("D MMM YYYY");
  return (
    <div style={{ minWidth: 190 }}>
      <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 13 }}>{header}</div>
      <div style={{ fontSize: 13, padding: "2px 0" }}>
        {u.count} session{u.count === 1 ? "" : "s"}
      </div>
      <div style={{ fontSize: 13, padding: "2px 0" }}>{u.kwh.toFixed(2)} kWh</div>
      <div style={{ fontSize: 13, padding: "2px 0" }}>{u.hours.toFixed(2)} hrs</div>
    </div>
  );
}

// ── Bar chart ──────────────────────────────────────────────────────
function MetricBarChart({
  units,
  getValue,
  color,
  yMax,
  yTitle,
  height = 280,
}: {
  units: Unit[];
  getValue: (u: Unit) => number;
  color: string;
  yMax: number;
  /** Axis title with its unit, e.g. "Energy (kWh)". */
  yTitle: string;
  height?: number;
}) {
  const innerHeight = height - X_AXIS_HEIGHT;
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const yTicks = [0, 0.25, 0.5, 0.75, 1];
  const yLabels = yTicks
    .slice()
    .sort((a, b) => b - a)
    .map((t) => Math.round(yMax * t));
  const labelIdx = useMemo(() => pickLabelIndices(units.length), [units.length]);

  return (
    <div style={{ position: "relative", height, marginTop: 16 }}>
      {/* Y axis title */}
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: X_AXIS_HEIGHT,
          width: Y_TITLE_W,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span
          style={{
            transform: "rotate(180deg)",
            writingMode: "vertical-rl",
            fontSize: 12,
            fontWeight: 600,
            color: BRAND.textSecondary,
            whiteSpace: "nowrap",
          }}
        >
          {yTitle}
        </span>
      </div>

      {/* Y axis ticks */}
      <div
        style={{
          position: "absolute",
          left: Y_TITLE_W,
          top: 0,
          bottom: X_AXIS_HEIGHT,
          width: Y_AXIS_W - 8,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
        }}
      >
        {yLabels.map((y, i) => (
          <span key={i} style={{ fontSize: 12, color: BRAND.textSecondary, textAlign: "right" }}>
            {y}
          </span>
        ))}
      </div>

      {/* Grid lines */}
      <div
        style={{
          position: "absolute",
          left: PLOT_LEFT - 4,
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
          left: PLOT_LEFT,
          top: 0,
          right: 8,
          bottom: X_AXIS_HEIGHT,
          display: "flex",
          alignItems: "flex-end",
          gap: 0,
        }}
      >
        {units.map((u, unitIdx) => {
          const v = getValue(u) || 0;
          const isHover = hoverIdx === unitIdx;
          return (
            <Tooltip key={unitIdx} title={buildUnitTooltip(u)} mouseEnterDelay={0}>
              <div
                onMouseEnter={() => setHoverIdx(unitIdx)}
                onMouseLeave={() => setHoverIdx((prev) => (prev === unitIdx ? null : prev))}
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
                  <div style={{ width: "60%", maxWidth: 28, height: 2, background: "#e5e5e0", borderRadius: 1 }} />
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
        })}
      </div>

      {/* X axis dates */}
      <div
        style={{
          position: "absolute",
          left: PLOT_LEFT,
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
              fontSize: 12,
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

// ── Charging Location Breakdown ────────────────────────────────────
interface HubRow {
  hubName: string;
  totalKwh: number;
  sessionCount: number;
}

function LocationBreakdown({ hubAnalytics }: { hubAnalytics: HubRow[] }) {
  const total = hubAnalytics.reduce((acc, h) => acc + (h.totalKwh || 0), 0);
  const palette = [BRAND.orange, BRAND.green, BRAND.teal, BRAND.blue, BRAND.purple];
  const isOutside = (name: string) => !name || /outside/i.test(name);
  let paletteIdx = 0;
  const rows = hubAnalytics.map((h) => {
    const name = h.hubName || "Outside Hub";
    // Idle sites keep their place in the list but not a palette colour — the
    // bar would read as activity when there was none.
    const outside = isOutside(h.hubName) || h.sessionCount === 0;
    const color = outside ? BRAND.textMuted : palette[paletteIdx++ % palette.length];
    return {
      name,
      kwh: h.totalKwh || 0,
      sessions: h.sessionCount || 0,
      color,
      pct: total > 0 ? ((h.totalKwh || 0) / total) * 100 : 0,
    };
  });

  if (rows.length === 0) {
    return (
      <div style={{ fontSize: 14, color: BRAND.textMuted, padding: "12px 0" }}>
        No charging data for the selected period.
      </div>
    );
  }

  return (
    <div>
      {rows.map((r, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", padding: "9px 0", fontSize: 14 }}>
          <div
            style={{
              width: 9,
              height: 9,
              borderRadius: "50%",
              background: r.color,
              flexShrink: 0,
              marginRight: 8,
            }}
          />
          <div style={{ color: BRAND.textSecondary, minWidth: 160 }}>{r.name}</div>
          <div
            style={{
              flex: 1,
              height: 5,
              background: "#f0f0ed",
              borderRadius: 3,
              margin: "0 12px",
              overflow: "hidden",
            }}
          >
            <div style={{ height: "100%", width: `${r.pct}%`, background: r.color, borderRadius: 3 }} />
          </div>
          <div
            style={{
              fontWeight: 600,
              color: BRAND.textPrimary,
              textAlign: "right",
              fontSize: 14,
              whiteSpace: "nowrap",
            }}
          >
            {r.kwh.toFixed(2)} kWh · {r.sessions} session{r.sessions === 1 ? "" : "s"}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────
export default function SessionsAnalytics() {
  const db = useDb();
  const [analyticsPreset, setAnalyticsPreset] = useState<number | "all" | null>(30);
  const [analyticsRange, setAnalyticsRange] = useState<[Dayjs, Dayjs]>(() => rangeForPreset(30));
  const [metric, setMetric] = useState<"kwh" | "sessions" | "duration">("kwh");

  const handleAnalyticsPresetChange = (next: number | "all") => {
    setAnalyticsPreset(next);
    setAnalyticsRange(rangeForPreset(next));
  };
  const handleAnalyticsRangeChange = (next: [Dayjs, Dayjs]) => {
    setAnalyticsRange(next);
    setAnalyticsPreset(null);
  };

  const [aStart, aEnd] = analyticsRange;

  const sessionsInRange = useMemo(() => {
    return db.sessions.filter((s) => {
      const t = dayjs(s.startTime);
      return !t.isBefore(aStart.startOf("day")) && !t.isAfter(aEnd.endOf("day"));
    });
  }, [db.sessions, aStart, aEnd]);

  const units = useMemo<Unit[]>(() => {
    const start = aStart.startOf("day");
    const end = aEnd.startOf("day");
    const totalDays = Math.max(1, end.diff(start, "day") + 1);
    const days: { key: string; kwh: number; hours: number; count: number }[] = [];
    for (let i = 0; i < totalDays; i += 1) {
      days.push({ key: start.add(i, "day").format("YYYY-MM-DD"), kwh: 0, hours: 0, count: 0 });
    }
    const idx = Object.fromEntries(days.map((d, i) => [d.key, i]));
    for (const s of sessionsInRange) {
      const k = dayjs(s.startTime).format("YYYY-MM-DD");
      const i = idx[k];
      if (i == null) continue;
      days[i].kwh += s.energyKwh || 0;
      days[i].hours += sessionDurationHours(s) ?? 0;
      days[i].count += 1;
    }
    const bucketSize = Math.max(1, Math.ceil(days.length / MAX_BARS));
    const out: Unit[] = [];
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
  }, [aStart, aEnd, sessionsInRange]);

  const totals = useMemo(
    () => ({
      kwh: units.reduce((s, b) => s + b.kwh, 0),
      hours: units.reduce((s, b) => s + b.hours, 0),
      count: units.reduce((s, b) => s + b.count, 0),
    }),
    [units],
  );

  const hubAnalytics = useMemo<HubRow[]>(() => {
    // Every hub that has a charger starts at zero, so a site that drew nothing
    // in the window (Azara, whose sockets are still faulted) is reported as an
    // idle site rather than quietly dropping off the list.
    const map = new Map<string, HubRow>();
    for (const cp of db.chargepoints) {
      if (!map.has(cp.hub)) map.set(cp.hub, { hubName: cp.hub, totalKwh: 0, sessionCount: 0 });
    }
    for (const s of sessionsInRange) {
      const hubName = hubForSession(s, db.chargepoints);
      const row = map.get(hubName) ?? { hubName, totalKwh: 0, sessionCount: 0 };
      row.totalKwh += s.energyKwh || 0;
      row.sessionCount += 1;
      map.set(hubName, row);
    }
    return [...map.values()].sort((a, b) => b.totalKwh - a.totalKwh);
  }, [sessionsInRange, db.chargepoints]);

  // "Outside Hub" is where sessions happened, not a site we run — it is a row
  // in the breakdown but must not be counted as one of the hubs.
  const ourHubs = hubAnalytics.filter((h) => !/outside/i.test(h.hubName));
  const activeHubCount = ourHubs.filter((h) => h.sessionCount > 0).length;
  const outsideRow = hubAnalytics.find((h) => /outside/i.test(h.hubName));

  const metricConfig = {
    kwh: {
      label: "Energy",
      yTitle: "Energy (kWh)",
      getValue: (u: Unit) => u.kwh,
      color: BRAND.orange,
    },
    sessions: {
      label: "Sessions",
      yTitle: "Sessions",
      getValue: (u: Unit) => u.count,
      color: BRAND.orange,
    },
    duration: {
      label: "Duration",
      yTitle: "Duration (hrs)",
      getValue: (u: Unit) => u.hours,
      color: BRAND.orange,
    },
  };

  const yMax = niceMax(
    units.reduce((m, u) => Math.max(m, metricConfig[metric].getValue(u)), 0),
    1,
  );
  const hasData = units.some((u) => u.count > 0 || u.kwh > 0 || u.hours > 0);

  return (
    <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 16 }}>
      <DateControls
        presetValue={analyticsPreset}
        onPresetChange={handleAnalyticsPresetChange}
        range={analyticsRange}
        onRangeChange={handleAnalyticsRangeChange}
      />

      {/* KPI cards */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <SummaryCard label="Total Sessions" value={totals.count.toLocaleString("en-IN")} accent={BRAND.orange} />
        <SummaryCard
          label="Total Energy"
          value={totals.kwh.toFixed(1)}
          unit="kWh"
          sub={totals.count > 0 ? `${(totals.kwh / totals.count).toFixed(2)} kWh/session avg` : ""}
        />
        <SummaryCard
          label="Total Duration"
          value={totals.hours.toFixed(1)}
          unit="hrs"
          sub={totals.count > 0 ? `${((totals.hours / totals.count) * 60).toFixed(0)} min/session avg` : ""}
        />
        <SummaryCard
          label="Charging Locations"
          value={activeHubCount}
          sub={
            `active of ${ourHubs.length} hub${ourHubs.length === 1 ? "" : "s"}` +
            (outsideRow
              ? ` · ${outsideRow.sessionCount} outside hub`
              : "")
          }
        />
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
            Trend
          </Title>
          <Segmented
            value={metric}
            onChange={(v) => setMetric(v as typeof metric)}
            options={[
              { label: "Energy", value: "kwh" },
              { label: "Sessions", value: "sessions" },
              { label: "Duration", value: "duration" },
            ]}
          />
        </div>
        {!hasData ? (
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: 300 }}>
            <Empty description="No charging activity in this window" />
          </div>
        ) : (
          <MetricBarChart
            units={units}
            getValue={metricConfig[metric].getValue}
            color={metricConfig[metric].color}
            yMax={yMax}
            yTitle={metricConfig[metric].yTitle}
            height={300}
          />
        )}
      </div>

      {/* Hub breakdown */}
      <div style={CARD_STYLE}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            marginBottom: 12,
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          <Title level={5} style={{ margin: 0, color: BRAND.textPrimary }}>
            Where charging happened
          </Title>
          <span style={{ fontSize: 14, color: BRAND.textSecondary }}>
            Total:{" "}
            <span style={{ color: BRAND.textPrimary, fontWeight: 600 }}>{totals.kwh.toFixed(2)} kWh</span>
            {" · "}
            <span style={{ color: BRAND.textPrimary, fontWeight: 600 }}>
              {totals.count} session{totals.count === 1 ? "" : "s"}
            </span>
          </span>
        </div>
        <LocationBreakdown hubAnalytics={hubAnalytics} />
      </div>
    </div>
  );
}
