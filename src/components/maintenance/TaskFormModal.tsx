"use client";

import {
  Button,
  DatePicker,
  Divider,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Switch,
} from "antd";
import dayjs, { Dayjs } from "dayjs";
import { Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { findService, serviceOptionGroups } from "@/data/serviceCatalog";
import type { MaintenanceTask } from "@/data/types";
import { DATE_FORMAT } from "@/lib/dateFormat";

const SERVICE_OPTIONS = serviceOptionGroups();

export interface TaskFormVehicle {
  id: string;
  licensePlate: string;
  make: string;
  model: string;
  odometerKm: number | null;
}

export interface TaskFormPayload {
  evId: string;
  title: string;
  description: string | null;
  isRecurring: boolean;
  intervalKm: number | null;
  intervalMonths: number | null;
  dueKm: number | null;
  dueDate: string | null; // YYYY-MM-DD
  currentOdometerKm: number | null;
}

interface TaskFormValues {
  evId: string;
  title: string;
  description?: string | null;
  isRecurring?: boolean;
  intervalKm?: number | null;
  intervalMonths?: number | null;
  dueKm?: number | null;
  dueDate?: Dayjs | null;
  currentOdometerKm?: number | null;
}

// Add / edit a service. Pass `task` to edit, null to add.
export default function TaskFormModal({
  open,
  onClose,
  onSubmit,
  task,
  vehicles,
  customServices,
  onCreateService,
  loading,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (payload: TaskFormPayload) => void;
  task: MaintenanceTask | null;
  vehicles: TaskFormVehicle[];
  /** Services the fleet added itself, on top of the built-in catalogue. */
  customServices: string[];
  onCreateService: (title: string) => void;
  loading: boolean;
}) {
  const [form] = Form.useForm<TaskFormValues>();
  const isEdit = !!task;
  const [newService, setNewService] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);

  // The catalogue covers the usual jobs, but no list written up front covers
  // every fleet — anything added here joins the options straight away.
  const serviceOptions = useMemo(() => {
    const extra = customServices.filter((title) => !findService(title));
    if (task?.title && !findService(task.title) && !extra.includes(task.title)) {
      // Editing a service that was removed from the list: keep it selectable
      // so opening the form does not silently blank the field.
      extra.push(task.title);
    }
    return extra.length
      ? [...SERVICE_OPTIONS, { label: "Added by your fleet", options: extra.map((t) => ({ value: t, label: t })) }]
      : SERVICE_OPTIONS;
  }, [customServices, task]);

  const addService = () => {
    const title = newService.trim();
    if (!title) return;
    // Already on the list — just pick it rather than making a duplicate.
    if (!findService(title) && !customServices.includes(title)) {
      onCreateService(title);
    }
    form.setFieldValue("title", title);
    setNewService("");
    // Adding is picking: the service is now selected, so the list has done its
    // job and should get out of the way like any other choice would.
    setPickerOpen(false);
  };

  const trimmedNewService = newService.trim();
  const duplicateService =
    trimmedNewService.length > 0 &&
    (!!findService(trimmedNewService) ||
      customServices.includes(trimmedNewService));

  const selectedEvId = Form.useWatch("evId", form);
  const isRecurring = Form.useWatch("isRecurring", form);
  // Sandbox replacement for useEvOdometer: read the known odometer straight
  // from the selected vehicle row.
  const odometerInfo =
    !isEdit && open && selectedEvId
      ? {
          currentKm:
            vehicles.find((v) => v.id === selectedEvId)?.odometerKm ?? null,
        }
      : null;
  const hasAnchor = odometerInfo?.currentKm != null;

  useEffect(() => {
    if (!open) return;
    if (task) {
      form.setFieldsValue({
        evId: task.evId,
        title: task.title,
        description: task.description,
        isRecurring: task.isRecurring,
        intervalKm: task.intervalKm,
        intervalMonths: task.intervalMonths,
        dueKm: task.dueKm != null ? Number(task.dueKm) : null,
        dueDate: task.dueDate ? dayjs(task.dueDate) : null,
      });
    } else {
      form.resetFields();
    }
  }, [open, task, form]);

  /**
   * Picking a service fills its usual interval in. Only when adding: on an edit
   * the intervals on the row are the ones that contract was agreed at, and
   * re-selecting the same service should not quietly rewrite them.
   */
  const handleServiceChange = (title: string) => {
    if (isEdit) return;
    const preset = findService(title);
    if (!preset) return;
    form.setFieldsValue({
      isRecurring: preset.isRecurring,
      intervalKm: preset.intervalKm,
      intervalMonths: preset.intervalMonths,
    });
  };

  /** Half-typed service names should not survive into the next open. */
  const handleClose = () => {
    setNewService("");
    setPickerOpen(false);
    onClose();
  };

  const handleOk = async () => {
    const values = await form.validateFields();
    setNewService("");
    setPickerOpen(false);
    const payload: TaskFormPayload = {
      evId: values.evId,
      title: values.title,
      description: values.description ?? null,
      isRecurring: !!values.isRecurring,
      intervalKm: values.intervalKm ?? null,
      intervalMonths: values.intervalMonths ?? null,
      dueKm: values.dueKm ?? null,
      dueDate: values.dueDate ? values.dueDate.format("YYYY-MM-DD") : null,
      currentOdometerKm: values.currentOdometerKm ?? null,
    };
    onSubmit(payload);
  };

  return (
    <Modal
      title={isEdit ? "Edit service" : "Add service"}
      open={open}
      onCancel={handleClose}
      onOk={handleOk}
      okText={isEdit ? "Save changes" : "Add service"}
      confirmLoading={loading}
      destroyOnHidden
      width={520}
    >
      <Form
        form={form}
        layout="vertical"
        requiredMark={false}
        initialValues={{ isRecurring: false }}
      >
        <Form.Item
          name="evId"
          label="Vehicle"
          rules={[{ required: true, message: "Select a vehicle" }]}
        >
          <Select
            placeholder="Select vehicle"
            disabled={isEdit}
            showSearch
            optionFilterProp="label"
            options={(vehicles || []).map((v) => ({
              value: v.id,
              label: `${v.licensePlate || `EV #${v.id}`}${
                v.make ? ` — ${v.make} ${v.model || ""}` : ""
              }`,
            }))}
          />
        </Form.Item>

        <Form.Item
          name="title"
          label="Service"
          rules={[{ required: true, message: "Select a service" }]}
        >
          <Select
            placeholder="Select service"
            showSearch
            optionFilterProp="label"
            options={serviceOptions}
            onChange={handleServiceChange}
            open={pickerOpen}
            onOpenChange={setPickerOpen}
            listHeight={260}
            popupRender={(menu) => (
              <>
                {menu}
                <Divider style={{ margin: "4px 0 0" }} />
                <div
                  style={{
                    padding: "10px 12px",
                    background: "#fafafa",
                    borderRadius: "0 0 8px 8px",
                  }}
                >
                  <div
                    style={{
                      fontSize: 12,
                      color: "#94a3b8",
                      marginBottom: 6,
                    }}
                  >
                    Not on the list? Add it to your fleet&apos;s services.
                  </div>
                  <Space.Compact style={{ width: "100%" }}>
                    <Input
                      placeholder="e.g. Regen braking calibration"
                      value={newService}
                      onChange={(e) => setNewService(e.target.value)}
                      status={duplicateService ? "warning" : undefined}
                      onKeyDown={(e) => {
                        // The list treats Enter as "pick the highlighted
                        // option"; in here it means "add what I typed".
                        e.stopPropagation();
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addService();
                        }
                      }}
                    />
                    <Button
                      type="primary"
                      icon={<Plus size={14} style={{ marginBottom: -2 }} />}
                      disabled={!trimmedNewService}
                      onClick={addService}
                    >
                      {duplicateService ? "Select" : "Add"}
                    </Button>
                  </Space.Compact>
                  {duplicateService && (
                    <div
                      style={{ fontSize: 12, color: "#d97706", marginTop: 6 }}
                    >
                      Already on the list — adding will just select it.
                    </div>
                  )}
                </div>
              </>
            )}
          />
        </Form.Item>

        <Form.Item name="description" label="Description">
          <Input.TextArea rows={2} placeholder="Optional details" />
        </Form.Item>

        <Form.Item
          name="isRecurring"
          label="Recurring"
          valuePropName="checked"
          tooltip="On completion the next due point is scheduled automatically from the intervals below"
        >
          <Switch />
        </Form.Item>

        {isRecurring && (
          <div style={{ display: "flex", gap: 12 }}>
            <Form.Item name="intervalKm" label="Every (km)" style={{ flex: 1 }}>
              <InputNumber
                min={1}
                style={{ width: "100%" }}
                placeholder="e.g. 30000"
              />
            </Form.Item>
            <Form.Item
              name="intervalMonths"
              label="Every (months)"
              style={{ flex: 1 }}
            >
              <InputNumber
                min={1}
                style={{ width: "100%" }}
                placeholder="e.g. 12"
              />
            </Form.Item>
          </div>
        )}

        <div style={{ display: "flex", gap: 12 }}>
          <Form.Item
            name="dueKm"
            label="Due at (km)"
            style={{ flex: 1 }}
            tooltip={
              isRecurring
                ? "Leave empty to derive from the km interval and the current odometer"
                : "Odometer reading at which this task is due"
            }
          >
            <InputNumber
              min={0}
              style={{ width: "100%" }}
              placeholder="e.g. 60000"
            />
          </Form.Item>
          <Form.Item
            name="dueDate"
            label="Due by (date)"
            style={{ flex: 1 }}
            tooltip={
              isRecurring
                ? "Leave empty to derive from the months interval"
                : undefined
            }
          >
            <DatePicker style={{ width: "100%" }} format={DATE_FORMAT} />
          </Form.Item>
        </div>

        {!isEdit && (
          <Form.Item
            name="currentOdometerKm"
            label="Current odometer (km)"
            tooltip="Used as the starting point for km tracking — distance driven is added automatically from telematics"
            extra={
              selectedEvId
                ? hasAnchor
                  ? `Known reading: ~${Number(odometerInfo!.currentKm).toLocaleString()} km — enter a value only to recalibrate`
                  : "No odometer reading recorded for this vehicle yet — required for km-based tracking"
                : null
            }
          >
            <InputNumber
              min={0}
              style={{ width: "100%" }}
              placeholder="e.g. 42500"
            />
          </Form.Item>
        )}
      </Form>
    </Modal>
  );
}
