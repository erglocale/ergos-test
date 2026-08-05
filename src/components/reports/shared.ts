"use client";

import dayjs, { Dayjs } from "dayjs";

// ── Brand palette (matches Vehicle Analytics in the original app) ────────────
export const BRAND = {
  orange: "#f97417",
  orangeLight: "#fff7ed",
  green: "#22c55e",
  greenBg: "#f0fdf4",
  greenBorder: "#bbf7d0",
  greenText: "#166534",
  blue: "#3b82f6",
  border: "#e5e5e0",
  textPrimary: "#1a1f2e",
  textSecondary: "#6b7280",
  textMuted: "#9ca3af",
};

export const SECTION_CARD: React.CSSProperties = {
  background: "#ffffff",
  border: `1px solid ${BRAND.border}`,
  borderRadius: 12,
  padding: 20,
};

export type DateRange = [Dayjs, Dayjs];

export function getPresetRanges(): { label: string; value: DateRange }[] {
  const now = dayjs();
  return [
    {
      label: "Last 7 days",
      value: [now.subtract(6, "day").startOf("day"), now.endOf("day")],
    },
    {
      label: "Last 30 days",
      value: [now.subtract(29, "day").startOf("day"), now.endOf("day")],
    },
    {
      label: "Previous Week",
      value: [
        now.subtract(1, "week").startOf("week"),
        now.subtract(1, "week").endOf("week"),
      ],
    },
    {
      label: "Previous Month",
      value: [
        now.subtract(1, "month").startOf("month"),
        now.subtract(1, "month").endOf("month"),
      ],
    },
    {
      label: "Previous 3 Months",
      value: [
        now.subtract(3, "month").startOf("month"),
        now.subtract(1, "month").endOf("month"),
      ],
    },
    { label: "MTD", value: [now.startOf("month"), now.endOf("day")] },
    { label: "YTD", value: [now.startOf("year"), now.endOf("day")] },
  ];
}

export function formatReportDate(d: Dayjs | Date | string | null | undefined): string {
  if (!d) return "";
  return dayjs(d).format("YYYY-MM-DD HH:mm:ss");
}

/** Client-side CSV download (PORTING.md rule 6). */
export function downloadCsv(rows: (string | number)[][], filename: string): void {
  const csvContent = rows
    .map((row) =>
      row
        .map((cell) =>
          typeof cell === "string" && (cell.includes(",") || cell.includes('"'))
            ? `"${String(cell).replace(/"/g, '""')}"`
            : String(cell),
        )
        .join(","),
    )
    .join("\n");
  const blob = new Blob(["﻿" + csvContent], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Bordered map placeholder (PORTING.md rule 4). */
export function mapPlaceholderStyle(height: number): React.CSSProperties {
  return {
    height,
    background: "#e8e4e0",
    border: `1px solid ${BRAND.border}`,
    borderRadius: 8,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#8a8580",
    fontSize: 14,
  };
}
