"use client";

import {
  ClearOutlined,
  ExclamationCircleFilled,
  SettingOutlined,
} from "@ant-design/icons";
import { Button, Col, message, Modal, Row } from "antd";
import { useState } from "react";
import { GrPowerReset } from "react-icons/gr";
import { MdOutlineSendAndArchive } from "react-icons/md";
import { RxUpdate } from "react-icons/rx";
import { updateRow } from "@/data/store";
import type { Chargepoint, ConnectorStatus } from "@/data/types";
import ChargerConfigurationModal from "./ChargerConfigurationModal";
import { CONFIRM_BUTTON_PROPS } from "./derive";
import ResetChargerModal from "./ResetChargerModal";
import TriggerMessageModal from "./TriggerMessageModal";
import UpdateChargerConfigurationModal from "./UpdateChargerConfigurationModal";

const { confirm } = Modal;

export default function ChargerControls({ cp }: { cp: Chargepoint }) {
  const cpid = cp.id;
  const [resetChargerModalOpen, setResetChargerModalOpen] = useState(false);
  const toggleResetChargerModalOpen = () =>
    setResetChargerModalOpen(!resetChargerModalOpen);

  const [isChargerConfigurationModalOpen, setIsChargerConfigurationModalOpen] =
    useState(false);
  const [
    isUpdateChargerConfigurationModalOpen,
    setIsUpdateChargerConfigurationModalOpen,
  ] = useState(false);
  const [isTriggerMessageModalOpen, setIsTriggerMessageModalOpen] =
    useState(false);

  const setAllConnectors = (status: ConnectorStatus) => {
    updateRow("chargepoints", cp.id, {
      connectors: cp.connectors.map((c) => ({ ...c, status })),
    });
  };

  return (
    <>
      <Row gutter={[16, 16]}>
        <Col className="gutter-row">
          <Button
            color="primary"
            variant="solid"
            onClick={toggleResetChargerModalOpen}
            icon={<GrPowerReset />}
          >
            Reset Charger
          </Button>
        </Col>

        <Col className="gutter-row">
          <Button
            color="primary"
            variant="solid"
            onClick={() => setIsChargerConfigurationModalOpen(true)}
            icon={<SettingOutlined />}
          >
            Get Charger Configuration
          </Button>
        </Col>

        <Col className="gutter-row">
          <Button
            color="primary"
            variant="solid"
            onClick={() => {
              confirm({
                title:
                  "Are you sure you want to send a ClearCache message to this Charger?",
                icon: <ExclamationCircleFilled />,
                content:
                  "When clicked the Proceed button, a ClearCache Message will be sent to the Chargepoint which will result in instructing the Charger to clear its Authorization Cache! This action cannot be undone!",
                onOk() {
                  message.success("Accepted");
                },
                onCancel() {},
                ...CONFIRM_BUTTON_PROPS,
              });
            }}
            icon={<ClearOutlined />}
          >
            Clear Cache
          </Button>
        </Col>

        <Col className="gutter-row">
          <Button
            color="primary"
            variant="solid"
            onClick={() => setIsUpdateChargerConfigurationModalOpen(true)}
            icon={<RxUpdate />}
          >
            Update Charger Configurations
          </Button>
        </Col>
        <Col className="gutter-row">
          <Button
            color="primary"
            variant="solid"
            onClick={() => {
              confirm({
                title:
                  "Are you sure you want to send a ChangeAvailability message to this Charger?",
                icon: <ExclamationCircleFilled />,
                content:
                  "When clicked the Proceed button, a ChangeAvailability Message will be sent to the Chargepoint with a request to make the entire Chargepoint `Operative`, which will result in instructing the Charger to make its status Operative! This action cannot be undone!",
                onOk() {
                  setAllConnectors("Available");
                  message.success("Accepted");
                },
                onCancel() {},
                ...CONFIRM_BUTTON_PROPS,
              });
            }}
          >
            Make Chargepoint Operative
          </Button>
        </Col>
        <Col className="gutter-row">
          <Button
            color="primary"
            variant="solid"
            onClick={() => {
              confirm({
                title:
                  "Are you sure you want to send a ChangeAvailability message to this Charger?",
                icon: <ExclamationCircleFilled />,
                content:
                  "When clicked the Proceed button, a ChangeAvailability Message will be sent to the Chargepoint with a request to make the entire Chargepoint `Inoperative`, which will result in instructing the Charger to make its status Inoperative and unavailable for any kind of use! This action cannot be undone!",
                onOk() {
                  setAllConnectors("Unavailable");
                  message.success("Accepted");
                },
                onCancel() {},
                ...CONFIRM_BUTTON_PROPS,
              });
            }}
          >
            Make Chargepoint Inoperative
          </Button>
        </Col>

        <Col className="gutter-row">
          <Button
            color="primary"
            variant="solid"
            onClick={() => setIsTriggerMessageModalOpen(true)}
            icon={<MdOutlineSendAndArchive />}
          >
            Trigger Message
          </Button>
        </Col>
      </Row>

      <ResetChargerModal
        isModalOpen={resetChargerModalOpen}
        handleModalVisibility={setResetChargerModalOpen}
        cpid={cpid}
      />
      <ChargerConfigurationModal
        isModalOpen={isChargerConfigurationModalOpen}
        handleModalVisibility={setIsChargerConfigurationModalOpen}
        cpid={cpid}
      />
      <UpdateChargerConfigurationModal
        isModalOpen={isUpdateChargerConfigurationModalOpen}
        handleModalVisibility={setIsUpdateChargerConfigurationModalOpen}
        cpid={cpid}
      />
      <TriggerMessageModal
        cpid={cpid}
        isModalOpen={isTriggerMessageModalOpen}
        handleModalVisibility={setIsTriggerMessageModalOpen}
      />
    </>
  );
}
