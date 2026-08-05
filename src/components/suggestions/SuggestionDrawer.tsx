"use client";

import { Button, Drawer, Empty, Tag, Typography } from "antd";
import ReactECharts from "echarts-for-react";
import { useState } from "react";
import ConfirmAcceptDialog from "./ConfirmAcceptDialog";
import type { CapRow, NudgeRow } from "./derive";

const { Text } = Typography;
const ORANGE = "#F26E21";
const ORANGE_SOFT = "#FBC9A6";
const GRAY = "#e5e7eb";
const RED = "#ef4444";
const GREEN = "#16a34a";

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 28 }}>
      <Text strong style={{ display: "block", marginBottom: 10 }}>
        {title}
      </Text>
      {children}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        padding: "6px 0",
        borderBottom: `1px solid ${GRAY}`,
      }}
    >
      <Text type="secondary">{label}</Text>
      <Text strong>{value}</Text>
    </div>
  );
}

function fmtTimeAgo(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const mins = Math.max(
      0,
      Math.round((Date.now() - new Date(iso).getTime()) / 60000),
    );
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins} min ago`;
    return `${Math.round(mins / 60)} h ago`;
  } catch {
    return "—";
  }
}

// Realtime charging-nudge detail: why this vehicle should plug in now, how much
// it would gain (SOC → cap bar), and whether it'll fully top up before it leaves.
function ChargingDetail({ record }: { record: NudgeRow }) {
  const soc = record.soc;
  const cap = record.targetCap != null ? record.targetCap : 100;
  const gain = soc != null ? Math.max(0, Math.round(cap - soc)) : null;
  const slack = record.slackMin;
  const urgent = record.reason && record.reason.includes("low");

  return (
    <>
      <Section title="Suggestion">
        <div style={{ fontSize: 20, fontWeight: 700, color: ORANGE }}>
          Plug in now
        </div>
        <Text type="secondary">at {record.hub || "the depot"}</Text>
        <div style={{ marginTop: 8 }}>
          <Tag color={urgent ? "red" : "orange"}>{record.reason}</Tag>
          {record.rank ? <Tag color="default">priority #{record.rank}</Tag> : null}
        </div>
      </Section>

      {soc != null ? (
        <Section title="Charge to target">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginBottom: 6,
            }}
          >
            <Text type="secondary">Now {Math.round(soc)}%</Text>
            <Text type="secondary">Target {Math.round(cap)}%</Text>
          </div>
          {/* SOC bar: solid = current charge, soft = the top-up this nudge adds */}
          <div
            style={{
              position: "relative",
              height: 18,
              background: GRAY,
              borderRadius: 9,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                bottom: 0,
                width: `${Math.min(100, soc)}%`,
                background: ORANGE,
              }}
            />
            <div
              style={{
                position: "absolute",
                left: `${Math.min(100, soc)}%`,
                top: 0,
                bottom: 0,
                width: `${Math.max(0, Math.min(100, cap) - Math.min(100, soc))}%`,
                background: ORANGE_SOFT,
              }}
            />
          </div>
          <Text
            type="secondary"
            style={{ fontSize: 12, display: "block", marginTop: 6 }}
          >
            {gain && gain > 0
              ? `Topping up about ${gain}% to reach the ${Math.round(cap)}% ceiling.`
              : "Already at the target ceiling."}
          </Text>
        </Section>
      ) : null}

      {slack != null ? (
        <Section title="Will it finish in time?">
          <div
            style={{
              fontSize: 16,
              fontWeight: 700,
              color: slack >= 0 ? GREEN : RED,
            }}
          >
            {slack >= 0
              ? `~${Math.round(slack)} min to spare`
              : `~${Math.abs(Math.round(slack))} min short`}
          </div>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {slack >= 0
              ? "Expected to reach the target before its usual departure for this hour."
              : "Predicted to leave before a full top-up — it still gets a useful partial charge now."}
          </Text>
        </Section>
      ) : null}

      <Section title="Details">
        {record.hubDistanceKm != null ? (
          <Fact
            label="Distance to hub"
            value={`${record.hubDistanceKm.toFixed(2)} km`}
          />
        ) : null}
        {record.targetCap != null ? (
          <Fact label="Charge ceiling" value={`${Math.round(record.targetCap)}%`} />
        ) : null}
        {record.rank != null ? <Fact label="Priority" value={`#${record.rank}`} /> : null}
        <Fact label="Suggested" value={fmtTimeAgo(record.createdAt)} />
      </Section>
    </>
  );
}

// SOC-cap detail: the suggestion + the "how low can we cap" sweep chart.
function CapDetail({
  record,
  onApply,
  chartReady,
}: {
  record: CapRow;
  onApply: (record: CapRow) => void;
  chartReady: boolean;
}) {
  const sl = record.socLimit;
  const cap = record.details?.cap;
  const sweep = cap?.sweep || [];

  const [confirmOpen, setConfirmOpen] = useState(false);

  const vehicleLabel = record.label || `EV ${record.evId}`;

  const handleApply = () => {
    onApply(record);
    setConfirmOpen(false);
  };

  const sweepOption = {
    grid: { top: 24, right: 24, bottom: 28, left: 40 },
    tooltip: {
      trigger: "item",
      formatter: (p: { name: string; value: number }) =>
        `Cap ${p.name}%<br/>Impact: ${p.value}% extra top-up days`,
    },
    xAxis: {
      type: "category",
      data: sweep.map((d) => String(d.cap)),
      axisLabel: { fontSize: 11, formatter: (c: string) => `${c}%` },
      axisTick: { show: false },
    },
    yAxis: {
      type: "value",
      axisLabel: { fontSize: 11, formatter: (v: number) => `${v}%` },
      splitLine: { lineStyle: { type: "dashed" } },
    },
    series: [
      {
        type: "bar",
        data: sweep.map((d) => ({
          value: d.added_pct,
          itemStyle: {
            color: d.cap === cap?.lowest_safe_cap ? ORANGE : GRAY,
            borderRadius: [3, 3, 0, 0],
          },
        })),
        markLine:
          cap?.tolerance_pct != null
            ? {
                silent: true,
                symbol: "none",
                lineStyle: { color: RED, type: "dashed", width: 1 },
                label: {
                  formatter: "tolerance",
                  position: "insideEndTop",
                  fontSize: 10,
                  color: RED,
                },
                data: [{ yAxis: cap.tolerance_pct }],
              }
            : undefined,
      },
    ],
  };

  return (
    <>
      <Section title="Suggestion">
        {sl?.suggested_cap != null ? (
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, color: ORANGE }}>
              Limit SOC to {sl.suggested_cap}%
            </div>
            <Text type="secondary">
              Lowest safe cap {sl.lowest_safe_cap}%
              {cap?.operating_days ? ` · ${cap.operating_days} days seen` : ""}
            </Text>
            <div style={{ marginTop: 14 }}>
              <Button
                type="primary"
                onClick={() => setConfirmOpen(true)}
                style={{ background: ORANGE, borderColor: ORANGE }}
              >
                Accept &amp; apply {sl.suggested_cap}% limit
              </Button>
            </div>
          </div>
        ) : (
          <Text type="secondary">No SOC-cap suggestion.</Text>
        )}
      </Section>

      <ConfirmAcceptDialog
        open={confirmOpen}
        label={vehicleLabel}
        cap={sl?.suggested_cap}
        onConfirm={handleApply}
        onCancel={() => setConfirmOpen(false)}
      />

      {sweep.length ? (
        <Section title="How low can we safely cap?">
          {/* Mount the chart only after the drawer's open animation so echarts
              never measures a 0-width container. */}
          <div style={{ height: 220 }}>
            {chartReady && (
              <ReactECharts option={sweepOption} style={{ height: 220 }} />
            )}
          </div>
          <Text type="secondary" style={{ fontSize: 11 }}>
            Highlighted bar = lowest safe cap ({cap?.lowest_safe_cap}%). The
            suggested {sl?.suggested_cap}% adds a safety buffer on top.
          </Text>
        </Section>
      ) : null}
    </>
  );
}

export type DrawerRecord =
  | (NudgeRow & { kind: "charge" })
  | (CapRow & { kind: "cap" });

export default function SuggestionDrawer({
  record,
  open,
  onClose,
  onApply,
}: {
  record: DrawerRecord | null;
  open: boolean;
  onClose: () => void;
  onApply: (record: CapRow) => void;
}) {
  const [chartReady, setChartReady] = useState(false);
  return (
    <Drawer
      title={record ? record.label || `EV ${record.evId}` : ""}
      placement="right"
      styles={{ wrapper: { width: 520 } }}
      open={open}
      onClose={onClose}
      afterOpenChange={(isOpen) => setChartReady(isOpen)}
    >
      {!record ? null : record.kind === "charge" ? (
        <ChargingDetail record={record} />
      ) : !record.details ? (
        <Empty description="No supporting data — regenerate suggestions to populate the chart." />
      ) : (
        <CapDetail record={record} onApply={onApply} chartReady={chartReady} />
      )}
    </Drawer>
  );
}
