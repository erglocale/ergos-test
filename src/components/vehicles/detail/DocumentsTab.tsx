"use client";

import { ExclamationCircleFilled } from "@ant-design/icons";
import { Button, Modal, Tag, message } from "antd";
import dayjs from "dayjs";
import { useMemo, useState } from "react";
import { FiDownload, FiEye, FiFileText, FiPlus, FiTrash2 } from "react-icons/fi";
import type { Vehicle } from "@/data/types";
import { deriveVehicleDocs, fmtDate, type VehicleDoc } from "./vehicleDetailUtils";

const { confirm } = Modal;

export const docOptions = [
  // PUCC intentionally omitted — fleet is EV.
  { label: "All", value: "ALL" },
  { value: "VEHICLE_REGISTRATION", label: "Vehicle Registration" },
  { value: "VEHICLE_FITNESS_CERTIFICATE", label: "Vehicle Fitness Certificate" },
  { value: "VEHICLE_INSURANCE", label: "Vehicle Insurance" },
  { value: "OTHERS", label: "Others" },
];

// Documents tab — production fetches uploaded documents from S3; the
// sandbox shows deterministic dummy documents (deletes last for the
// session only, uploads are stubbed).
export default function DocumentsTab({ vehicle }: { vehicle: Vehicle }) {
  const [selectedType, setSelectedType] = useState("ALL");
  const [removedIds, setRemovedIds] = useState<string[]>([]);

  const allDocs = useMemo(() => deriveVehicleDocs(vehicle), [vehicle]);
  const documents = allDocs.filter(
    (d) =>
      !removedIds.includes(d.id) && (selectedType === "ALL" || d.documentType === selectedType),
  );

  const expiryLine = (doc: VehicleDoc) => {
    if (!doc.expiresAt) return null;
    const daysLeft = dayjs(doc.expiresAt).startOf("day").diff(dayjs().startOf("day"), "day");
    const formatted = fmtDate(doc.expiresAt);
    let className = "text-xs text-gray-600";
    let label = `Expires on ${formatted}`;
    if (daysLeft < 0) {
      className = "text-xs font-medium text-red-600";
      label = `Expired on ${formatted}`;
    } else if (daysLeft <= 30) {
      className = "text-xs font-medium text-red-600";
      label = `Expires on ${formatted} (${daysLeft}d left)`;
    } else if (daysLeft <= 90) {
      className = "text-xs font-medium text-amber-600";
      label = `Expires on ${formatted} (${daysLeft}d left)`;
    }
    return <p className={className}>{label}</p>;
  };

  return (
    <>
      <div className="flex w-full items-center justify-between">
        <div>
          {docOptions.map((docType) => {
            const isSelected = selectedType === docType.value;
            return (
              <Tag
                key={docType.value}
                color={isSelected ? "#f50" : undefined}
                onClick={() => setSelectedType(docType.value)}
                className={`cursor-pointer rounded-3xl px-3 py-1 font-semibold ${isSelected ? "text-white" : ""}`}
              >
                {docType.label}
              </Tag>
            );
          })}
        </div>

        <Button
          type="primary"
          icon={<FiPlus className="h-4 w-4" />}
          size="large"
          onClick={() => message.info("Not available in the sandbox")}
        >
          Upload New Document
        </Button>
      </div>

      {documents.length === 0 && <div className="mt-4 text-gray-500">No documents found.</div>}

      <div className="mt-6 flex w-full flex-wrap gap-4">
        {documents.map((doc) => (
          <div className="flex items-center gap-2" key={doc.id}>
            <div className="flex flex-col rounded-xl border border-gray-300" style={{ width: "380px" }}>
              <div
                className="flex w-full flex-col items-center justify-center rounded-xl rounded-b-none bg-gray-100"
                style={{ height: "150px" }}
              >
                <div className="rounded-xl bg-red-100 p-4">
                  <FiFileText className="h-8 w-8 text-red-500" />
                </div>
                <p className="mt-2 text-gray-500">{doc.fileKind}</p>
              </div>
              <div className="flex flex-col items-center rounded-xl bg-white p-4 pb-4 pt-4">
                <div className="flex w-full justify-between">
                  <div className="flex flex-col">
                    <p className="text-xs">Document Number</p>
                    <p className="font-semibold">{doc.documentIdentifier}</p>
                  </div>

                  <div className="flex flex-col gap-1">
                    <Tag
                      className="rounded-xl p-1 text-xs"
                      style={{ textAlign: "center" }}
                      color="rgb(59, 59, 59)"
                    >
                      {docOptions.find((type) => type.value === doc.documentType)?.label}
                    </Tag>
                    <p className="text-xs text-gray-600">Uploaded on {fmtDate(doc.createdAt)}</p>
                    {expiryLine(doc)}
                  </div>
                </div>

                <div className="mt-4 flex w-full justify-between gap-2">
                  <Button
                    className="w-full"
                    size="large"
                    icon={<FiEye className="h-4 w-4" />}
                    onClick={() => message.info("Not available in the sandbox")}
                  >
                    View
                  </Button>

                  <Button
                    size="large"
                    style={{ width: "60px" }}
                    onClick={() => message.info("Not available in the sandbox")}
                    icon={<FiDownload className="h-4 w-8" />}
                  />
                  <Button
                    size="large"
                    danger
                    style={{ width: "60px" }}
                    icon={<FiTrash2 className="h-4 w-8" />}
                    onClick={() => {
                      confirm({
                        title: "Delete Document ?",
                        icon: <ExclamationCircleFilled />,
                        okText: "Delete",
                        content:
                          "Are you sure you want to delete this document? This action cannot be undone.",
                        onOk() {
                          setRemovedIds((prev) => [...prev, doc.id]);
                          message.success("Document deleted.");
                        },
                        onCancel() {},
                      });
                    }}
                  />
                </div>
                <div className="mt-4 w-full">
                  {doc.verificationStatus === "VERIFIED" && (
                    <Tag
                      color="green"
                      className="align-center w-full rounded-lg p-2 text-center text-sm font-semibold"
                    >
                      Verified
                    </Tag>
                  )}
                  {doc.verificationStatus === "PENDING" && (
                    <Tag
                      color="orange"
                      className="align-center w-full rounded-lg p-2 text-center text-sm font-semibold"
                    >
                      Verification Pending
                    </Tag>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
