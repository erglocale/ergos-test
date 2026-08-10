"use client";

import { App, ConfigProvider } from "antd";
import { Toaster } from "sonner";
import { AntdStaticBridge } from "@/lib/antdStatic";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ConfigProvider theme={{ token: { colorPrimary: "#f97417" } }}>
      <App>
        <AntdStaticBridge />
        <Toaster
          position="top-right"
          richColors
          closeButton
          expand
          visibleToasts={4}
        />
        {children}
      </App>
    </ConfigProvider>
  );
}
