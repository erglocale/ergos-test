"use client";

import { ExclamationCircleFilled, ReloadOutlined } from "@ant-design/icons";
import { Button, Col, message, Modal, Row, Typography } from "antd";
import { resetDb, useDb } from "@/data/store";

const { Title, Text } = Typography;
const { confirm } = Modal;

// Sandbox port of pages/AccountManagement/CommissionDetails.jsx ("Organization
// Settings"). The org id is a fixed sandbox value; the company name comes from
// db.profile. Also hosts the sandbox-only "Reset demo data" control.
export default function OrganizationSettings() {
  const db = useDb();
  const [messageApi, contextHolder] = message.useMessage();

  return (
    <>
      {contextHolder}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Title level={4} style={{ marginBottom: "20px", marginTop: "10px" }}>
          Organization Details
        </Title>
      </div>
      <div style={{ maxHeight: "88%", overflowY: "auto" }}>
        <div
          style={{
            border: "1px solid #f0f0f0",
            padding: "20px",
            borderRadius: "8px",
          }}
        >
          <div>
            <Title level={5}>Organization Information</Title>
          </div>
          <Row gutter={[16, 16]}>
            <Col span={12}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-start",
                  flexDirection: "column",
                }}
              >
                <Text style={{ color: "gray", marginBottom: "10px" }}>
                  Organization Id
                </Text>
                <Text copyable>org-erglocale-sandbox-001</Text>
              </div>
            </Col>
            <Col span={12}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-start",
                  flexDirection: "column",
                }}
              >
                <Text style={{ color: "gray", marginBottom: "10px" }}>
                  Organization Name
                </Text>
                <div style={{ display: "flex" }}>
                  <Text style={{ marginRight: "6px" }}>{db.profile.company}</Text>
                </div>
              </div>
            </Col>
          </Row>
        </div>

        {/* Sandbox-only: reset the localStorage-backed demo data */}
        <div
          style={{
            border: "1px solid #f0f0f0",
            padding: "20px",
            borderRadius: "8px",
            marginTop: "20px",
          }}
        >
          <div>
            <Title level={5}>Demo Data</Title>
          </div>
          <Text style={{ color: "gray", display: "block", marginBottom: 12 }}>
            The sandbox runs on locally stored demo data. Resetting restores the
            original fixtures — every change you made (added rows, applied
            suggestions, profile edits) is discarded.
          </Text>
          <Button
            danger
            icon={<ReloadOutlined />}
            onClick={() => {
              confirm({
                title: "Reset demo data?",
                icon: <ExclamationCircleFilled />,
                content:
                  "All changes made in the sandbox will be lost and the original demo dataset will be restored.",
                okText: "Reset",
                okButtonProps: { danger: true },
                onOk() {
                  resetDb();
                  messageApi.success("Demo data has been reset.");
                },
              });
            }}
          >
            Reset demo data
          </Button>
        </div>
      </div>
    </>
  );
}
