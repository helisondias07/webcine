import React from "react";
import { Badge, Button, Modal } from "@mantine/core";
import styles from "./ScreenShareModal.module.css";

export const VBrowserModal = ({
  closeModal,
  startVBrowser,
}: {
  closeModal: () => void;
  startVBrowser: (options: {
    size: string;
    region: string;
    targetUrl?: string;
  }) => void;
}) => {
  return (
    <Modal
      opened
      onClose={closeModal}
      title="Iniciar navegador virtual"
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
        Abra um navegador em nuvem dentro da sala para assistir conteúdos que
        não funcionam por link direto.
      </div>
      <ul className={styles.modalList}>
        <li>Ideal para plataformas com restrições de reprodução no navegador local.</li>
        <li>A sessão inicia na nuvem e pode ser controlada em tempo real.</li>
        <li>Opções avançadas de premium ficarão disponíveis em breve.</li>
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
            Inicie um navegador virtual padrão para compartilhar com a sala.
          </p>
          <ul className={styles.planSpecs}>
            <li>Controle em tempo real</li>
            <li>Sem configuração manual</li>
            <li>Fluxo simples para assistir junto</li>
          </ul>
          <Button
            color="webgold"
            className={styles.planAction}
            onClick={() => {
              startVBrowser({ size: "", region: "" });
              closeModal();
            }}
            fullWidth
          >
            Iniciar
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
            Prioridade, sessão estendida e recursos avançados de navegação.
          </p>
          <ul className={styles.planSpecs}>
            <li>Melhor estabilidade para salas maiores</li>
            <li>Recursos extras para sessões longas</li>
            <li>Prioridade de alocação de navegador</li>
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

