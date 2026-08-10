"use client";

import { DownloadOutlined } from "@ant-design/icons";
import { Alert, Button, DatePicker, InputNumber, Space, Typography } from "antd";
import dayjs from "dayjs";
import { useMemo, useState } from "react";
import ChargerLocationMap, {
  type ChargerMapPoint,
} from "@/components/maps/ChargerLocationMap";
import { useDb } from "@/data/store";
import type { ChargingSession } from "@/data/types";
import VehicleSelectionModal from "./VehicleSelectionModal";
import {
  BRAND,
  DateRange,
  downloadCsv,
  formatReportDate,
  getPresetRanges,
  SECTION_CARD,
} from "./shared";
import { DATE_FORMAT } from "@/lib/dateFormat";

const { RangePicker } = DatePicker;
const { Title, Text } = Typography;

const HUB_COLOR = BRAND.orange;
const PUBLIC_COLOR = BRAND.blue;

const DEFAULT_DATE_RANGE: DateRange = (() => {
  const preset = getPresetRanges().find((p) => p.label === "Last 30 days");
  return preset ? preset.value : [dayjs().subtract(29, "day"), dayjs()];
})();

// Fixtures have no hub-vs-public flag — derive a deterministic ~30% "Public"
// split from the session id so the donut has both segments.
function isPublicSession(s: ChargingSession): boolean {
  const n = Number(s.id.replace(/\D+/g, "")) || 0;
  return n % 10 < 3;
}

// Fixtures have no per-session GPS point for public charging — derive a
// deterministic location near the Guwahati hub area from a string hash.
function hashPoint(key: string): { lat: number; lng: number } {
  let h = 0;
  for (let i = 0; i < key.length; i += 1) h = (h * 31 + key.charCodeAt(i)) | 0;
  const a = Math.abs(h);
  return {
    lat: 26.11 + ((a % 1000) / 1000) * 0.02,
    lng: 91.78 + ((Math.floor(a / 1000) % 1000) / 1000) * 0.03,
  };
}

/* ─── Pure-CSS donut chart (with center text) ─── */
function CSSDonut({
  hubPct,
  publicPct,
  size = 180,
  centerContent,
}: {
  hubPct: number;
  publicPct: number;
  size?: number;
  centerContent: React.ReactNode;
}) {
  const total = hubPct + publicPct;
  const bg =
    total === 0
      ? "#e5e7eb"
      : `conic-gradient(${HUB_COLOR} 0% ${hubPct}%, ${PUBLIC_COLOR} ${hubPct}% 100%)`;
  return (
    <div
      style={{
        position: "relative",
        width: size,
        height: size,
        borderRadius: "50%",
        background: bg,
        flexShrink: 0,
      }}
      role="img"
      aria-label={`Charging split: Hub ${hubPct}%, Public ${publicPct}%`}
    >
      <div
        style={{
          position: "absolute",
          inset: size * 0.22,
          borderRadius: "50%",
          background: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          padding: 6,
          textAlign: "center",
        }}
      >
        {centerContent}
      </div>
    </div>
  );
}

function LegendDot({ color, size = 10 }: { color: string; size?: number }) {
  return (
    <span
      style={{
        display: "inline-block",
        width: size,
        height: size,
        borderRadius: "50%",
        backgroundColor: color,
        marginRight: 6,
        flexShrink: 0,
      }}
    />
  );
}

function SectionHeader({
  title,
  extra,
}: {
  title: string;
  extra?: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
        marginBottom: 16,
        paddingBottom: 12,
        borderBottom: `1px solid ${BRAND.border}`,
        gap: 12,
        flexWrap: "wrap",
      }}
    >
      <Title level={5} style={{ margin: 0, color: BRAND.textPrimary }}>
        {title}
      </Title>
      {extra}
    </div>
  );
}

function MetricBlock({
  accent,
  label,
  kwh,
  sessions,
  cost,
  pct,
}: {
  accent: string;
  label: string;
  kwh: number;
  sessions: number;
  cost: number;
  pct?: number;
}) {
  return (
    <div
      style={{
        flex: 1,
        minWidth: 200,
        background: "#fff",
        border: `1px solid ${BRAND.border}`,
        borderLeft: `3px solid ${accent}`,
        borderRadius: 10,
        padding: "14px 16px",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 6,
        }}
      >
        <span
          style={{
            fontSize: 11,
            textTransform: "uppercase",
            letterSpacing: 0.5,
            color: BRAND.textMuted,
            fontWeight: 500,
          }}
        >
          {label}
        </span>
        {typeof pct === "number" && (
          <span
            style={{
              fontSize: 11,
              color: accent,
              fontWeight: 600,
              background: `${accent}15`,
              padding: "2px 8px",
              borderRadius: 10,
            }}
          >
            {pct}%
          </span>
        )}
      </div>
      <div
        style={{
          fontSize: 22,
          fontWeight: 700,
          color: BRAND.textPrimary,
          lineHeight: 1.1,
        }}
      >
        {kwh.toFixed(1)}
        <span
          style={{
            fontSize: 12,
            fontWeight: 500,
            color: BRAND.textSecondary,
            marginLeft: 4,
          }}
        >
          kWh
        </span>
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginTop: 6,
        }}
      >
        <span style={{ fontSize: 12, color: BRAND.textSecondary }}>
          {sessions} session{sessions === 1 ? "" : "s"}
        </span>
        <span style={{ fontSize: 14, fontWeight: 600, color: BRAND.textPrimary }}>
          ₹
          {cost.toLocaleString("en-IN", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </span>
      </div>
    </div>
  );
}

function StateMessage({
  tone = "muted",
  children,
}: {
  tone?: "muted" | "danger";
  children: React.ReactNode;
}) {
  const colorMap = { muted: BRAND.textSecondary, danger: "#dc2626" };
  return (
    <div style={SECTION_CARD}>
      <Text style={{ color: colorMap[tone] }}>{children}</Text>
    </div>
  );
}

interface ReportParams {
  vehicleIds: string[];
  range: DateRange;
}

export default function ChargingSessionAnalysis() {
  const db = useDb();
  const vehicles = db.vehicles;

  const [dateRange, setDateRange] = useState<DateRange>(DEFAULT_DATE_RANGE);
  const [selectedVehicleIds, setSelectedVehicleIds] = useState<string[]>(() =>
    vehicles.map((v) => v.id),
  );
  const [publicRate, setPublicRate] = useState(16);
  const [hubRate, setHubRate] = useState<number>(
    () => db.chargepoints[0]?.tariffPerKwh ?? 8.5,
  );
  const [modalOpen, setModalOpen] = useState(false);
  // Report generated on load with all vehicles + last 30 days (like the original).
  const [reportParams, setReportParams] = useState<ReportParams | null>(() => ({
    vehicleIds: vehicles.map((v) => v.id),
    range: DEFAULT_DATE_RANGE,
  }));

  const regById = useMemo(
    () => Object.fromEntries(vehicles.map((v) => [v.id, v.reg])),
    [vehicles],
  );

  // "Query": sessions in range for selected vehicles — resolves instantly.
  const sessions = useMemo(() => {
    if (!reportParams) return [];
    const regs = new Set(
      reportParams.vehicleIds.map((id) => regById[id]).filter(Boolean),
    );
    const [start, end] = reportParams.range;
    return db.sessions.filter((s) => {
      if (!regs.has(s.vehicleReg)) return false;
      const t = dayjs(s.startTime);
      return !t.isBefore(start) && !t.isAfter(end);
    });
  }, [db.sessions, reportParams, regById]);

  const hubSessions = useMemo(
    () => sessions.filter((s) => !isPublicSession(s)),
    [sessions],
  );
  const publicSessions = useMemo(
    () => sessions.filter((s) => isPublicSession(s)),
    [sessions],
  );

  const calcTotals = (rows: ChargingSession[], rate: number) => {
    const totalKwh = rows.reduce((sum, s) => sum + (s.energyKwh || 0), 0);
    return {
      totalKwh,
      sessionCount: rows.length,
      totalCost: totalKwh * rate,
    };
  };

  const hubTotals = useMemo(() => calcTotals(hubSessions, hubRate), [hubSessions, hubRate]);
  const publicTotals = useMemo(
    () => calcTotals(publicSessions, publicRate),
    [publicSessions, publicRate],
  );
  const potentialSavings = useMemo(
    () => publicTotals.totalCost - publicTotals.totalKwh * hubRate,
    [publicTotals, hubRate],
  );

  // Charging-location clusters for the map: hub sessions sit on their
  // chargepoint, public sessions get a deterministic per-vehicle location.
  const mapPoints = useMemo<ChargerMapPoint[]>(() => {
    const points: ChargerMapPoint[] = [];

    const hubByCharger = new Map<string, ChargingSession[]>();
    for (const s of hubSessions) {
      const rows = hubByCharger.get(s.chargerId);
      if (rows) rows.push(s);
      else hubByCharger.set(s.chargerId, [s]);
    }
    for (const [chargerId, rows] of hubByCharger) {
      const cp = db.chargepoints.find((c) => c.id === chargerId);
      if (!cp) continue;
      const kwh = rows.reduce((sum, s) => sum + (s.energyKwh || 0), 0);
      points.push({
        lat: cp.lat,
        lng: cp.lng,
        color: HUB_COLOR,
        count: rows.length,
        label: `${cp.name} — ${rows.length} hub session${rows.length === 1 ? "" : "s"} · ${kwh.toFixed(1)} kWh · ₹${(kwh * hubRate).toFixed(0)}`,
      });
    }

    const publicByVehicle = new Map<string, ChargingSession[]>();
    for (const s of publicSessions) {
      const rows = publicByVehicle.get(s.vehicleReg);
      if (rows) rows.push(s);
      else publicByVehicle.set(s.vehicleReg, [s]);
    }
    for (const [reg, rows] of publicByVehicle) {
      const { lat, lng } = hashPoint(reg);
      const kwh = rows.reduce((sum, s) => sum + (s.energyKwh || 0), 0);
      points.push({
        lat,
        lng,
        color: PUBLIC_COLOR,
        count: rows.length,
        label: `${reg} — ${rows.length} public session${rows.length === 1 ? "" : "s"} · ${kwh.toFixed(1)} kWh · ₹${(kwh * publicRate).toFixed(0)}`,
      });
    }

    return points;
  }, [hubSessions, publicSessions, db.chargepoints, hubRate, publicRate]);

  const totalKwh = hubTotals.totalKwh + publicTotals.totalKwh;
  const totalSessions = hubTotals.sessionCount + publicTotals.sessionCount;
  const totalCost = hubTotals.totalCost + publicTotals.totalCost;
  const hubPercentage =
    totalKwh > 0 ? Math.round((hubTotals.totalKwh / totalKwh) * 100) : 0;
  const publicPercentage = totalKwh > 0 ? 100 - hubPercentage : 0;

  const handleGenerateReport = () => {
    const [start, end] = dateRange;
    if (!start || !end || selectedVehicleIds.length === 0) return;
    setReportParams({ vehicleIds: selectedVehicleIds, range: dateRange });
  };

  const handleDownloadReport = () => {
    if (!reportParams || !hasReport) return;
    const [start, end] = reportParams.range;
    const startStr = formatReportDate(start);
    const endStr = formatReportDate(end);

    const rows: (string | number)[][] = [];
    rows.push(["Charging Session Analysis Report"]);
    rows.push(["Period", `${startStr} to ${endStr}`]);
    rows.push(["Vehicles", selectedVehicleIds.length]);
    rows.push([]);
    rows.push(["Summary", "", ""]);
    rows.push(["Hub rate (Rupees/kWh)", hubRate, ""]);
    rows.push(["Public rate (Rupees/kWh)", publicRate, ""]);
    rows.push(["Metric", "Hub", "Public"]);
    rows.push([
      "Energy (kWh)",
      hubTotals.totalKwh.toFixed(2),
      publicTotals.totalKwh.toFixed(2),
    ]);
    rows.push(["Sessions", hubTotals.sessionCount, publicTotals.sessionCount]);
    rows.push([
      "Cost (Rupees)",
      hubTotals.totalCost.toFixed(2),
      publicTotals.totalCost.toFixed(2),
    ]);
    rows.push([]);
    rows.push(["Total Energy (kWh)", totalKwh.toFixed(2)]);
    rows.push(["Total Cost (Rupees)", totalCost.toFixed(2)]);
    if (potentialSavings > 0) {
      rows.push(["Potential Savings (Rupees)", potentialSavings.toFixed(2)]);
    }
    rows.push([]);
    rows.push([
      "Vehicle number plate",
      "Start time",
      "End time",
      "Energy (kWh)",
      "Type",
      "Cost (Rupees)",
    ]);

    const sessionRows = [
      ...hubSessions.map((s) => ({
        plate: s.vehicleReg,
        start: s.startTime,
        end: s.endTime,
        type: "Hub",
        kwh: s.energyKwh || 0,
        cost: (s.energyKwh || 0) * hubRate,
      })),
      ...publicSessions.map((s) => ({
        plate: s.vehicleReg,
        start: s.startTime,
        end: s.endTime,
        type: "Public",
        kwh: s.energyKwh || 0,
        cost: (s.energyKwh || 0) * publicRate,
      })),
    ].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

    sessionRows.forEach(({ plate, start, end, type, kwh, cost }) => {
      rows.push([
        plate,
        formatReportDate(start),
        formatReportDate(end),
        kwh.toFixed(3),
        type,
        cost.toFixed(2),
      ]);
    });

    downloadCsv(
      rows,
      `Charging_Session_Analysis_${startStr.slice(0, 10)}_to_${endStr.slice(0, 10)}.csv`,
    );
  };

  const hasReportParams = !!reportParams;
  const hasReport = hasReportParams;
  const hasSessions = sessions.length > 0;
  const showReport = hasReport && hasSessions;
  const showEmptyState = hasReport && !hasSessions;

  const criteriaUnchanged =
    reportParams &&
    dateRange[0].valueOf() === reportParams.range[0].valueOf() &&
    dateRange[1].valueOf() === reportParams.range[1].valueOf() &&
    selectedVehicleIds.length === reportParams.vehicleIds.length &&
    selectedVehicleIds.every((id) => reportParams.vehicleIds.includes(id));
  const criteriaChanged = hasReportParams && !criteriaUnchanged;

  return (
    <div style={{ padding: "0 0 24px 0" }}>
      <Space orientation="vertical" size="middle" style={{ width: "100%" }}>
        {/* ── Filter bar ── */}
        <div style={{ ...SECTION_CARD, padding: 16 }}>
          <Space wrap align="center" size={[12, 12]}>
            <RangePicker
              format={DATE_FORMAT}
              value={dateRange}
              onChange={(dates) => {
                if (dates && dates[0] && dates[1])
                  setDateRange([dates[0], dates[1]]);
              }}
              allowClear={false}
              presets={getPresetRanges()}
            />
            <Button onClick={() => setModalOpen(true)}>
              {`Select Vehicles (${selectedVehicleIds.length})`}
            </Button>
            <Space>
              <Text style={{ color: BRAND.textSecondary }}>
                Public rate (₹/kWh)
              </Text>
              <InputNumber
                min={0}
                step={0.5}
                value={publicRate}
                onChange={(v) => {
                  const n = Number(v);
                  setPublicRate(Number.isFinite(n) && n >= 0 ? n : 0);
                }}
                style={{ width: 100 }}
              />
            </Space>
            <Space>
              <Text style={{ color: BRAND.textSecondary }}>Hub rate (₹/kWh)</Text>
              <InputNumber
                min={0}
                step={0.5}
                value={hubRate}
                onChange={(v) => {
                  const n = Number(v);
                  setHubRate(Number.isFinite(n) && n >= 0 ? n : 0);
                }}
                style={{ width: 100 }}
              />
            </Space>
            <Button
              type="primary"
              onClick={handleGenerateReport}
              disabled={
                !dateRange[0] || !dateRange[1] || selectedVehicleIds.length === 0
              }
            >
              Generate Report
            </Button>
            <Button
              icon={<DownloadOutlined />}
              onClick={handleDownloadReport}
              disabled={!hasReport}
              title="Download report (CSV)"
            />
          </Space>
        </div>

        {criteriaChanged && (showReport || showEmptyState) && (
          <Alert
            type="info"
            showIcon
            message="Criteria have changed."
            description="Click Generate Report to refresh the report with the current date range and vehicles."
            style={{ borderRadius: 10 }}
          />
        )}

        {showReport && (
          <>
            {/* ── Hub vs Public Charging ── */}
            <div style={SECTION_CARD}>
              <SectionHeader
                title="Hub vs Public Charging"
                extra={
                  <span style={{ fontSize: 12, color: BRAND.textSecondary }}>
                    <span style={{ color: BRAND.textPrimary, fontWeight: 600 }}>
                      {totalKwh.toFixed(1)} kWh
                    </span>{" "}
                    · {totalSessions} session
                    {totalSessions === 1 ? "" : "s"} ·{" "}
                    <span style={{ color: BRAND.textPrimary, fontWeight: 600 }}>
                      ₹
                      {totalCost.toLocaleString("en-IN", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                  </span>
                }
              />
              <div
                style={{
                  display: "flex",
                  gap: 24,
                  flexWrap: "wrap",
                  alignItems: "center",
                }}
              >
                <CSSDonut
                  hubPct={hubPercentage}
                  publicPct={publicPercentage}
                  size={180}
                  centerContent={
                    <span
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: 2,
                        lineHeight: 1.2,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 10,
                          color: BRAND.textMuted,
                          textTransform: "uppercase",
                          letterSpacing: 0.5,
                        }}
                      >
                        Total
                      </span>
                      <span
                        style={{
                          fontWeight: 700,
                          fontSize: 20,
                          color: BRAND.textPrimary,
                        }}
                      >
                        {totalKwh.toFixed(1)}
                      </span>
                      <span style={{ fontSize: 10, color: BRAND.textMuted }}>
                        kWh
                      </span>
                    </span>
                  }
                />

                <div
                  style={{
                    flex: 1,
                    minWidth: 280,
                    display: "flex",
                    gap: 12,
                    flexWrap: "wrap",
                  }}
                >
                  <MetricBlock
                    accent={HUB_COLOR}
                    label="Hub Charging"
                    kwh={hubTotals.totalKwh}
                    sessions={hubTotals.sessionCount}
                    cost={hubTotals.totalCost}
                    pct={hubPercentage}
                  />
                  <MetricBlock
                    accent={PUBLIC_COLOR}
                    label="Public Charging"
                    kwh={publicTotals.totalKwh}
                    sessions={publicTotals.sessionCount}
                    cost={publicTotals.totalCost}
                    pct={publicPercentage}
                  />
                </div>
              </div>
            </div>

            {/* ── Potential Savings ── */}
            {potentialSavings > 0 && (
              <div
                style={{
                  background: BRAND.greenBg,
                  border: `1px solid ${BRAND.greenBorder}`,
                  borderRadius: 12,
                  padding: 20,
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 20,
                  flexWrap: "wrap",
                }}
              >
                <div style={{ flex: 1, minWidth: 240 }}>
                  <div
                    style={{
                      fontSize: 11,
                      textTransform: "uppercase",
                      letterSpacing: 0.5,
                      color: BRAND.greenText,
                      fontWeight: 600,
                      marginBottom: 6,
                    }}
                  >
                    Potential Savings
                  </div>
                  <div
                    style={{
                      fontSize: 28,
                      fontWeight: 700,
                      color: BRAND.greenText,
                      lineHeight: 1.1,
                    }}
                  >
                    ₹
                    {potentialSavings.toLocaleString("en-IN", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </div>
                </div>
                <div
                  style={{
                    flex: 2,
                    minWidth: 280,
                    fontSize: 13,
                    color: BRAND.textSecondary,
                    lineHeight: 1.5,
                  }}
                >
                  If {publicTotals.totalKwh.toFixed(1)} kWh had been charged at
                  hub rate (₹{hubRate}/kWh) instead of public rate (₹
                  {publicRate}/kWh).
                </div>
              </div>
            )}

            {/* ── Map ── */}
            <div style={SECTION_CARD}>
              <SectionHeader
                title="Charging Locations"
                extra={
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 14,
                      fontSize: 12,
                    }}
                  >
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        color: BRAND.textSecondary,
                      }}
                    >
                      <LegendDot color={HUB_COLOR} />
                      Hub
                    </span>
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        color: BRAND.textSecondary,
                      }}
                    >
                      <LegendDot color={PUBLIC_COLOR} />
                      Public
                    </span>
                  </div>
                }
              />
              <ChargerLocationMap points={mapPoints} height={340} />
            </div>
          </>
        )}

        {showEmptyState && (
          <StateMessage>
            No charging sessions found for the selected criteria.
          </StateMessage>
        )}
      </Space>

      <VehicleSelectionModal
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onConfirm={(ids) => {
          setSelectedVehicleIds(ids ?? []);
          setModalOpen(false);
        }}
        selectedVehicleIds={selectedVehicleIds}
      />
    </div>
  );
}
