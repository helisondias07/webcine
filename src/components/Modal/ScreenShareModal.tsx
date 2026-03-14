import React from "react";
import { Badge, Button, Modal } from "@mantine/core";
import styles from "./ScreenShareModal.module.css";

export const ScreenShareModal = ({
  closeModal,
  startScreenShare,
}: {
  closeModal: () => void;
  startScreenShare: (useMediaSoup: boolean) => void;
}) => {
  return (
    <Modal
      opened={true}
      onClose={closeModal}
      title="Compartilhar tela"
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
        Escolha como deseja iniciar sua transmissão.
      </div>
      <ul className={styles.modalList}>
        <li>Melhor experiência em Chrome e Edge no desktop.</li>
        <li>Áudio funciona ao compartilhar tela inteira ou aba do navegador.</li>
        <li>Qualidade ajusta automaticamente para priorizar nitidez sem sobrecarregar.</li>
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
            Compartilhe direto do seu dispositivo para até 10 pessoas na sala.
          </p>
          <ul className={styles.planSpecs}>
            <li>Qualidade dinâmica até Full HD</li>
            <li>Ideal para reuniões pequenas</li>
            <li>Melhor resultado com upload estável acima de 15 Mbps</li>
          </ul>
          <Button
            color="webgold"
            className={styles.planAction}
            onClick={() => {
              startScreenShare(false);
              closeModal();
            }}
            fullWidth
          >
            Compartilhar tela
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
            Transmissão otimizada por relay para salas maiores e mais estáveis.
          </p>
          <ul className={styles.planSpecs}>
            <li>Mais pessoas simultâneas</li>
            <li>Menor consumo de upload local</li>
            <li>Prioridade de processamento</li>
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

