"use client";

import { Slider, Space, Typography } from "antd";
import { useMemo } from "react";

const { Text } = Typography;

// Convert minutes since midnight to time string (e.g., 420 -> "7:00 AM")
export function minutesToTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const period = hours >= 12 ? "PM" : "AM";
  const displayHours = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
  return `${displayHours}:${mins.toString().padStart(2, "0")} ${period}`;
}

// Generate all 30-minute intervals in a day, plus 11:59 PM as the last step
function generateTimeSteps(): number[] {
  const steps: number[] = [];
  for (let hour = 0; hour < 24; hour++) {
    for (let min = 0; min < 60; min += 30) {
      steps.push(hour * 60 + min);
    }
  }
  steps.push(23 * 60 + 59);
  return steps;
}

const TIME_STEPS = generateTimeSteps();
export const DEFAULT_START = 7 * 60; // 7:00 AM
export const DEFAULT_END = 21 * 60; // 9:00 PM

interface Props {
  value: [number, number];
  onChange: (v: [number, number]) => void;
}

export default function WorkHoursSlider({ value, onChange }: Props) {
  const [startMinutes, endMinutes] = value || [DEFAULT_START, DEFAULT_END];

  const startIndex = useMemo(
    () => TIME_STEPS.findIndex((m) => m >= startMinutes),
    [startMinutes],
  );
  const endIndex = useMemo(() => {
    for (let i = TIME_STEPS.length - 1; i >= 0; i -= 1) {
      if (TIME_STEPS[i] <= endMinutes) return i;
    }
    return -1;
  }, [endMinutes]);

  const handleChange = (vals: number[]) => {
    const [startIdx, endIdx] = vals;
    onChange?.([TIME_STEPS[startIdx], TIME_STEPS[endIdx]]);
  };

  const currentStartIndex = startIndex >= 0 ? startIndex : 0;
  const currentEndIndex = endIndex >= 0 ? endIndex : TIME_STEPS.length - 1;

  return (
    <Space orientation="vertical" style={{ width: "100%" }} size="small">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Text strong>Work Hours</Text>
      </div>
      <div style={{ padding: "0 32px" }}>
        <Slider
          range
          min={0}
          max={TIME_STEPS.length - 1}
          value={[currentStartIndex, currentEndIndex]}
          onChange={(v) => handleChange(v as number[])}
          marks={{
            [currentStartIndex]: minutesToTime(startMinutes),
            [currentEndIndex]: minutesToTime(endMinutes),
          }}
          step={1}
          tooltip={{
            formatter: (val) => minutesToTime(TIME_STEPS[val ?? 0]),
          }}
        />
      </div>
    </Space>
  );
}
