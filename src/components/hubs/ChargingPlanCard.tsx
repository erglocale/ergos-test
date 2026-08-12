"use client";

// Charging plan for a hub (demo spec item 5).
//
// Per vehicle the fleet manager sets either a weekly ready-time schedule
// (Sun–Sat, any day can be N/A when there is no run that day) or FIFO, plus a
// required SoC that can be a number or "Optimize" — meaning the suggestions
// engine's cap is handed to the optimizer instead of a fixed target.
// The old ready-times/FIFO buttons above the table are gone: the table always
// shows, and the mode is a per-vehicle choice.

import { Button, InputNumber, Popover, Select, Table, Tag, TimePicker, Tooltip, Typography } from "antd";
import type { TableProps } from "antd";
import dayjs from "dayjs";
import { useEffect, useMemo, useState } from "react";
import VehiclePhoto from "@/components/vehicles/vehiclePhoto";
import { setVehicleSocCap, useDb } from "@/data/store";
import type { Suggestion, Vehicle } from "@/data/types";
import { message } from "@/lib/antdStatic";

const { Text } = Typography;

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const TIME_FORMAT = "h:mm a";
/** Stored as 24-hour "HH:mm"; null means N/A (no run that day). */
const STORE_FORMAT = "HH:mm";

export type ReadyMode = "schedule" | "fifo";
/** A number is a fixed required SoC; "optimize" defers to the suggestions cap. */
export type TargetSoc = number | "optimize";

export interface PlanRow {
  mode: ReadyMode;
  /** Sun..Sat, "HH:mm" or null for N/A. */
  readyTimes: (string | null)[];
  targetSoc: TargetSoc;
}

export type HubPlan = Record<string, PlanRow>;

export function planKey(hub: string) {
  return `ergos-test:hub-plan:v2:${hub}`;
}

function defaultRow(v: Vehicle): PlanRow {
  // Weekdays out at 9, Saturday later, Sunday off — a plausible depot week.
  return {
    mode: "schedule",
    readyTimes: [null, "09:00", "09:00", "09:00", "09:00", "09:00", "10:00"],
    targetSoc: v.socCapPct,
  };
}

function fmt(t: string | null) {
  return t ? dayjs(t, STORE_FORMAT).format(TIME_FORMAT) : "N/A";
}

/** "Mon–Fri 9:00 am · Sat 10:00 am · Sun N/A" — consecutive equal days merged. */
function summarise(times: (string | null)[]): string {
  const parts: string[] = [];
  let from = 0;
  for (let i = 1; i <= 6; i += 1) {
    if (times[i] !== times[from]) {
      parts.push(`${from === i - 1 ? DAYS[from] : `${DAYS[from]}–${DAYS[i - 1]}`} ${fmt(times[from])}`);
      from = i;
    }
  }
  parts.push(`${from === 6 ? DAYS[6] : `${DAYS[from]}–${DAYS[6]}`} ${fmt(times[from])}`);
  return parts.join(" · ");
}

function WeekEditor({
  times,
  onChange,
}: {
  times: (string | null)[];
  onChange: (next: (string | null)[]) => void;
}) {
  const set = (day: number, value: string | null) => {
    const next = [...times];
    next[day] = value;
    onChange(next);
  };
  return (
    <div style={{ width: 230 }}>
      {DAYS.map((d, i) => (
        <div
          key={d}
          style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0" }}
        >
          <span style={{ width: 34, fontSize: 12, color: "#666" }}>{d}</span>
          <TimePicker
            size="small"
            allowClear
            minuteStep={15}
            format={TIME_FORMAT}
            use12Hours
            placeholder="N/A"
            style={{ width: 120 }}
            value={times[i] ? dayjs(times[i], STORE_FORMAT) : null}
            onChange={(v) => set(i, v ? v.format(STORE_FORMAT) : null)}
          />
          {i === 0 && (
            <Tooltip title="Copy this time to every day">
              <Button
                size="small"
                type="link"
                style={{ padding: 0 }}
                onClick={() => onChange(new Array(7).fill(times[0]))}
              >
                All
              </Button>
            </Tooltip>
          )}
        </div>
      ))}
      <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>
        Clear a day to mark it N/A — no charge deadline that day.
      </div>
    </div>
  );
}

export default function ChargingPlanCard({
  hub,
  vehicles,
  extra,
}: {
  hub: string;
  vehicles: Vehicle[];
  /** Rendered top-right, where the ready-times/FIFO buttons used to be. */
  extra?: React.ReactNode;
}) {
  const db = useDb();
  const [rows, setRows] = useState<HubPlan>({});

  // "Optimize" is not a vague promise: it resolves to the SoC cap the
  // suggestions engine published for that vehicle, and that cap is what the
  // optimizer charges to. The newest window wins if a vehicle has several.
  const suggestionByReg = useMemo(() => {
    const map = new Map<string, Suggestion>();
    for (const s of db.suggestions) {
      const prev = map.get(s.vehicleReg);
      if (!prev || dayjs(s.windowTo).isAfter(dayjs(prev.windowTo))) map.set(s.vehicleReg, s);
    }
    return map;
  }, [db.suggestions]);

  const suggestedCap = (v: Vehicle): number | null =>
    suggestionByReg.get(v.reg)?.suggestedCapPct ?? null;

  // localStorage can only be read after mount (this page is pre-rendered on the
  // server), so the saved plan necessarily arrives in an effect.
  useEffect(() => {
    let next: HubPlan = {};
    try {
      const raw = window.localStorage.getItem(planKey(hub));
      if (raw) next = JSON.parse(raw) as HubPlan;
    } catch {
      // corrupt plan — fall back to defaults
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydration-safe load
    setRows(next);
  }, [hub]);

  const rowFor = (v: Vehicle): PlanRow => rows[v.reg] ?? defaultRow(v);
  const patch = (v: Vehicle, p: Partial<PlanRow>) =>
    setRows((r) => ({ ...r, [v.reg]: { ...rowFor(v), ...p } }));

  /** The % the optimizer will actually charge this vehicle to. */
  const effectiveTarget = (v: Vehicle, row: PlanRow): number =>
    row.targetSoc === "optimize" ? (suggestedCap(v) ?? v.socCapPct) : row.targetSoc;

  const savePlan = () => {
    // Persist a full row per vehicle so defaults don't drift if the fixtures
    // change later.
    const complete: HubPlan = {};
    for (const v of vehicles) complete[v.reg] = rowFor(v);
    window.localStorage.setItem(planKey(hub), JSON.stringify(complete));
    setRows(complete);

    // Saving is what makes the plan real: the resolved target becomes the
    // vehicle's SoC cap, which is the target the charging simulation and the
    // optimizer's schedule both charge to. setVehicleSocCap routes energy-brain's
    // own vehicles through the sandbox override layer, since a write to its rows
    // would be undone by the next poll.
    let applied = 0;
    for (const v of vehicles) {
      const target = effectiveTarget(v, complete[v.reg]);
      if (target !== v.socCapPct) {
        setVehicleSocCap(v.id, target);
        applied += 1;
      }
    }

    const optimized = vehicles.filter((v) => complete[v.reg].targetSoc === "optimize").length;
    const fifo = vehicles.filter((v) => complete[v.reg].mode === "fifo").length;
    const parts: string[] = [];
    parts.push(
      fifo === vehicles.length
        ? "every vehicle charges first-in-first-out"
        : fifo > 0
          ? `${fifo} vehicle${fifo === 1 ? "" : "s"} on FIFO, the rest on ready times`
          : "ready times will drive the energy-brain schedule",
    );
    if (optimized > 0) {
      parts.push(
        `${optimized} on the suggested SoC cap`,
      );
    }
    if (applied > 0) {
      parts.push(`${applied} target${applied === 1 ? "" : "s"} updated`);
    }
    message.success(`Saved — ${parts.join(", ")}.`);
  };

  const columns: TableProps<Vehicle>["columns"] = [
    {
      title: "Vehicle",
      dataIndex: "reg",
      key: "reg",
      width: 190,
      render: (reg: string, v) => (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <VehiclePhoto vehicle={v} width={52} height={36} radius={6} />
          <div style={{ minWidth: 0 }}>
            <Text strong>{reg}</Text>
            <div style={{ fontSize: 11, color: "#94a3b8" }}>{`${v.make} ${v.model}`.trim()}</div>
          </div>
        </div>
      ),
    },
    {
      title: "Ready by",
      key: "ready",
      render: (_, v) => {
        const row = rowFor(v);
        return (
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <Select
              size="small"
              style={{ width: 120 }}
              value={row.mode}
              onChange={(mode: ReadyMode) => patch(v, { mode })}
              options={[
                { value: "schedule", label: "Weekly times" },
                { value: "fifo", label: "FIFO" },
              ]}
            />
            {row.mode === "fifo" ? (
              <Text type="secondary" style={{ fontSize: 12 }}>
                Charges in plug-in order
              </Text>
            ) : (
              <Popover
                trigger="click"
                placement="bottomLeft"
                title="Ready time per day"
                content={
                  <WeekEditor
                    times={row.readyTimes}
                    onChange={(readyTimes) => patch(v, { readyTimes })}
                  />
                }
              >
                <Button size="small" type="link" style={{ padding: 0, fontSize: 12 }}>
                  {summarise(row.readyTimes)}
                </Button>
              </Popover>
            )}
          </div>
        );
      },
    },
    {
      title: "Required SoC",
      key: "target",
      width: 300,
      render: (_, v) => {
        const row = rowFor(v);
        const optimize = row.targetSoc === "optimize";
        const cap = suggestedCap(v);
        return (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Select
              size="small"
              style={{ width: 104 }}
              value={optimize ? "optimize" : "fixed"}
              onChange={(v2) => patch(v, { targetSoc: v2 === "optimize" ? "optimize" : v.socCapPct })}
              options={[
                { value: "fixed", label: "Set %" },
                { value: "optimize", label: "Optimize" },
              ]}
            />
            {optimize ? (
              cap === null ? (
                <Tooltip title="No SoC cap has been published for this vehicle yet, so the optimizer charges to the vehicle's own smart charge limit.">
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    From EV smart charge limit · {Math.round(v.socCapPct)}%
                  </Text>
                </Tooltip>
              ) : (
                <Tooltip
                  title={`Suggested SoC cap for ${v.reg}. Saving the plan makes this the optimizer's target.`}
                >
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <Text strong style={{ fontSize: 13 }}>
                      {Math.round(cap)}%
                    </Text>
                    <Tag color="gold" style={{ marginInlineEnd: 0 }}>
                      suggested
                    </Tag>
                    {Math.round(cap) !== Math.round(v.socCapPct) && (
                      <Text type="secondary" style={{ fontSize: 11 }}>
                        now {Math.round(v.socCapPct)}%
                      </Text>
                    )}
                  </span>
                </Tooltip>
              )
            ) : (
              <InputNumber
                size="small"
                min={20}
                max={100}
                style={{ width: 84 }}
                value={row.targetSoc as number}
                formatter={(val) => `${val}%`}
                parser={(val) => Number((val ?? "").replace("%", ""))}
                onChange={(val) => patch(v, { targetSoc: Number(val ?? 100) })}
              />
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <Text strong>Charging plan</Text>
          <div style={{ fontSize: 12, color: "#888" }}>
            Each vehicle charges to its required SoC before its ready time, or in plug-in order on
            FIFO. &quot;Optimize&quot; hands the vehicle&apos;s suggested SoC cap to the optimizer.
          </div>
        </div>
        {extra}
      </div>

      <Table
        style={{ marginTop: 12 }}
        size="small"
        pagination={false}
        rowKey="id"
        dataSource={vehicles}
        columns={columns}
      />

      <div style={{ marginTop: 12, textAlign: "right" }}>
        <Button type="primary" style={{ background: "#f97316" }} onClick={savePlan}>
          Save plan
        </Button>
      </div>
    </div>
  );
}
