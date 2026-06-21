import React from "react";
import { Button, Modal } from "@mantine/core";
import styles from "./ScreenShareModal.module.css";

export const FileShareModal = ({
  closeModal,
  startFileShare,
}: {
  closeModal: () => void;
  startFileShare: (useMediaSoup: boolean) => void;
}) => (
  <Modal
    opened
    onClose={closeModal}
    title="Compartilhar arquivo"
    centered
    size={520}
    classNames={{
      content: styles.modalContent,
      header: styles.modalHeader,
      title: styles.modalTitle,
      body: styles.modalBody,
    }}
  >
    <p className={styles.modalLead}>
      O arquivo é transmitido diretamente do seu dispositivo. Mantenha esta
      página aberta durante a sessão.
    </p>
    <ul className={styles.modalList}>
      <li>MP4 e WebM oferecem a melhor compatibilidade.</li>
      <li>A velocidade depende do upload de quem está compartilhando.</li>
    </ul>
    <Button
      color="webgold"
      className={styles.planAction}
      onClick={() => {
        startFileShare(false);
        closeModal();
      }}
      fullWidth
      size="md"
    >
      Escolher arquivo
    </Button>
  </Modal>
);
