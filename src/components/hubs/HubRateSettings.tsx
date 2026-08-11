"use client";

// Energy price schedule for one hub (demo spec item 5: the settings button that
// replaces the old ready-times/FIFO buttons). Ported from the reference
// "ergos hub settings" jsx, rebuilt on antd so it matches the rest of the app.
// Saved per hub in localStorage — nothing here is sent anywhere.

import { Button, Drawer, InputNumber, Select, Switch, Typography } from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";
import { message } from "@/lib/antdStatic";
import {
  MONTHS,
  PERIOD_BG,
  PERIOD_LABELS,
  PERIOD_LINE,
  type Period,
  type RateConfig,
  type Schedule,
  UTILITIES,
  configFrom,
  rateKey,
} from "./hubRates";

const { Text } = Typography;

function Section({
  title,
  sub,
  children,
}: {
  title: string;
  sub?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        border: "1px solid #f0f0f0",
        borderRadius: 10,
        padding: 16,
        marginBottom: 14,
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 600 }}>{title}</div>
      {sub && <div style={{ fontSize: 12, color: "#888", marginTop: 2, marginBottom: 12 }}>{sub}</div>}
      <div style={{ marginTop: sub ? 0 : 12 }}>{children}</div>
    </div>
  );
}

/** 24 clickable cells; a click cycles the hour through the four periods. */
function TouGrid({
  label,
  schedule,
  onChange,
}: {
  label: string;
  schedule: Schedule;
  onChange: (next: Schedule) => void;
}) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 6 }}>{label}</div>
      <div style={{ display: "flex", gap: 1 }}>
        {schedule.map((period, h) => (
          <div
            key={h}
            onClick={() => {
              const next = [...schedule];
              next[h] = ((period + 1) % 4) as Period;
              onChange(next);
            }}
            title={`${h}:00 — ${PERIOD_LABELS[period]}`}
            style={{
              flex: 1,
              height: 30,
              background: PERIOD_BG[period],
              borderTop: `2px solid ${PERIOD_LINE[period]}`,
              borderRadius: h === 0 ? "4px 0 0 4px" : h === 23 ? "0 4px 4px 0" : 0,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 9,
              color: "#9ca3af",
            }}
          >
            {h % 3 === 0 ? `${h === 0 ? 12 : h > 12 ? h - 12 : h}${h < 12 ? "a" : "p"}` : ""}
          </div>
        ))}
      </div>
    </div>
  );
}

function RateCell({
  value,
  available,
  onChange,
}: {
  value: number | null;
  available: boolean;
  onChange: (v: number | null) => void;
}) {
  if (!available) return <Text type="secondary">n/a</Text>;
  return (
    <InputNumber
      size="small"
      step={0.001}
      value={value}
      onChange={(v) => onChange(v === null || v === undefined ? null : Number(v))}
      style={{ width: 96 }}
    />
  );
}

export default function HubRateSettings({
  hub,
  open,
  onClose,
}: {
  hub: string;
  open: boolean;
  onClose: () => void;
}) {
  const [cfg, setCfg] = useState<RateConfig>(() => configFrom("sce", UTILITIES[0].rates[0]));

  const load = useCallback(() => {
    try {
      const raw = window.localStorage.getItem(rateKey(hub));
      if (raw) {
        setCfg(JSON.parse(raw) as RateConfig);
        return;
      }
    } catch {
      // fall through to the default tariff
    }
    setCfg(configFrom("sce", UTILITIES[0].rates[0]));
  }, [hub]);

  // Reading localStorage has to wait for mount (the page is pre-rendered), and
  // re-reading on open keeps two tabs from showing stale rates.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydration-safe load
    if (open) load();
  }, [open, load]);

  const utility = UTILITIES.find((u) => u.id === cfg.utilityId) ?? UTILITIES[0];
  const tariff = utility.rates.find((r) => r.id === cfg.rateId) ?? utility.rates[0];

  const patch = (p: Partial<RateConfig>) => setCfg((c) => ({ ...c, ...p }));

  // Periods that never appear in a schedule have no price to collect.
  const has = useMemo(
    () => ({
      summerOnPeak: cfg.summerSchedule.includes(2),
      summerSuperOff: cfg.summerSchedule.includes(3),
      winterOnPeak: cfg.winterSchedule.includes(2),
      winterSuperOff: cfg.winterSchedule.includes(3),
    }),
    [cfg.summerSchedule, cfg.winterSchedule],
  );

  const save = () => {
    window.localStorage.setItem(rateKey(hub), JSON.stringify(cfg));
    message.success(`Energy price schedule saved for ${hub}`);
    onClose();
  };

  const rows = [
    { key: "onPeak", label: "On-peak", color: PERIOD_LINE[2], s: has.summerOnPeak, w: has.winterOnPeak },
    { key: "midPeak", label: "Mid-peak", color: PERIOD_LINE[1], s: true, w: true },
    { key: "offPeak", label: "Off-peak", color: PERIOD_LINE[0], s: true, w: true },
    {
      key: "superOffPeak",
      label: "Super off-peak",
      color: PERIOD_LINE[3],
      s: has.summerSuperOff,
      w: has.winterSuperOff,
    },
  ] as const;

  return (
    <Drawer
      title={`Energy price schedule — ${hub}`}
      open={open}
      onClose={onClose}
      width={640}
      extra={
        <div style={{ display: "flex", gap: 8 }}>
          <Button onClick={() => patch(configFrom(utility.id, tariff))}>Reset to tariff</Button>
          <Button type="primary" style={{ background: "#f97316" }} onClick={save}>
            Save
          </Button>
        </div>
      }
    >
      <Section
        title="Utility provider and rate schedule"
        sub="Pick the utility and tariff to auto-fill rates. Every field can be overridden for negotiated contract rates."
      >
        <div style={{ display: "grid", gap: 12 }}>
          <div>
            <div style={{ fontSize: 12, color: "#888", marginBottom: 4 }}>Utility provider</div>
            <Select
              style={{ width: "100%" }}
              value={cfg.utilityId}
              onChange={(id) => {
                const u = UTILITIES.find((x) => x.id === id);
                if (u) patch(configFrom(u.id, u.rates[0]));
              }}
              options={UTILITIES.map((u) => ({ value: u.id, label: u.name }))}
            />
          </div>
          <div>
            <div style={{ fontSize: 12, color: "#888", marginBottom: 4 }}>Rate schedule</div>
            <Select
              style={{ width: "100%" }}
              value={cfg.rateId}
              onChange={(id) => {
                const r = utility.rates.find((x) => x.id === id);
                if (r) patch(configFrom(utility.id, r));
              }}
              options={utility.rates.map((r) => ({ value: r.id, label: r.name }))}
            />
            <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>
              Rates from the {utility.name} tariff book.
            </div>
          </div>
        </div>
      </Section>

      <Section
        title="TOU period schedule"
        sub="Hours each rate period applies on weekdays. Weekends and holidays default to off-peak. Click a cell to cycle its period."
      >
        <TouGrid
          label={`Summer (${MONTHS[cfg.summerStart]} – ${MONTHS[cfg.summerEnd]})`}
          schedule={cfg.summerSchedule}
          onChange={(s) => patch({ summerSchedule: s })}
        />
        <TouGrid
          label={`Winter (${MONTHS[(cfg.summerEnd + 1) % 12]} – ${MONTHS[(cfg.summerStart + 11) % 12]})`}
          schedule={cfg.winterSchedule}
          onChange={(s) => patch({ winterSchedule: s })}
        />
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 11, color: "#666" }}>
          {PERIOD_LABELS.map((lbl, i) => (
            <span key={lbl} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 2,
                  background: PERIOD_BG[i],
                  border: `1px solid ${PERIOD_LINE[i]}`,
                }}
              />
              {lbl}
            </span>
          ))}
        </div>
      </Section>

      <Section title="Energy charges" sub="Volumetric price per kWh for each period and season.">
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #f0f0f0" }}>
              <th style={{ textAlign: "left", padding: "6px 4px", fontWeight: 500, color: "#9ca3af", fontSize: 11 }}>
                PERIOD
              </th>
              <th style={{ textAlign: "right", padding: "6px 4px", fontWeight: 500, color: "#9ca3af", fontSize: 11 }}>
                SUMMER / kWh
              </th>
              <th style={{ textAlign: "right", padding: "6px 4px", fontWeight: 500, color: "#9ca3af", fontSize: 11 }}>
                WINTER / kWh
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} style={{ borderBottom: "1px solid #fafafa" }}>
                <td style={{ padding: "8px 4px", fontWeight: 500 }}>
                  <span
                    style={{
                      display: "inline-block",
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: r.color,
                      marginRight: 8,
                    }}
                  />
                  {r.label}
                </td>
                <td style={{ textAlign: "right", padding: "8px 4px" }}>
                  <RateCell
                    value={cfg.summer[r.key]}
                    available={r.s}
                    onChange={(v) => patch({ summer: { ...cfg.summer, [r.key]: v } })}
                  />
                </td>
                <td style={{ textAlign: "right", padding: "8px 4px" }}>
                  <RateCell
                    value={cfg.winter[r.key]}
                    available={r.w}
                    onChange={(v) => patch({ winter: { ...cfg.winter, [r.key]: v } })}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="Demand charges" sub="Price per kW of peak power drawn within the billing period.">
        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 500, fontSize: 13 }}>Facilities-related demand (FRD)</div>
              <div style={{ fontSize: 11, color: "#888" }}>Max demand, all hours</div>
            </div>
            <InputNumber
              size="small"
              step={0.01}
              value={cfg.frd}
              onChange={(v) => patch({ frd: Number(v ?? 0) })}
              style={{ width: 96 }}
            />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 500, fontSize: 13 }}>Time-related demand (TRD)</div>
              <div style={{ fontSize: 11, color: "#888" }}>Max demand, on-peak hours only</div>
            </div>
            <InputNumber
              size="small"
              step={0.01}
              value={cfg.trd}
              onChange={(v) => patch({ trd: Number(v ?? 0) })}
              style={{ width: 96 }}
            />
          </div>
          <div style={{ borderTop: "1px solid #f5f5f5", paddingTop: 12 }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
              <Switch checked={cfg.ratchetOn} onChange={(on) => patch({ ratchetOn: on })} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 500, fontSize: 13 }}>Demand ratchet clause</div>
                <div style={{ fontSize: 11, color: "#888" }}>
                  Bill demand on the highest peak in the trailing 12 months, not just this month — one bad
                  demand event has a 12-month cost tail.
                </div>
              </div>
            </div>
            {cfg.ratchetOn && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
                <InputNumber
                  size="small"
                  min={0}
                  max={100}
                  value={cfg.ratchetPct}
                  onChange={(v) => patch({ ratchetPct: Number(v ?? 0) })}
                  style={{ width: 72 }}
                />
                <span style={{ fontSize: 12, color: "#666" }}>
                  % of historical peak applied as a demand floor
                </span>
              </div>
            )}
          </div>
        </div>
      </Section>

      <Section title="Fixed charges and billing cycle">
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <InputNumber
              size="small"
              step={0.01}
              value={cfg.customerCharge}
              onChange={(v) => patch({ customerCharge: Number(v ?? 0) })}
              style={{ width: 110 }}
            />
            <span style={{ fontSize: 12, color: "#666" }}>customer charge per month (fixed)</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <InputNumber
              size="small"
              min={1}
              max={28}
              value={cfg.billingDay}
              onChange={(v) => patch({ billingDay: Number(v ?? 1) })}
              style={{ width: 72 }}
            />
            <span style={{ fontSize: 12, color: "#666" }}>
              billing cycle reset day — demand charges reset here, not on the 1st
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 12, color: "#666" }}>Summer season</span>
            <Select
              size="small"
              style={{ width: 90 }}
              value={cfg.summerStart}
              onChange={(v) => patch({ summerStart: v })}
              options={MONTHS.map((m, i) => ({ value: i, label: m }))}
            />
            <span style={{ fontSize: 12, color: "#666" }}>through</span>
            <Select
              size="small"
              style={{ width: 90 }}
              value={cfg.summerEnd}
              onChange={(v) => patch({ summerEnd: v })}
              options={MONTHS.map((m, i) => ({ value: i, label: m }))}
            />
          </div>
        </div>
      </Section>
    </Drawer>
  );
}
