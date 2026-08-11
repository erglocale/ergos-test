"use client";

// Charger "Overview" tab (demo spec item 7): at-a-glance health for one
// charger — 30-day uptime, 7-day throughput, the predicted-fault callout and a
// recent-error log where every row carries a recommended action.

import { WarningFilled } from "@ant-design/icons";
import { Button, Card, Progress, Table, Tag, Tooltip, Typography } from "antd";
import type { TableProps } from "antd";
import dayjs from "dayjs";
import { useMemo, useState } from "react";
import { useDb } from "@/data/store";
import type { Chargepoint } from "@/data/types";
import { type ChargerError, deriveChargerHealth } from "./chargerHealth";
import { deriveCharger } from "./derive";

const { Text } = Typography;

const GREEN = "#16a34a";
const AMBER = "#f59e0b";
const RED = "#ef4444";
const TEAL = "#0d9488";
const MUTED = "#6b7280";
const LINE = "#f0f0f0";

function Tile({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 12, color: MUTED, whiteSpace: "nowrap" }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, lineHeight: 1.25, marginTop: 2 }}>{value}</div>
      <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>{sub}</div>
    </div>
  );
}

function Section({
  title,
  extra,
  children,
}: {
  title: string;
  extra?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card
      style={{ borderRadius: 12, border: `1px solid ${LINE}`, marginBottom: 16 }}
      styles={{ body: { padding: 16 } }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: 12,
          marginBottom: 10,
        }}
      >
        <Text strong>{title}</Text>
        {extra}
      </div>
      {children}
    </Card>
  );
}

export default function ChargerOverview({ cp }: { cp: Chargepoint }) {
  const db = useDb();
  const [showAll, setShowAll] = useState(false);

  // Derived once per data change: the generated part is seeded on the charger
  // id, so it stays identical across renders.
  const health = useMemo(
    () => deriveChargerHealth(cp, db.sessions, db.chargerWarnings),
    [cp, db.sessions, db.chargerWarnings],
  );
  const derived = useMemo(() => deriveCharger(cp), [cp]);

  const ringColor = health.score >= 80 ? GREEN : health.score >= 60 ? AMBER : RED;
  const throughputPct =
    health.ratedKw > 0 ? Math.min(100, (health.actualKw / health.ratedKw) * 100) : 0;
  const throughputColor = throughputPct >= 70 ? GREEN : throughputPct >= 40 ? AMBER : RED;

  const columns: TableProps<ChargerError>["columns"] = [
    {
      title: "TIME",
      key: "time",
      width: 140,
      render: (_, e) => (
        <Text type="secondary" style={{ fontSize: 13, whiteSpace: "nowrap" }}>
          {dayjs(e.at).format("MMM D, h:mm a")}
        </Text>
      ),
    },
    {
      title: "WHAT HAPPENED",
      key: "what",
      render: (_, e) => (
        <div>
          <div style={{ fontSize: 13 }}>
            <span
              style={{
                display: "inline-block",
                width: 7,
                height: 7,
                borderRadius: "50%",
                marginRight: 8,
                background: e.severity === "session-ending" ? RED : AMBER,
              }}
            />
            {e.title}
          </div>
          <div
            style={{
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              fontSize: 11,
              color: "#9ca3af",
              marginLeft: 15,
            }}
          >
            {e.code}
          </div>
        </div>
      ),
    },
    {
      title: "RECOMMENDED ACTION",
      key: "action",
      width: 330,
      render: (_, e) => <span style={{ fontSize: 13, color: TEAL }}>{e.action}</span>,
    },
  ];

  const rows = showAll ? health.errors : health.errors.slice(0, 4);

  return (
    <div>
      {/* Charger identity + health score, mirroring the spec's header block. */}
      <Card
        style={{ borderRadius: 12, border: `1px solid ${LINE}`, marginBottom: 16 }}
        styles={{ body: { padding: 16 } }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
            flexWrap: "wrap",
            paddingBottom: 14,
            borderBottom: `1px solid ${LINE}`,
            marginBottom: 14,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <Text strong style={{ fontSize: 16 }}>
              {cp.name}
            </Text>
            <div style={{ fontSize: 12, color: MUTED, marginTop: 4 }}>
              {cp.status === "Online" ? (
                <Tag color="green">Online</Tag>
              ) : (
                <Tag color="red">Offline</Tag>
              )}
              {cp.hub} · {derived.kw} kW {derived.type} · {cp.connectors.length} connector
              {cp.connectors.length === 1 ? "" : "s"} · {derived.openTime} - {derived.closeTime}
            </div>
          </div>
          <Tooltip title="Composite of uptime, throughput against the rated power, and faults in the last 30 days">
            <div style={{ flexShrink: 0 }}>
              <Progress
                type="circle"
                size={72}
                percent={health.score}
                strokeColor={ringColor}
                format={() => (
                  <div style={{ lineHeight: 1.15 }}>
                    <div style={{ fontSize: 19, fontWeight: 700, color: "#111827" }}>
                      {health.score}
                    </div>
                    <div style={{ fontSize: 8, color: "#9ca3af", letterSpacing: 0.6 }}>HEALTH</div>
                  </div>
                )}
              />
            </div>
          </Tooltip>
        </div>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Tile
            label="Uptime (30d)"
            value={`${health.uptimePct.toFixed(1)}%`}
            sub={`${health.uptimeDeltaPct >= 0 ? "Up" : "Down"} ${Math.abs(
              health.uptimeDeltaPct,
            ).toFixed(1)}% from last month`}
          />
          <Tile
            label="Sessions (7d)"
            value={`${health.sessions7d}`}
            sub={`${health.sessionsPerDay} per day avg`}
          />
          <Tile
            label="Energy delivered (7d)"
            value={`${health.energy7dKwh.toFixed(1)} kWh`}
            sub={`${health.energyPerDayKwh.toFixed(1)} kWh/day avg`}
          />
          <Tile
            label="Faults (30d)"
            value={`${health.faults30d}`}
            sub={`${health.faultsSessionEnding} session-ending, ${health.faultsMinor} minor`}
          />
        </div>
      </Card>

      {health.prediction && (
        <div
          style={{
            background: "#fffbeb",
            border: "1px solid #fde68a",
            borderRadius: 12,
            padding: "12px 16px",
            marginBottom: 16,
            display: "flex",
            gap: 10,
          }}
        >
          <WarningFilled style={{ color: AMBER, marginTop: 3, flexShrink: 0 }} />
          <div>
            <div style={{ fontWeight: 600, fontSize: 13, color: "#92400e" }}>
              {health.prediction.title}
            </div>
            <div style={{ fontSize: 12, color: "#78350f", marginTop: 2 }}>
              {health.prediction.body}
            </div>
          </div>
        </div>
      )}

      <Section
        title="Throughput efficiency"
        extra={
          <Text type="secondary" style={{ fontSize: 12 }}>
            Last 7 days avg
          </Text>
        }
      >
        <div
          style={{
            height: 8,
            borderRadius: 4,
            background: "#f1f5f9",
            marginBottom: 8,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${throughputPct}%`,
              height: "100%",
              borderRadius: 4,
              background: throughputColor,
              transition: "width 0.3s ease",
            }}
          />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, gap: 12 }}>
          <span style={{ color: MUTED }}>
            Actual: <b style={{ color: throughputColor }}>{health.actualKw.toFixed(1)} kW</b> avg
          </span>
          <span style={{ color: MUTED }}>Rated: {health.ratedKw} kW</span>
        </div>
      </Section>

      <Section
        title="Recent errors"
        extra={
          health.errors.length > 4 ? (
            <Button type="link" style={{ padding: 0 }} onClick={() => setShowAll((v) => !v)}>
              {showAll ? "Show less" : `View all (${health.errors.length}) →`}
            </Button>
          ) : (
            <Text type="secondary" style={{ fontSize: 12 }}>
              Last 30 days
            </Text>
          )
        }
      >
        <Table<ChargerError>
          columns={columns}
          dataSource={rows}
          rowKey="id"
          size="small"
          pagination={false}
          scroll={{ x: "max-content" }}
          locale={{ emptyText: "No errors recorded in the last 30 days." }}
        />
      </Section>
    </div>
  );
}
