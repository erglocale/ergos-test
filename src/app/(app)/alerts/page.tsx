"use client";

import { Badge, Tabs, Typography } from "antd";
import dayjs from "dayjs";
import { useMemo } from "react";
import ChargerWarnings from "@/components/alerts/ChargerWarningsList";
import { buildChargerWarningRows } from "@/components/alerts/chargerWarningRows";
import VehicleWarnings from "@/components/alerts/VehicleWarningsList";
import { useDb } from "@/data/store";

const { Title } = Typography;

export default function Alerts() {
  const db = useDb();

  // Replica of useChargersWarnings({ status: 'New', startDate: subDays(2), endDate: now }),
  // counted off the same detectors the tab itself renders so the badge can
  // never disagree with the table underneath it.
  const chargerWarningsCount = useMemo(() => {
    const start = dayjs().subtract(2, "day");
    return buildChargerWarningRows({
      chargepoints: db.chargepoints,
      sessions: db.sessions,
      chargerWarnings: db.chargerWarnings,
      vehicles: db.vehicles,
      workOrders: db.workOrders,
    }).filter((r) => r.status === "Active" && !dayjs(r.triggeredAt).isBefore(start)).length;
  }, [db.chargepoints, db.sessions, db.chargerWarnings, db.vehicles, db.workOrders]);

  return (
    <div style={{ padding: "0 16px" }}>
      <Title level={3} style={{ marginBottom: 16 }}>
        Alerts
      </Title>

      <Tabs
        defaultActiveKey="1"
        tabBarGutter={40}
        tabBarStyle={{
          borderBottom: "1px solid #e8e8e8",
          marginBottom: 20,
        }}
        items={[
          {
            key: "1",
            label: "Vehicle Alerts",
            children: <VehicleWarnings />,
          },
          {
            key: "2",
            label: (
              <span>
                Charger Alerts
                <Badge
                  count={chargerWarningsCount || 0}
                  overflowCount={99}
                  style={{
                    backgroundColor:
                      chargerWarningsCount > 0 ? "#dc2626" : "#d1d5db",
                    marginLeft: 8,
                    boxShadow: "0 0 0 1px #fff",
                    position: "relative",
                    top: -14,
                  }}
                  size="small"
                />
              </span>
            ),
            children: <ChargerWarnings />,
          },
        ]}
      />
    </div>
  );
}
