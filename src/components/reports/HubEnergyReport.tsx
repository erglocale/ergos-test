"use client";

// Charging Hub Energy Report (demo spec item 9), ported from the reference
// "ergos-report-v2" jsx onto antd + echarts.
//
// It answers one question: what did smart charging save at this hub last month?
// A managed profile (ergOS defers charging out of the on-peak window) is priced
// against an unmanaged baseline (vans plug in on return and charge flat out) on
// the hub's own tariff — the one configured in Hubs → Energy prices — covering
// TOU energy charges, facilities and time-related demand charges, and the fixed
// customer charge.

import { Alert, Button, Card, DatePicker, Select, Space, Typography } from "antd";
import dayjs, { type Dayjs } from "dayjs";
import ReactECharts from "echarts-for-react";
import { useMemo, useState } from "react";
import {
  type RateConfig,
  type Schedule,
  defaultConfigFor,
  isSummerMonth,
  loadRateConfig,
  tariffOf,
  utilityOf,
} from "@/components/hubs/hubRates";
import { useDb } from "@/data/store";
import { DATE_FORMAT } from "@/lib/dateFormat";
import { money, money2, useUnits } from "@/lib/units";
import { BRAND } from "./shared";

const { Text, Title } = Typography;
const { RangePicker } = DatePicker;

// Palette taken from the rest of the app: the app's green is "managed" and
// money saved, red is the unmanaged baseline, and the primary action keeps the
// brand orange used on every other report tab.
const ACCENT = "#16a34a"; // strokes and figures — reads better than #22c55e on white
const ACCENT_DEEP = BRAND.greenText; // "#166534"
const ACCENT_LIGHT = BRAND.greenBorder; // "#bbf7d0" chart fills
const ACCENT_BG = BRAND.greenBg; // "#f0fdf4"
const ACCENT_BORDER = BRAND.greenBorder;
const ACCENT_TEXT = BRAND.greenText;
const DANGER = "#dc2626";
const DANGER_LIGHT = "#fee2e2";
const SAVINGS = "#16a34a";
const ON_PEAK = "#dc2626";
const MID_PEAK = "#f59e0b";
const OFF_PEAK = BRAND.green; // "#22c55e"
const MAX_DAYS = 62;

type TouKey = "on" | "mid" | "off";

interface HourPoint {
  hour: number;
  unmanagedKw: number;
  managedKw: number;
  tou: TouKey;
}

interface DayProfile {
  date: Dayjs;
  weekday: boolean;
  hourly: HourPoint[];
  uPeak: number;
  mPeak: number;
  uEnergy: Record<TouKey, number>;
  mEnergy: Record<TouKey, number>;
}

/** Deterministic PRNG so a hub's report is identical on every render. */
function seeded(seed: number) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/** On-peak / daytime window implied by a 24-hour TOU schedule. */
function windowsOf(schedule: Schedule) {
  const onHours = schedule.flatMap((p, h) => (p === 2 ? [h] : []));
  const dayHours = schedule.flatMap((p, h) => (p === 1 || p === 2 ? [h] : []));
  const peakStart = onHours.length ? Math.min(...onHours) : 17;
  const peakEnd = onHours.length ? Math.max(...onHours) + 1 : 21;
  const dayStart = dayHours.length ? Math.min(...dayHours) : 8;
  const dayEnd = dayHours.length ? Math.max(...dayHours) + 1 : 22;
  return { peakStart, peakEnd, dayStart, dayEnd, hasOnPeak: onHours.length > 0 };
}

function touOf(hour: number, weekday: boolean, schedule: Schedule): TouKey {
  // Weekends and holidays sit at off-peak on every tariff in the catalog.
  if (!weekday) return "off";
  const period = schedule[hour] ?? 0;
  if (period === 2) return "on";
  if (period === 1) return "mid";
  return "off";
}

/**
 * Hourly kW for each day of the period. The unmanaged baseline spikes when
 * vans return during the on-peak window; the managed profile holds a trickle
 * through on-peak and catches up after it closes.
 */
function buildDays(
  from: Dayjs,
  to: Dayjs,
  vehicles: number,
  seed: number,
  schedule: Schedule,
): DayProfile[] {
  const rand = seeded(seed);
  const { peakStart, peakEnd } = windowsOf(schedule);
  const peakLen = Math.max(1, peakEnd - peakStart);
  const days: DayProfile[] = [];
  const total = Math.min(MAX_DAYS, to.startOf("day").diff(from.startOf("day"), "day") + 1);

  for (let i = 0; i < total; i += 1) {
    const date = from.startOf("day").add(i, "day");
    const dow = date.day();
    const weekday = dow > 0 && dow < 6;
    const scale = weekday ? 1 : 0.25;
    const vScale = Math.max(0.3, vehicles / 20);
    const hourly: HourPoint[] = [];

    for (let h = 0; h < 24; h += 1) {
      const base = 15 + rand() * 10;
      let uKw: number;
      let mKw: number;

      if (h < 5) {
        // tail end of overnight charging
        uKw = base + Math.max(0, 110 - h * 22 + rand() * 15) * scale;
        mKw = base + (155 - h * 25 + rand() * 10) * scale;
      } else if (h < 8) {
        // vans departing
        uKw = base + rand() * 18 * scale;
        mKw = base + (28 + rand() * 12) * scale;
      } else if (h < peakStart - 1) {
        // depot idle, base load only
        uKw = base + rand() * 8;
        mKw = base + rand() * 8;
      } else if (h < peakStart) {
        // first vans back
        uKw = base + (70 + rand() * 40) * scale;
        mKw = base + (50 + rand() * 20) * scale;
      } else if (h < peakEnd) {
        // on-peak: unmanaged spikes, managed throttles
        const progress = (h - peakStart) / peakLen;
        uKw = base + (280 + progress * 80 + rand() * 50) * scale * vScale;
        if (progress > 0.5) uKw = base + (360 + rand() * 55) * scale * vScale;
        if (progress > 0.85) uKw = base + (260 + rand() * 40) * scale * vScale;
        mKw = base + (30 + rand() * 22) * scale;
      } else {
        // after the peak closes: managed catches up
        const after = h - peakEnd;
        uKw = base + Math.max(0, 190 - after * 38 + rand() * 28) * scale;
        mKw = base + (175 + rand() * 28) * scale * vScale;
      }

      hourly.push({
        hour: h,
        unmanagedKw: Math.max(base, Math.round(uKw)),
        managedKw: Math.max(base, Math.round(mKw)),
        tou: touOf(h, weekday, schedule),
      });
    }

    const sum = (key: TouKey, field: "unmanagedKw" | "managedKw") =>
      hourly.filter((x) => x.tou === key).reduce((s, x) => s + x[field], 0);

    days.push({
      date,
      weekday,
      hourly,
      uPeak: Math.max(...hourly.map((x) => x.unmanagedKw)),
      mPeak: Math.max(...hourly.map((x) => x.managedKw)),
      uEnergy: { on: sum("on", "unmanagedKw"), mid: sum("mid", "unmanagedKw"), off: sum("off", "unmanagedKw") },
      mEnergy: { on: sum("on", "managedKw"), mid: sum("mid", "managedKw"), off: sum("off", "managedKw") },
    });
  }
  return days;
}

interface CostSide {
  eOn: number;
  eMid: number;
  eOff: number;
  frd: number;
  trd: number;
  energy: number;
  demand: number;
  total: number;
}

function computeCost(days: DayProfile[], cfg: RateConfig, summer: boolean) {
  const rates = summer ? cfg.summer : cfg.winter;
  // A period with no price on this season falls back to the other season's,
  // then to off-peak, so a bill is never silently free.
  const priceOf = (key: "onPeak" | "midPeak" | "offPeak") =>
    rates[key] ?? (summer ? cfg.winter[key] : cfg.summer[key]) ?? rates.offPeak ?? 0;

  const uE = { on: 0, mid: 0, off: 0 };
  const mE = { on: 0, mid: 0, off: 0 };
  let uPk = 0;
  let mPk = 0;
  let uOnPk = 0;
  let mOnPk = 0;

  for (const d of days) {
    uE.on += d.uEnergy.on;
    uE.mid += d.uEnergy.mid;
    uE.off += d.uEnergy.off;
    mE.on += d.mEnergy.on;
    mE.mid += d.mEnergy.mid;
    mE.off += d.mEnergy.off;
    uPk = Math.max(uPk, d.uPeak);
    mPk = Math.max(mPk, d.mPeak);
    const onHours = d.hourly.filter((h) => h.tou === "on");
    uOnPk = Math.max(uOnPk, ...onHours.map((h) => h.unmanagedKw), 0);
    mOnPk = Math.max(mOnPk, ...onHours.map((h) => h.managedKw), 0);
  }

  const side = (e: typeof uE, pk: number, onPk: number): CostSide => {
    const eOn = e.on * priceOf("onPeak");
    const eMid = e.mid * priceOf("midPeak");
    const eOff = e.off * priceOf("offPeak");
    const frd = pk * cfg.frd;
    const trd = onPk * cfg.trd;
    const energy = eOn + eMid + eOff;
    const demand = frd + trd;
    return { eOn, eMid, eOff, frd, trd, energy, demand, total: energy + demand + cfg.customerCharge };
  };

  const unmanaged = side(uE, uPk, uOnPk);
  const managed = side(mE, mPk, mOnPk);

  return {
    unmanaged,
    managed,
    peaks: { uPk, mPk, uOnPk, mOnPk },
    energy: { u: uE, m: mE },
    prices: {
      onPeak: priceOf("onPeak"),
      midPeak: priceOf("midPeak"),
      offPeak: priceOf("offPeak"),
    },
    sav: {
      demand: unmanaged.demand - managed.demand,
      energy: unmanaged.energy - managed.energy,
      total: unmanaged.total - managed.total,
      pct: unmanaged.total > 0 ? ((unmanaged.total - managed.total) / unmanaged.total) * 100 : 0,
    },
  };
}

const fmtKwh = (n: number) => Math.round(n).toLocaleString("en-US");

function Metric({
  label,
  value,
  sub,
  color,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  color: string;
  accent?: string;
}) {
  return (
    <div
      style={{
        flex: "1 1 190px",
        minWidth: 170,
        padding: "14px 16px",
        background: "#fff",
        border: `1px solid ${BRAND.border}`,
        borderLeft: `3px solid ${color}`,
        borderRadius: 12,
      }}
    >
      <div
        style={{
          fontSize: 11,
          color: BRAND.textSecondary,
          fontWeight: 500,
          textTransform: "uppercase",
          letterSpacing: "0.03em",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 26,
          fontWeight: 700,
          color: accent ?? BRAND.textPrimary,
          lineHeight: 1.2,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </div>
      {sub && <div style={{ fontSize: 11, color: BRAND.textMuted, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function Panel({
  title,
  sub,
  extra,
  children,
}: {
  title: string;
  sub?: string;
  extra?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card
      style={{ borderRadius: 12, border: `1px solid ${BRAND.border}` }}
      styles={{ body: { padding: 20 } }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 10,
          marginBottom: 12,
        }}
      >
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, color: BRAND.textPrimary }}>{title}</div>
          {sub && <div style={{ fontSize: 11, color: BRAND.textSecondary, marginTop: 2 }}>{sub}</div>}
        </div>
        {extra}
      </div>
      {children}
    </Card>
  );
}

export default function HubEnergyReport() {
  const db = useDb();
  const units = useUnits();

  const hubs = useMemo(
    () => Array.from(new Set(db.chargepoints.map((c) => c.hub))).sort(),
    [db.chargepoints],
  );
  const [hub, setHub] = useState<string | null>(null);
  const activeHub = hub ?? hubs[0] ?? null;

  const lastMonth = dayjs().subtract(1, "month");
  const [range, setRange] = useState<[Dayjs, Dayjs]>([
    lastMonth.startOf("month"),
    lastMonth.endOf("month"),
  ]);
  const [applied, setApplied] = useState<[Dayjs, Dayjs] | null>([
    lastMonth.startOf("month"),
    lastMonth.endOf("month"),
  ]);
  const [dayIndex, setDayIndex] = useState(0);

  const vehicleCount = useMemo(
    () => (activeHub ? db.vehicles.filter((v) => v.hub === activeHub).length : 0),
    [db.vehicles, activeHub],
  );
  const chargerCount = useMemo(
    () => (activeHub ? db.chargepoints.filter((c) => c.hub === activeHub).length : 0),
    [db.chargepoints, activeHub],
  );

  // The hub's own tariff when it has been configured in Hubs → Energy prices
  // and is quoted in the active currency; otherwise the default for that
  // currency, so a ₹ fleet is never billed against a $ tariff book.
  const { cfg, fromHubSettings } = useMemo(() => {
    const saved = activeHub ? loadRateConfig(activeHub) : null;
    if (saved && utilityOf(saved).currency === units.currencyCode) {
      return { cfg: saved, fromHubSettings: true };
    }
    return { cfg: defaultConfigFor(units.currencyCode), fromHubSettings: false };
  }, [activeHub, units.currencyCode]);

  const summer = applied ? isSummerMonth(applied[0].month(), cfg) : true;
  const schedule = summer ? cfg.summerSchedule : cfg.winterSchedule;

  const days = useMemo(() => {
    if (!applied || !activeHub) return [];
    return buildDays(
      applied[0],
      applied[1],
      Math.max(4, vehicleCount || 4),
      hashStr(activeHub),
      schedule,
    );
  }, [applied, activeHub, vehicleCount, schedule]);

  const cost = useMemo(() => computeCost(days, cfg, summer), [days, cfg, summer]);
  const day = days[Math.min(dayIndex, Math.max(0, days.length - 1))];
  const windows = windowsOf(schedule);

  if (!activeHub) {
    return <Alert type="info" showIcon message="No hubs in the fleet yet." />;
  }

  const hourChart = day
    ? {
        grid: { top: 24, right: 16, bottom: 28, left: 56 },
        tooltip: {
          trigger: "axis",
          valueFormatter: (v: number) => `${Math.round(Number(v))} kW`,
        },
        legend: { show: false },
        xAxis: {
          type: "category",
          data: day.hourly.map((h) => h.hour),
          axisLabel: {
            fontSize: 10,
            interval: 2,
            formatter: (h: string) => {
              const n = Number(h);
              return `${n === 0 ? 12 : n > 12 ? n - 12 : n}${n < 12 ? "a" : "p"}`;
            },
          },
        },
        yAxis: {
          type: "value",
          name: "kW",
          nameTextStyle: { fontSize: 10, color: BRAND.textMuted },
          axisLabel: { fontSize: 10 },
          splitLine: { lineStyle: { color: "#f1f0ec" } },
        },
        series: [
          {
            name: "Unmanaged baseline",
            type: "line",
            smooth: true,
            showSymbol: false,
            lineStyle: { color: DANGER, width: 1.5, type: "dashed" },
            areaStyle: { color: DANGER_LIGHT, opacity: 0.45 },
            data: day.hourly.map((h) => h.unmanagedKw),
            // Shade the tariff windows behind the curves.
            markArea: day.weekday
              ? {
                  silent: true,
                  itemStyle: { color: "rgba(239,68,68,0.06)" },
                  data: windows.hasOnPeak
                    ? [[{ xAxis: String(windows.peakStart) }, { xAxis: String(windows.peakEnd - 1) }]]
                    : [],
                }
              : undefined,
          },
          {
            name: "Managed (ergOS)",
            type: "line",
            smooth: true,
            showSymbol: false,
            lineStyle: { color: ACCENT, width: 2 },
            areaStyle: { color: ACCENT_LIGHT, opacity: 0.6 },
            data: day.hourly.map((h) => h.managedKw),
            markLine: {
              silent: true,
              symbol: "none",
              lineStyle: { color: ACCENT, type: "dashed", width: 1 },
              label: { formatter: `Month peak ${cost.peaks.mPk} kW`, fontSize: 10 },
              data: [{ yAxis: cost.peaks.mPk }],
            },
          },
        ],
      }
    : null;

  const dailyPeaksOption = {
    grid: { top: 16, right: 10, bottom: 24, left: 46 },
    tooltip: { trigger: "axis", valueFormatter: (v: number) => `${Math.round(Number(v))} kW` },
    xAxis: {
      type: "category",
      data: days.map((d) => d.date.format("D")),
      axisLabel: { fontSize: 9, interval: days.length > 20 ? 2 : 0 },
    },
    yAxis: {
      type: "value",
      name: "kW",
      nameTextStyle: { fontSize: 10, color: BRAND.textMuted },
      axisLabel: { fontSize: 10 },
      splitLine: { lineStyle: { color: "#f1f0ec" } },
    },
    series: [
      {
        name: "Managed",
        type: "bar",
        data: days.map((d) => d.mPeak),
        itemStyle: { color: ACCENT, borderRadius: [2, 2, 0, 0] },
        barMaxWidth: 12,
      },
    ],
  };

  const touOption = {
    grid: { top: 16, right: 10, bottom: 24, left: 52 },
    tooltip: { trigger: "axis", valueFormatter: (v: number) => `${fmtKwh(Number(v))} kWh` },
    xAxis: {
      type: "category",
      data: days.map((d) => d.date.format("D")),
      axisLabel: { fontSize: 9, interval: days.length > 20 ? 2 : 0 },
    },
    yAxis: {
      type: "value",
      name: "kWh",
      nameTextStyle: { fontSize: 10, color: BRAND.textMuted },
      axisLabel: { fontSize: 10 },
      splitLine: { lineStyle: { color: "#f1f0ec" } },
    },
    series: [
      {
        name: "Off-peak",
        type: "bar",
        stack: "tou",
        data: days.map((d) => Math.round(d.mEnergy.off)),
        itemStyle: { color: OFF_PEAK },
      },
      {
        name: "Mid-peak",
        type: "bar",
        stack: "tou",
        data: days.map((d) => Math.round(d.mEnergy.mid)),
        itemStyle: { color: MID_PEAK },
      },
      {
        name: "On-peak",
        type: "bar",
        stack: "tou",
        data: days.map((d) => Math.round(d.mEnergy.on)),
        itemStyle: { color: ON_PEAK, borderRadius: [2, 2, 0, 0] },
      },
    ],
  };

  const comparisonOption = {
    grid: { top: 10, right: 24, bottom: 24, left: 110 },
    tooltip: { trigger: "axis", valueFormatter: (v: number) => money(Number(v), units) },
    legend: { bottom: 0, itemHeight: 8, textStyle: { fontSize: 11 } },
    xAxis: {
      type: "value",
      axisLabel: {
        fontSize: 10,
        formatter: (v: number) => `${units.currencySymbol}${(v / 1000).toFixed(0)}k`,
      },
      splitLine: { lineStyle: { color: "#f1f0ec" } },
    },
    yAxis: {
      type: "category",
      data: ["Energy charges", "Demand charges"],
      axisLabel: { fontSize: 12 },
    },
    series: [
      {
        name: "Unmanaged",
        type: "bar",
        data: [cost.unmanaged.energy, cost.unmanaged.demand],
        itemStyle: { color: DANGER, borderRadius: [0, 4, 4, 0] },
        barMaxWidth: 18,
      },
      {
        name: "Managed (ergOS)",
        type: "bar",
        data: [cost.managed.energy, cost.managed.demand],
        itemStyle: { color: ACCENT, borderRadius: [0, 4, 4, 0] },
        barMaxWidth: 18,
      },
    ],
  };

  const touRows = [
    { period: "On-peak", rate: cost.prices.onPeak, u: cost.energy.u.on, m: cost.energy.m.on, color: ON_PEAK },
    { period: "Mid-peak", rate: cost.prices.midPeak, u: cost.energy.u.mid, m: cost.energy.m.mid, color: MID_PEAK },
    { period: "Off-peak", rate: cost.prices.offPeak, u: cost.energy.u.off, m: cost.energy.m.off, color: OFF_PEAK },
  ];

  const totalManagedKwh = cost.energy.m.on + cost.energy.m.mid + cost.energy.m.off;
  const tariff = tariffOf(cfg);
  const peakWindowText = windows.hasOnPeak
    ? `${hourLabel(windows.peakStart)} - ${hourLabel(windows.peakEnd)}`
    : "No on-peak window this season";

  return (
    <Space orientation="vertical" style={{ width: "100%" }} size="middle">
      {/* controls */}
      <Card styles={{ body: { padding: 16 } }}>
        <Space wrap align="center">
          <Select
            style={{ minWidth: 220 }}
            value={activeHub}
            onChange={(h) => {
              setHub(h);
              setDayIndex(0);
            }}
            options={hubs.map((h) => ({ label: h, value: h }))}
          />
          <RangePicker
            format={DATE_FORMAT}
            value={range}
            allowClear={false}
            onChange={(v) => {
              if (v && v[0] && v[1]) setRange([v[0], v[1]]);
            }}
          />
          <Button
            type="primary"
            style={{ background: "#ea580c", borderColor: "#ea580c" }}
            onClick={() => {
              setApplied(range);
              setDayIndex(0);
            }}
          >
            Generate Report
          </Button>
        </Space>
        <div style={{ marginTop: 8, fontSize: 12, color: BRAND.textSecondary }}>
          {chargerCount} charger{chargerCount === 1 ? "" : "s"} · {vehicleCount} vehicle
          {vehicleCount === 1 ? "" : "s"} ·{" "}
          {fromHubSettings
            ? `Priced on this hub's configured tariff (${tariff.name})`
            : `Priced on the default ${units.currencyCode} tariff (${tariff.name}) — set one in Hubs → Energy prices`}
        </div>
      </Card>

      {!applied || !day ? (
        <Alert type="info" showIcon message="Pick a period and generate the report." />
      ) : (
        <>
          {/* savings hero */}
          <div
            style={{
              background: ACCENT_BG,
              border: `1px solid ${ACCENT_BORDER}`,
              borderRadius: 16,
              padding: "26px 28px",
              boxShadow: "0 4px 20px rgba(22,163,74,0.10)",
            }}
          >
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: "0.8px",
                color: ACCENT_DEEP,
                marginBottom: 8,
              }}
            >
              Smart charging savings · {activeHub}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 32, alignItems: "baseline" }}>
              <div>
                <div
                  style={{
                    fontSize: 44,
                    fontWeight: 800,
                    lineHeight: 1,
                    color: BRAND.textPrimary,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {money(cost.sav.total, units)}
                </div>
                <div style={{ fontSize: 12, color: ACCENT_TEXT, marginTop: 4 }}>
                  saved over this period vs unmanaged charging
                </div>
              </div>
              <div style={{ display: "flex", gap: 28, flexWrap: "wrap" }}>
                <HeroStat value={`${cost.sav.pct.toFixed(0)}%`} label="cost reduction" />
                <HeroStat
                  value={`${cost.peaks.uPk - cost.peaks.mPk} kW`}
                  label="peak shaved"
                />
                <HeroStat
                  value={`${fmtKwh(cost.energy.u.on - cost.energy.m.on)} kWh`}
                  label="shifted off on-peak"
                />
              </div>
            </div>
          </div>

          {/* KPI strip */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            <Metric label="Total energy" value={`${fmtKwh(totalManagedKwh)} kWh`} color="#3b82f6" />
            <Metric
              label="Peak demand (managed)"
              value={`${cost.peaks.mPk} kW`}
              sub={`vs ${cost.peaks.uPk} kW unmanaged`}
              color={ACCENT}
              accent={ACCENT}
            />
            <Metric
              label="On-peak demand"
              value={`${cost.peaks.mOnPk} kW`}
              sub={`vs ${cost.peaks.uOnPk} kW unmanaged`}
              color={MID_PEAK}
            />
            <Metric
              label="Cost for period (managed)"
              value={money(cost.managed.total, units)}
              sub={`vs ${money(cost.unmanaged.total, units)} unmanaged`}
              color={SAVINGS}
              accent={SAVINGS}
            />
          </div>

          {/* power demand profile */}
          <Panel
            title="Power demand profile"
            sub={`${day.date.format("DD MMM YYYY")} · ${day.weekday ? "Weekday" : "Weekend"}`}
            extra={
              <Select
                size="small"
                style={{ width: 170 }}
                value={Math.min(dayIndex, days.length - 1)}
                onChange={setDayIndex}
                options={days.map((d, i) => ({
                  value: i,
                  label: `${d.date.format("DD MMM")}${d.weekday ? "" : " (wknd)"}`,
                }))}
              />
            }
          >
            <div
              style={{ display: "flex", gap: 14, fontSize: 11, color: BRAND.textSecondary, flexWrap: "wrap" }}
            >
              <LegendItem color={ACCENT} label="Managed (ergOS)" />
              <LegendItem color={DANGER} label="Unmanaged baseline" />
              <LegendItem color="rgba(239,68,68,0.25)" label={`On-peak ${peakWindowText}`} block />
            </div>
            {hourChart && <ReactECharts option={hourChart} style={{ height: 270 }} />}
            {day.weekday && windows.hasOnPeak && (
              <div style={{ textAlign: "center", fontSize: 11, color: BRAND.textSecondary }}>
                On-peak demand throttled from{" "}
                {Math.max(...day.hourly.filter((h) => h.tou === "on").map((h) => h.unmanagedKw))} kW →{" "}
                {Math.max(...day.hourly.filter((h) => h.tou === "on").map((h) => h.managedKw))} kW ·
                charging deferred past {hourLabel(windows.peakEnd)}
              </div>
            )}
          </Panel>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Panel title="Daily peak demand" sub="Managed profile, per day">
              <ReactECharts option={dailyPeaksOption} style={{ height: 200 }} />
              <div style={{ fontSize: 11, color: BRAND.textSecondary, marginTop: 4 }}>
                Period peak: {cost.peaks.mPk} kW · on-peak max: {cost.peaks.mOnPk} kW
              </div>
            </Panel>

            <Panel title="Daily energy by TOU period" sub="On-peak / mid-peak / off-peak (managed)">
              <ReactECharts option={touOption} style={{ height: 200 }} />
              <div style={{ display: "flex", gap: 12, fontSize: 11, color: BRAND.textSecondary, marginTop: 4 }}>
                <span style={{ color: OFF_PEAK }}>● Off-peak {fmtKwh(cost.energy.m.off)} kWh</span>
                <span style={{ color: MID_PEAK }}>● Mid-peak {fmtKwh(cost.energy.m.mid)} kWh</span>
                <span style={{ color: ON_PEAK }}>● On-peak {fmtKwh(cost.energy.m.on)} kWh</span>
              </div>
            </Panel>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Panel title="Demand charge savings" sub="FRD (all-hours peak) + TRD (on-peak demand)">
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                <div style={{ flex: "1 1 90px" }}>
                  <div style={{ fontSize: 11, color: BRAND.textSecondary }}>Unmanaged</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: DANGER }}>
                    {money(cost.unmanaged.demand, units)}
                  </div>
                </div>
                <div style={{ fontSize: 18, color: BRAND.textMuted }}>→</div>
                <div style={{ flex: "1 1 90px" }}>
                  <div style={{ fontSize: 11, color: BRAND.textSecondary }}>Managed</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: ACCENT }}>
                    {money(cost.managed.demand, units)}
                  </div>
                </div>
                <div
                  style={{
                    background: BRAND.greenBg,
                    color: SAVINGS,
                    fontWeight: 700,
                    fontSize: 13,
                    padding: "4px 10px",
                    borderRadius: 4,
                  }}
                >
                  {money(cost.sav.demand, units)} saved
                </div>
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: BRAND.textSecondary,
                  lineHeight: 1.7,
                  borderTop: "1px solid #f3f4f6",
                  paddingTop: 10,
                  marginTop: 12,
                }}
              >
                <strong>FRD</strong> ({cost.peaks.uPk} → {cost.peaks.mPk} kW):{" "}
                {money(cost.unmanaged.frd - cost.managed.frd, units)} saved at{" "}
                {money2(cfg.frd, units)}/kW
                <br />
                <strong>TRD</strong> ({cost.peaks.uOnPk} → {cost.peaks.mOnPk} kW on-peak):{" "}
                {money(cost.unmanaged.trd - cost.managed.trd, units)} saved at{" "}
                {money2(cfg.trd, units)}/kW
              </div>
            </Panel>

            <Panel title="TOU energy arbitrage" sub="kWh shifted out of the expensive periods">
              <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${BRAND.border}` }}>
                    <th style={{ textAlign: "left", padding: "5px 0", color: BRAND.textSecondary, fontWeight: 500 }}>
                      Period
                    </th>
                    <th style={{ textAlign: "right", padding: "5px 0", color: BRAND.textSecondary, fontWeight: 500 }}>
                      Rate
                    </th>
                    <th style={{ textAlign: "right", padding: "5px 0", color: DANGER, fontWeight: 500 }}>
                      Unmanaged
                    </th>
                    <th style={{ textAlign: "right", padding: "5px 0", color: ACCENT, fontWeight: 500 }}>
                      Managed
                    </th>
                    <th style={{ textAlign: "right", padding: "5px 0", color: BRAND.textSecondary, fontWeight: 500 }}>
                      Shift
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {touRows.map((r) => (
                    <tr key={r.period} style={{ borderBottom: "1px solid #f3f4f6" }}>
                      <td style={{ padding: "7px 0", fontWeight: 500 }}>
                        <span
                          style={{
                            display: "inline-block",
                            width: 8,
                            height: 8,
                            borderRadius: "50%",
                            background: r.color,
                            marginRight: 6,
                          }}
                        />
                        {r.period}
                      </td>
                      <td style={{ textAlign: "right", padding: "7px 0", color: BRAND.textSecondary }}>
                        {money2(r.rate, units)}
                      </td>
                      <td style={{ textAlign: "right", padding: "7px 0", color: DANGER }}>
                        {fmtKwh(r.u)}
                      </td>
                      <td style={{ textAlign: "right", padding: "7px 0", color: ACCENT }}>
                        {fmtKwh(r.m)}
                      </td>
                      <td
                        style={{
                          textAlign: "right",
                          padding: "7px 0",
                          fontWeight: 500,
                          color: r.u > r.m ? SAVINGS : "#9ca3af",
                        }}
                      >
                        {r.u > r.m ? "↓" : "↑"}
                        {fmtKwh(Math.abs(r.m - r.u))}
                      </td>
                    </tr>
                  ))}
                  <tr style={{ fontWeight: 600, borderTop: `2px solid ${BRAND.border}` }}>
                    <td style={{ padding: "7px 0" }} colSpan={2}>
                      Energy cost
                    </td>
                    <td style={{ textAlign: "right", padding: "7px 0", color: DANGER }}>
                      {money(cost.unmanaged.energy, units)}
                    </td>
                    <td style={{ textAlign: "right", padding: "7px 0", color: ACCENT }}>
                      {money(cost.managed.energy, units)}
                    </td>
                    <td style={{ textAlign: "right", padding: "7px 0", color: SAVINGS }}>
                      {money(cost.sav.energy, units)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </Panel>
          </div>

          <Panel title="Cost comparison" sub="Unmanaged baseline vs ergOS-managed">
            <ReactECharts option={comparisonOption} style={{ height: 190 }} />
          </Panel>

          <Panel title="Projected annual impact">
            <div style={{ display: "flex", flexWrap: "wrap", gap: 20 }}>
              <div style={{ flex: "1 1 180px" }}>
                <div style={{ fontSize: 30, fontWeight: 800, color: SAVINGS }}>
                  {money(cost.sav.total * 12, units)}
                </div>
                <div style={{ fontSize: 12, color: BRAND.textSecondary }}>Estimated annual savings</div>
              </div>
              <div style={{ flex: "1 1 180px" }}>
                <div style={{ fontSize: 30, fontWeight: 800 }}>
                  {money(cost.sav.demand * 12, units)}
                </div>
                <div style={{ fontSize: 12, color: BRAND.textSecondary }}>From demand charge reduction</div>
              </div>
              <div style={{ flex: "1 1 180px" }}>
                <div style={{ fontSize: 30, fontWeight: 800 }}>
                  {money(cost.sav.energy * 12, units)}
                </div>
                <div style={{ fontSize: 12, color: BRAND.textSecondary }}>From TOU energy arbitrage</div>
              </div>
            </div>
            <div
              style={{
                fontSize: 11,
                color: BRAND.textMuted,
                marginTop: 12,
                borderTop: "1px solid #f3f4f6",
                paddingTop: 8,
              }}
            >
              Based on {tariff.name} {summer ? "summer" : "winter"} rates. The other season uses a
              different TOU structure but similar demand-charge savings. Includes{" "}
              {money2(cfg.customerCharge, units)} fixed customer charge (not optimizable). The annual
              projection assumes consistent fleet utilization.
            </div>
          </Panel>

          <Card styles={{ body: { padding: "14px 20px" } }} style={{ borderRadius: 10 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 20, fontSize: 12, color: BRAND.textSecondary }}>
              <div>
                <Text strong>Rate schedule:</Text> {tariff.name}
              </div>
              <div>
                <Text strong>On-peak window:</Text> {peakWindowText} weekdays
              </div>
              <div>
                <Text strong>FRD:</Text> {money2(cfg.frd, units)}/kW
              </div>
              <div>
                <Text strong>TRD:</Text> {money2(cfg.trd, units)}/kW
              </div>
              <div>
                <Text strong>On-peak:</Text> {money2(cost.prices.onPeak, units)}/kWh
              </div>
              <div>
                <Text strong>Off-peak:</Text> {money2(cost.prices.offPeak, units)}/kWh
              </div>
            </div>
          </Card>

          <Title level={5} style={{ color: BRAND.textMuted, fontWeight: 400, fontSize: 11 }}>
            Simulated managed/unmanaged profiles for demonstration — priced on a real tariff
            structure.
          </Title>
        </>
      )}
    </Space>
  );
}

function HeroStat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div style={{ fontSize: 20, fontWeight: 700, color: BRAND.textPrimary }}>{value}</div>
      <div style={{ fontSize: 11, color: ACCENT_TEXT }}>{label}</div>
    </div>
  );
}

function LegendItem({ color, label, block }: { color: string; label: string; block?: boolean }) {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
      <span
        style={{
          display: "inline-block",
          width: block ? 10 : 14,
          height: block ? 10 : 3,
          borderRadius: 2,
          background: color,
        }}
      />
      {label}
    </span>
  );
}

function hourLabel(hour: number): string {
  const h = ((hour % 24) + 24) % 24;
  const suffix = h < 12 ? "AM" : "PM";
  const display = h % 12 === 0 ? 12 : h % 12;
  return `${display}:00 ${suffix}`;
}
