"use client";

import { DownloadOutlined } from "@ant-design/icons";
import { Button, Modal, QRCode } from "antd";
import { qrUrlForCharger } from "./derive";
import { message } from "@/lib/antdStatic";

export default function QRCodeDetailModal({
  isModalVisible,
  changeModalVisible,
  cpid,
}: {
  isModalVisible: boolean;
  changeModalVisible: (open: boolean) => void;
  cpid: string;
}) {
  return (
    <Modal
      title="QR Code"
      open={isModalVisible}
      onCancel={() => changeModalVisible(false)}
      footer={[
        <Button
          type="primary"
          icon={<DownloadOutlined />}
          onClick={() => message.info("Not available in the sandbox")}
          key={0}
        >
          Download QR Code
        </Button>,
      ]}
    >
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          flexDirection: "column",
        }}
      >
        <div id={`charger-qr-code-${cpid}`} className="p-3">
          <QRCode
            value={qrUrlForCharger(cpid)}
            bgColor="#fff"
            size={440}
            errorLevel="H"
            type="svg"
          />
          <div className="mt-2 flex flex-col gap-1 p-1 px-2 pb-3 text-4xl font-extrabold">
            <div className="flex justify-center">
              <p className="">CP ID -</p>
              <p className="ml-1"> {cpid}</p>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
