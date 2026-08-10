"use client";

import { Pagination, Typography } from "antd";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useDb } from "@/data/store";

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

export default function LiveVehicleChargingStatus() {
  const db = useDb();
  const router = useRouter();
  const [limit] = useState(10);
  const [pageNum, setPageNum] = useState(1);

  const ongoing = db.sessions.filter((s) => s.endTime === null);

  // Hide the entire section when there are no live charging sessions
  if (!ongoing.length) return null;

  const rows = ongoing.slice((pageNum - 1) * limit, pageNum * limit);

  const cellBase: React.CSSProperties = {
    padding: "12px",
    fontSize: "14px",
    color: "#555",
    verticalAlign: "top",
  };

  const readyText = (soc: number, powerKw: number, batteryKwh: number, capPct: number) => {
    const remainingKwh = Math.max(0, ((capPct - soc) / 100) * batteryKwh);
    const minutes = powerKw > 0 ? Math.round((remainingKwh / powerKw) * 60) : 0;
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
            const soc = vehicle?.soc ?? session.socStart;
            const powerKw = cp?.connectors[0]?.powerKw ?? 3;
            return (
              <tr key={session.id} style={{ backgroundColor: "#fff", borderRadius: "8px" }}>
                <td
                  style={{ ...cellBase, width: "20%", cursor: "pointer" }}
                  onClick={() => vehicle && router.push(`/vehicles/${vehicle.id}`)}
                >
                  <div style={{ fontWeight: 600 }}>
                    {vehicle ? `${vehicle.make} ${vehicle.model}` : "—"}
                  </div>
                  <div style={{ fontSize: "14px", color: "#888" }}>{session.vehicleReg}</div>
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
                    {readyText(soc, powerKw, vehicle?.batteryKwh ?? 8, vehicle?.socCapPct ?? 100)}
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
