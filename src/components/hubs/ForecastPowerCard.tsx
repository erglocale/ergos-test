"use client";

// Expected power consumption for the next 24 hours (demo spec item 5 — this
// replaces the duplicated "power output (last 24 h)" chart).
//
// The numbers come straight from energy-brain's optimizer: every ongoing
// session at this hub has an allocation profile on a 15-minute grid, and each
// colour is one session's optimization stacked on the others, so the bar height
// is the site's planned draw. Nothing is computed here — the plan is read via
// the shared schedule cache the simulator already keeps warm.

import { Empty, Typography } from "antd";
import dayjs from "dayjs";
import ReactECharts from "echarts-for-react";
import { useMemo } from "react";
import { useSchedules } from "@/data/liveSim";

const { Text } = Typography;

const SERIES_COLORS = [
  "#38bdf8",
  "#0ea5e9",
  "#7dd3fc",
  "#0284c7",
  "#22c55e",
  "#a78bfa",
  "#f59e0b",
  "#f472b6",
];

const STEP_MS = 15 * 60_000;
const WINDOW_MS = 24 * 3_600_000;

export default function ForecastPowerCard({
  /** Session id -> label shown in the tooltip (vehicle reg). */
  sessionLabels,
}: {
  sessionLabels: Map<string, string>;
}) {
  const schedules = useSchedules();

  const chart = useMemo(() => {
    const mine = schedules.filter((s) => sessionLabels.has(s.sessionId) && s.points.length);
    if (!mine.length) return null;

    // A slot is kept if it is in the [now, now + 24 h) window; the optimizer's
    // horizon is usually shorter, so this normally keeps everything it sent.
    const from = dayjs().startOf("hour").valueOf();
    const to = from + WINDOW_MS;
    const slots = new Set<number>();
    for (const s of mine) {
      for (const p of s.points) {
        const t = new Date(p.time).getTime();
        if (t >= from && t < to) slots.add(t - (t % STEP_MS));
      }
    }
    if (!slots.size) return null;
    const times = Array.from(slots).sort((a, b) => a - b);

    const series = mine.map((s, i) => {
      const bySlot = new Map<number, number>();
      for (const p of s.points) {
        const t = new Date(p.time).getTime();
        bySlot.set(t - (t % STEP_MS), p.limit);
      }
      return {
        name: sessionLabels.get(s.sessionId) ?? s.sessionId,
        type: "bar" as const,
        stack: "power",
        barMaxWidth: 26,
        itemStyle: { color: SERIES_COLORS[i % SERIES_COLORS.length] },
        data: times.map((t) => Math.round((bySlot.get(t) ?? 0) * 100) / 100),
      };
    });

    const peak = Math.max(
      ...times.map((_, idx) => series.reduce((sum, s) => sum + (s.data[idx] ?? 0), 0)),
    );
    const energyKwh = series.reduce(
      (sum, s) => sum + s.data.reduce((a, b) => a + b, 0) * (STEP_MS / 3_600_000),
      0,
    );

    return {
      peak,
      energyKwh,
      option: {
        grid: { top: 16, right: 10, bottom: 24, left: 46 },
        tooltip: {
          trigger: "axis",
          axisPointer: { type: "shadow" },
          textStyle: { fontSize: 12 },
          valueFormatter: (v: number) => `${Number(v).toFixed(2)} kW`,
        },
        xAxis: {
          type: "category",
          data: times.map((t) => dayjs(t).format("HH:mm")),
          axisLabel: { fontSize: 11, interval: times.length > 24 ? 3 : 1 },
        },
        yAxis: {
          type: "value",
          name: "Power (kW)",
          nameLocation: "middle",
          nameGap: 34,
          nameTextStyle: { fontSize: 11, color: "#888" },
          axisLabel: { fontSize: 11 },
        },
        series,
      },
    };
  }, [schedules, sessionLabels]);

  if (!chart) {
    return (
      <div style={{ height: 200, display: "grid", placeItems: "center" }}>
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="No optimized sessions from energy brain for this hub yet"
        />
      </div>
    );
  }

  return (
    <div>
      <div style={{ fontSize: 12, color: "#888", marginBottom: 4 }}>
        Peak <Text strong>{chart.peak.toFixed(1)} kW</Text> · planned energy{" "}
        <Text strong>{chart.energyKwh.toFixed(1)} kWh</Text> · each colour is one session
      </div>
      <ReactECharts option={chart.option} style={{ height: 200 }} />
    </div>
  );
}
