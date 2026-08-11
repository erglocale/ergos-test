"use client";

import { Tabs, Typography } from "antd";
import ChargingSessionAnalysis from "@/components/reports/ChargingSessionAnalysis";
import CostPerDistanceAnalysis from "@/components/reports/CostPerDistanceAnalysis";
import HubEnergyReport from "@/components/reports/HubEnergyReport";
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
    key: "costPerDistance",
    label: "Cost per Distance",
    children: <CostPerDistanceAnalysis />,
  },
  {
    key: "hubEnergy",
    label: "Charging Hub Energy Report",
    children: <HubEnergyReport />,
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
