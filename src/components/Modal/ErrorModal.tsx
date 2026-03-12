import React from "react";
import { Modal, Button } from "@mantine/core";
import { IconCirclePlusFilled, IconHome } from "@tabler/icons-react";
import styles from "./ErrorModal.module.css";

export const ErrorModal = ({ error }: { error: string }) => {
  return (
    <Modal
      opened
      onClose={() => {}}
      withCloseButton={false}
      closeOnEscape={false}
      closeOnClickOutside={false}
      title={error}
      centered
      classNames={{
        title: styles.title,
        content: styles.content,
        body: styles.body,
      }}
    >
      <div className={styles.actions}>
        <Button
          size="md"
          className={styles.actionButton}
          color="webgold"
          onClick={() => {
            window.location.assign("/create");
          }}
          leftSection={<IconCirclePlusFilled />}
        >
          Nova sala
        </Button>
        <Button
          size="md"
          className={styles.actionButton}
          variant="light"
          color="webgold"
          onClick={() => {
            window.location.assign("/");
          }}
          leftSection={<IconHome />}
        >
          Ir para inicio
        </Button>
      </div>
    </Modal>
  );
};
