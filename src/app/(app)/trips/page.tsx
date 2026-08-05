"use client";

import { Typography } from "antd";
import TripsList from "@/components/trips/TripsList";

const { Title } = Typography;

export default function Trips() {
  return (
    <div style={{ marginLeft: 16, marginRight: 16 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 20,
        }}
      >
        <Title level={3} style={{ marginBottom: 0 }}>
          Trips
        </Title>
      </div>
      <TripsList />
    </div>
  );
}
