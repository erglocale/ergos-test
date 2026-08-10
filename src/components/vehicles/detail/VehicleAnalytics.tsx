"use client";

import { DatePicker, Empty, Segmented, Tooltip } from "antd";
import dayjs, { type Dayjs } from "dayjs";
import { useMemo, useState } from "react";
import { useDb } from "@/data/store";
import type { Vehicle } from "@/data/types";
import { DATE_FORMAT } from "@/lib/dateFormat";

const { RangePicker } = DatePicker;

// ── Brand palette ───────────────────────────────────────────────
const BRAND = {
  orange: "#f97417",
  green: "#22c55e",
  greenBg: "#f0fdf4",
  greenBorder: "#bbf7d0",
  greenText: "#166534",
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

// ── Utilities ───────────────────────────────────────────────────
const startOfDayKey = (d: Dayjs) => d.format("YYYY-MM-DD");

const buildDateAxis = (startDate: Dayjs, endDate: Dayjs): Dayjs[] => {
  const days: Dayjs[] = [];
  const totalDays = endDate.startOf("day").diff(startDate.startOf("day"), "day") + 1;
  for (let i = 0; i < totalDays; i += 1) {
    days.push(startDate.startOf("day").add(i, "day"));
  }
  return days;
};

// Pick a sensible y-max so bars never overflow (rounded up to next nice number).
const niceMax = (max: number, fallback = 1): number => {
  if (!max || max <= 0) return fallback;
  const exp = Math.pow(10, Math.floor(Math.log10(max)));
  for (const m of [1, 2, 2.5, 5, 10]) {
    const candidate = m * exp;
    if (candidate >= max) return candidate;
  }
  return Math.ceil(max / exp) * exp;
};

// ── Date controls ───────────────────────────────────────────────
const PRESETS: { label: string; value: number | "all" }[] = [
  { label: "Last 7 days", value: 7 },
  { label: "Last 30 days", value: 30 },
  { label: "Last 90 days", value: 90 },
  { label: "All time", value: "all" },
];

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
    <div className="mb-5 flex flex-wrap items-center gap-3">
      <Segmented
        size="middle"
        value={presetValue as number | "all"}
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
          if (!v?.[0] || !v?.[1]) return;
          onRangeChange([v[0], v[1]]);
        }}
      />
    </div>
  );
}

// ── KPI summary card ────────────────────────────────────────────
function SummaryCard({
  label,
  value,
  unit,
  sub,
}: {
  label: string;
  value: React.ReactNode;
  unit?: string;
  sub?: string;
}) {
  return (
    <div
      style={{
        background: "#fff",
        border: `1px solid ${BRAND.border}`,
        borderRadius: 10,
        padding: "12px 14px",
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
      <div style={{ fontSize: 22, fontWeight: 700, color: BRAND.textPrimary, lineHeight: 1.1 }}>
        {value}
        {unit && (
          <span style={{ fontSize: 12, fontWeight: 500, color: BRAND.textSecondary, marginLeft: 3 }}>
            {unit}
          </span>
        )}
      </div>
      {sub && (
        <div style={{ fontSize: 10, color: BRAND.textMuted, marginTop: 3, lineHeight: 1.4 }}>{sub}</div>
      )}
    </div>
  );
}

// ── Custom CSS-driven bar chart (ported verbatim from production) ──
const X_AXIS_HEIGHT = 26;

interface ChartUnit {
  chargedKwh: number;
  dischargedKwh: number;
  sessions: number;
  distanceKm: number;
  hours: number;
  startKey: string;
  endKey: string;
  spanDays: number;
}

interface ChartSeries {
  key: string;
  color: string;
  getValue: (u: ChartUnit) => number;
  opacity?: number;
  width?: number;
  yMax?: number;
  format?: (v: number, sessions: number, u: ChartUnit) => string;
}

// Pick which unit indices get a visible date label. Caps at ~7 labels
// evenly distributed between the first and last bar (inclusive).
const pickLabelIndices = (count: number): Set<number> => {
  if (count <= 1) return new Set([0]);
  const target = Math.min(7, count);
  const idx = new Set<number>();
  for (let i = 0; i < target; i += 1) {
    idx.add(Math.round((i * (count - 1)) / (target - 1)));
  }
  return idx;
};

const formatUnitLabel = (u: ChartUnit | undefined): string => {
  if (!u) return "";
  const start = dayjs(u.startKey);
  if (u.spanDays >= 28) return start.format("MMM 'YY");
  return start.format("D MMM");
};

const formatUnitRange = (u: ChartUnit | undefined): string => {
  if (!u) return "";
  const start = dayjs(u.startKey);
  const end = dayjs(u.endKey);
  if (u.spanDays <= 1) return start.format("D MMM YYYY");
  return `${start.format("D MMM")} – ${end.format("D MMM YYYY")}`;
};

function buildUnitTooltip({
  u,
  series,
  values,
  sessionCount,
}: {
  u: ChartUnit;
  series: ChartSeries[];
  values: number[];
  sessionCount: number;
}) {
  const start = dayjs(u.startKey);
  const end = dayjs(u.endKey);
  const header =
    u.spanDays > 1 ? `${start.format("D MMM")} – ${end.format("D MMM YYYY")}` : start.format("D MMM YYYY");
  const lines = series.map((s, i) => ({ s, v: values[i] || 0 })).filter(({ v }) => v > 0);
  return (
    <div style={{ minWidth: 180 }}>
      <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 12 }}>{header}</div>
      {lines.length === 0 ? (
        <div style={{ fontSize: 12, opacity: 0.7 }}>No activity</div>
      ) : (
        lines.map(({ s, v }) => (
          <div
            key={s.key}
            style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, padding: "2px 0" }}
          >
            <span
              style={{ width: 8, height: 8, borderRadius: 2, background: s.color, flexShrink: 0 }}
            />
            <span>{s.format ? s.format(v, sessionCount, u) : `${v}`}</span>
          </div>
        ))
      )}
      {sessionCount > 0 && (
        <div
          style={{
            marginTop: 6,
            paddingTop: 6,
            borderTop: "1px solid rgba(255,255,255,0.15)",
            fontSize: 11,
            opacity: 0.85,
          }}
        >
          {sessionCount} session{sessionCount === 1 ? "" : "s"}
        </div>
      )}
    </div>
  );
}

function PairedBarChart({
  units,
  series,
  yMax,
  yTicks = [0, 0.25, 0.5, 0.75, 1],
  height = 250,
  sessionCounts,
}: {
  units: ChartUnit[];
  series: ChartSeries[];
  yMax: number;
  yTicks?: number[];
  height?: number;
  sessionCounts?: number[];
}) {
  const innerHeight = height - X_AXIS_HEIGHT;
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const yLabels = yTicks
    .slice()
    .sort((a, b) => b - a) // top to bottom
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
          <span key={i} style={{ fontSize: 10, color: BRAND.textMuted, textAlign: "right" }}>
            {y}
          </span>
        ))}
      </div>

      {/* Grid lines */}
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

      {/* Bars */}
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
        {units.map((u, unitIdx) => {
          const values = series.map((s) => s.getValue(u));
          const allZero = values.every((v) => !v || v === 0);
          const sessionCount = sessionCounts ? sessionCounts[unitIdx] : 0;
          const isHover = hoverIdx === unitIdx;
          return (
            <Tooltip
              key={unitIdx}
              title={buildUnitTooltip({ u, series, values, sessionCount })}
              mouseEnterDelay={0}
            >
              <div
                onMouseEnter={() => setHoverIdx(unitIdx)}
                onMouseLeave={() => setHoverIdx((prev) => (prev === unitIdx ? null : prev))}
                style={{
                  flex: 1,
                  minWidth: 0,
                  display: "flex",
                  alignItems: "flex-end",
                  justifyContent: "center",
                  gap: 3,
                  padding: "0 2px",
                  alignSelf: "stretch",
                  background: isHover ? "rgba(249, 116, 23, 0.08)" : "transparent",
                  borderRadius: 4,
                  transition: "background 0.12s",
                  cursor: "default",
                }}
              >
                {allZero ? (
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
                  series.map((s, sIdx) => {
                    const v = values[sIdx] || 0;
                    if (v <= 0) return null;
                    const seriesMax = s.yMax || yMax;
                    const h = Math.max(2, (v / seriesMax) * innerHeight);
                    const showCircle = sIdx === 0 && sessionCount > 0;
                    return (
                      <div
                        key={s.key}
                        style={{
                          flex: 1,
                          minWidth: 0,
                          maxWidth: s.width || 16,
                          height: h,
                          background: s.color,
                          opacity: s.opacity ?? 1,
                          borderRadius: "4px 4px 1px 1px",
                          transition: "all 0.2s",
                          position: "relative",
                        }}
                      >
                        {showCircle && (
                          <span
                            style={{
                              position: "absolute",
                              bottom: "100%",
                              left: "50%",
                              transform: "translateX(-50%)",
                              marginBottom: 4,
                              fontSize: 10,
                              fontWeight: 700,
                              color: BRAND.greenText,
                              background: BRAND.greenBg,
                              border: `1px solid ${BRAND.greenBorder}`,
                              width: 18,
                              height: 18,
                              borderRadius: "50%",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              pointerEvents: "none",
                            }}
                          >
                            {sessionCount}
                          </span>
                        )}
                      </div>
                    );
                  })
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

// ── Charging Location Breakdown ─────────────────────────────────
function LocationBreakdown({
  hubAnalytics,
}: {
  hubAnalytics: { hubName: string | null; totalKwh: number; sessionCount: number }[];
}) {
  const total = (hubAnalytics || []).reduce((acc, h) => acc + (h.totalKwh || 0), 0);
  const palette = [BRAND.orange, BRAND.green, BRAND.teal, BRAND.blue, BRAND.purple];
  const isOutside = (name: string | null) => !name || /outside/i.test(name);
  let paletteIdx = 0;
  const rows = (hubAnalytics || []).map((h) => {
    const name = h.hubName || "Outside Hub";
    const outside = isOutside(h.hubName);
    const color = outside ? BRAND.textMuted : palette[paletteIdx++ % palette.length];
    return {
      name,
      kwh: h.totalKwh || 0,
      sessions: h.sessionCount || 0,
      color,
      pct: total > 0 ? ((h.totalKwh || 0) / total) * 100 : 0,
    };
  });

  return (
    <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${BRAND.border}` }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: BRAND.textSecondary, marginBottom: 12 }}>
        Where was this vehicle charged?
      </div>
      {rows.length === 0 ? (
        <div style={{ fontSize: 12, color: BRAND.textMuted, padding: "12px 0" }}>
          No charging data for the selected period.
        </div>
      ) : (
        <>
          {rows.map((r, i) => (
            <div
              key={i}
              style={{ display: "flex", alignItems: "center", padding: "6px 0", fontSize: 12 }}
            >
              <div
                style={{
                  width: 8,
                  height: 8,
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
                  height: 4,
                  background: "#f0f0ed",
                  borderRadius: 2,
                  margin: "0 12px",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{ height: "100%", width: `${r.pct}%`, background: r.color, borderRadius: 2 }}
                />
              </div>
              <div
                style={{
                  fontWeight: 600,
                  color: BRAND.textPrimary,
                  textAlign: "right",
                  fontSize: 12,
                  whiteSpace: "nowrap",
                }}
              >
                {r.kwh.toFixed(2)} kWh · {r.sessions} session{r.sessions === 1 ? "" : "s"}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

// ── Main Analytics component ────────────────────────────────────
const MAX_BARS = 60;

const rangeForPreset = (preset: number | "all", trackingStart: string): [Dayjs, Dayjs] => {
  const end = dayjs();
  if (preset === "all") {
    const start = trackingStart ? dayjs(trackingStart) : end.subtract(364, "day");
    return [start, end];
  }
  return [end.subtract(preset - 1, "day"), end];
};

export default function VehicleAnalytics({ vehicle }: { vehicle: Vehicle }) {
  const db = useDb();
  const [presetValue, setPresetValue] = useState<number | "all" | null>(30);
  const [range, setRange] = useState<[Dayjs, Dayjs]>(() => rangeForPreset(30, vehicle.createdAt));

  const handlePresetChange = (next: number | "all") => {
    setPresetValue(next);
    setRange(rangeForPreset(next, vehicle.createdAt));
  };

  const handleRangeChange = (next: [Dayjs, Dayjs]) => {
    setRange(next);
    setPresetValue(null); // user picked a custom range — deselect presets
  };

  const { startDate, endDate } = useMemo(
    () => ({ startDate: range[0].startOf("day"), endDate: range[1].endOf("day") }),
    [range],
  );

  const vehicleTrips = useMemo(
    () => db.trips.filter((t) => t.vehicleReg === vehicle.reg),
    [db.trips, vehicle.reg],
  );
  const vehicleSessions = useMemo(
    () => db.sessions.filter((s) => s.vehicleReg === vehicle.reg),
    [db.sessions, vehicle.reg],
  );

  // Build a per-day map combining both data sources (store stand-in for the
  // production charging + timeseries analytics endpoints).
  const daily = useMemo(() => {
    const map = new Map<string, Omit<ChartUnit, "startKey" | "endKey" | "spanDays"> & { dateKey: string }>();

    const ensure = (key: string) => {
      if (!map.has(key)) {
        map.set(key, {
          dateKey: key,
          chargedKwh: 0,
          dischargedKwh: 0,
          sessions: 0,
          distanceKm: 0,
          hours: 0,
        });
      }
      return map.get(key)!;
    };

    vehicleSessions.forEach((s) => {
      const start = dayjs(s.startTime);
      if (start.isBefore(startDate) || start.isAfter(endDate)) return;
      const row = ensure(startOfDayKey(start));
      row.chargedKwh += Number(s.energyKwh || 0);
      row.sessions += 1;
    });

    vehicleTrips.forEach((t) => {
      const start = dayjs(t.startTime);
      if (start.isBefore(startDate) || start.isAfter(endDate)) return;
      const row = ensure(startOfDayKey(start));
      row.dischargedKwh += Number(t.energyKwh || 0);
      row.distanceKm += Number(t.distanceKm || 0);
      row.hours += Math.max(0, dayjs(t.endTime).diff(start, "minute")) / 60;
    });

    return map;
  }, [vehicleSessions, vehicleTrips, startDate, endDate]);

  const days = useMemo(() => buildDateAxis(startDate, endDate), [startDate, endDate]);

  const dailyForDays = useMemo(
    () =>
      days.map((d) => {
        const row = daily.get(startOfDayKey(d));
        return (
          row || {
            dateKey: startOfDayKey(d),
            chargedKwh: 0,
            dischargedKwh: 0,
            sessions: 0,
            distanceKm: 0,
            hours: 0,
          }
        );
      }),
    [days, daily],
  );

  // ── Aggregates ──
  const totals = useMemo(() => {
    const t = { chargedKwh: 0, dischargedKwh: 0, sessions: 0, distanceKm: 0, hours: 0, activeDays: 0 };
    dailyForDays.forEach((d) => {
      t.chargedKwh += d.chargedKwh;
      t.dischargedKwh += d.dischargedKwh;
      t.sessions += d.sessions;
      t.distanceKm += d.distanceKm;
      t.hours += d.hours;
      if (d.distanceKm > 0 || d.hours > 0) t.activeDays += 1;
    });
    return t;
  }, [dailyForDays]);

  const periodDays = days.length;
  const avgDailyDistance = periodDays > 0 ? totals.distanceKm / periodDays : 0;
  const avgDailyUsage = totals.activeDays > 0 ? totals.hours / totals.activeDays : 0;
  const efficiency = totals.distanceKm > 0 ? (totals.dischargedKwh / totals.distanceKm) * 1000 : 0;

  // ── Bucket per-day rows into ≤MAX_BARS chart units ──
  const units = useMemo<ChartUnit[]>(() => {
    if (dailyForDays.length === 0) return [];
    const chunkSize = Math.max(1, Math.ceil(dailyForDays.length / MAX_BARS));
    const out: ChartUnit[] = [];
    for (let i = 0; i < dailyForDays.length; i += chunkSize) {
      const chunk = dailyForDays.slice(i, i + chunkSize);
      const sum = chunk.reduce(
        (acc, d) => {
          acc.chargedKwh += d.chargedKwh;
          acc.dischargedKwh += d.dischargedKwh;
          acc.sessions += d.sessions;
          acc.distanceKm += d.distanceKm;
          acc.hours += d.hours;
          return acc;
        },
        { chargedKwh: 0, dischargedKwh: 0, sessions: 0, distanceKm: 0, hours: 0 },
      );
      out.push({
        ...sum,
        startKey: chunk[0].dateKey,
        endKey: chunk[chunk.length - 1].dateKey,
        spanDays: chunk.length,
      });
    }
    return out;
  }, [dailyForDays]);

  // ── Hub breakdown (production hubAnalytics stand-in) ──
  const hubAnalytics = useMemo(() => {
    const map = new Map<string, { hubName: string; totalKwh: number; sessionCount: number }>();
    vehicleSessions.forEach((s) => {
      const start = dayjs(s.startTime);
      if (start.isBefore(startDate) || start.isAfter(endDate)) return;
      const hub = db.chargepoints.find((c) => c.id === s.chargerId)?.hub ?? "Outside Hub";
      const row = map.get(hub) ?? { hubName: hub, totalKwh: 0, sessionCount: 0 };
      row.totalKwh += Number(s.energyKwh || 0);
      row.sessionCount += 1;
      map.set(hub, row);
    });
    return [...map.values()].sort((a, b) => b.totalKwh - a.totalKwh);
  }, [vehicleSessions, db.chargepoints, startDate, endDate]);

  // ── Chart 1: Charging ──
  const chargingMaxKwh = niceMax(
    Math.max(...units.map((u) => Math.max(u.chargedKwh, u.dischargedKwh)), 1),
  );

  // ── Chart 2: Distance & Duration — independent scales ──
  const distanceMax = niceMax(Math.max(...units.map((u) => u.distanceKm), 1));
  const durationMax = niceMax(Math.max(...units.map((u) => u.hours), 1));

  const hasNoData =
    totals.chargedKwh === 0 &&
    totals.dischargedKwh === 0 &&
    totals.distanceKm === 0 &&
    totals.hours === 0;

  return (
    <div style={{ paddingBottom: 20 }}>
      {/* Date controls */}
      <DateControls
        presetValue={presetValue}
        onPresetChange={handlePresetChange}
        range={range}
        onRangeChange={handleRangeChange}
      />

      {/* 3-KPI Summary Strip */}
      <div
        style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 24 }}
      >
        <SummaryCard
          label="Avg Daily Distance"
          value={avgDailyDistance.toFixed(1)}
          unit="km/day"
          sub={`${totals.distanceKm.toFixed(1)} km total · ${periodDays} day${periodDays === 1 ? "" : "s"}`}
        />
        <SummaryCard
          label="Avg Daily Usage"
          value={avgDailyUsage.toFixed(1)}
          unit="hrs/day"
          sub={`${totals.hours.toFixed(1)} hrs total · ${totals.activeDays} active day${totals.activeDays === 1 ? "" : "s"}`}
        />
        <SummaryCard
          label="Energy Efficiency"
          value={efficiency > 0 ? Math.round(efficiency) : "—"}
          unit={efficiency > 0 ? "Wh/km" : ""}
          sub={
            totals.distanceKm > 0
              ? `${totals.dischargedKwh.toFixed(2)} kWh consumed · ${totals.distanceKm.toFixed(1)} km driven`
              : "Insufficient data"
          }
        />
      </div>

      {hasNoData && (
        <div style={{ ...CARD_STYLE, padding: 60 }}>
          <Empty description="No analytics data for this period" />
        </div>
      )}

      {!hasNoData && (
        <>
          {/* Chart 1: Charging (energy + sessions merged) */}
          <div style={{ ...CARD_STYLE, marginBottom: 16 }}>
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                marginBottom: 6,
              }}
            >
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, color: BRAND.textPrimary }}>Charging</div>
                <div style={{ fontSize: 12, color: BRAND.textMuted, marginTop: 2 }}>
                  <strong style={{ color: BRAND.textPrimary, fontWeight: 600 }}>
                    {totals.chargedKwh.toFixed(2)} kWh
                  </strong>{" "}
                  charged across{" "}
                  <strong style={{ color: BRAND.textPrimary, fontWeight: 600 }}>
                    {totals.sessions} session{totals.sessions === 1 ? "" : "s"}
                  </strong>
                </div>
              </div>
            </div>
            <div
              style={{ display: "flex", gap: 14, fontSize: 11, color: BRAND.textMuted, marginTop: 4 }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: BRAND.green }} />
                Energy charged (kWh)
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: BRAND.orange }} />
                Energy discharged (kWh)
              </span>
              <span style={{ color: BRAND.textSecondary }}>① = session count</span>
            </div>

            <PairedBarChart
              units={units}
              yMax={chargingMaxKwh}
              height={250}
              series={[
                {
                  key: "charged",
                  color: BRAND.green,
                  width: 16,
                  getValue: (u) => u.chargedKwh,
                  format: (v, sessions, u) => {
                    const rangeLabel = formatUnitRange(u);
                    const head =
                      sessions > 0
                        ? `${v.toFixed(2)} kWh · ${sessions} session${sessions === 1 ? "" : "s"}`
                        : `${v.toFixed(2)} kWh`;
                    return rangeLabel ? `${rangeLabel} — ${head}` : head;
                  },
                },
                {
                  key: "discharged",
                  color: BRAND.orange,
                  width: 16,
                  getValue: (u) => u.dischargedKwh,
                  format: (v, _s, u) => {
                    const rangeLabel = formatUnitRange(u);
                    const head = `${v.toFixed(2)} kWh discharged`;
                    return rangeLabel ? `${rangeLabel} — ${head}` : head;
                  },
                },
              ]}
              sessionCounts={units.map((u) => u.sessions)}
            />

            <LocationBreakdown hubAnalytics={hubAnalytics} />
          </div>

          {/* Chart 2: Distance & Duration */}
          <div style={{ ...CARD_STYLE, marginBottom: 20 }}>
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                marginBottom: 6,
              }}
            >
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, color: BRAND.textPrimary }}>
                  Distance &amp; Duration
                </div>
                <div style={{ fontSize: 12, color: BRAND.textMuted, marginTop: 2 }}>
                  Total:{" "}
                  <strong style={{ color: BRAND.textPrimary, fontWeight: 600 }}>
                    {totals.distanceKm.toFixed(1)} km
                  </strong>{" "}
                  ·{" "}
                  <strong style={{ color: BRAND.textPrimary, fontWeight: 600 }}>
                    {totals.hours.toFixed(1)} hrs
                  </strong>
                </div>
              </div>
            </div>
            <div
              style={{ display: "flex", gap: 14, fontSize: 11, color: BRAND.textMuted, marginTop: 4 }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: BRAND.teal }} />
                Distance (km)
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: BRAND.orange }} />
                Duration (hrs)
              </span>
            </div>

            <PairedBarChart
              units={units}
              yMax={distanceMax}
              height={230}
              series={[
                {
                  key: "distance",
                  color: BRAND.teal,
                  width: 16,
                  yMax: distanceMax,
                  getValue: (u) => u.distanceKm,
                  format: (v, _s, u) => {
                    const rangeLabel = formatUnitRange(u);
                    return rangeLabel ? `${rangeLabel} — ${v.toFixed(1)} km` : `${v.toFixed(1)} km`;
                  },
                },
                {
                  key: "duration",
                  color: BRAND.orange,
                  width: 16,
                  yMax: durationMax,
                  getValue: (u) => u.hours,
                  format: (v, _s, u) => {
                    const rangeLabel = formatUnitRange(u);
                    return rangeLabel ? `${rangeLabel} — ${v.toFixed(1)} hrs` : `${v.toFixed(1)} hrs`;
                  },
                },
              ]}
            />
          </div>
        </>
      )}
    </div>
  );
}
