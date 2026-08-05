"use client";

import { Col, Row, Tabs } from "antd";
import { useState } from "react";
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
              <Row gutter={[14, 14]} style={{ marginTop: "20px", marginBottom: "20px" }}>
                <Col span={24} style={{ marginBottom: "20px" }}>
                  <SessionsList />
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
