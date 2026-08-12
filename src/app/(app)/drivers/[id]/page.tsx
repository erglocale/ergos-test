"use client";

import { InfoCircleOutlined } from "@ant-design/icons";
import {
  Badge,
  Card,
  Col,
  Divider,
  Empty,
  Row,
  Statistic,
  Tabs,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import dayjs from "dayjs";
import { useParams } from "next/navigation";
import { useMemo } from "react";
import DriverAnalytics from "@/components/drivers/DriverAnalytics";
import DriverCheckinLogs from "@/components/drivers/DriverCheckinLogs";
import DriverDocumentsTab from "@/components/drivers/DriverDocumentsTab";
import { useDb } from "@/data/store";

const { Title } = Typography;

export default function DriverDetail() {
  const params = useParams<{ id: string }>();
  const driverId = decodeURIComponent(params.id);
  const db = useDb();

  const driver = db.drivers.find((d) => d.id === driverId);

  // Production hits the driver usage single-metrics analytics endpoint;
  // the sandbox aggregates db.trips / db.sessions by driver name instead.
  const usage = useMemo(() => {
    if (!driver) {
      return { kms: 0, cycles: 0, energyUsed: 0, hours: 0, energyCharged: 0 };
    }
    const trips = db.trips.filter((t) => t.driverName === driver.name);
    const sessions = db.sessions.filter((s) => s.driverName === driver.name);
    return {
      kms: trips.reduce((acc, t) => acc + Number(t.distanceKm || 0), 0),
      cycles: sessions.length,
      energyUsed: trips.reduce((acc, t) => acc + Number(t.energyKwh || 0), 0),
      hours: trips.reduce(
        (acc, t) => acc + Math.max(0, dayjs(t.endTime).diff(dayjs(t.startTime), "minute")) / 60,
        0,
      ),
      energyCharged: sessions.reduce((acc, s) => acc + Number(s.energyKwh || 0), 0),
    };
  }, [db.trips, db.sessions, driver]);

  // Production's active checkin-session lookup — the sandbox treats the
  // driver's assigned vehicle as "in use" while its status is Driving.
  const activeVehicle = useMemo(() => {
    if (!driver) return undefined;
    const vehicle = db.vehicles.find(
      (v) =>
        (driver.vehicleReg !== null && v.reg === driver.vehicleReg) || v.driverId === driver.id,
    );
    return vehicle?.status === "Driving" ? vehicle : undefined;
  }, [db.vehicles, driver]);

  if (!driver) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Empty description={`Driver ${driverId} not found`} />
      </div>
    );
  }

  const [firstName, ...rest] = driver.name.split(" ");
  const lastName = rest.join(" ");

  const tabItems = [
    {
      key: "1",
      label: "Details",
      children: (
        <Row gutter={[16, 16]}>
          <Col span={12} style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ flex: 1 }}>
              <Card
                style={{
                  borderRadius: "10px",
                  border: "1px solid #f0f0f0",
                  width: "100%",
                  height: "100%",
                  display: "flex",
                  flexDirection: "column",
                  boxShadow: "0 4px 12px rgba(0, 0, 0, 0.1)",
                }}
                styles={{
                  body: { flex: 1, display: "flex", flexDirection: "column" },
                }}
              >
                <Row style={{ paddingBottom: "12px" }}>
                  <Col span={12}>
                    <div style={{ color: "#8c8c8c", fontSize: "14px" }}>Name</div>
                    <div style={{ fontSize: "16px", fontWeight: 400 }}>
                      {firstName} {lastName}
                    </div>
                  </Col>
                </Row>

                <Divider style={{ margin: "0 0 12px 0" }} />

                <Row style={{ paddingBottom: "12px" }}>
                  <Col span={12}>
                    <div style={{ color: "#8c8c8c", fontSize: "14px" }}>Phone</div>
                    <div style={{ fontSize: "16px", fontWeight: 400 }}>{driver.phone}</div>
                  </Col>
                  <Col span={12}>
                    <div style={{ color: "#8c8c8c", fontSize: "14px" }}>Email</div>
                    <div style={{ fontSize: "16px", fontWeight: 400 }}>{driver.email}</div>
                  </Col>
                </Row>

                <Divider style={{ margin: "0 0 12px 0" }} />

                <Row style={{ paddingBottom: "12px" }}>
                  <Col span={12}>
                    <div style={{ color: "#8c8c8c", fontSize: "14px" }}>Address</div>
                    <div style={{ fontSize: "16px", fontWeight: 400 }}>{driver.address}</div>
                  </Col>
                  <Col span={12}>
                    <div style={{ color: "#8c8c8c", fontSize: "14px" }}>State</div>
                    <div style={{ fontSize: "16px", fontWeight: 400 }}>{driver.state}</div>
                  </Col>
                </Row>

                <Divider style={{ margin: "0 0 12px 0" }} />

                <Row style={{ paddingBottom: "12px" }}>
                  <Col span={12}>
                    <div style={{ color: "#8c8c8c", fontSize: "14px" }}>City</div>
                    <div style={{ fontSize: "16px", fontWeight: 400 }}>{driver.city}</div>
                  </Col>
                  <Col span={12}>
                    <div style={{ color: "#8c8c8c", fontSize: "14px" }}>Pincode</div>
                    <div style={{ fontSize: "16px", fontWeight: 400 }}>{driver.pin}</div>
                  </Col>
                </Row>

                <Divider style={{ margin: "0 0 12px 0" }} />

                <Row style={{ paddingBottom: "12px" }}>
                  <Col span={12}>
                    <div style={{ color: "#8c8c8c", fontSize: "14px" }}>Id</div>
                    <div style={{ fontSize: "16px", fontWeight: 400 }}>{driver.id}</div>
                  </Col>
                </Row>

                <div style={{ flexGrow: 1 }}></div>
              </Card>
            </div>
          </Col>

          <Col span={12} style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ flex: 1 }}>
              <Row gutter={[14, 14]} style={{ height: "100%" }}>
                <Col span={12}>
                  <Card
                    hoverable
                    style={{ height: "100%", boxShadow: "0 4px 12px rgba(0, 0, 0, 0.1)" }}
                  >
                    <Statistic
                      title={
                        <div className="flex">
                          <p>Total kms driven</p>
                          <Tooltip
                            title="Total distance travelled by the driver (all time)"
                            mouseEnterDelay={0}
                          >
                            <InfoCircleOutlined className="ml-1" />
                          </Tooltip>
                        </div>
                      }
                      styles={{ content: { fontWeight: 600, fontSize: "35px" } }}
                      suffix={<p className="text-2xl font-normal">kms</p>}
                      value={usage.kms}
                      precision={2}
                    />
                  </Card>
                </Col>
                <Col span={12}>
                  <Card
                    hoverable
                    style={{ height: "100%", boxShadow: "0 4px 12px rgba(0, 0, 0, 0.1)" }}
                  >
                    <Statistic
                      title={
                        <div className="flex">
                          <p>Total charging cycles</p>
                          <Tooltip
                            title="Total charging cycles performed by the driver (all time) - processed on ergOS"
                            mouseEnterDelay={0}
                          >
                            <InfoCircleOutlined className="ml-1" />
                          </Tooltip>
                        </div>
                      }
                      styles={{ content: { fontWeight: 600, fontSize: "35px" } }}
                      value={usage.cycles}
                    />
                  </Card>
                </Col>

                <Col span={12}>
                  <Card
                    hoverable
                    style={{ height: "100%", boxShadow: "0 4px 12px rgba(0, 0, 0, 0.1)" }}
                  >
                    <Statistic
                      title={
                        <div className="flex">
                          <p>Total energy consumed</p>
                          <Tooltip
                            title="Total energy consumed by the driver (all time) — energy used while driving."
                            mouseEnterDelay={0}
                          >
                            <InfoCircleOutlined className="ml-1" />
                          </Tooltip>
                        </div>
                      }
                      styles={{ content: { fontWeight: 600, fontSize: "35px" } }}
                      value={usage.energyUsed}
                      suffix={<p className="text-2xl font-normal">kWh</p>}
                      precision={2}
                    />
                  </Card>
                </Col>

                <Col span={12}>
                  <Card
                    hoverable
                    style={{ height: "100%", boxShadow: "0 4px 12px rgba(0, 0, 0, 0.1)" }}
                  >
                    <Statistic
                      title={
                        <div className="flex">
                          <p>Total hours driven</p>
                          <Tooltip
                            title="Total hours driven by the driver (all time)"
                            mouseEnterDelay={0}
                          >
                            <InfoCircleOutlined className="ml-1" />
                          </Tooltip>
                        </div>
                      }
                      styles={{ content: { fontWeight: 600, fontSize: "35px" } }}
                      value={usage.hours}
                      precision={0}
                      suffix={<p className="text-2xl font-normal">hrs</p>}
                    />
                  </Card>
                </Col>

                <Col span={12}>
                  <Card
                    hoverable
                    style={{ height: "100%", boxShadow: "0 4px 12px rgba(0, 0, 0, 0.1)" }}
                  >
                    <Statistic
                      title={
                        <div className="flex">
                          <p>Total energy charged</p>
                          <Tooltip
                            title="Total energy charged (all time) — energy delivered during charging."
                            mouseEnterDelay={0}
                          >
                            <InfoCircleOutlined className="ml-1" />
                          </Tooltip>
                        </div>
                      }
                      styles={{ content: { fontWeight: 600, fontSize: "35px" } }}
                      value={usage.energyCharged.toFixed(2)}
                      suffix={<p className="text-2xl font-normal">kWh</p>}
                    />
                  </Card>
                </Col>
              </Row>
            </div>
          </Col>
        </Row>
      ),
    },
    {
      key: "2",
      label: "Analytics",
      children: <DriverAnalytics driver={driver} />,
    },
    {
      key: "3",
      label: "Check-In Logs",
      children: <DriverCheckinLogs driver={driver} />,
    },
    {
      key: "4",
      label: "Documents",
      children: <DriverDocumentsTab driver={driver} />,
    },
  ];

  return (
    <div style={{ marginLeft: 16, marginRight: 16 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Title level={3} style={{ marginBottom: "0px" }}>
          Driver -{" "}
          <span
            style={{
              fontSize: "20px",
              fontWeight: 400,
              color: "gray",
              alignItems: "center",
            }}
          >
            {firstName} {lastName}
          </span>
          <span style={{ alignItems: "center" }}>
            {activeVehicle && (
              <Tag
                icon={
                  <Badge
                    status="processing"
                    size="default"
                    styles={{
                      indicator: {
                        height: "12px",
                        width: "12px",
                        border: "0px",
                        color: "#52c41a",
                        backgroundColor: "#52c41a",
                      },
                      root: {
                        marginRight: "4px",
                      },
                    }}
                  />
                }
                style={{
                  paddingTop: "4px",
                  paddingBottom: "4px",
                  paddingLeft: "8px",
                  paddingRight: "10px",
                  marginLeft: "10px",
                }}
              >
                Currently using {activeVehicle.make} {activeVehicle.model} - {activeVehicle.reg}
              </Tag>
            )}
          </span>
        </Title>
      </div>

      <Tabs defaultActiveKey="1" tabBarStyle={{ marginBottom: "20px" }} items={tabItems} />
    </div>
  );
}
