"use client";

import { ExclamationCircleFilled, InfoCircleOutlined } from "@ant-design/icons";
import {
  Avatar,
  Button,
  message,
  Table,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import type { TableProps } from "antd";
import { useState } from "react";
import UserDetailsModal from "@/components/users/UserDetailsModal";
import UserFormModal, {
  UserFormValues,
} from "@/components/users/UserFormModal";
import { createRow, nextId, updateRow, useDb } from "@/data/store";
import type { PortalUser } from "@/data/types";
import { modal } from "@/lib/antdStatic";

const { Title, Text } = Typography;

function getInitials(namee: string): string {
  if (namee && namee.trim()) {
    const nameArray = namee.trim().split(" ");
    if (nameArray.length > 1) return `${nameArray[0][0]}${nameArray[1][0]}`;
    return `${nameArray[0][0]}`;
  }
  return "US";
}

// Sandbox port of pages/UserManagement/Users.jsx, backed by db.users, with the
// invite / edit / disable flows wired through the store.
export default function Users() {
  const db = useDb();
  const users = db.users;
  const [detailUser, setDetailUser] = useState<PortalUser | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editUser, setEditUser] = useState<PortalUser | null>(null);
  const [messageApi, contextHolder] = message.useMessage();

  const handleFormSubmit = (values: UserFormValues) => {
    if (editUser) {
      updateRow("users", editUser.id, { ...values });
      messageApi.success("User updated!");
    } else {
      createRow("users", {
        id: nextId("users", "usr"),
        ...values,
        status: "Invited",
        lastLoginAt: null,
      });
      messageApi.success(`Invite sent to ${values.email}`);
    }
    setFormOpen(false);
    setEditUser(null);
  };

  const toggleDisabled = (user: PortalUser) => {
    if (user.status === "Disabled") {
      updateRow("users", user.id, { status: "Active" });
      messageApi.success(`${user.name} re-enabled`);
      return;
    }
    modal.confirm({
      title: `Disable ${user.name}?`,
      icon: <ExclamationCircleFilled />,
      content:
        "The user will no longer be able to sign in to the dashboard until re-enabled.",
      okText: "Disable",
      okButtonProps: { danger: true },
      onOk() {
        updateRow("users", user.id, { status: "Disabled" });
        messageApi.success(`${user.name} disabled`);
      },
    });
  };

  const columns: TableProps<PortalUser>["columns"] = [
    {
      title: "Phone",
      dataIndex: "phone",
      key: "phone",
      render: (_text: string, user) => (
        <div
          style={{
            display: "flex",
            justifyContent: "flex-start",
            alignItems: "center",
            width: "100%",
          }}
        >
          <Avatar
            size={30}
            style={{
              fontSize: "10px",
              color: "#f56a00",
              backgroundColor: "#fde3cf",
              marginRight: "10px",
            }}
          >
            {getInitials(user.name || user.email)}
          </Avatar>
          {user.phone}
        </div>
      ),
    },
    {
      title: "Email",
      dataIndex: "email",
      key: "email",
      render: (_text: string, user) =>
        user.email ? (
          <Text>{user.email}</Text>
        ) : (
          <Text style={{ color: "orangered" }}>Email not updated</Text>
        ),
    },
    {
      title: "User Id",
      dataIndex: "id",
      key: "id",
      render: (text: string) => <Text copyable>{text}</Text>,
    },
    {
      title: "Name",
      dataIndex: "name",
      key: "name",
      render: (_text: string, user) => (
        <div
          style={{
            display: "flex",
            justifyContent: "flex-start",
            alignItems: "center",
            width: "100%",
          }}
        >
          {user.name}
        </div>
      ),
    },
    {
      title: "Role",
      dataIndex: "role",
      key: "role",
      render: (role: PortalUser["role"]) => <Tag>{role}</Tag>,
    },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      render: (status: PortalUser["status"]) => (
        <Tag
          color={
            status === "Active"
              ? "green"
              : status === "Invited"
                ? "orange"
                : "default"
          }
        >
          {status}
        </Tag>
      ),
    },
    {
      title: "Actions",
      key: "actions",
      render: (_text, user) => (
        <>
          <Button
            type="text"
            size="small"
            style={{ color: "#f97417" }}
            onClick={() => setDetailUser(user)}
          >
            View
          </Button>
          <Button
            type="text"
            size="small"
            style={{ color: "#f97417" }}
            onClick={() => {
              setEditUser(user);
              setFormOpen(true);
            }}
          >
            Edit
          </Button>
          <Button
            type="text"
            size="small"
            danger={user.status !== "Disabled"}
            onClick={() => toggleDisabled(user)}
          >
            {user.status === "Disabled" ? "Enable" : "Disable"}
          </Button>
        </>
      ),
    },
  ];

  return (
    <div style={{ marginLeft: 16, marginRight: 16 }}>
      {contextHolder}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "10px",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "flex-start",
            alignItems: "center",
          }}
        >
          <Title level={3} style={{ marginBottom: "0px" }}>
            Users
          </Title>
          <Tooltip
            placement="top"
            title="You are viewing the list of users that have charged at least once on your Chargepoint network."
          >
            <InfoCircleOutlined
              style={{ color: "gray", marginLeft: "6px", marginTop: "2px" }}
            />
          </Tooltip>
        </div>
        <Button
          type="primary"
          onClick={() => {
            setEditUser(null);
            setFormOpen(true);
          }}
        >
          Invite User
        </Button>
      </div>
      <Table
        size="small"
        rowKey="id"
        columns={columns}
        dataSource={users}
        pagination={false}
      />
      <UserDetailsModal
        open={!!detailUser}
        user={detailUser}
        onClose={() => setDetailUser(null)}
      />
      <UserFormModal
        open={formOpen}
        user={editUser}
        onCancel={() => {
          setFormOpen(false);
          setEditUser(null);
        }}
        onSubmit={handleFormSubmit}
      />
    </div>
  );
}
