"use client";

import dayjs, { type Dayjs } from "dayjs";
import Link from "next/link";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useSchedules } from "@/data/liveSim";
import { useDb, useEnergyHubLimits, useSimStates } from "@/data/store";
import type { Chargepoint, ChargingSession } from "@/data/types";

// Calendar/Gantt view of each charger's sessions (demo spec item 1, Aug 2026).
//
// The model, which everything here follows:
//
//   • The calendar's x axis is TIME, and the "now" rule divides it: a block's
//     position and width, and the kW line inside it, are all time. Left of the
//     rule is what happened (blue), right of it is energy brain's plan (orange).
//   • A block is ONE session. A finished session spans plug-in → unplug; a live
//     one spans plug-in → the end of the plan, because the optimizer's plan is
//     the rest of the same charge, not a second booking.
//   • Inside a block:
//       header    plate + the SoC story: "20% → 41% → 80% · ETA 10:15 pm" —
//                 plugged in at, charged to, heading for.
//       kW line   power drawn (blue) up to now, power the optimizer allocated
//                 (orange) after it, both scaled to the connector's rating.
//       bar       the session on the same time axis: dark green from plug-in to
//                 now (charging that happened), then the plan's own 15-minute
//                 slots — dark orange where it charges, light orange where it
//                 pauses. The SoC it arrived with is deliberately NOT drawn:
//                 the vehicle was not charging then, so any width for it would
//                 be invented time. That figure lives in the header instead.
//   • Hub rows carry the same idea at site level: the blue area is the hub's
//     draw, past and planned, against its grid-limit pill.

const PX_PER_HOUR = 160;
const HOURS_BACK = 72;
const HOURS_AHEAD = 24;
const SAMPLE_MIN = 15;

// Block internals: header line (plate + SoC/ETA), then the kW curve, then the
// SoC bar. The header carries the numbers so nothing has to float over the bar.
const LABEL_H = 15;
const SPARK_H = 26;
const BAR_H = 10;
const LANE_HEIGHT = LABEL_H + SPARK_H + BAR_H + 16;
const SITE_ROW_H = 56;
/** Width of the pinned hub/charger name column. */
const LEFT_COL_W = 210;
/** The calendar scrolls inside itself rather than stretching the page. */
const BODY_MAX_H = "min(70vh, 620px)";

const BLUE = "#6366f1";
const GREEN = "#22c55e";
const GREEN_DARK = "#14532d";
const ORANGE = "#f97316";
const ORANGE_PALE = "#fed7aa";

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

function Swatch({ color }: { color: string }) {
  return (
    <span
      style={{
        display: "inline-block",
        width: 14,
        height: 9,
        borderRadius: 3,
        background: color,
        verticalAlign: "middle",
      }}
    />
  );
}

/**
 * Everything in a row shares the calendar's time axis, and the split is always
 * the same: left of the "now" rule is what happened, right of it is what energy
 * brain plans. The legend spells that out because the two halves use different
 * colour families.
 */
function Legend() {
  const item = (children: ReactNode) => (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>{children}</span>
  );
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 16,
        padding: "8px 12px",
        borderBottom: "1px solid #f0f0f0",
        fontSize: 11,
        color: "#6b7280",
      }}
    >
      {item(
        <>
          <svg width={16} height={9}>
            <polyline points="0,8 5,3 10,5 16,1" fill="none" stroke={BLUE} strokeWidth={1.6} />
          </svg>
          kW drawn
        </>,
      )}
      {item(
        <>
          <svg width={16} height={9}>
            <polyline points="0,8 5,3 10,5 16,1" fill="none" stroke={ORANGE} strokeWidth={1.6} />
          </svg>
          kW planned
        </>,
      )}
      {item(
        <>
          <Swatch color={GREEN} /> charged so far
        </>,
      )}
      {item(
        <>
          <Swatch color={ORANGE} /> optimized future charging
        </>,
      )}
      {item(
        <>
          <Swatch color={ORANGE_PALE} /> planned pause
        </>,
      )}
      {item(
        <>
          <span
            style={{
              display: "inline-block",
              width: 2,
              height: 11,
              background: "#111827",
              verticalAlign: "middle",
            }}
          />
          now
        </>,
      )}
    </div>
  );
}

/**
 * One session drawn on the time axis. A finished session runs plug-in → unplug;
 * a live one runs plug-in → the end of energy brain's plan, because the plan is
 * the rest of the same charge, not a second booking. Everything inside the
 * block (header, kW line, charge bar) shares that same axis.
 */
interface Block {
  key: string;
  startMs: number;
  endMs: number;
  lane: number;
  label: string;
  kind: "past" | "ongoing";
  /** Actual kW over the elapsed part of the session. */
  power: number[];
  /** Connector rating (kW) — full scale for this block's power line. */
  ratedKw: number;
  /** SoC when the vehicle plugged in. */
  socStart: number;
  /** Where the charge ends up: the target while live, the final SoC once done. */
  socEnd: number;
  done: boolean;
  eta: string | null;
  /** SoC right now — only set while a plan continues the session. */
  socNow?: number;
  /** The optimizer's 15-minute slots: kW allocated at each instant. */
  planSlots?: { ms: number; limit: number }[];
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
  const sim = useSimStates();
  const hubGridLimits = useEnergyHubLimits();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState<Dayjs>(() => dayjs());
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  // The optimizer plan is fetched once for the whole app by LiveSimulation;
  // running it again here would make the backend re-solve for the same answer.
  const predicted = useSchedules();

  useEffect(() => {
    const timer = setInterval(() => setNow(dayjs()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const windowStart = now.subtract(HOURS_BACK, "hour").startOf("hour");
  const windowEnd = now.add(HOURS_AHEAD, "hour").endOf("hour");
  const totalWidth = (windowEnd.diff(windowStart, "minute") / 60) * PX_PER_HOUR;
  const xOf = (ms: number) =>
    ((ms - windowStart.valueOf()) / 3_600_000) * PX_PER_HOUR;

  useEffect(() => {
    const el = scrollRef.current;
    // The name column is pinned over the first LEFT_COL_W px of the viewport,
    // so "now" is centred in what is actually visible of the track.
    if (el)
      el.scrollLeft = Math.max(
        0,
        xOf(now.valueOf()) - (el.clientWidth - LEFT_COL_W) * 0.55,
      );
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

  /**
   * The hub's ceiling. For an energy-brain site that is the network's grid
   * connection limit, which is what the optimizer actually rations against —
   * NOT the sum of every charge point (sites are deliberately oversubscribed).
   * Fixture hubs have no grid figure, so they fall back to installed capacity.
   */
  const hubLimitKw = (hub: string, cps: Chargepoint[]) =>
    hubGridLimits[hub] ??
    cps.reduce((sum, cp) => sum + cp.connectors.reduce((s, cn) => s + cn.powerKw, 0), 0);

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

      // The optimizer's plan for a live session is not a separate booking — it
      // is the rest of the same charge, so it extends this block instead of
      // starting a second one with its own 0–100 % bar.
      const points = ongoing ? predictedBySession.get(s.id) : undefined;
      const planTimes = points?.length ? points.map((p) => dayjs(p.time).valueOf()) : null;
      const planEndMs = planTimes ? Math.max(...planTimes) + SAMPLE_MIN * 60_000 : null;
      const hasPlan = planEndMs !== null && planEndMs > now.valueOf();
      const endMs = hasPlan ? Math.max(pastEndMs, planEndMs) : pastEndMs;

      if (
        startMs < endMs &&
        endMs > windowStart.valueOf() &&
        startMs < windowEnd.valueOf()
      ) {
        const socNow = s.socEnd ?? vehicle?.soc ?? s.socStart;
        const target = vehicle?.socCapPct ?? 100;
        // The plan's own 15-minute slots, in time order. The bar draws them
        // where they actually fall, so a pause shows up in the slot it happens
        // in rather than as a token marker.
        const planSlots =
          hasPlan && points?.length
            ? [...points]
                .map((p) => ({ ms: dayjs(p.time).valueOf(), limit: p.limit }))
                .filter((p) => p.ms + SAMPLE_MIN * 60_000 > now.valueOf())
                .sort((a, b) => a.ms - b.ms)
            : undefined;
        raw.push({
          key: `${s.id}-block`,
          startMs: Math.max(startMs, windowStart.valueOf()),
          endMs: Math.min(endMs, windowEnd.valueOf()),
          label: s.vehicleReg,
          kind: ongoing ? "ongoing" : "past",
          // Dummy history curve, scaled to the connector's actual rating. For a
          // live session the newest sample is the simulator's real draw, so the
          // curve ends where the site row and hub page say it does.
          power: (() => {
            const curve = pastCurve(s.id).map((f) => f * connectorKw(cp, s.connectorId));
            if (ongoing) curve[curve.length - 1] = sim.get(s.id)?.powerKw ?? 0;
            return curve;
          })(),
          ratedKw: connectorKw(cp, s.connectorId),
          socStart: s.socStart,
          socNow: hasPlan ? socNow : undefined,
          socEnd: hasPlan ? target : socNow,
          done: !ongoing,
          eta: hasPlan && planEndMs ? dayjs(planEndMs).format("h:mm a") : null,
          planSlots,
        });
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
        if (sStart <= ms && ms < sEnd) {
          // In the sample containing "now" the simulator has the actual draw.
          const live = !s.endTime && ms >= now.valueOf() - stepMs;
          kw += live ? (sim.get(s.id)?.powerKw ?? 0) : connectorKw(cp, s.connectorId);
        }
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
  /** Index of the site-power sample that contains "now" — where blue becomes orange. */
  const nowSampleIndex = Math.max(
    0,
    Math.floor((now.valueOf() - windowStart.valueOf()) / (SAMPLE_MIN * 60_000)),
  );

  const renderBlock = (b: Block) => {
    const left = xOf(b.startMs);
    const width = Math.max(10, xOf(b.endMs) - left);

    const clampPx = (px: number) => Math.max(0, Math.min(width, px));
    const nowPx = clampPx(nowX - left);

    // The bar is the session on the time axis, nothing else:
    //   dark green   plugged in → now, charging that has happened
    //   dark orange  now → end, the slots energy brain will charge in
    //   light orange the slots it deliberately pauses in
    // The SoC it arrived with has no place here — the vehicle was not charging
    // then, so any width for it would be invented time. It is in the header.
    const bar: { left: number; width: number; color: string }[] = [];
    if (nowPx > 0) bar.push({ left: 0, width: nowPx, color: GREEN });
    for (const slot of b.planSlots ?? []) {
      const from = clampPx(Math.max(xOf(slot.ms) - left, nowPx));
      const to = clampPx(xOf(slot.ms + SAMPLE_MIN * 60_000) - left);
      if (to <= from) continue;
      bar.push({
        left: from,
        width: to - from,
        color: slot.limit > 0 ? ORANGE : ORANGE_PALE,
      });
    }
    // How the plan is shaped, for the tooltip: how many stretches it charges in
    // and how many times it pauses.
    const stretches = (b.planSlots ?? []).reduce(
      (acc, slot) => {
        if (slot.limit > 0) {
          if (!acc.charging) acc.count += 1;
          acc.charging = true;
        } else {
          acc.charging = false;
        }
        return acc;
      },
      { count: 0, charging: false },
    ).count;

    return (
      <div
        key={b.key}
        style={{ position: "absolute", left, top: b.lane * LANE_HEIGHT + 6, width }}
        title={
          `${b.label} · ${dayjs(b.startMs).format("h:mm a")} – ${dayjs(b.endMs).format("h:mm a")}` +
          ` · SoC ${Math.round(b.socStart)}%` +
          (b.socNow != null ? ` → now ${Math.round(b.socNow)}%` : "") +
          ` → ${Math.round(b.socEnd)}%` +
          (stretches > 1
            ? ` · plan: ${stretches} charging stretches, ${stretches - 1} pause${
                stretches === 2 ? "" : "s"
              }`
            : b.planSlots?.length
              ? " · plan: charges straight through"
              : "") +
          ` · peak ${Math.max(...b.power).toFixed(1)} kW of ${b.ratedKw} kW connector`
        }
      >
        {/* Header line: plate, then where the charge is going. It lives above
            the curve instead of floating over the SoC bar, so nothing covers
            the bar and nothing spills into the next block — a narrow block just
            truncates, and the tooltip still carries the full detail. */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            height: LABEL_H,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              width: 12,
              height: 12,
              borderRadius: 3,
              fontSize: 8,
              fontWeight: 700,
              color: "white",
              background: b.done ? GREEN_DARK : b.socNow != null ? ORANGE : GREEN,
            }}
          >
            {b.done ? "✓" : "+"}
          </span>
          <span style={{ fontSize: 10, fontWeight: 600, color: "#4b5563" }}>{b.label}</span>
          {/* The SoC story, colour-coded the same way the bar is: where it
              plugged in (grey), where the charge has got to (green), where
              energy brain will take it (orange). SoC is a level, not a
              duration, so it is written here rather than drawn on the bar. */}
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            <span style={{ color: "#9ca3af" }}>{Math.round(b.socStart)}%</span>
            {b.socNow != null && (
              <>
                <span style={{ color: "#9ca3af" }}> → </span>
                <span style={{ color: GREEN }}>{Math.round(b.socNow)}%</span>
              </>
            )}
            <span style={{ color: "#9ca3af" }}> → </span>
            <span style={{ color: b.done ? GREEN_DARK : b.socNow != null ? ORANGE : GREEN }}>
              {Math.round(b.socEnd)}%{b.eta ? ` · ETA ${b.eta}` : ""}
            </span>
          </span>
        </div>

        {/* kW power curve — full scale is the connector's rating, so line
            height is comparable across blocks instead of self-normalized.
            Past draw is blue; where the plan takes over the line turns orange. */}
        {b.planSlots?.length && nowPx > 0 && nowPx < width ? (
          <div style={{ display: "flex", height: SPARK_H }}>
            <Sparkline
              values={b.power}
              color={BLUE}
              width={nowPx}
              height={SPARK_H}
              scaleMax={b.ratedKw}
            />
            <Sparkline
              values={b.planSlots.map((p) => p.limit)}
              color={ORANGE}
              width={width - nowPx}
              height={SPARK_H}
              scaleMax={b.ratedKw}
            />
          </div>
        ) : (
          <Sparkline
            values={b.power}
            color={BLUE}
            width={width}
            height={SPARK_H}
            scaleMax={b.ratedKw}
          />
        )}

        {/* The session on the time axis: green up to the "now" rule, then the
            plan's own slots — orange where it charges, pale where it pauses. */}
        <div
          style={{
            position: "relative",
            height: BAR_H,
            borderRadius: BAR_H / 2,
            background: "#e5e7eb",
            overflow: "hidden",
          }}
        >
          {bar.map((seg) => (
            <div
              key={`${seg.color}-${seg.left}`}
              style={{
                position: "absolute",
                left: seg.left,
                top: 0,
                bottom: 0,
                width: seg.width,
                background: seg.color,
              }}
            />
          ))}
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
      <Legend />
      {/* One scroll box for BOTH axes, so the calendar scrolls inside itself
          instead of stretching the page. The name column pins to the left and
          the hour ruler to the top, which is only possible while they share a
          single scrolling ancestor — hence one scroller rather than one per
          column. overscroll-behavior stops the page from taking over once this
          box reaches its end. */}
      <div
        ref={scrollRef}
        style={{
          maxHeight: BODY_MAX_H,
          overflow: "auto",
          overscrollBehavior: "contain",
        }}
      >
        <div style={{ display: "flex", width: "max-content", minWidth: "100%" }}>
          {/* Name column — pinned while the track scrolls under it */}
          <div
            style={{
              flex: `0 0 ${LEFT_COL_W}px`,
              width: LEFT_COL_W,
              borderRight: "1px solid #f0f0f0",
              position: "sticky",
              left: 0,
              // Above the now rule (5) and the hour ruler (2): the track has to
              // pass UNDER the names, not over them.
              zIndex: 6,
              background: "white",
            }}
          >
            <div
              style={{
                height: 34,
                borderBottom: "1px solid #f0f0f0",
                position: "sticky",
                top: 0,
                zIndex: 7,
                background: "white",
              }}
            />
            {hubGroups.map(([hub, cps]) => {
              const isCollapsed = collapsed[hub];
              const gridLimit = hubLimitKw(hub, cps);
              return (
                <div key={hub}>
                  <div
                    style={{
                      height: SITE_ROW_H,
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
                      {hubGridLimits[hub] === undefined ? "Limit" : "Grid"}{" "}
                      {Math.round(gridLimit)} kW
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

          {/* Timeline. Its width is the full track: the scroll box above owns
              both axes, so this column is laid out at natural size rather than
              flexing. */}
          <div style={{ width: totalWidth, position: "relative", flex: "0 0 auto" }}>
            {/* Hour ruler — pinned to the top of the scroll box */}
            <div
              style={{
                display: "flex",
                height: 34,
                borderBottom: "1px solid #f0f0f0",
                position: "sticky",
                top: 0,
                zIndex: 2,
                background: "white",
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
              const siteLimit = hubLimitKw(hub, cps);
              return (
                <div key={hub}>
                  {/* Site power curve across the whole timeline */}
                  <div
                    style={{
                      height: SITE_ROW_H,
                      backgroundColor: "#fafafa",
                      borderTop: "1px solid #f0f0f0",
                      borderBottom: "1px solid #f0f0f0",
                      position: "relative",
                    }}
                  >
                    {/* Same rule as the blocks: drawn load in blue up to now,
                        the optimizer's allocation in orange after it. */}
                    <div
                      style={{ position: "absolute", inset: 0, opacity: 0.9, display: "flex" }}
                    >
                      <Sparkline
                        values={values.slice(0, nowSampleIndex + 1)}
                        color={BLUE}
                        width={nowX}
                        height={SITE_ROW_H}
                        scaleMax={siteLimit}
                      />
                      <Sparkline
                        values={values.slice(nowSampleIndex)}
                        color={ORANGE}
                        width={Math.max(0, totalWidth - nowX)}
                        height={SITE_ROW_H}
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
              {/* The time chip rides the top of the scroll box, so the rule is
                  still labelled after scrolling down a few chargers. */}
              <div
                style={{
                  position: "sticky",
                  top: 2,
                  marginLeft: -30,
                  display: "inline-block",
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
