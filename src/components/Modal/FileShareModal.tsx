import React from "react";
import { Badge, Button, Modal } from "@mantine/core";
import styles from "./ScreenShareModal.module.css";

export const FileShareModal = (props: {
  closeModal: () => void;
  startFileShare: (useMediaSoup: boolean) => void;
}) => {
  const { closeModal } = props;
  return (
    <Modal
      opened
      onClose={closeModal}
      title="Compartilhar arquivo"
      centered
      size={620}
      classNames={{
        content: styles.modalContent,
        header: styles.modalHeader,
        title: styles.modalTitle,
        body: styles.modalBody,
      }}
    >
      <div className={styles.modalLead}>
        Escolha como deseja compartilhar um arquivo do seu dispositivo.
      </div>
      <ul className={styles.modalList}>
        <li>MP4 e WebM costumam funcionar melhor em todos os navegadores.</li>
        <li>Alguns codecs de MKV/AVI podem falhar no modo direto.</li>
        <li>Versão premium para arquivo avançado estará disponível em breve.</li>
      </ul>
      <div className={styles.planGrid}>
        <section className={styles.planCard}>
          <div className={styles.planHead}>
            <h3>WebCineTV Free</h3>
            <Badge variant="light" color="webgold">
              Disponível
            </Badge>
          </div>
          <p className={styles.planText}>
            Compartilhe direto do seu dispositivo para até 10 pessoas.
          </p>
          <ul className={styles.planSpecs}>
            <li>Latência baixa</li>
            <li>Sem conversão do arquivo</li>
            <li>Melhor em MP4/WebM</li>
          </ul>
          <Button
            color="webgold"
            className={styles.planAction}
            onClick={() => {
              props.startFileShare(false);
              closeModal();
            }}
            fullWidth
          >
            Compartilhar arquivo
          </Button>
        </section>
        <section className={`${styles.planCard} ${styles.premiumCard}`}>
          <div className={styles.planHead}>
            <h3>WebCineTV Premium</h3>
            <Badge variant="light" color="gray">
              Em breve
            </Badge>
          </div>
          <p className={styles.planText}>
            Compartilhamento premium de arquivos com relay e conversão.
          </p>
          <ul className={styles.planSpecs}>
            <li>Mais formatos funcionando</li>
            <li>Melhor para salas maiores</li>
            <li>Latência aproximada de 5s</li>
          </ul>
          <Button
            variant="light"
            color="gray"
            className={styles.planAction}
            disabled
            fullWidth
          >
            Em breve...
          </Button>
        </section>
      </div>
    </Modal>
  );
};

