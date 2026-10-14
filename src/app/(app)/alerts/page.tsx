"use client";

import { Badge, Tabs, Typography } from "antd";
import ChargerWarnings, { useChargerAlertRows } from "@/components/alerts/ChargerWarningsList";
import VehicleWarnings from "@/components/alerts/VehicleWarningsList";

const { Title } = Typography;

export default function Alerts() {
  // Replica of useChargerAlerts({ state: 'open', limit: 1 }).count
  const chargerWarningsCount = useChargerAlertRows().filter((r) => !r.resolvedAt).length;

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
