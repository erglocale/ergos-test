"use client";

import { UserOutlined } from "@ant-design/icons";
import { Col, Menu, Row, Typography } from "antd";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FaUsers } from "react-icons/fa";
import { GiProfit } from "react-icons/gi";
import { HiOutlineBellAlert } from "react-icons/hi2";

const { Title } = Typography;

const MENU_ITEMS = [
  {
    label: "My Profile",
    key: "myProfile",
    icon: <UserOutlined />,
    href: "/settings/myProfile",
  },
  {
    label: "Member Directory",
    key: "members",
    icon: <FaUsers size={18} />,
    href: "/settings/members",
  },
  {
    label: "Organization Settings",
    key: "commissionDetails",
    icon: <GiProfit size={18} />,
    href: "/settings/commissionDetails",
  },
  {
    label: "Alert Preferences",
    key: "alertPreferences",
    icon: <HiOutlineBellAlert size={18} />,
    href: "/settings/alertPreferences",
  },
];

// Sandbox port of pages/AccountManagement/index.jsx — the /settings shell with
// the left sub-navigation. Each sub-section is its own Next.js route.
export default function SettingsShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div
      style={{
        marginLeft: 16,
        marginRight: 16,
        height: "calc(100vh - 32px)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div>
        <Title level={3} style={{ marginBottom: "10px" }}>
          Settings
        </Title>
      </div>
      <Row gutter={[14, 14]} style={{ flex: 1, minHeight: 0 }}>
        <Col span={6} style={{ height: "100%" }}>
          <div
            style={{
              backgroundColor: "white",
              padding: "20px",
              height: "100%",
              borderRadius: "10px",
              border: "1px solid #e1e1e4",
              paddingRight: "20px",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              minHeight: 0,
            }}
          >
            <Menu
              theme="light"
              mode="inline"
              selectable={false}
              style={{ border: "0px", marginTop: "15px" }}
              items={MENU_ITEMS.map((item) => {
                const active = pathname.endsWith(item.key);
                return {
                  key: item.key,
                  icon: item.icon,
                  style: {
                    backgroundColor: active ? "#fff3e5" : undefined,
                    color: active ? "#F87417" : undefined,
                    borderRadius: "4px",
                  },
                  label: <Link href={item.href}>{item.label}</Link>,
                };
              })}
            />
          </div>
        </Col>
        <Col span={18} style={{ height: "100%" }}>
          <div
            style={{
              backgroundColor: "white",
              padding: "20px",
              height: "100%",
              borderRadius: "10px",
              paddingLeft: "34px",
              paddingRight: "34px",
              border: "1px solid #e1e1e4",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              minHeight: 0,
            }}
          >
            {children}
          </div>
        </Col>
      </Row>
    </div>
  );
}
