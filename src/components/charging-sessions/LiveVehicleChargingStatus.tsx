"use client";

import { Pagination, Typography } from "antd";
import { useRouter } from "next/navigation";
import { useState } from "react";
import VehiclePhoto from "@/components/vehicles/vehiclePhoto";
import { etaMinutes } from "@/data/liveSim";
import { useDb, useSimStates } from "@/data/store";

const { Title } = Typography;

// Replica of production's VehicleChargingStatusAndHistory.jsx: the
// "Live Vehicle Charging Status" card at the top of the Charging Sessions
// tab. Hidden entirely when nothing is charging.

function VehicleStatusProgress({ percentage }: { percentage: number }) {
  const pct = Math.max(0, Math.min(100, percentage));
  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "10px",
        backgroundColor: "#e0e0df",
        borderRadius: "7px",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          height: "100%",
          width: `${pct}%`,
          backgroundColor: "#22c55e",
          transition: "width 0.5s ease",
          zIndex: 0,
          animation:
            pct < 100 ? "liveChargeGlow 2.5s ease-in-out infinite alternate" : "none",
        }}
      />
    </div>
  );
}

export default function LiveVehicleChargingStatus({
  hub = null,
  plates = [],
}: {
  /** null = all hubs (demo spec item 6). */
  hub?: string | null;
  /** Empty = every vehicle. */
  plates?: string[];
} = {}) {
  const db = useDb();
  const sim = useSimStates();
  const router = useRouter();
  const [limit] = useState(10);
  const [pageNum, setPageNum] = useState(1);

  const ongoing = db.sessions.filter((s) => {
    if (s.endTime !== null) return false;
    if (plates.length && !plates.includes(s.vehicleReg)) return false;
    if (hub && db.chargepoints.find((c) => c.id === s.chargerId)?.hub !== hub) return false;
    return true;
  });

  // Hide the entire section when nothing matching the filters is charging
  if (!ongoing.length) return null;

  const rows = ongoing.slice((pageNum - 1) * limit, pageNum * limit);

  const cellBase: React.CSSProperties = {
    padding: "12px",
    fontSize: "14px",
    color: "#555",
    verticalAlign: "top",
  };

  const readyText = (minutes: number | null, soc: number, targetSoc: number) => {
    // Drawing nothing has two very different causes. A vehicle that has reached
    // its charge limit is done — it was showing "waiting for its charging slot",
    // which reads as a vehicle being held back rather than a finished one.
    if (soc >= targetSoc - 0.05) return "Fully charged";
    // Otherwise there is no power because the optimizer has parked this vehicle
    // until a cheaper/sunnier slot, and an ETA would be meaningless.
    if (minutes === null) return "Waiting for its charging slot";
    if (minutes < 5) return "Ready in few minutes";
    return `Ready in ${minutes} min`;
  };

  return (
    <div
      style={{
        maxHeight: "520px",
        overflowY: "auto",
        border: "1px solid #f0f0f0",
        borderRadius: "10px",
        padding: "14px",
        backgroundColor: "white",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
      }}
    >
      <div
        style={{
          marginBottom: "20px",
          position: "sticky",
          top: 0,
          backgroundColor: "white",
          zIndex: 10,
          paddingBottom: "4px",
          borderBottom: "1px solid #f0f0f0",
        }}
      >
        <Title level={5}>Live Vehicle Charging Status</Title>
      </div>

      <table
        style={{
          width: "100%",
          borderCollapse: "separate",
          borderSpacing: "0 8px",
          tableLayout: "fixed",
        }}
      >
        <tbody>
          {rows.map((session) => {
            const vehicle = db.vehicles.find((v) => v.reg === session.vehicleReg);
            const cp = db.chargepoints.find((c) => c.id === session.chargerId);
            const state = sim.get(session.id);
            const soc = state?.soc ?? vehicle?.soc ?? session.socStart;
            const powerKw = state?.powerKw ?? 0;
            const eta = state
              ? etaMinutes(state, {
                  connectorKw:
                    cp?.connectors.find((cn) => cn.id === session.connectorId)?.powerKw ?? 3,
                  vehicleMaxKw: vehicle?.maxChargeKw,
                  batteryKwh: vehicle?.batteryKwh ?? 8,
                  targetSoc: vehicle?.socCapPct ?? 100,
                  plannedKw: null,
                })
              : null;
            return (
              <tr key={session.id} style={{ backgroundColor: "#fff", borderRadius: "8px" }}>
                <td
                  style={{ ...cellBase, width: "20%", cursor: "pointer" }}
                  onClick={() => vehicle && router.push(`/vehicles/${vehicle.id}`)}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <VehiclePhoto vehicle={vehicle} width={64} height={44} radius={6} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600 }}>
                        {vehicle ? `${vehicle.make} ${vehicle.model}` : "—"}
                      </div>
                      <div style={{ fontSize: "14px", color: "#888" }}>{session.vehicleReg}</div>
                    </div>
                  </div>
                </td>
                <td
                  style={{ ...cellBase, width: "30%", cursor: "pointer" }}
                  onClick={() => cp && router.push(`/chargingStations/${cp.id}`)}
                >
                  <div style={{ fontWeight: 600 }}>{session.chargerName}</div>
                  <div style={{ fontSize: "14px", color: "#888" }}>
                    CPID - {session.chargerId} | Connector - {session.connectorId}
                  </div>
                </td>
                <td style={{ ...cellBase, width: "30%" }}>
                  <div style={{ marginBottom: "6px", marginRight: "64px" }}>
                    <VehicleStatusProgress percentage={soc} />
                  </div>
                  <div style={{ fontSize: "14px", color: "#555" }}>
                    {`SoC: ${Number(soc).toFixed(1)}%, `}
                    {readyText(eta, soc, vehicle?.socCapPct ?? 100)}
                    <span style={{ color: powerKw > 0 ? "#16a34a" : "#9ca3af", fontWeight: 600 }}>
                      {` · ${powerKw.toFixed(2)} kW`}
                    </span>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div
        style={{
          position: "sticky",
          bottom: 0,
          backgroundColor: "white",
          zIndex: 10,
          padding: "10px 0",
          borderTop: "1px solid #f0f0f0",
          width: "100%",
          display: "flex",
          justifyContent: "flex-end",
        }}
      >
        <Pagination
          defaultCurrent={pageNum}
          total={ongoing.length}
          pageSize={limit}
          showSizeChanger={false}
          onChange={(page) => setPageNum(page)}
        />
      </div>
    </div>
  );
}
