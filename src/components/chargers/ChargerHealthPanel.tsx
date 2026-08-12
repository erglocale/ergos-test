"use client";

// Health + recent errors for one charger, shown at the bottom of the charger's
// Details tab (demo spec item 7): a health ring on the left, and an error log
// on the right where every row carries the action to take. The predicted-fault
// callout sits above them, because the error rows refer back to it.

import { WarningFilled } from "@ant-design/icons";
import { Button, Card, Progress, Table, Tooltip, Typography } from "antd";
import type { TableProps } from "antd";
import dayjs from "dayjs";
import { useMemo, useState } from "react";
import { useDb } from "@/data/store";
import type { Chargepoint } from "@/data/types";
import { type ChargerError, deriveChargerHealth } from "./chargerHealth";

const { Text } = Typography;

const GREEN = "#16a34a";
const AMBER = "#f59e0b";
const RED = "#ef4444";
const TEAL = "#0d9488";
const LINE = "#f0f0f0";

export default function ChargerHealthPanel({ cp }: { cp: Chargepoint }) {
  const db = useDb();
  const [showAll, setShowAll] = useState(false);

  // Derived once per data change: the generated part is seeded on the charger
  // id, so it stays identical across renders.
  const health = useMemo(
    () => deriveChargerHealth(cp, db.sessions, db.chargerWarnings),
    [cp, db.sessions, db.chargerWarnings],
  );

  const ringColor = health.score >= 80 ? GREEN : health.score >= 60 ? AMBER : RED;

  const columns: TableProps<ChargerError>["columns"] = [
    {
      title: "TIME",
      key: "time",
      width: 130,
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
      width: 300,
      render: (_, e) => <span style={{ fontSize: 13, color: TEAL }}>{e.action}</span>,
    },
  ];

  const rows = showAll ? health.errors : health.errors.slice(0, 4);

  return (
    <div style={{ marginTop: 20 }}>
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

      <div className="flex flex-col gap-4 lg:flex-row">
        {/* Health ring */}
        <Card
          style={{ borderRadius: 12, border: `1px solid ${LINE}`, flex: "0 0 260px" }}
          styles={{
            body: {
              padding: 24,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              minHeight: 220,
            },
          }}
        >
          <Tooltip title="Composite of uptime, throughput against the rated power, and faults in the last 30 days">
            <Progress
              type="circle"
              size={150}
              percent={health.score}
              strokeColor={ringColor}
              strokeWidth={9}
              format={() => (
                <div style={{ lineHeight: 1.1 }}>
                  <div style={{ fontSize: 40, fontWeight: 700, color: "#111827" }}>
                    {health.score}
                  </div>
                  <div style={{ fontSize: 11, color: "#9ca3af", letterSpacing: 1.5 }}>
                    HEALTH
                  </div>
                </div>
              )}
            />
          </Tooltip>
        </Card>

        {/* Recent errors */}
        <Card
          style={{ borderRadius: 12, border: `1px solid ${LINE}`, flex: 1, minWidth: 0 }}
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
            <Text strong>Recent errors</Text>
            {health.errors.length > 4 ? (
              <Button type="link" style={{ padding: 0 }} onClick={() => setShowAll((v) => !v)}>
                {showAll ? "Show less" : `View all (${health.errors.length}) →`}
              </Button>
            ) : (
              <Text type="secondary" style={{ fontSize: 12 }}>
                Last 30 days
              </Text>
            )}
          </div>
          <Table<ChargerError>
            columns={columns}
            dataSource={rows}
            rowKey="id"
            size="small"
            pagination={false}
            scroll={{ x: "max-content" }}
            locale={{ emptyText: "No errors recorded in the last 30 days." }}
          />
        </Card>
      </div>
    </div>
  );
}
