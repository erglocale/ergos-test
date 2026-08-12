"use client";

import { FilterOutlined, InfoCircleOutlined } from "@ant-design/icons";
import {
  Button,
  Col,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Slider,
  Steps,
  Tag,
  Typography,
} from "antd";
import { useMemo, useState } from "react";
import { FaCar } from "react-icons/fa";
import { createRow, nextId, useDb } from "@/data/store";
import type { Vehicle } from "@/data/types";
import { message } from "@/lib/antdStatic";

const { Text, Title } = Typography;
const { Search } = Input;

// Local stand-in for the public EV repository the production app queries.
interface CatalogueEv {
  id: string;
  name: string;
  make: string;
  model: string;
  year: number;
  category: Vehicle["category"];
  avg_cost: number; // USD
  max_range: number; // kms
  battery_capacity: number; // kWh
}

const EV_CATALOGUE: CatalogueEv[] = [
  { id: "ev-1", name: "Mahindra Treo Zor", make: "Mahindra", model: "Treo Zor", year: 2023, category: "3W Cargo", avg_cost: 4200, max_range: 125, battery_capacity: 8 },
  { id: "ev-2", name: "Piaggio Ape E-City", make: "Piaggio", model: "Ape E-City", year: 2023, category: "3W Passenger", avg_cost: 3900, max_range: 110, battery_capacity: 7.5 },
  { id: "ev-3", name: "Euler HiLoad EV", make: "Euler", model: "HiLoad EV", year: 2024, category: "3W Cargo", avg_cost: 5100, max_range: 170, battery_capacity: 12.4 },
  { id: "ev-4", name: "OSM Rage+ Frost", make: "OSM", model: "Rage+ Frost", year: 2023, category: "3W Cargo", avg_cost: 4600, max_range: 140, battery_capacity: 10.8 },
  { id: "ev-5", name: "Altigreen neEV Tez", make: "Altigreen", model: "neEV Tez", year: 2024, category: "3W Cargo", avg_cost: 4800, max_range: 150, battery_capacity: 11 },
  { id: "ev-6", name: "Tata Ace EV", make: "Tata", model: "Ace EV", year: 2023, category: "4W", avg_cost: 12000, max_range: 154, battery_capacity: 21.3 },
  { id: "ev-7", name: "Hero Vida V1", make: "Hero", model: "Vida V1", year: 2023, category: "2W", avg_cost: 1600, max_range: 110, battery_capacity: 3.9 },
  { id: "ev-8", name: "Ola S1 Pro", make: "Ola", model: "S1 Pro", year: 2024, category: "2W", avg_cost: 1700, max_range: 180, battery_capacity: 4 },
];

const getCommaBasedNumber = (n: number) => n.toLocaleString("en-IN");

const steps = [
  { title: "Select vehicle" },
  { title: "Fill vehicle details" },
];

interface VehicleFormValues {
  make: string;
  model: string;
  batteryCapacity: number;
  range: number;
  licensePlate: string;
  vin: string;
}

function EvImagePlaceholder({ height }: { height: number }) {
  return (
    <div
      style={{
        width: "100%",
        height,
        borderRadius: "7px",
        background: "#f1f5f9",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <FaCar size={44} color="#cbd5e1" />
    </div>
  );
}

export default function AddVehicleModal({
  isModalOpen,
  handleModalVisibility,
}: {
  isModalOpen: boolean;
  handleModalVisibility: (open: boolean) => void;
}) {
  const db = useDb();
  const [form] = Form.useForm<VehicleFormValues>();

  const [minPrice, setMinPrice] = useState(500); // In USD
  const [maxPrice, setMaxPrice] = useState(15000); // In USD
  const [minRange, setMinRange] = useState(30);
  const [maxRange, setMaxRange] = useState(400);
  const [minBatteryCapacity, setMinBatteryCapacity] = useState(2);
  const [maxBatteryCapacity, setMaxBatteryCapacity] = useState(350);
  const [evSearch, setEvSearch] = useState("");
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState<CatalogueEv | null>(null);
  const [currentStep, setCurrentStep] = useState(0);

  const vehiclesList = useMemo(() => {
    const q = evSearch.trim().toLowerCase();
    return EV_CATALOGUE.filter(
      (ev) =>
        ev.avg_cost >= minPrice &&
        ev.avg_cost <= maxPrice &&
        ev.max_range >= minRange &&
        ev.max_range <= maxRange &&
        ev.battery_capacity >= minBatteryCapacity &&
        ev.battery_capacity <= maxBatteryCapacity &&
        (!q ||
          ev.name.toLowerCase().includes(q) ||
          ev.make.toLowerCase().includes(q) ||
          ev.model.toLowerCase().includes(q)),
    );
  }, [evSearch, minPrice, maxPrice, minRange, maxRange, minBatteryCapacity, maxBatteryCapacity]);

  const closeModal = () => {
    handleModalVisibility(false);
    setCurrentStep(0);
    form.resetFields();
  };

  const onFinish = (values: VehicleFormValues) => {
    const hub = db.vehicles[0]?.hub ?? "Six Mile";
    const lat = db.vehicles[0]?.lat ?? 26.12;
    const lng = db.vehicles[0]?.lng ?? 91.79;
    createRow("vehicles", {
      id: nextId("vehicles", "veh"),
      reg: values.licensePlate,
      make: values.make,
      model: values.model,
      category: selectedVehicle?.category ?? "3W Cargo",
      batteryKwh: values.batteryCapacity,
      soc: 100,
      socCapPct: 100,
      status: "Idle",
      odometerKm: 0,
      driverId: null,
      hub,
      lat,
      lng,
      imei: `86110001${String(Date.now()).slice(-8)}`,
      createdAt: new Date().toISOString(),
    });
    message.success("Vehicle successfully registered!");
    closeModal();
  };

  return (
    <Modal
      title={<Steps current={currentStep} items={steps} style={{ width: "50%" }} />}
      open={isModalOpen}
      onCancel={closeModal}
      footer={null}
      mask={{ closable: false }}
      width={900}
    >
      {currentStep === 0 && (
        <>
          <Row
            style={{ width: "100%", marginBottom: "20px", marginTop: "30px" }}
            gutter={[12, 12]}
          >
            <Col span={23}>
              <Search
                placeholder="input search text, ex: tata"
                allowClear
                style={{ width: "100%" }}
                onChange={(e) => setEvSearch(e.target.value)}
              />
            </Col>

            <Col span={1}>
              <Button
                icon={<FilterOutlined style={{ padding: "0px", margin: "0px" }} />}
                iconPosition="end"
                onClick={() => setFiltersExpanded(!filtersExpanded)}
              />
            </Col>
          </Row>

          {filtersExpanded && (
            <div
              style={{
                border: "1px solid #d9d9d9",
                padding: "10px",
                borderRadius: "7px",
                marginBottom: "20px",
              }}
            >
              <strong>Filters</strong>
              <Row style={{ marginTop: "10px" }} gutter={[12, 12]}>
                <Col span={4} style={{ alignItems: "center" }}>
                  Range:
                </Col>
                <Col span={2}>30 kms</Col>
                <Col span={14} style={{ alignItems: "center" }}>
                  <Slider
                    range
                    value={[minRange, maxRange]}
                    style={{ marginTop: "6px" }}
                    tooltip={{ formatter: (val) => `${val} kms` }}
                    max={1000}
                    min={30}
                    onChange={([lo, hi]: number[]) => {
                      setMinRange(lo);
                      setMaxRange(hi);
                    }}
                  />
                </Col>
                <Col span={4}>1000 kms</Col>
              </Row>
              <Row style={{ marginTop: "10px" }} gutter={[12, 12]}>
                <Col span={4} style={{ alignItems: "center" }}>
                  Battery capacity:
                </Col>
                <Col span={2}>2 kWh</Col>
                <Col span={14} style={{ alignItems: "center" }}>
                  <Slider
                    value={[minBatteryCapacity, maxBatteryCapacity]}
                    range
                    tooltip={{ formatter: (val) => `${val} kWh` }}
                    style={{ marginTop: "6px" }}
                    max={350}
                    min={2}
                    onChange={([lo, hi]: number[]) => {
                      setMinBatteryCapacity(lo);
                      setMaxBatteryCapacity(hi);
                    }}
                  />
                </Col>
                <Col span={4}>350 kWh</Col>
              </Row>
              <Row style={{ marginTop: "10px" }} gutter={[12, 12]}>
                <Col span={4} style={{ alignItems: "center" }}>
                  Price:
                </Col>
                <Col span={2}>500 USD</Col>
                <Col span={14} style={{ alignItems: "center" }}>
                  <Slider
                    value={[minPrice, maxPrice]}
                    range
                    tooltip={{ formatter: (val) => `${val} USD` }}
                    style={{ marginTop: "6px" }}
                    max={150000}
                    min={500}
                    onChange={([lo, hi]: number[]) => {
                      setMinPrice(lo);
                      setMaxPrice(hi);
                    }}
                  />
                </Col>
                <Col span={4}>150000 USD</Col>
              </Row>
              <Button
                size="small"
                type="primary"
                style={{ left: "89%", marginTop: "10px" }}
              >
                Apply filters
              </Button>
            </div>
          )}

          <Row gutter={[14, 14]} style={{ overflowY: "auto", height: "540px" }}>
            {vehiclesList.map((ev) => (
              <Col span={8} key={ev.id}>
                <div
                  style={{
                    border: "1px solid #d9d9d9",
                    borderRadius: "7px",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-start",
                    width: "100%",
                    padding: "10px",
                  }}
                >
                  <div style={{ width: "100%" }}>
                    <EvImagePlaceholder height={180} />
                  </div>
                  <div
                    style={{
                      width: "100%",
                      display: "flex",
                      flexDirection: "column",
                    }}
                  >
                    <Title level={5}>{ev.name}</Title>

                    <div
                      style={{
                        width: "100%",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <div
                        style={{
                          width: "100%",
                          display: "flex",
                          flexDirection: "column",
                        }}
                      >
                        <Text style={{ color: "#717171" }}>Price</Text>
                        <Text style={{ fontSize: "14px", fontWeight: 600 }}>
                          {getCommaBasedNumber(ev.avg_cost)} USD
                        </Text>
                      </div>
                      <div
                        style={{
                          width: "100%",
                          display: "flex",
                          flexDirection: "column",
                        }}
                      >
                        <Text style={{ color: "#717171" }}>Range</Text>
                        <Text style={{ fontSize: "14px", fontWeight: 600 }}>
                          {ev.max_range} kms
                        </Text>
                      </div>
                    </div>

                    <div
                      style={{
                        width: "100%",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginTop: "10px",
                      }}
                    >
                      <div
                        style={{
                          width: "100%",
                          display: "flex",
                          flexDirection: "column",
                        }}
                      >
                        <Text style={{ color: "#717171" }}>Battery Capacity</Text>
                        <Text style={{ fontSize: "14px", fontWeight: 600 }}>
                          {ev.battery_capacity} kWh
                        </Text>
                      </div>
                    </div>

                    <div
                      style={{
                        marginTop: "10px",
                        display: "flex",
                        justifyContent: "flex-end",
                      }}
                    >
                      <Button
                        type="primary"
                        onClick={() => {
                          setSelectedVehicle(ev);
                          form.setFieldsValue({
                            make: ev.make,
                            model: ev.model,
                            batteryCapacity: ev.battery_capacity,
                            range: ev.max_range,
                          });
                          setCurrentStep(1);
                        }}
                      >
                        Select Vehicle
                      </Button>
                    </div>
                  </div>
                </div>
              </Col>
            ))}
          </Row>
        </>
      )}

      {currentStep === 1 && (
        <Form
          form={form}
          onFinish={onFinish}
          initialValues={{ batteryCapacity: 75, range: 200 }}
        >
          <div
            style={{
              border: "1px solid #d9d9d9",
              borderRadius: "7px",
              padding: "14px",
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-start",
              height: "100%",
              marginBottom: "14px",
              marginTop: "30px",
            }}
          >
            <div style={{ width: 220, flexShrink: 0 }}>
              <EvImagePlaceholder height={160} />
            </div>

            <div
              style={{
                width: "100%",
                marginLeft: "20px",
                height: 160,
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
              }}
            >
              <div
                style={{
                  width: "100%",
                  display: "flex",
                  justifyContent: "flex-start",
                  alignItems: "center",
                }}
              >
                <Title level={4} style={{ margin: "0px" }}>
                  {selectedVehicle?.name}
                </Title>
                <Tag color="green" style={{ marginLeft: "10px", fontWeight: 600 }}>
                  SELECTED
                </Tag>
              </div>
              <div
                style={{ width: "100%", display: "flex", alignItems: "center" }}
              >
                <div style={{ marginRight: "30px" }}>
                  <Text style={{ fontSize: "16px" }}>Make - </Text>
                  <Text style={{ color: "#717171", fontSize: "16px" }}>
                    {selectedVehicle?.make}
                  </Text>
                </div>

                <div style={{ marginRight: "30px" }}>
                  <Text style={{ fontSize: "16px" }}>Model - </Text>
                  <Text style={{ color: "#717171", fontSize: "16px" }}>
                    {selectedVehicle?.model}
                  </Text>
                </div>
              </div>

              <div
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  marginTop: "10px",
                }}
              >
                <div style={{ marginRight: "30px" }}>
                  <Text style={{ fontSize: "16px" }}>Year - </Text>
                  <Text style={{ color: "#717171", fontSize: "16px" }}>
                    {selectedVehicle?.year}
                  </Text>
                </div>
                <div style={{ marginRight: "30px" }}>
                  <Text style={{ fontSize: "16px" }}>Range - </Text>
                  <Text style={{ color: "#717171", fontSize: "16px" }}>
                    {selectedVehicle?.max_range} kms
                  </Text>
                </div>

                <div style={{ marginRight: "30px" }}>
                  <Text style={{ fontSize: "16px" }}>Capacity - </Text>
                  <Text style={{ color: "#717171", fontSize: "16px" }}>
                    {selectedVehicle?.battery_capacity} kWh
                  </Text>
                </div>
              </div>

              <div
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  marginTop: "10px",
                  justifyContent: "space-between",
                }}
              >
                <div style={{ marginRight: "30px" }}>
                  <Text style={{ fontSize: "12px", color: "#717171" }}>
                    <InfoCircleOutlined style={{ marginRight: "4px" }} />
                    Click on “Change Vehicle” to change and select from a list of
                    electric vehicles.{" "}
                  </Text>
                </div>
                <div style={{ display: "flex", alignItems: "center" }}>
                  <Button type="primary" onClick={() => setCurrentStep(0)}>
                    Change Vehicle
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              width: "100%",
            }}
          >
            <div style={{ marginBottom: "16px", width: "100%", marginRight: "20px" }}>
              <Text style={{ color: "gray" }}>Manufacturer</Text>
              <Form.Item
                name="make"
                rules={[{ required: true, message: "Required" }]}
                style={{ marginBottom: 0 }}
              >
                <Input
                  placeholder="eg: Tesla"
                  style={{ width: "100%", marginTop: "10px" }}
                />
              </Form.Item>
            </div>

            <div style={{ marginBottom: "16px", width: "100%" }}>
              <Text style={{ color: "gray" }}>Vehicle Model</Text>
              <Form.Item
                name="model"
                rules={[{ required: true, message: "Required" }]}
                style={{ marginBottom: 0 }}
              >
                <Input
                  placeholder="eg: Model Y"
                  style={{ width: "100%", marginTop: "10px" }}
                />
              </Form.Item>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              width: "100%",
            }}
          >
            <div style={{ marginBottom: "16px", width: "100%", marginRight: "20px" }}>
              <Text style={{ color: "gray" }}>Battery Capacity</Text>
              <Form.Item
                name="batteryCapacity"
                rules={[{ required: true, message: "Required" }]}
                style={{ marginBottom: 0 }}
              >
                <InputNumber
                  placeholder="eg: 30"
                  min={1}
                  style={{ width: "100%", marginTop: "10px" }}
                  addonAfter="kW"
                />
              </Form.Item>
            </div>

            <div style={{ marginBottom: "16px", width: "100%" }}>
              <Text style={{ color: "gray" }}>Range</Text>
              <Form.Item
                name="range"
                rules={[{ required: true, message: "Required" }]}
                style={{ marginBottom: 0 }}
              >
                <InputNumber
                  placeholder="eg: 300"
                  min={10}
                  style={{ width: "100%", marginTop: "10px" }}
                  addonAfter="kms"
                />
              </Form.Item>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              width: "100%",
            }}
          >
            <div style={{ marginBottom: "16px", width: "100%", marginRight: "20px" }}>
              <Text style={{ color: "gray" }}>Vehicle License No.</Text>
              <Form.Item
                name="licensePlate"
                rules={[{ required: true, message: "Required" }]}
                style={{ marginBottom: 0 }}
              >
                <Input
                  placeholder="eg: BL057XXXX"
                  style={{ width: "100%", marginTop: "10px" }}
                />
              </Form.Item>
            </div>

            <div style={{ marginBottom: "16px", width: "100%" }}>
              <Text style={{ color: "gray" }}>
                Vehicle Identification Number (VIN)
              </Text>
              <Form.Item
                name="vin"
                rules={[{ required: true, message: "Required" }]}
                style={{ marginBottom: 0 }}
              >
                <Input
                  placeholder="eg: HJK893093XXXXX"
                  style={{ width: "100%", marginTop: "10px" }}
                />
              </Form.Item>
            </div>
          </div>

          <div
            style={{
              marginTop: "20px",
              display: "flex",
              justifyContent: "flex-end",
              alignItems: "center",
            }}
          >
            <Button
              type="default"
              onClick={closeModal}
              style={{ marginRight: "10px" }}
            >
              Cancel
            </Button>
            <Button type="primary" htmlType="submit">
              Add Vehicle
            </Button>
          </div>
        </Form>
      )}
    </Modal>
  );
}
