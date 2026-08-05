"use client";

import { Tabs, Typography } from "antd";
import ChargingSessionAnalysis from "@/components/reports/ChargingSessionAnalysis";
import RsPerKmAnalysis from "@/components/reports/RsPerKmAnalysis";
import VehicleUtilizationAnalysis from "@/components/reports/VehicleUtilizationAnalysis";

const { Title } = Typography;

const TAB_ITEMS = [
  {
    key: "chargingSessionAnalysis",
    label: "Charging Session Analysis",
    children: <ChargingSessionAnalysis />,
  },
  {
    key: "vehicleUtilization",
    label: "Vehicle Utilization Analysis",
    children: <VehicleUtilizationAnalysis />,
  },
  {
    key: "rsPerKm",
    label: "Rs / km Analysis",
    children: <RsPerKmAnalysis />,
  },
];

export default function Reports() {
  return (
    <div style={{ marginLeft: 16, marginRight: 16 }}>
      <Title level={3} style={{ marginBottom: 16 }}>
        Reports
      </Title>
      <Tabs defaultActiveKey="chargingSessionAnalysis" items={TAB_ITEMS} />
    </div>
  );
}
