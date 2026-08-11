"use client";

import { Col, Row, Tabs } from "antd";
import { useState } from "react";
import LiveVehicleChargingStatus from "@/components/charging-sessions/LiveVehicleChargingStatus";
import SessionsAnalytics from "@/components/charging-sessions/SessionsAnalytics";
import SessionsList from "@/components/charging-sessions/SessionsList";

export default function ChargingSessions() {
  const [activeTabKey, setActiveTabKey] = useState("1");

  return (
    <div style={{ marginLeft: 16, marginRight: 16 }}>
      <Tabs
        activeKey={activeTabKey}
        style={{ marginTop: "16px" }}
        onChange={(key) => setActiveTabKey(key)}
        items={[
          {
            key: "1",
            label: "Charging Sessions",
            children: (
              // Filters live at the top of the tab and drive the live block as
              // well as the table (demo spec item 6), so SessionsList renders
              // the live section between its filter bar and its table.
              <Row gutter={[14, 14]} style={{ marginTop: "20px", marginBottom: "20px" }}>
                <Col span={24} style={{ marginBottom: "20px" }}>
                  <SessionsList
                    renderLive={(f) => (
                      <LiveVehicleChargingStatus hub={f.hub} plates={f.plates} />
                    )}
                  />
                </Col>
              </Row>
            ),
          },
          {
            key: "2",
            label: "Analytics",
            children: <SessionsAnalytics />,
          },
        ]}
      />
    </div>
  );
}
