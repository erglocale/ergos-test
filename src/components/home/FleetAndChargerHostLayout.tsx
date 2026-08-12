"use client";

import { Input, Select, Typography } from "antd";
import dayjs, { type Dayjs } from "dayjs";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { LuSearch, LuUser } from "react-icons/lu";
import DashboardMap from "@/components/maps/DashboardMap";
import { isEnergyBrainVehicle, useDb } from "@/data/store";

const { Text, Title } = Typography;

// ─── Shared exports (used by warning components) ─────────────────
export const rangePresets: { label: string; value: [Dayjs, Dayjs] }[] = [
  { label: "Last 2 Days", value: [dayjs().subtract(2, "day"), dayjs()] },
  { label: "Last 7 Days", value: [dayjs().subtract(7, "day"), dayjs()] },
  { label: "Last 14 Days", value: [dayjs().subtract(14, "day"), dayjs()] },
  { label: "Last 30 Days", value: [dayjs().subtract(30, "day"), dayjs()] },
  { label: "Last 90 Days", value: [dayjs().subtract(90, "day"), dayjs()] },
];
export const warningStatusOptions = [
  { value: "All", label: "All" },
  { value: "New", label: "New" },
  { value: "Fixed", label: "Resolved" },
];
export const vehicleWarningCodeOptions = [
  { label: "All", value: "ALL" },
  { label: "Low Battery", value: "VEHICLE_LOW_SOC" },
  { label: "Over Speeding", value: "VEHICLE_OVER_SPEEDING" },
  { label: "Low Aux Battery", value: "VEHICLE_LOW_AUX_BATTERY" },
  { label: "Fast Charging Overuse", value: "VEHICLE_FAST_CHARGING_OVERUSE" },
  {
    label: "Vehicle Not Charging",
    value: "VEHICLE_CHARGER_PLUGGED_NOT_CHARGING",
  },
];
export const chargerWarningTypeOptions = [
  { label: "All", value: "ALL" },
  { label: "Downtime", value: "Downtime" },
  { label: "Connector Fault", value: "ConnectorFault" },
];

const LEFT_MIN_WIDTH = 420;
const RIGHT_MIN_WIDTH = 420;
const SPLITTER_WIDTH = 10;
const DESKTOP_BREAKPOINT = 992;

// ─── Store-backed vehicle view model ─────────────────────────────
// Mirrors the shape returned by the production vehicles API.
interface VehicleVM {
  id: string;
  licensePlate: string;
  model: string;
  batteryLevel: number;
  isCharging: boolean;
  isRunning: boolean;
  telematicsDeviceEnabled: boolean;
  telemetryTimestamp: string | null;
  currentlyUsedBy: { firstName: string; lastName: string } | null;
  hub: string;
  lat: number;
  lng: number;
  /** Live rows from energy-brain — pinned to the top of the default listing. */
  isEnergyBrain: boolean;
}

// Deterministic per-vehicle "minutes ago" for the telemetry timestamp the
// fixtures don't have.
function hashMinutes(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) | 0;
  return (Math.abs(h) % 170) + 2; // 2..171 minutes
}

// ─── Helpers ──────────────────────────────────────────────────────
function sanitizeSoc(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function shortTimeAgo(ts: string | null): string {
  if (!ts) return "";
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function getSocColor(soc: number): string {
  if (soc > 60) return "#16a34a";
  if (soc > 30) return "#eab308";
  if (soc > 20) return "#f97316";
  return "#ef4444";
}

function SocBar({ percent }: { percent: number }) {
  const soc = sanitizeSoc(percent);
  const color = getSocColor(soc);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div
        style={{
          width: 100,
          height: 8,
          borderRadius: 4,
          backgroundColor: "#f1f5f9",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${soc}%`,
            height: "100%",
            borderRadius: 4,
            backgroundColor: color,
            transition: "width 0.4s",
          }}
        />
      </div>
      <span style={{ fontWeight: 700, fontSize: 13, color, minWidth: 36 }}>
        {soc}%
      </span>
    </div>
  );
}

function StatusCell({ vehicle }: { vehicle: VehicleVM }) {
  const pill: React.CSSProperties = {
    padding: "2px 10px",
    borderRadius: 12,
    fontSize: 11,
    fontWeight: 600,
    display: "inline-block",
  };
  if (!vehicle?.telematicsDeviceEnabled)
    return <span style={{ ...pill, color: "#94a3b8" }}>Disabled</span>;
  if (vehicle?.isCharging)
    return (
      <span style={{ ...pill, background: "#dcfce7", color: "#16a34a" }}>
        Charging
      </span>
    );
  if (vehicle?.isRunning) {
    return (
      <div>
        <span style={{ ...pill, background: "#dbeafe", color: "#3b82f6" }}>
          Running
        </span>
        <div
          style={{
            fontSize: 11,
            color: "#94a3b8",
            marginTop: 2,
            display: "flex",
            alignItems: "center",
            gap: 3,
          }}
        >
          <LuUser size={10} style={{ flexShrink: 0 }} />
          {vehicle?.currentlyUsedBy
            ? `${vehicle.currentlyUsedBy.firstName} ${vehicle.currentlyUsedBy.lastName}`
            : "Not checked in"}
        </div>
      </div>
    );
  }
  return (
    <span style={{ ...pill, background: "#fff7ed", color: "#f97316" }}>
      Idle
    </span>
  );
}

// Local replica of Components/HubManagement/HubFilter — hubs derived from
// the dummy store instead of the hubs API.
function HubFilter({
  value,
  onChange,
  placeholder = "Filter by hub",
  style,
}: {
  value: string | null;
  onChange: (hub: string | null) => void;
  placeholder?: string;
  style?: React.CSSProperties;
}) {
  const db = useDb();
  const hubs = useMemo(
    () =>
      Array.from(
        new Set([
          ...db.vehicles.map((v) => v.hub),
          ...db.chargepoints.map((c) => c.hub),
        ]),
      ).sort(),
    [db.vehicles, db.chargepoints],
  );

  return (
    <Select
      allowClear
      showSearch
      placeholder={placeholder}
      value={value || undefined}
      onChange={(v) => onChange(v || null)}
      optionFilterProp="label"
      style={{ minWidth: 180, ...(style || {}) }}
      options={hubs.map((h) => ({ label: h, value: h }))}
    />
  );
}

// ─── Main Layout ──────────────────────────────────────────────────
export default function FleetAndChargerHostLayout() {
  const db = useDb();
  const router = useRouter();
  const splitContainerRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<{
    startX: number;
    startLeft: number;
    containerWidth: number;
  } | null>(null);
  const pointerMoveListenerRef = useRef<((e: PointerEvent) => void) | null>(
    null,
  );
  const pointerUpListenerRef = useRef<(() => void) | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState("plate");
  const [leftPaneWidth, setLeftPaneWidth] = useState<number | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window === "undefined"
      ? true
      : window.innerWidth >= DESKTOP_BREAKPOINT,
  );

  const [hubFilter, setHubFilter] = useState<string | null>(null);

  // Store-backed replacements for the analytics + vehicles queries.
  const vehicles = useMemo<VehicleVM[]>(
    () =>
      db.vehicles.map((v) => {
        const driver = v.driverId
          ? (db.drivers.find((d) => d.id === v.driverId) ?? null)
          : null;
        const enabled = v.status !== "Offline";
        const [firstName, ...rest] = (driver?.name ?? "").split(" ");
        return {
          id: v.id,
          licensePlate: v.reg,
          model: `${v.make} ${v.model}`,
          batteryLevel: v.soc,
          isCharging: v.status === "Charging",
          isRunning: v.status === "Driving",
          telematicsDeviceEnabled: enabled,
          telemetryTimestamp: enabled
            ? new Date(Date.now() - hashMinutes(v.id) * 60000).toISOString()
            : null,
          currentlyUsedBy: driver
            ? { firstName, lastName: rest.join(" ") }
            : null,
          hub: v.hub,
          lat: v.lat,
          lng: v.lng,
          isEnergyBrain: isEnergyBrainVehicle(v.id),
        };
      }),
    [db.vehicles, db.drivers],
  );

  const hubVehicles = useMemo(
    () => (hubFilter ? vehicles.filter((v) => v.hub === hubFilter) : vehicles),
    [vehicles, hubFilter],
  );

  const clearResizeListeners = () => {
    if (pointerMoveListenerRef.current) {
      window.removeEventListener("pointermove", pointerMoveListenerRef.current);
      pointerMoveListenerRef.current = null;
    }
    if (pointerUpListenerRef.current) {
      window.removeEventListener("pointerup", pointerUpListenerRef.current);
      pointerUpListenerRef.current = null;
    }
  };

  useEffect(() => {
    const syncDesktopLayout = () => {
      const desktop = window.innerWidth >= DESKTOP_BREAKPOINT;
      setIsDesktop(desktop);

      if (!desktop || !splitContainerRef.current) return;

      const containerWidth = splitContainerRef.current.clientWidth;
      if (!containerWidth) return;

      const maxLeft = Math.max(
        LEFT_MIN_WIDTH,
        containerWidth - SPLITTER_WIDTH - RIGHT_MIN_WIDTH,
      );

      setLeftPaneWidth((prev) => {
        if (prev == null) {
          const preferred = Math.round(containerWidth * 0.46);
          return Math.min(Math.max(preferred, LEFT_MIN_WIDTH), maxLeft);
        }
        return Math.min(Math.max(prev, LEFT_MIN_WIDTH), maxLeft);
      });
    };

    syncDesktopLayout();
    window.addEventListener("resize", syncDesktopLayout);
    return () => {
      window.removeEventListener("resize", syncDesktopLayout);
      clearResizeListeners();
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startResize = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isDesktop || !splitContainerRef.current) return;

    event.preventDefault();
    const containerWidth = splitContainerRef.current.clientWidth;
    if (!containerWidth) return;

    const currentLeft = leftPaneWidth ?? Math.round(containerWidth * 0.46);
    dragStateRef.current = {
      startX: event.clientX,
      startLeft: currentLeft,
      containerWidth,
    };

    const onPointerMove = (moveEvent: PointerEvent) => {
      if (!dragStateRef.current) return;

      const delta = moveEvent.clientX - dragStateRef.current.startX;
      const maxLeft = Math.max(
        LEFT_MIN_WIDTH,
        dragStateRef.current.containerWidth - SPLITTER_WIDTH - RIGHT_MIN_WIDTH,
      );
      const nextLeft = Math.min(
        Math.max(dragStateRef.current.startLeft + delta, LEFT_MIN_WIDTH),
        maxLeft,
      );

      setLeftPaneWidth(nextLeft);
    };

    const onPointerUp = () => {
      clearResizeListeners();
      dragStateRef.current = null;
      setIsResizing(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      // Let map and table recalculate dimensions after drag ends.
      window.dispatchEvent(new Event("resize"));
    };

    clearResizeListeners();
    pointerMoveListenerRef.current = onPointerMove;
    pointerUpListenerRef.current = onPointerUp;
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);

    setIsResizing(true);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  const filteredVehicles = useMemo(() => {
    let list = hubVehicles;
    if (statusFilter !== "all") {
      list = list.filter((v) => {
        if (statusFilter === "charging") return v?.isCharging;
        if (statusFilter === "running") return v?.isRunning && !v?.isCharging;
        if (statusFilter === "idle") return !v?.isRunning && !v?.isCharging;
        return true;
      });
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (v) =>
          v?.licensePlate?.toLowerCase().includes(q) ||
          v?.model?.toLowerCase().includes(q),
      );
    }
    list = [...list].sort((a, b) => {
      if (sortBy === "soc_asc")
        return sanitizeSoc(a?.batteryLevel) - sanitizeSoc(b?.batteryLevel);
      if (sortBy === "soc_desc")
        return sanitizeSoc(b?.batteryLevel) - sanitizeSoc(a?.batteryLevel);
      if (sortBy === "updated") {
        const tA = a?.telemetryTimestamp
          ? new Date(a.telemetryTimestamp).getTime()
          : 0;
        const tB = b?.telemetryTimestamp
          ? new Date(b.telemetryTimestamp).getTime()
          : 0;
        return tB - tA;
      }
      // Default ordering: the live energy-brain fleet first, then by plate.
      // The explicit SoC / updated sorts are left alone so they stay honest.
      if (a.isEnergyBrain !== b.isEnergyBrain) return a.isEnergyBrain ? -1 : 1;
      return (a?.licensePlate || "").localeCompare(b?.licensePlate || "");
    });
    return list;
  }, [hubVehicles, statusFilter, searchQuery, sortBy]);

  // Fleet single-metrics analytics, computed from the dummy store.
  const total = vehicles.length;
  const charging = vehicles.filter((v) => v.isCharging).length;
  const running = vehicles.filter((v) => v.isRunning).length;
  const idle = vehicles.filter(
    (v) => v.telematicsDeviceEnabled && !v.isRunning && !v.isCharging,
  ).length;

  const handleRowClick = (vehicle: VehicleVM) => {
    const { lat, lng } = vehicle;
    if (!lat || !lng) return;

    window.dispatchEvent(
      new CustomEvent("flyToVehicle", { detail: { lat, lng } }),
    );
  };

  const COL_HEIGHT = "96vh";
  const leftPaneStyle: React.CSSProperties = isDesktop
    ? {
        width: leftPaneWidth ? `${leftPaneWidth}px` : "46%",
        minWidth: LEFT_MIN_WIDTH,
        flexShrink: 0,
      }
    : { width: "100%" };
  const rightPaneStyle: React.CSSProperties = isDesktop
    ? {
        flex: 1,
        minWidth: RIGHT_MIN_WIDTH,
      }
    : {
        width: "100%",
        marginTop: 16,
      };

  return (
    <div style={{ padding: "0 0px", paddingTop: 0 }}>
      <div
        ref={splitContainerRef}
        style={{
          display: isDesktop ? "flex" : "block",
          width: "100%",
          minHeight: COL_HEIGHT,
        }}
      >
        {/* LEFT COLUMN: Fleet Overview + Vehicle Table */}
        <div style={leftPaneStyle}>
          <div
            style={{
              height: COL_HEIGHT,
              display: "flex",
              flexDirection: "column",
            }}
          >
            {/* Fleet Overview */}
            <div
              style={{
                borderRadius: 12,
                border: "1px solid #e5e7eb",
                background: "#fff",
                padding: "12px 16px",
                marginBottom: "1.2vh",
                flexShrink: 0,
              }}
            >
              <Title level={5} style={{ margin: "0 0 8px" }}>
                Fleet Overview
              </Title>
              <div style={{ display: "flex" }}>
                {[
                  { label: "Total", value: total, color: "#1e293b" },
                  { label: "Charging", value: charging, color: "#16a34a" },
                  { label: "Running", value: running, color: "#3b82f6" },
                  { label: "Idle", value: idle, color: "#f97316" },
                ].map((item, i) => (
                  <div
                    key={item.label}
                    style={{
                      flex: 1,
                      textAlign: "center",
                      borderLeft: i > 0 ? "1px solid #e5e7eb" : "none",
                    }}
                  >
                    <Text style={{ color: "#94a3b8", fontSize: 11 }}>
                      {item.label}
                    </Text>
                    <div
                      style={{
                        fontSize: 22,
                        fontWeight: 700,
                        color: item.color,
                        lineHeight: 1.3,
                      }}
                    >
                      {item.value}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Table container — fills remaining height */}
            <div
              style={{
                flex: 1,
                minHeight: 0,
                display: "flex",
                flexDirection: "column",
                border: "1px solid #e5e7eb",
                borderRadius: 12,
                background: "#fff",
                overflow: "hidden",
              }}
            >
              {/* Toolbar */}
              <div
                style={{
                  padding: "8px 12px",
                  borderBottom: "1px solid #f0f0f0",
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                  flexWrap: "wrap",
                  flexShrink: 0,
                }}
              >
                <Input
                  placeholder="Search..."
                  prefix={<LuSearch size={13} color="#94a3b8" />}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  allowClear
                  className="toolbar-input"
                  style={{ flex: 1, minWidth: 100 }}
                />
                <HubFilter
                  value={hubFilter}
                  onChange={setHubFilter}
                  placeholder="Hub: All"
                  style={{ width: 150, minWidth: 150 }}
                />
                <Select
                  value={statusFilter}
                  onChange={setStatusFilter}
                  className="toolbar-select"
                  style={{ width: 130 }}
                  options={[
                    { value: "all", label: "Status: All" },
                    { value: "charging", label: "Status: Charging" },
                    { value: "running", label: "Status: Running" },
                    { value: "idle", label: "Status: Idle" },
                  ]}
                />
                <Select
                  value={sortBy}
                  onChange={setSortBy}
                  className="toolbar-select"
                  style={{ width: 150 }}
                  options={[
                    { value: "plate", label: "Sort: Vehicle no." },
                    { value: "soc_asc", label: "Sort: SoC ↑" },
                    { value: "soc_desc", label: "Sort: SoC ↓" },
                    { value: "updated", label: "Sort: Updated" },
                  ]}
                />
              </div>

              {/* Column headers */}
              <div
                style={{
                  display: "flex",
                  padding: "6px 12px",
                  borderBottom: "1px solid #f0f0f0",
                  background: "#fafafa",
                  flexShrink: 0,
                }}
              >
                <div
                  style={{
                    width: "28%",
                    fontSize: 10,
                    fontWeight: 600,
                    color: "#94a3b8",
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                  }}
                >
                  Vehicle no.
                </div>
                <div
                  style={{
                    width: "30%",
                    fontSize: 10,
                    fontWeight: 600,
                    color: "#94a3b8",
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                  }}
                >
                  Battery
                </div>
                <div
                  style={{
                    width: "22%",
                    fontSize: 10,
                    fontWeight: 600,
                    color: "#94a3b8",
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                  }}
                >
                  Status
                </div>
                <div style={{ width: "20%" }} />
              </div>

              {/* Vehicle rows — scrollable */}
              <div
                style={{
                  flex: 1,
                  minHeight: 0,
                  overflowY: "auto",
                }}
              >
                {!filteredVehicles.length ? (
                  <div
                    style={{
                      padding: 40,
                      textAlign: "center",
                      color: "#94a3b8",
                    }}
                  >
                    No vehicles found
                  </div>
                ) : (
                  filteredVehicles.map((vehicle) => (
                    <div
                      key={vehicle.id}
                      className="vehicle-row-hover"
                      onClick={() =>
                        vehicle?.telematicsDeviceEnabled &&
                        handleRowClick(vehicle)
                      }
                      style={{
                        display: "flex",
                        alignItems: "center",
                        padding: "8px 12px",
                        borderBottom: "1px solid #f5f5f5",
                        cursor: vehicle?.telematicsDeviceEnabled
                          ? "pointer"
                          : "default",
                        opacity: vehicle?.telematicsDeviceEnabled ? 1 : 0.5,
                      }}
                    >
                      <div style={{ width: "28%" }}>
                        <div
                          style={{
                            fontWeight: 700,
                            color: "#f97416",
                            fontSize: 13,
                          }}
                        >
                          {vehicle?.licensePlate}
                        </div>
                        <div
                          style={{
                            fontSize: 11,
                            color: "#b0b8c4",
                            marginTop: 1,
                          }}
                        >
                          {vehicle?.model || ""}
                        </div>
                      </div>
                      <div style={{ width: "30%" }}>
                        {vehicle?.telematicsDeviceEnabled ? (
                          <div>
                            <SocBar percent={vehicle?.batteryLevel} />
                            {vehicle?.telemetryTimestamp && (
                              <div
                                style={{
                                  fontSize: 10,
                                  color: "#b0b8c4",
                                  marginTop: 1,
                                }}
                              >
                                {shortTimeAgo(vehicle.telemetryTimestamp)}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span style={{ fontSize: 11, color: "#cbd5e1" }}>
                            N/A
                          </span>
                        )}
                      </div>
                      <div style={{ width: "22%" }}>
                        <StatusCell vehicle={vehicle} />
                      </div>
                      <div
                        style={{
                          width: "20%",
                          textAlign: "right",
                          paddingRight: 4,
                        }}
                      >
                        {vehicle?.telematicsDeviceEnabled && (
                          <button
                            type="button"
                            className="view-detail-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              router.push(`/vehicles/${vehicle.id}`);
                            }}
                          >
                            View Details
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        {isDesktop && (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize dashboard columns"
            className={`home-column-resizer ${isResizing ? "home-column-resizer-active" : ""}`}
            onPointerDown={startResize}
          >
            <span className="home-column-resizer-handle" aria-hidden="true" />
          </div>
        )}

        {/* RIGHT COLUMN: Map spanning full height */}
        <div style={rightPaneStyle}>
          <div
            style={{
              borderRadius: 12,
              border: "1px solid #e5e7eb",
              overflow: "hidden",
              height: COL_HEIGHT,
            }}
          >
            <DashboardMap mapContainerHeight="100%" />
          </div>
        </div>
      </div>

      <style>{`
        .vehicle-row-hover:hover { background: #fafafa; }
        .view-detail-btn {
          background: #fff7ed; border: 1px solid #fed7aa; border-radius: 8px;
          padding: 5px 12px; cursor: pointer; font-size: 12px; font-weight: 600;
          color: #f97416; transition: all 0.15s; white-space: nowrap;
        }
        .view-detail-btn:hover { background: #f97416; color: #fff; border-color: #f97416; }
        .toolbar-input .ant-input-affix-wrapper,
        .toolbar-input.ant-input-affix-wrapper {
          border-radius: 8px !important; height: 32px !important; font-size: 12px !important;
        }
        .toolbar-select .ant-select-selector {
          border-radius: 8px !important; height: 32px !important; font-size: 12px !important;
          display: flex !important; align-items: center !important;
        }
        .home-column-resizer {
          width: ${SPLITTER_WIDTH}px;
          cursor: col-resize;
          position: relative;
          flex-shrink: 0;
          touch-action: none;
        }
        .home-column-resizer::before {
          content: '';
          position: absolute;
          left: 50%;
          top: 0;
          transform: translateX(-50%);
          width: 8px;
          height: 100%;
          background: rgba(249, 116, 22, 0.12);
          opacity: 0;
          transition: opacity 0.15s ease;
          pointer-events: none;
        }
        .home-column-resizer:hover::before,
        .home-column-resizer-active::before {
          opacity: 1;
        }
        .home-column-resizer-handle {
          position: absolute;
          left: 50%;
          top: 50%;
          transform: translate(-50%, -50%);
          z-index: 1;
          width: 20px;
          height: 28px;
          border-radius: 5px;
          border: 1px solid #d1d5db;
          background: #fff;
          pointer-events: none;
          transition: border-color 0.15s ease, background 0.15s ease;
        }
        .home-column-resizer-handle::before {
          content: '';
          position: absolute;
          left: 50%;
          top: 50%;
          transform: translate(-50%, -50%);
          width: 12px;
          height: 18px;
          background:
            radial-gradient(circle, #94a3b8 1.4px, transparent 1.6px) 0 0 / 6px 6px;
          transition: background 0.15s ease;
        }
        .home-column-resizer:hover .home-column-resizer-handle,
        .home-column-resizer-active .home-column-resizer-handle {
          border-color: #f97416;
          background: #fffaf5;
        }
        .home-column-resizer:hover .home-column-resizer-handle::before,
        .home-column-resizer-active .home-column-resizer-handle::before {
          background:
            radial-gradient(circle, #f97416 1.4px, transparent 1.6px) 0 0 / 6px 6px;
        }
      `}</style>
    </div>
  );
}
