"use client";

// The demo's front door. Everything behind it is gated by middleware.ts; this
// screen only exchanges the shared credentials for the session cookie.

import { Alert, Button, Form, Input, Typography } from "antd";
import { useState } from "react";

const { Text, Title } = Typography;
const ORANGE = "#F26E21";

/** Only same-site paths are followed after sign-in. */
function safeReturnPath(): string {
  if (typeof window === "undefined") return "/home";
  const from = new URLSearchParams(window.location.search).get("from");
  if (!from || !from.startsWith("/") || from.startsWith("//")) return "/home";
  return from;
}

export default function Login() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onFinish = async (values: { email: string; password: string }) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Couldn't sign in. Try again.");
        setLoading(false);
        return;
      }
      // A full navigation, so the request that renders the app carries the new
      // cookie through the middleware.
      window.location.replace(safeReturnPath());
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        background: "#fafaf9",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 380,
          background: "#fff",
          border: "1px solid #eee",
          borderRadius: 14,
          padding: 32,
          boxShadow: "0 6px 24px rgba(0,0,0,0.05)",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- fixed-size brand mark */}
        <img
          src="/ergos.png"
          alt="ergOS"
          style={{ width: 90, height: 40, objectFit: "contain", marginBottom: 20 }}
        />
        <Title level={4} style={{ marginTop: 0, marginBottom: 4 }}>
          Sign in
        </Title>
        <Text type="secondary" style={{ fontSize: 13 }}>
          This demo is private. Use the shared credentials to continue.
        </Text>

        {error ? (
          <Alert type="error" showIcon message={error} style={{ marginTop: 16 }} />
        ) : null}

        <Form layout="vertical" onFinish={onFinish} style={{ marginTop: 20 }} requiredMark={false}>
          <Form.Item
            label="Email"
            name="email"
            rules={[{ required: true, message: "Enter your email" }]}
          >
            <Input
              size="large"
              type="email"
              autoComplete="username"
              placeholder="you@erglocale.com"
              autoFocus
            />
          </Form.Item>
          <Form.Item
            label="Password"
            name="password"
            rules={[{ required: true, message: "Enter the password" }]}
          >
            <Input.Password size="large" autoComplete="current-password" placeholder="••••••••" />
          </Form.Item>
          <Button
            block
            size="large"
            type="primary"
            htmlType="submit"
            loading={loading}
            style={{ background: ORANGE, borderColor: ORANGE }}
          >
            Sign in
          </Button>
        </Form>
      </div>
    </div>
  );
}
