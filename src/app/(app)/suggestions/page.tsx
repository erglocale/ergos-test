"use client";

import {
  Button,
  message,
  Select,
  Switch,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import type { TableProps } from "antd";
import { useEffect, useMemo, useRef, useState } from "react";
import ConfirmAcceptDialog from "@/components/suggestions/ConfirmAcceptDialog";
import type { CapRow, NudgeRow } from "@/components/suggestions/derive";
import { deriveCapRows, deriveNudges } from "@/components/suggestions/derive";
import {
  ANALYTICS_API,
  fetchGroups,
  fetchLiveCapRows,
  fetchLiveNudges,
  type LiveGroup,
} from "@/components/suggestions/liveApi";
import SuggestionDrawer, {
  DrawerRecord,
} from "@/components/suggestions/SuggestionDrawer";
import { setVehicleSocCap, updateRow, useDb } from "@/data/store";

const { Title, Text } = Typography;
const ORANGE = "#F26E21";

/** "as 01 sc-7409" and "AS01SC7409" are the same vehicle. */
function normalizePlate(plate: string | null | undefined): string {
  return (plate ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

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
  loading,
  onRowClick,
}: {
  nudges: NudgeRow[];
  loading?: boolean;
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
        loading={loading}
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
  loading,
  onRowClick,
  onApply,
}: {
  rows: CapRow[];
  loading?: boolean;
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
        row.socLimit?.suggested_cap != null ? (
          <Button
            size="small"
            type="primary"
            style={{ background: ORANGE, borderColor: ORANGE }}
            onClick={(e) => {
              e.stopPropagation();
              setAcceptTarget(row);
            }}
          >
            Accept
          </Button>
        ) : null,
    },
  ];

  return (
    <div>
      <Table
        rowKey="evId"
        size="middle"
        loading={loading}
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

  // -- Live mode: read real published suggestions from the analytics API ----
  // Sandbox-only control. Off = deterministic localStorage fixtures; on = the
  // rows analytics-ui actually published to the suggestion schema.
  const [live, setLive] = useState(false);
  const [groups, setGroups] = useState<LiveGroup[]>([]);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [liveCaps, setLiveCaps] = useState<CapRow[]>([]);
  const [liveNudges, setLiveNudges] = useState<NudgeRow[]>([]);
  const [liveLoading, setLiveLoading] = useState(false);
  const erroredRef = useRef(false);

  const liveError = () => {
    // One toast per failure streak, not one per 60s poll.
    if (erroredRef.current) return;
    erroredRef.current = true;
    messageApi.error(
      "Couldn't reach the analytics API — check the connection and try again.",
    );
  };

  useEffect(() => {
    if (!live || groups.length) return;
    fetchGroups()
      .then((gs) => {
        setGroups(gs);
        const eco = gs.find((g) => g.name.toLowerCase().includes("eco"));
        setGroupId((cur) => cur ?? eco?.id ?? gs[0]?.id ?? null);
      })
      .catch(liveError);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, groups.length]);

  useEffect(() => {
    if (!live || !groupId) return;
    let cancelled = false;
    setLiveLoading(true);
    Promise.all([fetchLiveCapRows(groupId), fetchLiveNudges(groupId)])
      .then(([caps, nudges]) => {
        if (cancelled) return;
        erroredRef.current = false;
        setLiveCaps(caps);
        setLiveNudges(nudges);
      })
      .catch(() => {
        if (!cancelled) liveError();
      })
      .finally(() => {
        if (!cancelled) setLiveLoading(false);
      });
    // Each preview call runs the full allocator server-side, so poll gently
    // (the real allocator ticks every ~15–30 min anyway).
    const timer = window.setInterval(() => {
      fetchLiveNudges(groupId)
        .then((nudges) => {
          if (!cancelled) setLiveNudges(nudges);
        })
        .catch(() => {});
    }, 300_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, groupId]);

  const demoNudges = useMemo(() => deriveNudges(db.vehicles), [db.vehicles]);
  const demoCapRows = useMemo(() => deriveCapRows(db), [db]);

  const nudges = live ? liveNudges : demoNudges;
  const capRows = live ? liveCaps : demoCapRows;

  const applySuggestion = (row: CapRow) => {
    const cap = row.socLimit?.suggested_cap;
    if (cap == null) return;
    // Fixture suggestions carry their own row; live rows (suggestionId
    // "live-<evId>") have none, so this is a no-op for them.
    updateRow("suggestions", row.suggestionId, { status: "Applied" });

    // Live rows label the vehicle by its real licence plate, which is also what
    // the sandbox fleet uses — so a live suggestion lands on the matching demo
    // vehicle. Plates are compared loosely (case, spaces, hyphens) because the
    // analytics feed and the fixtures don't always format them the same way.
    const plate = normalizePlate(row.label);
    const vehicle = plate
      ? db.vehicles.find((v) => normalizePlate(v.reg) === plate)
      : undefined;
    const who = row.label || `EV ${row.evId}`;
    if (!vehicle) {
      messageApi.warning(`No vehicle matching ${who} in the sandbox fleet — nothing to update.`);
      setSelected(null);
      return;
    }
    // setVehicleSocCap picks the right layer, so this also lands on
    // energy-brain's vans, whose rows aren't in the fixture db.
    setVehicleSocCap(vehicle.id, cap);
    messageApi.success(`Charge limit set to ${cap}% for ${vehicle.reg}`);
    setSelected(null);
  };

  // SOC Cap leads: it is the suggestion set the demo opens on.
  const tabs = [
    {
      key: "cap",
      label: "SOC Cap",
      children: (
        <CapTab
          rows={capRows}
          loading={live && liveLoading}
          onRowClick={(row) => setSelected({ ...row, kind: "cap" })}
          onApply={applySuggestion}
        />
      ),
    },
    {
      key: "charging",
      label: "Charging",
      children: (
        <ChargingTab
          nudges={nudges}
          loading={live && liveLoading}
          onRowClick={(row) => setSelected({ ...row, kind: "charge" })}
        />
      ),
    },
  ];

  return (
    <div style={{ marginLeft: 16, marginRight: 16 }}>
      {contextHolder}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <Title level={3} style={{ marginBottom: 2 }}>
          Charging Suggestions
        </Title>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {live && groups.length ? (
            <Select
              size="small"
              style={{ minWidth: 180 }}
              value={groupId}
              onChange={setGroupId}
              options={groups.map((g) => ({ value: g.id, label: g.name }))}
            />
          ) : null}
          <Text type="secondary" style={{ fontSize: 13 }}>
            Live data
          </Text>
          <Tooltip
            title={
              ANALYTICS_API
                ? ""
                : "Set NEXT_PUBLIC_ANALYTICS_API in .env.local and restart the dev server."
            }
          >
            <Switch
              size="small"
              checked={live}
              disabled={!ANALYTICS_API}
              onChange={setLive}
            />
          </Tooltip>
        </div>
      </div>

      <div style={{ marginTop: 8 }}>
        <Tabs defaultActiveKey="cap" items={tabs} />
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
