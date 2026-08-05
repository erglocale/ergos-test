"use client";

import { CheckSquareOutlined, WarningOutlined } from "@ant-design/icons";
import { Button, Collapse, Descriptions, Empty, Tabs, Tag, Typography } from "antd";
import { useParams } from "next/navigation";
import { useState } from "react";
import ChargerAnalytics from "@/components/chargers/ChargerAnalytics";
import ChargerControls from "@/components/chargers/ChargerControls";
import ChargerSessionsList from "@/components/chargers/ChargerSessionsList";
import Connectors from "@/components/chargers/Connectors";
import { deriveCharger } from "@/components/chargers/derive";
import EditChargerDetails from "@/components/chargers/EditChargerDetailsModal";
import QRCodeDetailModal from "@/components/chargers/QRCodeModal";
import { useDb } from "@/data/store";

const { Title, Text } = Typography;

function StatusDot({ online }: { online: boolean }) {
  return (
    <span
      style={{
        display: "inline-block",
        height: "12px",
        width: "12px",
        borderRadius: "50%",
        backgroundColor: online ? "#52c41a" : "#ff4d4f",
        marginRight: "6px",
      }}
    />
  );
}

export default function Details() {
  const params = useParams<{ id: string }>();
  const cpid = decodeURIComponent(params.id);
  const db = useDb();
  const chargerData = db.chargepoints.find((cp) => cp.id === cpid);

  const [isEditChargerDetailsModalOpen, setIsEditChargerModalOpen] =
    useState(false);
  const [isQRCodeModalOpen, setIsQRCodeModalOpen] = useState(false);

  if (!chargerData) {
    return (
      <div style={{ marginTop: 60 }}>
        <Empty description={`Chargepoint ${cpid} not found`} />
      </div>
    );
  }

  const derived = deriveCharger(chargerData);
  const online = chargerData.status === "Online";

  const detailsTab = (
    <>
      <div style={{ marginBottom: "20px" }}>
        <Collapse
          defaultActiveKey={["1"]}
          style={{ width: "100%" }}
          items={[
            {
              key: "1",
              label: <span style={{ fontWeight: "bold" }}>Charger Controls</span>,
              children: <ChargerControls cp={chargerData} />,
            },
          ]}
        />
      </div>
      <div>
        <Descriptions
          bordered
          size="middle"
          style={{ background: "white", borderRadius: "8px" }}
          items={[
            { key: "id", label: "Chargepoint Id", children: chargerData.id },
            { key: "name", label: "Name", children: chargerData.name },
            { key: "stationId", label: "Station Id", children: derived.stationId },
            { key: "region", label: "Region", children: derived.region },
            { key: "city", label: "City", children: derived.city },
            { key: "pincode", label: "Pincode", children: derived.pincode },
            {
              key: "address",
              label: "Address",
              children: chargerData.address,
              span: 3,
            },
            {
              key: "identification",
              label: "Identification",
              children: derived.identification,
            },
            {
              key: "coordinates",
              label: "Coordinates",
              children: `${chargerData.lng}, ${chargerData.lat}`,
            },
            {
              key: "openTimings",
              label: "Open Timings",
              children: `${derived.openTime} - ${derived.closeTime}`,
            },
            { key: "capacity", label: "Capacity", children: `${derived.kw} kW` },
            { key: "type", label: "Type", children: derived.type },
            {
              key: "supportedVehicles",
              label: "Supported Vehicles",
              children:
                derived.vehicleType === "4"
                  ? "4 / 3 Wheelers"
                  : derived.vehicleType === "3"
                    ? "3 / 2 Wheelers"
                    : "2 Wheelers",
            },
            { key: "vendor", label: "Vendor", children: chargerData.vendor },
            { key: "model", label: "Model", children: chargerData.model },
            {
              key: "verified",
              label: "Verified",
              children: derived.verified ? (
                <CheckSquareOutlined style={{ fontSize: "24px", color: "green" }} />
              ) : (
                <WarningOutlined style={{ fontSize: "24px", color: "red" }} />
              ),
            },
            {
              key: "enabled",
              label: "Enabled",
              children: derived.enabled ? (
                <CheckSquareOutlined style={{ fontSize: "24px", color: "green" }} />
              ) : (
                <WarningOutlined style={{ fontSize: "24px", color: "red" }} />
              ),
            },
            {
              key: "pricePerKwh",
              label: "Price per kWh",
              children: chargerData.tariffPerKwh,
            },
            {
              key: "actions",
              label: "Actions",
              children: (
                <Button
                  style={{ marginTop: "10px" }}
                  type="primary"
                  ghost
                  onClick={() => setIsQRCodeModalOpen(true)}
                >
                  View QRCode
                </Button>
              ),
            },
          ]}
        />
      </div>
      <div style={{ marginTop: "20px", marginBottom: "20px" }}>
        <Title level={5}>Connectors</Title>
        <Connectors cp={chargerData} />
      </div>
    </>
  );

  return (
    <div style={{ marginLeft: 16, marginRight: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <Title level={2} style={{ marginBottom: "0px" }}>
          {cpid}{" "}
        </Title>
        <Button type="primary" onClick={() => setIsEditChargerModalOpen(true)}>
          Edit Details
        </Button>
        <EditChargerDetails
          isModalOpen={isEditChargerDetailsModalOpen}
          changeModalVisibility={setIsEditChargerModalOpen}
          cpid={cpid}
          cp={chargerData}
        />
      </div>
      <div style={{ display: "flex", alignItems: "center" }}>
        <Text>
          <StatusDot online={online} />
          {online ? <Tag color="green">Online</Tag> : <Tag color="red">Offline</Tag>}
          {derived.isSmartCharger && (
            <Tag color="blue" style={{ fontWeight: 600 }}>
              Smart Charger
            </Tag>
          )}
        </Text>
      </div>

      <div style={{ marginTop: 8, marginBottom: 12 }}>
        <Tag>{chargerData.hub}</Tag>
      </div>

      <Tabs
        defaultActiveKey="1"
        items={[
          { key: "1", label: "Details", children: detailsTab },
          {
            key: "2",
            label: "Analytics",
            children: <ChargerAnalytics cpid={cpid} />,
            style: { paddingTop: "0px" },
          },
          {
            key: "3",
            label: "Sessions",
            children: <ChargerSessionsList chargerId={cpid} />,
            style: { paddingTop: "0px" },
          },
        ]}
      />
      <QRCodeDetailModal
        cpid={cpid}
        isModalVisible={isQRCodeModalOpen}
        changeModalVisible={setIsQRCodeModalOpen}
      />
    </div>
  );
}
