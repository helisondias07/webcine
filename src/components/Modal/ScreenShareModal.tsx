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
        Escolha como deseja iniciar sua transmissao.
      </div>
      <ul className={styles.modalList}>
        <li>Melhor experiencia em Chrome e Edge no desktop.</li>
        <li>Audio funciona ao compartilhar tela inteira ou aba do navegador.</li>
        <li>Qualidade ajusta automaticamente para priorizar nitidez sem sobrecarregar.</li>
      </ul>
      <div className={styles.planGrid}>
        <section className={styles.planCard}>
          <div className={styles.planHead}>
            <h3>WebCineTV Free</h3>
            <Badge variant="light" color="webgold">
              Disponivel
            </Badge>
          </div>
          <p className={styles.planText}>
            Compartilhe direto do seu dispositivo para ate 10 pessoas na sala.
          </p>
          <ul className={styles.planSpecs}>
            <li>Qualidade dinamica ate Full HD</li>
            <li>Ideal para reunioes pequenas</li>
            <li>Melhor resultado com upload estavel acima de 15 Mbps</li>
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
            Transmissao otimizada por relay para salas maiores e mais estaveis.
          </p>
          <ul className={styles.planSpecs}>
            <li>Mais pessoas simultaneas</li>
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
