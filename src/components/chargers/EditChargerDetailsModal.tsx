"use client";

import { Col, Input, Modal, Row, Select, TimePicker } from "antd";
import { useEffect, useState } from "react";
import { updateRow } from "@/data/store";
import type { Chargepoint } from "@/data/types";
import { deriveCharger } from "./derive";
import { message } from "@/lib/antdStatic";

const { TextArea } = Input;

export default function EditChargerDetails({
  isModalOpen,
  changeModalVisibility,
  cpid,
  cp,
}: {
  isModalOpen: boolean;
  changeModalVisibility: (open: boolean) => void;
  cpid: string;
  cp: Chargepoint | undefined;
}) {
  const [updatingChargerDetails, setUpdatingChargerDetails] = useState(false);
  const [chargerName, setChargerName] = useState("");
  const [region, setRegion] = useState("");
  const [city, setCity] = useState("");
  const [pincode, setPincode] = useState<number | null>(null);
  const [address, setAddress] = useState("");
  const [latitude, setLatitude] = useState(0);
  const [longitude, setLongitude] = useState(0);
  const [pricePerkWh, setPricePerkWh] = useState(20);
  const [capacity, setCapacity] = useState(7);
  const [supportedVehicleType, setSupportedVehicleType] = useState("2");
  const [type, setType] = useState("AC");

  function updateChargerDetails() {
    if (!cp) return;
    setUpdatingChargerDetails(true);
    // Only the fields the sandbox store actually has are persisted; the rest
    // (region/city/pincode/type/vehicle type/timings) are display-only here.
    updateRow("chargepoints", cp.id, {
      name: chargerName,
      address,
      lat: latitude,
      lng: longitude,
      tariffPerKwh: pricePerkWh,
      connectors: cp.connectors.map((c) => ({ ...c, powerKw: capacity })),
    });
    message.success("Details Updated");
    setUpdatingChargerDetails(false);
    changeModalVisibility(false);
  }

  useEffect(() => {
    if (cp) {
      const derived = deriveCharger(cp);
      setChargerName(cp.name);
      setRegion(derived.region);
      setCity(derived.city);
      setPincode(Number(derived.pincode));
      setAddress(cp.address);
      setLatitude(cp.lat);
      setLongitude(cp.lng);
      setPricePerkWh(cp.tariffPerKwh);
      setCapacity(derived.kw);
      setSupportedVehicleType(derived.vehicleType);
      setType(derived.type);
    }
  }, [cp]);

  return (
    <Modal
      title="Edit Charger Configurations"
      open={isModalOpen}
      onOk={() => updateChargerDetails()}
      okText="Update Details"
      onCancel={() => changeModalVisibility(false)}
      confirmLoading={updatingChargerDetails}
    >
      <Row gutter={[14, 14]} style={{ marginTop: "20px" }}>
        <Col span={6}>Open Timings</Col>
        <Col span={18}>
          <TimePicker.RangePicker
            style={{ width: "100%" }}
            format="h:mm a"
            use12Hours={false}
          />
        </Col>
      </Row>
      <Row gutter={[14, 14]} style={{ marginTop: "20px" }}>
        <Col span={6}>Chargepoint Name</Col>
        <Col span={18}>
          <Input
            value={chargerName}
            onChange={(e) => setChargerName(e.target?.value)}
          />
        </Col>
      </Row>

      <Row gutter={[14, 14]} style={{ marginTop: "20px" }}>
        <Col span={6}> Capacity</Col>
        <Col span={18}>
          <Input
            value={capacity}
            onChange={(e) => setCapacity(Number(e.target?.value))}
          />
        </Col>
      </Row>
      <Row gutter={[14, 14]} style={{ marginTop: "20px" }}>
        <Col span={6}> Type</Col>
        <Col span={18}>
          <Select
            value={type}
            style={{ width: "100%" }}
            onChange={(val: string) => setType(val)}
            options={[
              { value: "AC", label: "AC" },
              { value: "DC", label: "DC" },
            ]}
          />
        </Col>
      </Row>

      <Row gutter={[14, 14]} style={{ marginTop: "20px" }}>
        <Col span={6}> Supported Vehicle</Col>
        <Col span={18}>
          <Select
            value={supportedVehicleType}
            style={{ width: "100%" }}
            onChange={(val: string) => setSupportedVehicleType(val)}
            options={[
              { value: "2", label: "2 wheelers" },
              { value: "3", label: "2 / 3 Wheelers" },
              { value: "4", label: "3 / 4 Wheelers" },
            ]}
          />
        </Col>
      </Row>
      <Row gutter={[14, 14]} style={{ marginTop: "20px" }}>
        <Col span={6}>Region</Col>
        <Col span={18}>
          <Input value={region} onChange={(e) => setRegion(e.target?.value)} />
        </Col>
      </Row>
      <Row gutter={[14, 14]} style={{ marginTop: "20px" }}>
        <Col span={6}>City</Col>
        <Col span={18}>
          <Input value={city} onChange={(e) => setCity(e.target?.value)} />
        </Col>
      </Row>
      <Row gutter={[14, 14]} style={{ marginTop: "20px" }}>
        <Col span={6}>Pincode</Col>
        <Col span={18}>
          <Input
            value={pincode ?? undefined}
            type="number"
            onChange={(e) => setPincode(Number(e.target?.value))}
          />
        </Col>
      </Row>
      <Row gutter={[14, 14]} style={{ marginTop: "20px" }}>
        <Col span={6}>Address</Col>
        <Col span={18}>
          <TextArea
            rows={4}
            value={address}
            onChange={(e) => setAddress(e.target?.value)}
          />
        </Col>
      </Row>

      <Row gutter={[14, 14]} style={{ marginTop: "20px" }}>
        <Col span={6}>Latitude</Col>
        <Col span={6}>
          <Input
            value={latitude}
            type="number"
            onChange={(e) => setLatitude(Number(e.target?.value))}
          />
        </Col>
        <Col span={6} style={{ textAlign: "right" }}>
          Longitude
        </Col>
        <Col span={6}>
          <Input
            type="number"
            value={longitude}
            onChange={(e) => setLongitude(Number(e.target?.value))}
          />
        </Col>
      </Row>

      <Row gutter={[14, 14]} style={{ marginTop: "20px", marginBottom: "20px" }}>
        <Col span={6}>Price Per kWh</Col>
        <Col span={18}>
          <Input
            type="number"
            value={pricePerkWh}
            onChange={(e) => setPricePerkWh(Number(e.target?.value))}
          />
        </Col>
      </Row>
    </Modal>
  );
}
