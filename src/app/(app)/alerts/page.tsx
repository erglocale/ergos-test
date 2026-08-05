"use client";

import { Badge, Tabs, Typography } from "antd";
import { useMemo } from "react";
import ChargerWarningsList from "@/components/alerts/ChargerWarningsList";
import VehicleWarningsList from "@/components/alerts/VehicleWarningsList";
import { isVehicleAlert } from "@/components/alerts/alertUtils";
import { useDb } from "@/data/store";

const { Title } = Typography;

export default function Alerts() {
  const db = useDb();

  const chargerWarningsCount = useMemo(
    () => db.alerts.filter((a) => !isVehicleAlert(a) && !a.acknowledged).length,
    [db.alerts],
  );

  return (
    <div style={{ padding: "0 16px" }}>
      <Title level={3} style={{ marginBottom: 16 }}>
        Alerts
      </Title>

      <Tabs
        defaultActiveKey="1"
        tabBarGutter={40}
        tabBarStyle={{ borderBottom: "1px solid #e8e8e8", marginBottom: 20 }}
        items={[
          {
            key: "1",
            label: "Vehicle Alerts",
            children: <VehicleWarningsList />,
          },
          {
            key: "2",
            label: (
              <span>
                Charger Warnings
                <Badge
                  count={chargerWarningsCount || 0}
                  overflowCount={99}
                  style={{
                    backgroundColor: chargerWarningsCount > 0 ? "#dc2626" : "#d1d5db",
                    marginLeft: 8,
                    boxShadow: "0 0 0 1px #fff",
                    position: "relative",
                    top: -14,
                  }}
                  size="small"
                />
              </span>
            ),
            children: <ChargerWarningsList />,
          },
        ]}
      />
    </div>
  );
}
