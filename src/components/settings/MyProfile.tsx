"use client";

import { EditOutlined } from "@ant-design/icons";
import {
  Avatar,
  Button,
  Col,
  Form,
  Input,
  message,
  Row,
  Select,
  Switch,
  Tooltip,
  Typography,
} from "antd";
import { useEffect, useState } from "react";
import { VscUnverified, VscVerifiedFilled } from "react-icons/vsc";
import { updateProfile, useDb } from "@/data/store";

const { Title, Text } = Typography;

function getInitials(namee: string): string {
  if (namee && namee.trim()) {
    const nameArray = namee.trim().split(" ");
    if (nameArray.length > 1) {
      return `${nameArray[0][0]} ${nameArray[1][0]}`;
    }
    return `${nameArray[0][0]}`;
  }
  return "User";
}

// Sandbox port of pages/AccountManagement/MyProfile.jsx — profile data comes
// from db.profile and saves through updateProfile(). The edit flow uses an
// antd Form (formik is not installed in the sandbox).
export default function MyProfile() {
  const db = useDb();
  const profile = db.profile;
  const [editModePersonalInfo, setEditModePersonalInfo] = useState(false);
  const [form] = Form.useForm<{ firstName: string; lastName: string }>();
  const [messageApi, contextHolder] = message.useMessage();

  const [userTimeZone, setUserTimeZone] = useState("Asia/Calcutta");

  useEffect(() => {
    const existing = localStorage.getItem("userTimeZone");
    if (existing) {
      setUserTimeZone(existing);
    } else {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      setUserTimeZone(tz);
      localStorage.setItem("userTimeZone", tz);
    }
  }, []);

  const updateProfileDetails = async () => {
    try {
      const values = await form.validateFields();
      updateProfile({ firstName: values.firstName, lastName: values.lastName });
      setEditModePersonalInfo(false);
      messageApi.success("Successfully updated Profile details!");
    } catch {
      // validation error — keep the form open
    }
  };

  const fullName = `${profile.firstName} ${profile.lastName}`;

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
          My Profile
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
          <div
            style={{
              width: "100%",
              display: "flex",
              justifyContent: "flex-start",
            }}
          >
            <Avatar
              size={120}
              style={{
                fontSize: "34px",
                color: "#f56a00",
                backgroundColor: "#fde3cf",
              }}
            >
              {getInitials(fullName)}
            </Avatar>
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                alignItems: "flex-start",
                flexDirection: "column",
                marginLeft: "20px",
              }}
            >
              <Title level={5}>{fullName}</Title>
              <Text style={{ color: "gray" }}>{profile.email}</Text>
            </div>
          </div>
        </div>

        <div
          style={{
            border: "1px solid #f0f0f0",
            padding: "20px",
            borderRadius: "8px",
            marginTop: "20px",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <Title level={5}>Personal Information</Title>

            {editModePersonalInfo ? (
              <div>
                <Button
                  type="primary"
                  onClick={() => setEditModePersonalInfo(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="primary"
                  onClick={updateProfileDetails}
                  style={{ marginLeft: "10px" }}
                >
                  Update
                </Button>
              </div>
            ) : (
              <Button
                type="primary"
                icon={<EditOutlined />}
                onClick={() => {
                  form.setFieldsValue({
                    firstName: profile.firstName,
                    lastName: profile.lastName,
                  });
                  setEditModePersonalInfo(true);
                }}
              >
                Edit
              </Button>
            )}
          </div>
          <Row gutter={[16, 16]}>
            <Col span={12}>
              {editModePersonalInfo ? (
                <Form
                  form={form}
                  layout="vertical"
                  initialValues={{
                    firstName: profile.firstName,
                    lastName: profile.lastName,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "flex-start", gap: 10 }}>
                    <Form.Item
                      name="firstName"
                      label={<Text style={{ color: "gray" }}>First Name</Text>}
                      rules={[{ required: true, message: "Required" }]}
                      style={{ marginBottom: 0 }}
                    >
                      <Input />
                    </Form.Item>
                    <Form.Item
                      name="lastName"
                      label={<Text style={{ color: "gray" }}>Last Name</Text>}
                      rules={[{ required: true, message: "Required" }]}
                      style={{ marginBottom: 0 }}
                    >
                      <Input />
                    </Form.Item>
                  </div>
                </Form>
              ) : (
                <div
                  style={{
                    display: "flex",
                    justifyContent: "flex-start",
                    flexDirection: "column",
                  }}
                >
                  <Text style={{ color: "gray", marginBottom: "10px" }}>Name</Text>
                  <Text>{fullName}</Text>
                </div>
              )}
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
                  User ID
                </Text>
                <Text copyable>usr-demo-1</Text>
              </div>
            </Col>
          </Row>
        </div>

        <div
          style={{
            border: "1px solid #f0f0f0",
            padding: "20px",
            borderRadius: "8px",
            marginTop: "20px",
          }}
        >
          <div>
            <Title level={5}>Email and Phone Number</Title>
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
                <Text style={{ color: "gray", marginBottom: "10px" }}>Email</Text>
                <div style={{ display: "flex" }}>
                  <Text style={{ marginRight: "6px" }}>{profile.email}</Text>
                  <Tooltip title="Email is verified">
                    <VscVerifiedFilled size={26} color="#57c621" />
                  </Tooltip>
                </div>
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
                  Phone Number
                </Text>
                <div style={{ display: "flex" }}>
                  <Text style={{ marginRight: "6px" }}>{profile.phone}</Text>
                  <Tooltip title="Phone is not verified">
                    <VscUnverified size={26} color="red" />
                  </Tooltip>
                </div>
              </div>
            </Col>
          </Row>
        </div>

        <div
          style={{
            border: "1px solid #f0f0f0",
            padding: "20px",
            borderRadius: "8px",
            marginTop: "20px",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <Title level={5}>Dashboard Configs</Title>
          </div>
          <Row gutter={[16, 16]}>
            <Col span={12}>
              <div style={{ display: "flex", justifyContent: "flex-start" }}>
                <Text
                  style={{
                    color: "gray",
                    marginBottom: "10px",
                    marginRight: "10px",
                  }}
                >
                  Enable Driver and Vehicle management
                </Text>
                <Switch defaultChecked />
              </div>
            </Col>
          </Row>
          <div className="mt-2 flex items-center gap-12">
            <div style={{ display: "flex", justifyContent: "flex-start" }}>
              <Text style={{ color: "gray", marginRight: "10px" }}>
                Time Zone
              </Text>
              <Select
                size="small"
                showSearch
                placeholder="Select a timezone"
                optionFilterProp="label"
                popupMatchSelectWidth={250}
                value={userTimeZone}
                onChange={(value) => {
                  setUserTimeZone(value);
                  localStorage.setItem("userTimeZone", value);
                }}
                options={Intl.supportedValuesOf("timeZone").map((timeZone) => ({
                  value: timeZone,
                  label: timeZone,
                }))}
              />
            </div>
            <div style={{ display: "flex", justifyContent: "flex-start" }}>
              <Text style={{ color: "gray", marginRight: "10px" }}>
                Time Format
              </Text>
              <Select
                size="small"
                showSearch
                placeholder="Select a time format"
                optionFilterProp="label"
                value={profile.timeFormat}
                onChange={(value) => updateProfile({ timeFormat: value })}
                options={[
                  { value: "12", label: "12-hour" },
                  { value: "24", label: "24-hour" },
                ]}
              />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
