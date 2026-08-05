"use client";

import { Avatar, Button, Descriptions, Modal, Tag, Typography } from "antd";
import dayjs from "dayjs";
import type { PortalUser } from "@/data/types";

const { Text } = Typography;

function getInitials(namee: string): string {
  if (namee && namee.trim()) {
    const nameArray = namee.trim().split(" ");
    if (nameArray.length > 1) return `${nameArray[0][0]}${nameArray[1][0]}`;
    return `${nameArray[0][0]}`;
  }
  return "US";
}

// Sandbox stand-in for Components/UserManagement/UserDetailsModal — shows the
// portal user's details from the store.
export default function UserDetailsModal({
  open,
  user,
  onClose,
}: {
  open: boolean;
  user: PortalUser | null;
  onClose: () => void;
}) {
  return (
    <Modal
      title="User Details"
      open={open}
      onCancel={onClose}
      footer={<Button onClick={onClose}>Close</Button>}
    >
      {user ? (
        <>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              marginBottom: 16,
            }}
          >
            <Avatar
              size={48}
              style={{
                fontSize: "16px",
                color: "#f56a00",
                backgroundColor: "#fde3cf",
              }}
            >
              {getInitials(user.name || user.email)}
            </Avatar>
            <div>
              <Text strong style={{ display: "block" }}>
                {user.name}
              </Text>
              <Text type="secondary">{user.email}</Text>
            </div>
          </div>
          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label="User Id">
              <Text copyable>{user.id}</Text>
            </Descriptions.Item>
            <Descriptions.Item label="Phone">{user.phone || "—"}</Descriptions.Item>
            <Descriptions.Item label="Role">{user.role}</Descriptions.Item>
            <Descriptions.Item label="Status">
              <Tag
                color={
                  user.status === "Active"
                    ? "green"
                    : user.status === "Invited"
                      ? "orange"
                      : "default"
                }
              >
                {user.status}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Last Login">
              {user.lastLoginAt ? (
                dayjs(user.lastLoginAt).format("DD MMM YYYY, hh:mm A")
              ) : (
                <Text type="secondary">Never</Text>
              )}
            </Descriptions.Item>
          </Descriptions>
        </>
      ) : null}
    </Modal>
  );
}
