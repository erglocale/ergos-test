"use client";

import { Button, Col, DatePicker, Form, Input, message, Modal, Row, Typography } from "antd";
import dayjs from "dayjs";
import { createRow, nextId } from "@/data/store";
import { DATE_FORMAT } from "@/lib/dateFormat";

const { Text } = Typography;

interface DriverFormValues {
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  address: string;
  state: string;
  city: string;
  pincode: string;
  expiryDate: dayjs.Dayjs;
}

const labelStyle: React.CSSProperties = { color: "gray" };
const inputStyle: React.CSSProperties = { width: "100%", marginTop: "10px" };

export default function RegisterDriverModal({
  isModalOpen,
  handleModalVisibility,
}: {
  isModalOpen: boolean;
  handleModalVisibility: (open: boolean) => void;
}) {
  const [form] = Form.useForm<DriverFormValues>();

  const onFinish = (values: DriverFormValues) => {
    const id = nextId("drivers", "drv");
    createRow("drivers", {
      id,
      name: `${values.firstName} ${values.lastName}`.trim(),
      phone: values.phoneNumber,
      email: values.email,
      // The production form has no license field — derive a dummy one.
      licenseNo: `AS01 2024${String(Math.abs(id.length * 13577)).padStart(5, "0")}`,
      vehicleReg: null,
      status: "Active",
      joinedAt: new Date().toISOString(),
      address: values.address ?? "",
      city: values.city ?? "",
      state: values.state ?? "",
      pin: values.pincode ?? "",
    });
    form.resetFields();
    message.success("Driver successfully registered!");
    handleModalVisibility(false);
  };

  return (
    <Modal
      title="Register Driver"
      open={isModalOpen}
      onCancel={() => handleModalVisibility(false)}
      footer={null}
      closable={false}
      mask={{ closable: false }}
    >
      <Form
        form={form}
        onFinish={onFinish}
        style={{ marginTop: "20px" }}
        initialValues={{ expiryDate: dayjs("2035-01-01") }}
        requiredMark={false}
      >
        <div style={{ marginBottom: "16px" }}>
          <Row gutter={[14, 14]}>
            <Col span={12}>
              <Text style={labelStyle}>First name</Text>
              <Form.Item
                name="firstName"
                rules={[{ required: true, message: "Required" }]}
                noStyle={false}
                style={{ marginBottom: 0 }}
              >
                <Input placeholder="eg: John" style={inputStyle} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Text style={labelStyle}>Last name</Text>
              <Form.Item
                name="lastName"
                rules={[{ required: true, message: "Required" }]}
                style={{ marginBottom: 0 }}
              >
                <Input placeholder="eg: Doe" style={inputStyle} />
              </Form.Item>
            </Col>
          </Row>
        </div>

        <div style={{ marginBottom: "16px" }}>
          <Text style={labelStyle}>Email</Text>
          <Form.Item
            name="email"
            rules={[{ required: true, message: "Required" }]}
            style={{ marginBottom: 0 }}
          >
            <Input placeholder="eg: johndoe@erglocale.com" style={inputStyle} />
          </Form.Item>
        </div>
        <div style={{ marginBottom: "16px" }}>
          <Text style={labelStyle}>Phone</Text>
          <Form.Item
            name="phoneNumber"
            rules={[{ required: true, message: "Required" }]}
            style={{ marginBottom: 0 }}
          >
            <Input placeholder="eg: +91XXXXXXXX" style={inputStyle} />
          </Form.Item>
        </div>

        <div style={{ marginBottom: "16px" }}>
          <Text style={labelStyle}>Address</Text>
          <Form.Item
            name="address"
            rules={[{ required: true, message: "Required" }]}
            style={{ marginBottom: 0 }}
          >
            <Input.TextArea
              placeholder="eg: Sector C, MBR Layout, Demo City"
              style={inputStyle}
              rows={3}
            />
          </Form.Item>
        </div>

        <div style={{ marginBottom: "16px" }}>
          <Row gutter={[14, 14]}>
            <Col span={12}>
              <Text style={labelStyle}>State</Text>
              <Form.Item
                name="state"
                rules={[{ required: true, message: "Required" }]}
                style={{ marginBottom: 0 }}
              >
                <Input placeholder="eg: Karnataka" style={inputStyle} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Text style={labelStyle}>City</Text>
              <Form.Item
                name="city"
                rules={[{ required: true, message: "Required" }]}
                style={{ marginBottom: 0 }}
              >
                <Input placeholder="eg: Bangalore" style={inputStyle} />
              </Form.Item>
            </Col>
          </Row>
        </div>

        <div style={{ marginBottom: "16px" }}>
          <Row gutter={[14, 14]}>
            <Col span={12}>
              <Text style={labelStyle}>Pincode</Text>
              <Form.Item
                name="pincode"
                rules={[{ required: true, message: "Required" }]}
                style={{ marginBottom: 0 }}
              >
                <Input placeholder="eg: 784490" style={inputStyle} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Text style={labelStyle}>Expiry Date</Text>
              <Form.Item name="expiryDate" style={{ marginBottom: 0 }}>
                <DatePicker style={inputStyle} format={DATE_FORMAT} />
              </Form.Item>
            </Col>
          </Row>
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
            onClick={() => {
              handleModalVisibility(false);
              form.resetFields();
            }}
            style={{ marginRight: "10px" }}
          >
            Cancel
          </Button>
          <Button type="primary" htmlType="submit">
            Register Driver
          </Button>
        </div>
      </Form>
    </Modal>
  );
}
