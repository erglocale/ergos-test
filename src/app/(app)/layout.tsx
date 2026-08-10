"use client";

import {
  BulbOutlined,
  InfoCircleFilled,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  SettingOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { Layout, Menu, Typography, message } from "antd";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { AiFillHome } from "react-icons/ai";
import { BiTrip } from "react-icons/bi";
import { FaAddressCard, FaWarehouse, FaWrench } from "react-icons/fa";
import { ImPower } from "react-icons/im";
import { MdEvStation } from "react-icons/md";
import { TbReportAnalytics } from "react-icons/tb";
import EnergyBrainSync from "@/components/energy/EnergyBrainSync";
import { useDb } from "@/data/store";

const { Sider, Content } = Layout;
const { Text } = Typography;

const ICON_COLOR = { color: "#636160" };

const MENU_ITEMS = [
  { label: "Dashboard", icon: <AiFillHome style={ICON_COLOR} />, href: "/home" },
  { label: "Alerts", icon: <InfoCircleFilled style={ICON_COLOR} />, href: "/alerts" },
  { label: "Charging Sessions", icon: <ImPower style={ICON_COLOR} />, href: "/chargingSessions" },
  { label: "Trips", icon: <BiTrip style={ICON_COLOR} />, href: "/trips" },
  { label: "Chargepoints", icon: <MdEvStation style={ICON_COLOR} />, href: "/chargingStations" },
  { label: "Hubs", icon: <FaWarehouse style={ICON_COLOR} />, href: "/hubs" },
  { label: "Drivers", icon: <FaAddressCard style={ICON_COLOR} />, href: "/drivers" },
  { label: "Maintenance", icon: <FaWrench style={ICON_COLOR} />, href: "/maintenance" },
  { label: "Reports", icon: <TbReportAnalytics style={ICON_COLOR} />, href: "/reports" },
  { label: "Suggestions", icon: <BulbOutlined style={ICON_COLOR} />, href: "/suggestions" },
  { label: "Settings", icon: <SettingOutlined style={ICON_COLOR} />, href: "/settings" },
];

function itemStyle(active: boolean): React.CSSProperties {
  return {
    backgroundColor: active ? "#F4EBE4" : undefined,
    color: active ? "#F87417" : undefined,
    borderRadius: "7px",
    width: "92%",
    marginLeft: "10px",
    marginTop: "10px",
    borderRight: active ? "4px solid #f87417" : undefined,
  };
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const db = useDb();
  const [collapsed, setCollapsed] = useState(false);
  // Data lives in localStorage, so render only after mount to avoid
  // hydration mismatches between the server seed and the browser's copy.
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  const P = collapsed ? MenuUnfoldOutlined : MenuFoldOutlined;

  return (
    <Layout className="h-screen">
      <EnergyBrainSync />
      <Sider
        style={{
          overflow: "none",
          height: "100vh",
          position: "fixed",
          left: 0,
          backgroundColor: "#F7F3F1",
          borderRight: "1px solid #e1e1e4",
          zIndex: 500,
        }}
        width={260}
        trigger={null}
        collapsible
        collapsed={collapsed}
      >
        <div
          className="logo"
          style={{
            display: "flex",
            justifyContent: "center",
            height: "64px",
            alignItems: "center",
          }}
        >
          {collapsed ? null : (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                padding: "10px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "center", alignItems: "center" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/ergos.png" alt="ergOsLogo" style={{ width: "90px", height: "40px" }} />
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  marginTop: "-8px",
                }}
              >
                <p style={{ fontSize: "11px", color: "gray", fontWeight: 200 }}>
                  powered by <span style={{ color: "#f97417", fontWeight: 600 }}>erg</span>
                  <span style={{ color: "black", fontWeight: 600 }}>Locale</span>
                </p>
              </div>
            </div>
          )}
          <P
            onClick={() => setCollapsed(!collapsed)}
            style={{ marginLeft: collapsed ? "0px" : "5px", marginTop: "10px" }}
          />
        </div>

        <Menu
          theme="light"
          mode="inline"
          selectable={false}
          style={{ border: "0px", marginTop: "15px", backgroundColor: "#F7F3F1" }}
          items={MENU_ITEMS.map((item) => ({
            key: item.href,
            icon: item.icon,
            style: itemStyle(pathname.startsWith(item.href)),
            label: <Link href={item.href}>{item.label}</Link>,
          }))}
        />

        {/* Profile and Logout section at bottom */}
        <div style={{ position: "absolute", bottom: "20px", width: "100%" }}>
          <Menu
            theme="light"
            mode="inline"
            selectable={false}
            style={{ border: "0px", backgroundColor: "#F7F3F1" }}
            items={[
              {
                key: "myProfile",
                icon: <UserOutlined />,
                style: itemStyle(pathname.startsWith("/settings/myProfile")),
                label: (
                  <Link href="/settings/myProfile">
                    <Text style={{ marginRight: "10px", color: collapsed ? "#FFFFFF" : "#636160" }}>
                      {db.profile.firstName} {db.profile.lastName}
                    </Text>
                  </Link>
                ),
              },
              {
                key: "logout",
                icon: <LogoutOutlined />,
                style: itemStyle(false),
                label: "Logout",
                onClick: () => message.info("The sandbox has no login — you're always signed in."),
              },
            ]}
          />
        </div>
      </Sider>

      <Layout
        className="site-layout"
        style={{
          marginLeft: collapsed ? 70 : 250,
          minHeight: "100vh",
          overflowX: "hidden",
          backgroundColor: "#ffffff",
        }}
      >
        <Content style={{ margin: "16px 16px", overflow: "initial", paddingLeft: "8px" }}>
          {children}
        </Content>
      </Layout>
    </Layout>
  );
}
