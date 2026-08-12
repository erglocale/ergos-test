"use client";

import {
  InfoCircleOutlined,
  ReloadOutlined,
  SettingOutlined,
} from "@ant-design/icons";
import {
  Avatar,
  Button,
  Empty,
  Input,
  message,
  Modal,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
} from "antd";
import type { TableProps } from "antd";
import { useState } from "react";
import { useDb } from "@/data/store";
import type { PortalUser } from "@/data/types";
import { ALERT_TYPE_GROUPS, getAlertTypeLabel } from "./alertTypes";

const { Title, Text } = Typography;

// Notification preferences have no backing collection in the fixtures — they
// live in page state only (they reset on reload; noted in the port report).
interface Prefs {
  enable_push: boolean;
  enable_email: boolean;
  enable_whatsapp: boolean;
  email_override: string | null;
  phone_override: string | null;
  disabled_alert_types: string[];
}

const DEFAULT_PREFS: Prefs = {
  enable_push: true,
  enable_email: true,
  enable_whatsapp: false,
  email_override: null,
  phone_override: null,
  disabled_alert_types: [],
};

function getDisplayName(member: PortalUser): string {
  return member.name || member.email || "User";
}

function getInitials(member: PortalUser): string {
  const parts = getDisplayName(member).split(" ").filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return "U";
}

function OverrideInfo() {
  return (
    <span title="Overridden">
      <InfoCircleOutlined
        style={{ fontSize: 12, marginLeft: 4, color: "#9ca3af" }}
      />
    </span>
  );
}

export default function AlertPreferences() {
  const db = useDb();
  const membersList = db.users;
  const [selectedMember, setSelectedMember] = useState<PortalUser | null>(null);
  const [prefsByUser, setPrefsByUser] = useState<Record<string, Prefs>>({});
  const [emailDraft, setEmailDraft] = useState("");
  const [phoneDraft, setPhoneDraft] = useState("");
  const [messageApi, contextHolder] = message.useMessage();

  const currentUserId = membersList.find((m) => m.role === "Admin")?.id;

  const getPrefs = (userId: string): Prefs =>
    prefsByUser[userId] ?? DEFAULT_PREFS;

  const patchPrefs = (userId: string, patch: Partial<Prefs>) => {
    setPrefsByUser((prev) => ({
      ...prev,
      [userId]: { ...getPrefs(userId), ...patch },
    }));
  };

  const channelSwitch = (
    member: PortalUser,
    channel: "enable_push" | "enable_email" | "enable_whatsapp",
    channelLabel: string,
  ) => (
    <Switch
      checked={getPrefs(member.id)[channel]}
      size="small"
      onChange={(newVal) => {
        patchPrefs(member.id, { [channel]: newVal });
        messageApi.success(`${channelLabel} ${newVal ? "enabled" : "disabled"}`);
      }}
    />
  );

  const columns: TableProps<PortalUser>["columns"] = [
    {
      title: "Member",
      key: "name",
      width: 360,
      render: (_text, member) => {
        const prefs = getPrefs(member.id);
        const resolvedEmail = prefs.email_override ?? member.email;
        const resolvedPhone = prefs.phone_override ?? member.phone;
        return (
          <div className="flex items-center gap-2">
            <Avatar
              size={36}
              style={{
                fontSize: "13px",
                color: "#f56a00",
                backgroundColor: "#fde3cf",
              }}
            >
              {getInitials(member)}
            </Avatar>
            <div className="flex flex-col">
              <div className="flex flex-wrap items-center gap-1">
                <Text strong>{getDisplayName(member)}</Text>
                {member.id === currentUserId ? (
                  <Tag color="blue" style={{ marginInlineEnd: 0 }}>
                    YOU
                  </Tag>
                ) : null}
                <Tag style={{ marginInlineEnd: 0 }}>{member.role}</Tag>
              </div>
              <Text type="secondary" className="text-xs">
                {resolvedEmail || "—"}
                {prefs.email_override ? <OverrideInfo /> : null}
              </Text>
              <Text type="secondary" className="text-xs">
                {resolvedPhone || "—"}
                {prefs.phone_override ? <OverrideInfo /> : null}
              </Text>
            </div>
          </div>
        );
      },
    },
    {
      title: "Mobile App",
      key: "enable_push",
      width: 120,
      align: "center",
      render: (_text, member) => channelSwitch(member, "enable_push", "Mobile App"),
    },
    {
      title: "Email",
      key: "enable_email",
      width: 100,
      align: "center",
      render: (_text, member) => channelSwitch(member, "enable_email", "Email"),
    },
    {
      title: "WhatsApp",
      key: "enable_whatsapp",
      width: 110,
      align: "center",
      render: (_text, member) =>
        channelSwitch(member, "enable_whatsapp", "WhatsApp"),
    },
    {
      title: "Settings",
      key: "settings",
      width: 90,
      align: "center",
      fixed: "right",
      render: (_text, member) => (
        <Button
          size="small"
          icon={<SettingOutlined />}
          onClick={() => {
            const prefs = getPrefs(member.id);
            setEmailDraft(prefs.email_override ?? "");
            setPhoneDraft(prefs.phone_override ?? "");
            setSelectedMember(member);
          }}
        />
      ),
    },
  ];

  const selectedPrefs = selectedMember ? getPrefs(selectedMember.id) : null;

  const saveOverrides = () => {
    if (!selectedMember) return;
    patchPrefs(selectedMember.id, {
      email_override: emailDraft.trim() === "" ? null : emailDraft.trim(),
      phone_override: phoneDraft.trim() === "" ? null : phoneDraft.trim(),
    });
    messageApi.success("Contact overrides updated");
  };

  const resetOverride = (field: "email" | "phone") => {
    if (!selectedMember) return;
    if (field === "email") {
      setEmailDraft("");
      patchPrefs(selectedMember.id, { email_override: null });
    } else {
      setPhoneDraft("");
      patchPrefs(selectedMember.id, { phone_override: null });
    }
    messageApi.success(`${field === "email" ? "Email" : "Phone"} reset to default`);
  };

  const toggleAlertType = (alertType: string, enabled: boolean) => {
    if (!selectedMember || !selectedPrefs) return;
    const next = new Set(selectedPrefs.disabled_alert_types);
    if (enabled) next.delete(alertType);
    else next.add(alertType);
    patchPrefs(selectedMember.id, { disabled_alert_types: Array.from(next) });
  };

  return (
    <div className="flex h-full flex-col">
      {contextHolder}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div className="flex flex-col" style={{ marginBottom: "20px" }}>
          <Title level={4} style={{ marginTop: "10px", marginBottom: "0px" }}>
            Alert Preferences
          </Title>
          <p className="text-gray-500">
            Per-user notification settings for this organization
          </p>
        </div>
      </div>

      <div className="min-h-0 flex-1" style={{ overflow: "hidden" }}>
        <Table
          rowKey="id"
          dataSource={membersList}
          columns={columns}
          pagination={false}
          size="middle"
          sticky
          scroll={{ x: 780 }}
          locale={{
            emptyText: (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="No members found in this organization"
              />
            ),
          }}
        />
      </div>

      <Modal
        open={Boolean(selectedMember)}
        onCancel={() => setSelectedMember(null)}
        footer={null}
        width={760}
        title={
          selectedMember
            ? `Alert settings — ${getDisplayName(selectedMember)}`
            : ""
        }
      >
        {selectedMember && selectedPrefs ? (
          <div className="flex flex-col gap-3">
            {/* Contact overrides */}
            <div className="rounded-md border border-gray-200 bg-white p-4">
              <p className="mb-1 text-sm font-semibold">Contact overrides</p>
              <p className="mb-3 text-xs text-gray-500">
                Override the email / phone used for this user&rsquo;s alerts.
                Leave blank to fall back to their account default.
              </p>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="flex flex-col gap-1">
                  <Text className="text-xs text-gray-500">Email</Text>
                  <Space.Compact style={{ width: "100%" }}>
                    <Input
                      type="email"
                      value={emailDraft}
                      placeholder={selectedMember.email || "user@example.com"}
                      onChange={(e) => setEmailDraft(e.target.value)}
                    />
                    <Button
                      icon={<ReloadOutlined />}
                      title={`Reset to ${selectedMember.email || "account default"}`}
                      onClick={() => resetOverride("email")}
                    />
                  </Space.Compact>
                  <Text className="text-xs text-gray-400">
                    Default: {selectedMember.email || "—"}
                  </Text>
                </div>

                <div className="flex flex-col gap-1">
                  <Text className="text-xs text-gray-500">Phone (WhatsApp)</Text>
                  <Space.Compact style={{ width: "100%" }}>
                    <Input
                      value={phoneDraft}
                      placeholder={selectedMember.phone || "+1234567890"}
                      onChange={(e) => setPhoneDraft(e.target.value)}
                    />
                    <Button
                      icon={<ReloadOutlined />}
                      title={`Reset to ${selectedMember.phone || "account default"}`}
                      onClick={() => resetOverride("phone")}
                    />
                  </Space.Compact>
                  <Text className="text-xs text-gray-400">
                    Default: {selectedMember.phone || "—"}
                  </Text>
                </div>
              </div>

              <div className="mt-3 flex justify-end">
                <Button type="primary" size="small" onClick={saveOverrides}>
                  Save overrides
                </Button>
              </div>
            </div>

            {/* Alert type mutes */}
            <div className="rounded-md border border-gray-200 bg-white p-4">
              <p className="mb-1 text-sm font-semibold">Alert types</p>
              <p className="mb-3 text-xs text-gray-500">
                Turn off any alert type below to mute it for this user across
                all channels.
              </p>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                {ALERT_TYPE_GROUPS.map((group) => (
                  <div key={group.id} className="flex flex-col gap-1">
                    <p className="m-0 text-xs font-semibold uppercase text-gray-500">
                      {group.label}
                    </p>
                    <div className="flex flex-col gap-1">
                      {group.types.map((type) => {
                        const enabled =
                          !selectedPrefs.disabled_alert_types.includes(type);
                        return (
                          <label
                            key={type}
                            className="m-0 flex cursor-pointer items-center gap-2 rounded px-1 py-1 hover:bg-gray-50"
                            onClick={(e) => {
                              e.preventDefault();
                              toggleAlertType(type, !enabled);
                            }}
                          >
                            <Switch size="small" checked={enabled} />
                            <Text className="text-sm">{getAlertTypeLabel(type)}</Text>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
