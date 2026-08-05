"use client";

import {
  Button,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography,
  message,
} from "antd";
import type { TableProps } from "antd";
import { useMemo, useState } from "react";
import ConfirmAcceptDialog from "@/components/suggestions/ConfirmAcceptDialog";
import type { CapRow, NudgeRow } from "@/components/suggestions/derive";
import { deriveCapRows, deriveNudges } from "@/components/suggestions/derive";
import SuggestionDrawer, {
  DrawerRecord,
} from "@/components/suggestions/SuggestionDrawer";
import { updateRow, useDb } from "@/data/store";

const { Title, Text } = Typography;
const ORANGE = "#F26E21";

// ---- Charging tab: live "plug in now" nudges (the realtime suggestion) ----
function timeAgo(iso: string | null | undefined): string {
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

const nudgeColumns: TableProps<NudgeRow>["columns"] = [
  {
    title: "Vehicle",
    dataIndex: "label",
    key: "label",
    render: (label: string, row) => (
      <span style={{ fontWeight: 600 }}>{label || `EV ${row.evId}`}</span>
    ),
  },
  {
    title: "Plug in at",
    dataIndex: "hub",
    key: "hub",
    render: (hub: string) => <Text>{hub || "—"}</Text>,
  },
  {
    title: "SOC",
    key: "soc",
    render: (_v, row) =>
      row.soc != null ? (
        <span style={{ fontWeight: 600 }}>{Math.round(row.soc)}%</span>
      ) : (
        "—"
      ),
  },
  {
    title: "Why",
    key: "reason",
    render: (_v, row) => (
      <Tag color={row.reason && row.reason.includes("low") ? "red" : "orange"}>
        {row.reason}
      </Tag>
    ),
  },
  {
    title: "Suggested",
    key: "when",
    render: (_v, row) => (
      <Text type="secondary" style={{ fontSize: 12 }}>
        {timeAgo(row.createdAt)}
      </Text>
    ),
  },
];

function ChargingTab({
  nudges,
  onRowClick,
}: {
  nudges: NudgeRow[];
  onRowClick: (row: NudgeRow) => void;
}) {
  return (
    <div>
      <Text
        type="secondary"
        style={{ display: "block", marginBottom: 10, fontSize: 13 }}
      >
        Live recommendations — vehicles that should plug in now (updates as they
        return to the depot). Click a row for the details.
      </Text>
      <Table
        rowKey="evId"
        size="middle"
        columns={nudgeColumns}
        dataSource={nudges}
        pagination={false}
        scroll={{ x: "max-content" }}
        locale={{ emptyText: "No vehicles need charging right now." }}
        onRow={(record) => ({
          onClick: () => onRowClick(record),
          style: { cursor: "pointer" },
        })}
      />
    </div>
  );
}

// ---- SOC Cap tab: offline cap suggestion ----
function formatUpdated(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return "—";
  }
}

function CapTab({
  rows,
  onRowClick,
  onApply,
}: {
  rows: CapRow[];
  onRowClick: (row: CapRow) => void;
  onApply: (row: CapRow) => void;
}) {
  const [acceptTarget, setAcceptTarget] = useState<CapRow | null>(null);

  const targetLabel = acceptTarget
    ? acceptTarget.label || `EV ${acceptTarget.evId}`
    : "";

  const handleApply = () => {
    if (acceptTarget?.socLimit?.suggested_cap == null) return;
    onApply(acceptTarget);
    setAcceptTarget(null);
  };

  const capColumns: TableProps<CapRow>["columns"] = [
    {
      title: "Vehicle",
      dataIndex: "label",
      key: "label",
      render: (label: string, row) => (
        <span style={{ fontWeight: 600 }}>{label || `EV ${row.evId}`}</span>
      ),
    },
    {
      title: "Suggested SOC cap",
      key: "cap",
      render: (_v, row) =>
        row.socLimit?.suggested_cap != null ? (
          <span style={{ fontWeight: 600, color: ORANGE }}>
            {row.socLimit.suggested_cap}%
          </span>
        ) : (
          <Text type="secondary">No cap</Text>
        ),
    },
    {
      title: "Status",
      key: "status",
      render: (_v, row) => (
        <Tag
          color={
            row.status === "Applied"
              ? "green"
              : row.status === "Dismissed"
                ? "default"
                : "orange"
          }
        >
          {row.status}
        </Tag>
      ),
    },
    {
      title: "Updated",
      key: "updated",
      render: (_v, row) => (
        <Tooltip
          title={
            row.windowFrom && row.windowTo
              ? `Learned from ${row.windowFrom} → ${row.windowTo}`
              : ""
          }
        >
          <Text type="secondary" style={{ fontSize: 12 }}>
            {formatUpdated(row.computedAt)}
          </Text>
        </Tooltip>
      ),
    },
    {
      title: "",
      key: "accept",
      align: "right",
      render: (_v, row) =>
        row.socLimit?.suggested_cap != null && row.status === "New" ? (
          <span onClick={(e) => e.stopPropagation()}>
            <Button
              size="small"
              type="primary"
              style={{ background: ORANGE, borderColor: ORANGE }}
              onClick={() => setAcceptTarget(row)}
            >
              Accept
            </Button>
          </span>
        ) : null,
    },
  ];

  return (
    <div>
      <Table
        rowKey="suggestionId"
        size="middle"
        columns={capColumns}
        dataSource={rows}
        pagination={false}
        scroll={{ x: "max-content" }}
        locale={{
          emptyText:
            "No SOC-cap suggestions yet. Generate and publish them from the analytics Suggestions tab.",
        }}
        onRow={(record) => ({
          onClick: () => onRowClick(record),
          style: { cursor: "pointer" },
        })}
      />

      <ConfirmAcceptDialog
        open={!!acceptTarget}
        label={targetLabel}
        cap={acceptTarget?.socLimit?.suggested_cap}
        onConfirm={handleApply}
        onCancel={() => setAcceptTarget(null)}
      />
    </div>
  );
}

export default function Suggestions() {
  const db = useDb();
  const [selected, setSelected] = useState<DrawerRecord | null>(null);
  const [messageApi, contextHolder] = message.useMessage();

  const nudges = useMemo(() => deriveNudges(db.vehicles), [db.vehicles]);
  const capRows = useMemo(() => deriveCapRows(db), [db]);

  const applySuggestion = (row: CapRow) => {
    if (row.socLimit?.suggested_cap == null) return;
    updateRow("suggestions", row.suggestionId, { status: "Applied" });
    const vehicle = db.vehicles.find((v) => v.reg === row.label);
    if (vehicle) {
      updateRow("vehicles", vehicle.id, {
        socCapPct: row.socLimit.suggested_cap,
      });
    }
    messageApi.success(
      `Charge limit set to ${row.socLimit.suggested_cap}% for ${row.label || `EV ${row.evId}`}`,
    );
    setSelected(null);
  };

  const tabs = [
    {
      key: "charging",
      label: "Charging",
      children: (
        <ChargingTab
          nudges={nudges}
          onRowClick={(row) => setSelected({ ...row, kind: "charge" })}
        />
      ),
    },
    {
      key: "cap",
      label: "SOC Cap",
      children: (
        <CapTab
          rows={capRows}
          onRowClick={(row) => setSelected({ ...row, kind: "cap" })}
          onApply={applySuggestion}
        />
      ),
    },
  ];

  return (
    <div style={{ marginLeft: 16, marginRight: 16 }}>
      {contextHolder}
      <Title level={3} style={{ marginBottom: 2 }}>
        Charging Suggestions
      </Title>

      <div style={{ marginTop: 8 }}>
        <Tabs defaultActiveKey="charging" items={tabs} />
      </div>

      <SuggestionDrawer
        record={selected}
        open={!!selected}
        onClose={() => setSelected(null)}
        onApply={applySuggestion}
      />
    </div>
  );
}
