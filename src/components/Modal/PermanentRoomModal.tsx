import React from "react";
import { Modal, Text } from "@mantine/core";

export const PermanentRoomModal = ({
  closeModal,
}: {
  closeModal: () => void;
}) => (
  <Modal opened onClose={closeModal} centered title="Sala permanente">
    <Text size="sm">
      Salas permanentes mantêm o mesmo endereço e podem ter nome, descrição,
      senha e link personalizado. A administração fica vinculada a este
      navegador. Não limpe os dados locais do site se quiser manter o acesso de
      dono.
    </Text>
  </Modal>
);
