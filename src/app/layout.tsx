import { AntdRegistry } from "@ant-design/nextjs-registry";
import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  // The production tab title (ergOS-frontend/index.html), so a browser tab or a
  // screen share during the demo reads the same as the real app.
  title: "ergOS | Smart EV Fleet Management & Intelligent Energy Optimization",
  description: "ergOS UI/UX sandbox — dummy data, no backend",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <AntdRegistry>
          <Providers>{children}</Providers>
        </AntdRegistry>
      </body>
    </html>
  );
}
