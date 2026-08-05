"use client";

import { SearchOutlined } from "@ant-design/icons";
import { Button, Checkbox, Input, List, Modal, Select } from "antd";
import { useEffect, useMemo, useState } from "react";
import { useDb } from "@/data/store";

interface Props {
  open: boolean;
  onCancel: () => void;
  onConfirm: (ids: string[]) => void;
  selectedVehicleIds?: string[];
}

// Sandbox port of Components/Reports/VehicleSelectionModal — vehicles come
// from the dummy store; the hub quick-select uses vehicle.hub.
export default function VehicleSelectionModal({
  open,
  onCancel,
  onConfirm,
  selectedVehicleIds = [],
}: Props) {
  const db = useDb();
  const vehicles = db.vehicles;
  const hubs = useMemo(
    () => Array.from(new Set(vehicles.map((v) => v.hub))),
    [vehicles],
  );
  const [checkedIds, setCheckedIds] = useState<string[]>(() => [
    ...selectedVehicleIds,
  ]);
  const [search, setSearch] = useState("");
  const [hubFilter, setHubFilter] = useState<string | null>(null);

  // Sync checked state when modal opens
  useEffect(() => {
    if (open) {
      setCheckedIds(
        Array.isArray(selectedVehicleIds) ? [...selectedVehicleIds] : [],
      );
      setSearch("");
      setHubFilter(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // When a hub is picked, replace selection with vehicles in that hub.
  const handleHubChange = (hub: string | null) => {
    setHubFilter(hub);
    if (!hub) {
      setCheckedIds([]);
      return;
    }
    setCheckedIds(vehicles.filter((v) => v.hub === hub).map((v) => v.id));
  };

  const filteredVehicles = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return vehicles;
    return vehicles.filter((v) => v.reg.toLowerCase().includes(q));
  }, [vehicles, search]);

  const selectAll = () => {
    const filteredIds = filteredVehicles.map((v) => v.id);
    setCheckedIds((prev) => {
      const existing = new Set(prev);
      filteredIds.forEach((id) => existing.add(id));
      return Array.from(existing);
    });
  };

  const deselectAll = () => {
    const filteredIds = new Set(filteredVehicles.map((v) => v.id));
    setCheckedIds((prev) => prev.filter((id) => !filteredIds.has(id)));
  };

  const toggle = (id: string) => {
    setCheckedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id],
    );
  };

  const handleOk = () => {
    onConfirm?.(checkedIds);
    onCancel?.();
  };

  const filteredCheckedCount = filteredVehicles.filter((v) =>
    checkedIds.includes(v.id),
  ).length;

  return (
    <Modal
      title={`Select Vehicles${vehicles.length ? ` (${checkedIds.length} / ${vehicles.length} selected)` : ""}`}
      open={open}
      onCancel={onCancel}
      onOk={handleOk}
      okText="Apply"
      width={480}
    >
      <Input
        prefix={<SearchOutlined style={{ color: "#9CA3AF" }} />}
        placeholder="Search by license plate…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        allowClear
        style={{ marginBottom: 10 }}
      />

      <div
        style={{
          marginBottom: 10,
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        <Button size="small" onClick={selectAll} disabled={!filteredVehicles.length}>
          {search ? `Select filtered (${filteredVehicles.length})` : "Select all"}
        </Button>
        <Button
          size="small"
          onClick={deselectAll}
          disabled={filteredCheckedCount === 0}
        >
          {search
            ? `Deselect filtered (${filteredCheckedCount})`
            : "Deselect all"}
        </Button>
        {hubs.length > 0 && (
          <Select
            value={hubFilter}
            onChange={(v) => handleHubChange(v ?? null)}
            placeholder="Hub"
            size="small"
            allowClear
            style={{ width: 140, minWidth: 140 }}
            options={hubs.map((h) => ({ value: h, label: h }))}
          />
        )}
        {search && (
          <span style={{ fontSize: 12, color: "#9CA3AF", marginLeft: "auto" }}>
            {filteredVehicles.length} of {vehicles.length} shown
          </span>
        )}
      </div>

      {filteredVehicles.length === 0 ? (
        <div
          style={{
            padding: 24,
            textAlign: "center",
            color: "#9CA3AF",
            fontSize: 13,
          }}
        >
          No vehicles match &quot;{search}&quot;
        </div>
      ) : (
        <List
          size="small"
          dataSource={filteredVehicles}
          renderItem={(item) => (
            <List.Item style={{ padding: "6px 0" }}>
              <Checkbox
                checked={checkedIds.includes(item.id)}
                onChange={() => toggle(item.id)}
              >
                <span style={{ fontWeight: 500 }}>{item.reg}</span>
                <span style={{ color: "#9CA3AF", fontSize: 12, marginLeft: 6 }}>
                  {[item.make, item.model].filter(Boolean).join(" ")}
                </span>
              </Checkbox>
            </List.Item>
          )}
          style={{ maxHeight: 360, overflow: "auto" }}
        />
      )}
    </Modal>
  );
}
