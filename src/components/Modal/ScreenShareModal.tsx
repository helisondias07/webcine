import React from "react";
import { Button, Modal } from "@mantine/core";
import styles from "./ScreenShareModal.module.css";

export const ScreenShareModal = ({
  closeModal,
  startScreenShare,
}: {
  closeModal: () => void;
  startScreenShare: (useMediaSoup: boolean) => void;
}) => (
  <Modal
    opened
    onClose={closeModal}
    title="Compartilhar tela"
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
      Para transmitir vídeo com áudio, escolha uma aba do Chrome ou Edge e
      marque “Compartilhar áudio”.
    </p>
    <ul className={styles.modalList}>
      <li>Use uma aba para filmes e vídeos.</li>
      <li>Use a tela inteira para aplicativos e jogos.</li>
      <li>A qualidade se ajusta automaticamente à conexão da sala.</li>
    </ul>
    <Button
      color="webgold"
      className={styles.planAction}
      onClick={() => {
        startScreenShare(false);
        closeModal();
      }}
      fullWidth
      size="md"
    >
      Escolher o que compartilhar
    </Button>
  </Modal>
);
