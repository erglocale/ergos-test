"use client";

import { Button, Card, Col, Row, Typography } from "antd";
import { useState } from "react";
import DriversList from "@/components/drivers/DriversList";
import RegisterDriverModal from "@/components/drivers/RegisterDriverModal";
import { useDb } from "@/data/store";

const { Title } = Typography;

export default function Home() {
  const db = useDb();
  const [openRegisterDriverModal, setOpenRegisterDriverModal] = useState(false);

  const totalDrivers = db.drivers.length;
  const driversCurrentlyDriving = db.vehicles.filter(
    (v) => v.status === "Driving" && v.driverId !== null,
  ).length;

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
          Drivers
        </Title>

        <Button type="primary" onClick={() => setOpenRegisterDriverModal(true)}>
          Add Driver
        </Button>
      </div>
      <Row gutter={[14, 14]} style={{ height: "110px", marginTop: "20px" }}>
        <Col span={6}>
          <Card hoverable style={{ height: "100%" }}>
            <div className="flex flex-col gap-2">
              <p className="text-gray-400">Total Drivers Registered</p>
              {totalDrivers ? (
                <p className="text-3xl font-bold">{totalDrivers}</p>
              ) : (
                <p className="text-xl font-normal text-gray-500">Not Available</p>
              )}
            </div>
          </Card>
        </Col>

        <Col span={6}>
          <Card hoverable style={{ height: "100%" }}>
            <div className="flex flex-col gap-2">
              <p className="text-gray-400">Drivers currently driving</p>
              <p className="text-3xl font-bold">{driversCurrentlyDriving}</p>
            </div>
          </Card>
        </Col>
      </Row>
      <div style={{ marginTop: "30px" }}>
        <DriversList />
      </div>
      <RegisterDriverModal
        isModalOpen={openRegisterDriverModal}
        handleModalVisibility={setOpenRegisterDriverModal}
      />
    </div>
  );
}
