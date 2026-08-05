"use client";

import { Button, Form, Input, InputNumber, message, Modal, Select, Typography } from "antd";
import { useEffect } from "react";
import { updateRow } from "@/data/store";
import type { Vehicle } from "@/data/types";

const { Text } = Typography;

interface EditVehicleValues {
  reg: string;
  make: string;
  model: string;
  category: Vehicle["category"];
  batteryKwh: number;
  status: Vehicle["status"];
}

const labelStyle: React.CSSProperties = { color: "gray" };
const inputStyle: React.CSSProperties = { width: "100%", marginTop: "10px" };

export default function EditVehicleModal({
  vehicle,
  isModalOpen,
  handleModalVisibility,
}: {
  vehicle: Vehicle | null;
  isModalOpen: boolean;
  handleModalVisibility: (open: boolean) => void;
}) {
  const [form] = Form.useForm<EditVehicleValues>();

  useEffect(() => {
    if (vehicle && isModalOpen) {
      form.setFieldsValue({
        reg: vehicle.reg,
        make: vehicle.make,
        model: vehicle.model,
        category: vehicle.category,
        batteryKwh: vehicle.batteryKwh,
        status: vehicle.status,
      });
    }
  }, [vehicle, isModalOpen, form]);

  const onFinish = (values: EditVehicleValues) => {
    if (!vehicle) return;
    updateRow("vehicles", vehicle.id, values);
    message.success("Vehicle details updated!");
    handleModalVisibility(false);
  };

  return (
    <Modal
      title={`Edit Vehicle${vehicle ? ` - ${vehicle.reg}` : ""}`}
      open={isModalOpen}
      onCancel={() => handleModalVisibility(false)}
      footer={null}
      mask={{ closable: false }}
    >
      <Form form={form} onFinish={onFinish} style={{ marginTop: "20px" }}>
        <div style={{ marginBottom: "16px" }}>
          <Text style={labelStyle}>Vehicle License No.</Text>
          <Form.Item
            name="reg"
            rules={[{ required: true, message: "Required" }]}
            style={{ marginBottom: 0 }}
          >
            <Input style={inputStyle} />
          </Form.Item>
        </div>
        <div style={{ marginBottom: "16px" }}>
          <Text style={labelStyle}>Manufacturer</Text>
          <Form.Item
            name="make"
            rules={[{ required: true, message: "Required" }]}
            style={{ marginBottom: 0 }}
          >
            <Input style={inputStyle} />
          </Form.Item>
        </div>
        <div style={{ marginBottom: "16px" }}>
          <Text style={labelStyle}>Vehicle Model</Text>
          <Form.Item
            name="model"
            rules={[{ required: true, message: "Required" }]}
            style={{ marginBottom: 0 }}
          >
            <Input style={inputStyle} />
          </Form.Item>
        </div>
        <div style={{ marginBottom: "16px" }}>
          <Text style={labelStyle}>Category</Text>
          <Form.Item name="category" style={{ marginBottom: 0 }}>
            <Select
              style={inputStyle}
              options={[
                { value: "3W Cargo", label: "3W Cargo" },
                { value: "3W Passenger", label: "3W Passenger" },
                { value: "2W", label: "2W" },
                { value: "4W", label: "4W" },
              ]}
            />
          </Form.Item>
        </div>
        <div style={{ marginBottom: "16px" }}>
          <Text style={labelStyle}>Battery Capacity</Text>
          <Form.Item
            name="batteryKwh"
            rules={[{ required: true, message: "Required" }]}
            style={{ marginBottom: 0 }}
          >
            <InputNumber min={1} style={inputStyle} addonAfter="kWh" />
          </Form.Item>
        </div>
        <div style={{ marginBottom: "16px" }}>
          <Text style={labelStyle}>Status</Text>
          <Form.Item name="status" style={{ marginBottom: 0 }}>
            <Select
              style={inputStyle}
              options={[
                { value: "Idle", label: "Idle" },
                { value: "Driving", label: "Driving" },
                { value: "Charging", label: "Charging" },
                { value: "Offline", label: "Offline" },
              ]}
            />
          </Form.Item>
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
            onClick={() => handleModalVisibility(false)}
            style={{ marginRight: "10px" }}
          >
            Cancel
          </Button>
          <Button type="primary" htmlType="submit">
            Update Vehicle
          </Button>
        </div>
      </Form>
    </Modal>
  );
}
