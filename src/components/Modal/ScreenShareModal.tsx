import React from "react";
import { Button, Modal } from "@mantine/core";
import styles from "./ScreenShareModal.module.css";
import type { ScreenShareMode } from "../App/screenshare/capture";

export const ScreenShareModal = ({
  closeModal,
  startScreenShare,
  mode,
  unsupportedMessage,
}: {
  closeModal: () => void;
  startScreenShare: (useMediaSoup: boolean) => void;
  mode: ScreenShareMode;
  unsupportedMessage: string;
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
    {mode === "handheld" ? (
      <>
        <p className={styles.modalLead}>
          O celular ou tablet vai pedir permissão para gravar a tela. Aceite
          para a sala começar a ver a sua tela.
        </p>
        <ul className={styles.modalList}>
          <li>Toque em “Começar agora” ou “Gravar a tela”.</li>
          <li>
            O som de outros aplicativos geralmente não entra nessa captura.
          </li>
          <li>Para um filme com áudio, envie o arquivo de vídeo.</li>
        </ul>
      </>
    ) : mode === "unsupported" ? (
      <p className={styles.modalLead}>{unsupportedMessage}</p>
    ) : (
      <>
        <p className={styles.modalLead}>
          Para transmitir vídeo com áudio, escolha uma aba do Chrome ou Edge e
          marque “Compartilhar áudio”.
        </p>
        <ul className={styles.modalList}>
          <li>Use uma aba para filmes e vídeos.</li>
          <li>Use a tela inteira para aplicativos e jogos.</li>
          <li>A qualidade se ajusta automaticamente à conexão da sala.</li>
        </ul>
      </>
    )}
    {mode !== "unsupported" && (
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
        {mode === "handheld"
          ? "Compartilhar a tela"
          : "Escolher o que compartilhar"}
      </Button>
    )}
  </Modal>
);
