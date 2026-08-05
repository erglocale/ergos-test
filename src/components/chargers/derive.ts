import type { Chargepoint } from "@/data/types";

// Fields the production API returns that the sandbox fixtures lack are
// derived deterministically here (see PORTING.md — do not edit src/data/*).
export interface DerivedChargerFields {
  type: "AC" | "DC";
  kw: number;
  city: string;
  region: string;
  pincode: string;
  isSmartCharger: boolean;
  stationId: string;
  identification: string;
  openTime: string;
  closeTime: string;
  vehicleType: "2" | "3" | "4";
  verified: boolean;
  enabled: boolean;
}

export function deriveCharger(cp: Chargepoint): DerivedChargerFields {
  const parts = cp.address.split(",").map((p) => p.trim());
  const last = parts[parts.length - 1] ?? "";
  const match = last.match(/^(.*?)\s*(\d{6})$/);
  return {
    type: cp.connectors.some((c) => c.type === "CCS2") ? "DC" : "AC",
    kw: Math.max(...cp.connectors.map((c) => c.powerKw), 0),
    city: parts.length >= 2 ? parts[parts.length - 2] : cp.hub,
    region: match ? match[1] : "Assam",
    pincode: match ? match[2] : "781001",
    isSmartCharger: cp.vendor === "Delta",
    stationId: cp.hub.replace(/\s+/g, "-").toUpperCase(),
    identification: cp.serial,
    openTime: "06:00",
    closeTime: "22:00",
    vehicleType: "3",
    verified: true,
    enabled: cp.status === "Online",
  };
}

export const qrUrlForCharger = (cpid: string) =>
  `https://erglocale.onelink.me/rQV7/production?chargerId=${cpid}&scanType=charger`;

// Shared Modal.confirm button styling used across charger control dialogs.
export const CONFIRM_BUTTON_PROPS = {
  okText: "Proceed",
  width: 520,
  okButtonProps: { style: { backgroundColor: "#f97417" } },
  cancelButtonProps: { style: { color: "#f97417", borderColor: "#f97417" } },
} as const;

// Fake OCPP configuration keys shown in the configuration modals.
export const FAKE_CHARGER_CONFIGS: {
  key: string;
  value: string;
  readonly: boolean;
}[] = [
  { key: "HeartbeatInterval", value: "300", readonly: false },
  { key: "MeterValueSampleInterval", value: "60", readonly: false },
  { key: "NumberOfConnectors", value: "2", readonly: true },
  { key: "AuthorizeRemoteTxRequests", value: "true", readonly: false },
  { key: "ConnectionTimeOut", value: "120", readonly: false },
  { key: "LocalAuthListEnabled", value: "true", readonly: false },
  { key: "SupportedFeatureProfiles", value: "Core,RemoteTrigger,FirmwareManagement", readonly: true },
  { key: "WebSocketPingInterval", value: "30", readonly: false },
];
