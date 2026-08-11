"use client";

// Shared header for both alert tabs (demo spec item 8): a total with severity
// chips on the left, and a "type breakdown" of horizontal bars on the right —
// the bars replace the donut the vehicle alerts page used to draw.

import { Card, Col, Row, Typography } from "antd";

const { Text, Title } = Typography;

export interface BreakdownRow {
  label: string;
  count: number;
  color: string;
}

export interface SeverityChip {
  label: string;
  count: number;
  color: string;
}

function Chip({ label, count, color }: SeverityChip) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 14px",
        borderRadius: 8,
        background: `${color}0D`,
        border: `1px solid ${color}33`,
      }}
    >
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
      <Text style={{ fontSize: 13, color }}>
        {label}: <strong>{count}</strong>
      </Text>
    </div>
  );
}

export default function WarningBreakdown({
  totalLabel,
  total,
  severities,
  rows,
  breakdownLabel = "Warning type breakdown",
}: {
  totalLabel: string;
  total: number;
  severities: SeverityChip[];
  rows: BreakdownRow[];
  breakdownLabel?: string;
}) {
  // Bars are scaled to the largest type so a single dominant type doesn't
  // squash the rest into invisibility.
  const max = Math.max(1, ...rows.map((r) => r.count));

  return (
    <Row gutter={16} style={{ marginBottom: 16 }}>
      <Col xs={24} md={10}>
        <Card
          style={{ borderRadius: 12, height: "100%", border: "1px solid #f0f0f0" }}
          styles={{ body: { padding: "20px 24px" } }}
        >
          <Text type="secondary" style={{ fontSize: 13 }}>
            {totalLabel}
          </Text>
          <Title level={2} style={{ margin: "4px 0 16px" }}>
            {total}
          </Title>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {severities.map((s) => (
              <Chip key={s.label} {...s} />
            ))}
          </div>
        </Card>
      </Col>

      <Col xs={24} md={14}>
        <Card
          style={{ borderRadius: 12, height: "100%", border: "1px solid #f0f0f0" }}
          styles={{ body: { padding: "20px 24px" } }}
        >
          <Text type="secondary" style={{ fontSize: 13, marginBottom: 12, display: "block" }}>
            {breakdownLabel}
          </Text>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {rows.map((r) => (
              <div key={r.label} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 168, fontSize: 13, color: "#374151" }}>{r.label}</div>
                <div style={{ flex: 1, minWidth: 60 }}>
                  <div
                    style={{
                      height: 6,
                      borderRadius: 3,
                      background: r.color,
                      width: `${(r.count / max) * 100}%`,
                      minWidth: 8,
                    }}
                  />
                </div>
                <div style={{ width: 28, textAlign: "right", fontSize: 13, color: "#374151" }}>
                  {r.count}
                </div>
              </div>
            ))}
            {rows.length === 0 && (
              <Text type="secondary" style={{ fontSize: 13 }}>
                No data
              </Text>
            )}
          </div>
        </Card>
      </Col>
    </Row>
  );
}
