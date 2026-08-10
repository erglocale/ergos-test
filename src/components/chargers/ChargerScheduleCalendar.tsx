"use client";

import dayjs, { type Dayjs } from "dayjs";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  fetchPredictedSchedules,
  type PredictedSchedule,
} from "@/data/energyBrain";
import { useDb } from "@/data/store";
import type { Chargepoint, ChargingSession } from "@/data/types";

// Calendar/Gantt view of each charger's sessions (demo spec item 1, Aug 2026).
// Layout follows the reference mock: one collapsible group per hub with a
// site power curve + grid-limit pill, one row per charger, and blocks that
// combine a kW power line with a SoC progress bar. A vertical line marks now:
// past = recorded sessions, future = energy-brain's optimizer schedule.

const PX_PER_HOUR = 160;
const HOURS_BACK = 72;
const HOURS_AHEAD = 24;
const LANE_HEIGHT = 46;
const SAMPLE_MIN = 15;

const BLUE = "#6366f1";
const GREEN = "#22c55e";
const GREEN_DARK = "#14532d";
const ORANGE = "#f97316";

function hashInt(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/** Deterministic, session-specific charging curve (dummy data for history). */
function pastCurve(seed: string): number[] {
  const h = hashInt(seed);
  const n = 14;
  return Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1);
    const ramp = Math.min(1, t * 4);
    const taper = t > 0.75 ? 1 - (t - 0.75) * 2.4 : 1;
    const wobble = 0.88 + 0.12 * Math.sin((h % 17) + i * 1.7);
    return Math.max(0.05, ramp * taper * wobble);
  });
}

function Sparkline({
  values,
  color,
  width,
  height,
  scaleMax,
}: {
  values: number[];
  color: string;
  width: number;
  height: number;
  /** Fixed kW full-scale so heights are comparable between blocks. Without
      it each line self-normalizes and always touches the top. */
  scaleMax?: number;
}) {
  if (values.length < 2 || width < 20) return null;
  const max = Math.max(scaleMax ?? 0, ...values, 0.001);
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * width;
    const y = height - 1 - (v / max) * (height - 3);
    return [x, y] as const;
  });
  const line = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} ${width},${height} 0,${height}`;
  return (
    <svg width={width} height={height} style={{ display: "block" }}>
      <polygon points={area} fill={color} opacity={0.12} />
      <polyline
        points={line}
        fill="none"
        stroke={color}
        strokeWidth={1.4}
        strokeLinejoin="round"
      />
    </svg>
  );
}

interface Block {
  key: string;
  startMs: number;
  endMs: number;
  lane: number;
  label: string;
  kind: "past" | "ongoing" | "predicted";
  power: number[];
  /** Connector rating (kW) — full scale for this block's power line. */
  ratedKw: number;
  socStart: number;
  socEnd: number;
  done: boolean;
  eta: string | null;
}

function assignLanes(blocks: Omit<Block, "lane">[]): Block[] {
  const sorted = [...blocks].sort((a, b) => a.startMs - b.startMs);
  const laneEnds: number[] = [];
  return sorted.map((b) => {
    let lane = laneEnds.findIndex((end) => end <= b.startMs);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(b.endMs);
    } else {
      laneEnds[lane] = b.endMs;
    }
    return { ...b, lane };
  });
}

export default function ChargerScheduleCalendar({
  chargers,
}: {
  chargers: Chargepoint[];
}) {
  const db = useDb();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState<Dayjs>(() => dayjs());
  const [predicted, setPredicted] = useState<PredictedSchedule[]>([]);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let stopped = false;
    const tick = async () => {
      const schedules = await fetchPredictedSchedules();
      if (!stopped) {
        setPredicted(schedules);
        setNow(dayjs());
      }
    };
    tick();
    const timer = setInterval(tick, 60_000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, []);

  const windowStart = now.subtract(HOURS_BACK, "hour").startOf("hour");
  const windowEnd = now.add(HOURS_AHEAD, "hour").endOf("hour");
  const totalWidth = (windowEnd.diff(windowStart, "minute") / 60) * PX_PER_HOUR;
  const xOf = (ms: number) =>
    ((ms - windowStart.valueOf()) / 3_600_000) * PX_PER_HOUR;

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = Math.max(0, xOf(now.valueOf()) - el.clientWidth * 0.55);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const predictedBySession = useMemo(
    () => new Map(predicted.map((p) => [p.sessionId, p.points])),
    [predicted],
  );

  const hubGroups = useMemo(() => {
    const groups = new Map<string, Chargepoint[]>();
    for (const cp of chargers) {
      const list = groups.get(cp.hub) ?? [];
      list.push(cp);
      groups.set(cp.hub, list);
    }
    return Array.from(groups.entries());
  }, [chargers]);

  const connectorKw = (cp: Chargepoint, connectorId: number) =>
    cp.connectors.find((cn) => cn.id === connectorId)?.powerKw ??
    cp.connectors[0]?.powerKw ??
    3;

  const blocksFor = (cp: Chargepoint): Block[] => {
    const raw: Omit<Block, "lane">[] = [];
    const sessions = db.sessions.filter(
      (s: ChargingSession) => s.chargerId === cp.id,
    );
    for (const s of sessions) {
      const vehicle = db.vehicles.find((v) => v.reg === s.vehicleReg);
      const startMs = dayjs(s.startTime).valueOf();
      const ongoing = s.endTime === null;
      const pastEndMs = ongoing ? now.valueOf() : dayjs(s.endTime).valueOf();
      if (
        startMs < pastEndMs &&
        pastEndMs > windowStart.valueOf() &&
        startMs < windowEnd.valueOf()
      ) {
        raw.push({
          key: `${s.id}-past`,
          startMs: Math.max(startMs, windowStart.valueOf()),
          endMs: Math.min(pastEndMs, windowEnd.valueOf()),
          label: s.vehicleReg,
          kind: ongoing ? "ongoing" : "past",
          // Dummy history curve, scaled to the connector's actual rating.
          power: pastCurve(s.id).map((f) => f * connectorKw(cp, s.connectorId)),
          ratedKw: connectorKw(cp, s.connectorId),
          socStart: s.socStart,
          socEnd: s.socEnd ?? vehicle?.soc ?? s.socStart,
          done: !ongoing,
          eta: null,
        });
      }

      const points = predictedBySession.get(s.id);
      if (ongoing && points?.length) {
        const times = points.map((p) => dayjs(p.time).valueOf());
        const firstMs = Math.max(Math.min(...times), now.valueOf());
        const lastMs = Math.max(...times) + SAMPLE_MIN * 60_000;
        if (lastMs > firstMs) {
          const target = vehicle?.socCapPct ?? 100;
          raw.push({
            key: `${s.id}-predicted`,
            startMs: firstMs,
            endMs: Math.min(lastMs, windowEnd.valueOf()),
            label: s.vehicleReg,
            kind: "predicted",
            power: points.map((p) => p.limit),
            ratedKw: connectorKw(cp, s.connectorId),
            socStart: vehicle?.soc ?? s.socStart,
            socEnd: target,
            done: false,
            eta: dayjs(lastMs).format("h:mm a"),
          });
        }
      }
    }
    return assignLanes(raw);
  };

  // Site power: total kW drawn across the hub's chargers on the sample grid.
  const sitePower = (cps: Chargepoint[]): { values: number[]; peak: number } => {
    const ids = new Set(cps.map((c) => c.id));
    const sessions = db.sessions.filter((s) => ids.has(s.chargerId));
    const values: number[] = [];
    const stepMs = SAMPLE_MIN * 60_000;
    for (let ms = windowStart.valueOf(); ms < windowEnd.valueOf(); ms += stepMs) {
      let kw = 0;
      for (const s of sessions) {
        const cp = cps.find((c) => c.id === s.chargerId);
        if (!cp) continue;
        const sStart = dayjs(s.startTime).valueOf();
        const sEnd = s.endTime ? dayjs(s.endTime).valueOf() : now.valueOf();
        if (sStart <= ms && ms < sEnd) kw += connectorKw(cp, s.connectorId);
        const pts = predictedBySession.get(s.id);
        if (pts && ms >= now.valueOf()) {
          const hit = pts.find((p) => {
            const t = dayjs(p.time).valueOf();
            return ms >= t && ms < t + stepMs;
          });
          if (hit) kw += hit.limit;
        }
      }
      values.push(Math.round(kw * 100) / 100);
    }
    return { values, peak: Math.max(0, ...values) };
  };

  const hourTicks: Dayjs[] = [];
  for (let t = windowStart; t.isBefore(windowEnd); t = t.add(1, "hour")) {
    hourTicks.push(t);
  }

  const nowX = xOf(now.valueOf());

  const renderBlock = (b: Block) => {
    const left = xOf(b.startMs);
    const width = Math.max(10, xOf(b.endMs) - left);
    const isPredicted = b.kind === "predicted";
    const accent = isPredicted ? ORANGE : BLUE;
    const socFill = Math.max(0, Math.min(100, b.socEnd));
    const socFrom = Math.max(0, Math.min(100, b.socStart));

    return (
      <div
        key={b.key}
        style={{ position: "absolute", left, top: b.lane * LANE_HEIGHT + 6, width }}
        title={
          `${b.label} · ${dayjs(b.startMs).format("h:mm a")} – ${dayjs(b.endMs).format("h:mm a")}` +
          ` · SoC ${Math.round(b.socStart)}% → ${Math.round(b.socEnd)}%` +
          ` · peak ${Math.max(...b.power).toFixed(1)} kW of ${b.ratedKw} kW connector` +
          `${isPredicted ? " · predicted by energy brain" : ""}`
        }
      >
        {/* Vehicle label above the block, as in the mock */}
        <div
          style={{
            fontSize: 10,
            fontWeight: 600,
            color: "#4b5563",
            lineHeight: "11px",
            whiteSpace: "nowrap",
            overflow: "hidden",
          }}
        >
          {b.label}
        </div>

        {/* kW power curve — full scale is the connector's rating, so line
            height is comparable across blocks instead of self-normalized. */}
        <Sparkline
          values={b.power}
          color={accent}
          width={width}
          height={16}
          scaleMax={b.ratedKw}
        />

        {/* SoC progress bar with end cap + badge */}
        <div
          style={{
            position: "relative",
            height: 8,
            borderRadius: 4,
            background: "#e5e7eb",
            overflow: "hidden",
            border: isPredicted ? `1px dashed ${ORANGE}` : "none",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              width: `${socFrom}%`,
              background: isPredicted ? "#fed7aa" : GREEN,
              opacity: isPredicted ? 1 : 0.55,
            }}
          />
          <div
            style={{
              position: "absolute",
              left: `${socFrom}%`,
              top: 0,
              bottom: 0,
              width: `${Math.max(0, socFill - socFrom)}%`,
              background: isPredicted ? ORANGE : GREEN,
            }}
          />
          <div
            style={{
              position: "absolute",
              right: 0,
              top: 0,
              bottom: 0,
              width: 10,
              background: b.done ? GREEN_DARK : "transparent",
            }}
          />
        </div>

        {/* Right-hand badge: ✓ when finished, % + ETA while charging */}
        <div
          style={{
            position: "absolute",
            right: -6,
            top: 12,
            display: "flex",
            alignItems: "center",
            gap: 4,
            whiteSpace: "nowrap",
          }}
        >
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 14,
              height: 14,
              borderRadius: 4,
              fontSize: 9,
              fontWeight: 700,
              color: "white",
              background: b.done ? GREEN_DARK : isPredicted ? ORANGE : GREEN,
            }}
          >
            {b.done ? "✓" : "+"}
          </span>
          {!b.done && (
            <span style={{ fontSize: 9, fontWeight: 600, color: isPredicted ? ORANGE : GREEN }}>
              {Math.round(b.socEnd)}%{b.eta ? ` · ETA ${b.eta}` : ""}
            </span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div
      style={{
        border: "1px solid #f0f0f0",
        borderRadius: 12,
        backgroundColor: "white",
        overflow: "hidden",
      }}
    >
      <div style={{ display: "flex" }}>
        {/* Sticky left column */}
        <div style={{ flex: "0 0 210px", borderRight: "1px solid #f0f0f0" }}>
          <div style={{ height: 34, borderBottom: "1px solid #f0f0f0" }} />
          {hubGroups.map(([hub, cps]) => {
            const isCollapsed = collapsed[hub];
            const gridLimit = cps.reduce(
              (sum, cp) => sum + cp.connectors.reduce((s, cn) => s + cn.powerKw, 0),
              0,
            );
            return (
              <div key={hub}>
                <div
                  style={{
                    height: 40,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "0 10px",
                    backgroundColor: "#fafafa",
                    borderTop: "1px solid #f0f0f0",
                    borderBottom: "1px solid #f0f0f0",
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  <span
                    onClick={() => setCollapsed((c) => ({ ...c, [hub]: !c[hub] }))}
                    style={{ cursor: "pointer", color: "#6b7280", fontSize: 10 }}
                  >
                    {isCollapsed ? "▶" : "▼"}
                  </span>
                  <Link href={`/hubs/${encodeURIComponent(hub)}`} style={{ color: "inherit" }}>
                    {hub}
                  </Link>
                  <span
                    style={{
                      fontSize: 9,
                      fontWeight: 600,
                      color: BLUE,
                      background: "#eef2ff",
                      borderRadius: 10,
                      padding: "1px 6px",
                      whiteSpace: "nowrap",
                    }}
                  >
                    Limit {gridLimit} kW
                  </span>
                </div>
                {!isCollapsed &&
                  cps.map((cp) => {
                    const lanes = Math.max(1, ...blocksFor(cp).map((b) => b.lane + 1));
                    return (
                      <div
                        key={cp.id}
                        style={{
                          height: lanes * LANE_HEIGHT + 8,
                          display: "flex",
                          alignItems: "center",
                          padding: "0 12px",
                          borderBottom: "1px solid #f5f5f5",
                          fontSize: 13,
                        }}
                      >
                        <Link href={`/chargingStations/${cp.id}`} style={{ color: "#f97417" }}>
                          {cp.name}
                        </Link>
                      </div>
                    );
                  })}
              </div>
            );
          })}
        </div>

        {/* Timeline */}
        <div ref={scrollRef} style={{ overflowX: "auto", flex: 1 }}>
          <div style={{ width: totalWidth, position: "relative" }}>
            <div
              style={{
                display: "flex",
                height: 34,
                borderBottom: "1px solid #f0f0f0",
              }}
            >
              {hourTicks.map((t) => (
                <div
                  key={t.valueOf()}
                  style={{
                    width: PX_PER_HOUR,
                    flex: "0 0 auto",
                    fontSize: 10,
                    color: t.hour() === 0 ? "#374151" : "#9ca3af",
                    fontWeight: t.hour() === 0 ? 700 : 400,
                    borderLeft: "1px solid #f5f5f5",
                    padding: "2px 4px",
                    whiteSpace: "nowrap",
                  }}
                >
                  {t.hour() === 0 ? t.format("ddd, D MMM") : t.format("h a")}
                </div>
              ))}
            </div>

            {hubGroups.map(([hub, cps]) => {
              const isCollapsed = collapsed[hub];
              const { values, peak } = sitePower(cps);
              const siteLimit = cps.reduce(
                (sum, cp) => sum + cp.connectors.reduce((s, cn) => s + cn.powerKw, 0),
                0,
              );
              return (
                <div key={hub}>
                  {/* Site power curve across the whole timeline */}
                  <div
                    style={{
                      height: 40,
                      backgroundColor: "#fafafa",
                      borderTop: "1px solid #f0f0f0",
                      borderBottom: "1px solid #f0f0f0",
                      position: "relative",
                    }}
                  >
                    <div style={{ position: "absolute", inset: 0, opacity: 0.9 }}>
                      <Sparkline
                        values={values}
                        color={BLUE}
                        width={totalWidth}
                        height={40}
                        scaleMax={siteLimit}
                      />
                    </div>
                    <span
                      style={{
                        position: "absolute",
                        left: 8,
                        top: 3,
                        fontSize: 9,
                        color: "#9ca3af",
                        fontWeight: 600,
                      }}
                    >
                      site load · full scale {Math.max(siteLimit, peak).toFixed(0)} kW
                    </span>
                    {peak > 0 && (
                      <span
                        style={{
                          position: "absolute",
                          right: 8,
                          top: 3,
                          fontSize: 9,
                          color: BLUE,
                          fontWeight: 600,
                        }}
                      >
                        peak {peak.toFixed(1)} kW
                      </span>
                    )}
                  </div>
                  {!isCollapsed &&
                    cps.map((cp) => {
                      const blocks = blocksFor(cp);
                      const lanes = Math.max(1, ...blocks.map((b) => b.lane + 1));
                      return (
                        <div
                          key={cp.id}
                          style={{
                            position: "relative",
                            height: lanes * LANE_HEIGHT + 8,
                            borderBottom: "1px solid #f5f5f5",
                            backgroundImage:
                              "repeating-linear-gradient(to right, #fafafa 0 1px, transparent 1px " +
                              `${PX_PER_HOUR}px)`,
                          }}
                        >
                          {blocks.map(renderBlock)}
                        </div>
                      );
                    })}
                </div>
              );
            })}

            {/* Now line */}
            <div
              style={{
                position: "absolute",
                top: 0,
                bottom: 0,
                left: nowX,
                width: 2,
                backgroundColor: "#111827",
                zIndex: 5,
              }}
            >
              <div
                style={{
                  position: "absolute",
                  top: 2,
                  left: -30,
                  backgroundColor: "#111827",
                  color: "white",
                  fontSize: 10,
                  fontWeight: 600,
                  borderRadius: 4,
                  padding: "1px 5px",
                  whiteSpace: "nowrap",
                }}
              >
                {now.format("ddd h:mm a")}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
