"use client";

// antd v6 warns whenever the static `message.*` / `notification.*` helpers are
// used, because they render outside React and therefore miss ConfigProvider's
// theme and context. The supported replacement is App.useApp(), which is a
// hook — awkward for the ~20 call sites here that fire from plain handlers.
//
// This bridge keeps the call sites unchanged: <AntdStaticBridge/> (mounted once
// inside <App>) captures the context-aware instances, and the exports below
// forward to them. Import `message` from here instead of from "antd".

import { App } from "antd";
import { useEffect } from "react";

type AppApi = ReturnType<typeof App.useApp>;

let api: AppApi | null = null;

/** Mount once inside antd's <App>. Renders nothing. */
export function AntdStaticBridge() {
  const instances = App.useApp();
  useEffect(() => {
    api = instances;
    return () => {
      if (api === instances) api = null;
    };
  }, [instances]);
  return null;
}

type MessageApi = AppApi["message"];
type ModalApi = AppApi["modal"];
type NotificationApi = AppApi["notification"];

// Before the bridge mounts there is nothing to render into; that only ever
// covers the first paint, long before any handler can fire.
const forwardMessage =
  <K extends keyof MessageApi>(key: K) =>
  (...args: Parameters<MessageApi[K]>) =>
    (api?.message[key] as (...a: unknown[]) => unknown)?.(...args);

const forwardModal =
  <K extends keyof ModalApi>(key: K) =>
  (...args: Parameters<ModalApi[K]>) =>
    (api?.modal[key] as (...a: unknown[]) => unknown)?.(...args);

const forwardNotification =
  <K extends keyof NotificationApi>(key: K) =>
  (...args: Parameters<NotificationApi[K]>) =>
    (api?.notification[key] as (...a: unknown[]) => unknown)?.(...args);

export const message = {
  open: forwardMessage("open"),
  success: forwardMessage("success"),
  error: forwardMessage("error"),
  info: forwardMessage("info"),
  warning: forwardMessage("warning"),
  loading: forwardMessage("loading"),
  destroy: forwardMessage("destroy"),
};

export const modal = {
  confirm: forwardModal("confirm"),
  info: forwardModal("info"),
  success: forwardModal("success"),
  error: forwardModal("error"),
  warning: forwardModal("warning"),
};

export const notification = {
  open: forwardNotification("open"),
  success: forwardNotification("success"),
  error: forwardNotification("error"),
  info: forwardNotification("info"),
  warning: forwardNotification("warning"),
  destroy: forwardNotification("destroy"),
};
