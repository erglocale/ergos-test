"use client";

import { ExclamationCircleFilled } from "@ant-design/icons";
import {
  Avatar,
  Button,
  Descriptions,
  Form,
  Input,
  message,
  Modal,
  Select,
  Table,
  Tag,
  Typography,
} from "antd";
import type { TableProps } from "antd";
import dayjs from "dayjs";
import { useState } from "react";
import { createRow, nextId, removeRow, useDb } from "@/data/store";
import type { PortalUser } from "@/data/types";
import { modal } from "@/lib/antdStatic";

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

interface AddMemberValues {
  name: string;
  email: string;
  role: PortalUser["role"];
}

// Sandbox port of pages/AccountManagement/Members.jsx — the member directory is
// backed by db.users; Add creates an Invited user and Remove deletes the row.
export default function Members() {
  const db = useDb();
  const membersList = db.users;
  const [openAddMemberModal, setOpenAddMemberModal] = useState(false);
  const [selectedMember, setSelectedMember] = useState<PortalUser | null>(null);
  const [form] = Form.useForm<AddMemberValues>();
  const [messageApi, contextHolder] = message.useMessage();

  // The first Admin plays the "current user" role in the sandbox.
  const currentUserId = membersList.find((m) => m.role === "Admin")?.id;

  const removeMemberFromCommissionGroup = (memberId: string) => {
    removeRow("users", memberId);
    messageApi.success("Member removed!");
  };

  const handleAddMember = async () => {
    try {
      const values = await form.validateFields();
      createRow("users", {
        id: nextId("users", "usr"),
        name: values.name,
        email: values.email,
        phone: "",
        role: values.role,
        status: "Invited",
        lastLoginAt: null,
      });
      messageApi.success("Member invited!");
      setOpenAddMemberModal(false);
      form.resetFields();
    } catch {
      // validation error
    }
  };

  const membersColumns: TableProps<PortalUser>["columns"] = [
    {
      title: "Name",
      dataIndex: "name",
      render: (_text: string, member) => (
        <div
          style={{
            display: "flex",
            justifyContent: "flex-start",
            alignItems: "center",
            width: "100%",
          }}
        >
          <Avatar
            size={40}
            style={{
              fontSize: "14px",
              color: "#f56a00",
              backgroundColor: "#fde3cf",
              marginRight: "10px",
            }}
          >
            {getInitials(member.name || member.email)}
          </Avatar>
          {member.name}
        </div>
      ),
      key: "name",
      ellipsis: true,
      width: 220,
    },
    {
      title: "Email",
      dataIndex: "email",
      key: "email",
      width: 280,
      ellipsis: true,
    },
    {
      title: "Actions",
      dataIndex: "actions",
      key: "actions",
      render: (_text: string, member) => (
        <>
          {currentUserId === member.id ? (
            <>
              <Tag color="blue">YOU</Tag>
              <Button
                type="primary"
                ghost
                onClick={() => setSelectedMember(member)}
              >
                View
              </Button>
            </>
          ) : (
            <>
              <Button
                type="primary"
                ghost
                size="small"
                onClick={() => setSelectedMember(member)}
              >
                View
              </Button>
              <Button
                type="primary"
                ghost
                size="small"
                style={{ marginLeft: "10px" }}
                danger
                onClick={() => {
                  modal.confirm({
                    title: `Are you sure you want to remove this member: ${member.name || member.email}?`,
                    icon: <ExclamationCircleFilled />,
                    content:
                      "Removing this member will result in the removal of the member from members list. This action cannot be undone!",
                    onOk() {
                      removeMemberFromCommissionGroup(member.id);
                    },
                    onCancel() {},
                  });
                }}
              >
                Remove
              </Button>
            </>
          )}
        </>
      ),
      ellipsis: true,
      width: 190,
      fixed: "right",
    },
  ];

  return (
    <div style={{ height: "100%" }}>
      {contextHolder}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Title level={4} style={{ marginBottom: "20px", marginTop: "10px" }}>
          Members
        </Title>
        <Button type="primary" onClick={() => setOpenAddMemberModal(true)}>
          Add Member
        </Button>
      </div>
      <div style={{ maxHeight: "90%", overflowY: "auto" }}>
        <Table
          columns={membersColumns}
          dataSource={membersList}
          rowKey="id"
          pagination={false}
          scroll={{ x: 300 }}
          size="small"
        />
      </div>

      {/* Add Member modal (sandbox stand-in for Components/Settings/AddMemberModal) */}
      <Modal
        title="Add Member"
        open={openAddMemberModal}
        onCancel={() => setOpenAddMemberModal(false)}
        onOk={handleAddMember}
        okText="Send Invite"
      >
        <Form form={form} layout="vertical" initialValues={{ role: "Viewer" }}>
          <Form.Item
            name="name"
            label="Name"
            rules={[{ required: true, message: "Please enter a name" }]}
          >
            <Input placeholder="Full name" />
          </Form.Item>
          <Form.Item
            name="email"
            label="Email"
            rules={[
              { required: true, message: "Please enter an email" },
              { type: "email", message: "Enter a valid email" },
            ]}
          >
            <Input placeholder="name@company.com" />
          </Form.Item>
          <Form.Item name="role" label="Role" rules={[{ required: true }]}>
            <Select
              options={[
                { value: "Admin", label: "Admin" },
                { value: "Fleet Manager", label: "Fleet Manager" },
                { value: "Technician", label: "Technician" },
                { value: "Viewer", label: "Viewer" },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* Member detail modal (sandbox stand-in for MemberDetailModal) */}
      <Modal
        title="Member Details"
        open={!!selectedMember}
        onCancel={() => setSelectedMember(null)}
        footer={
          <Button onClick={() => setSelectedMember(null)}>Close</Button>
        }
      >
        {selectedMember ? (
          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label="Name">
              {selectedMember.name}
            </Descriptions.Item>
            <Descriptions.Item label="Email">
              {selectedMember.email}
            </Descriptions.Item>
            <Descriptions.Item label="Phone">
              {selectedMember.phone || "—"}
            </Descriptions.Item>
            <Descriptions.Item label="Role">
              {selectedMember.role}
            </Descriptions.Item>
            <Descriptions.Item label="Status">
              <Tag
                color={
                  selectedMember.status === "Active"
                    ? "green"
                    : selectedMember.status === "Invited"
                      ? "orange"
                      : "default"
                }
              >
                {selectedMember.status}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Last Login">
              {selectedMember.lastLoginAt ? (
                dayjs(selectedMember.lastLoginAt).format("DD MMM YYYY, hh:mm A")
              ) : (
                <Text type="secondary">Never</Text>
              )}
            </Descriptions.Item>
          </Descriptions>
        ) : null}
      </Modal>
    </div>
  );
}
