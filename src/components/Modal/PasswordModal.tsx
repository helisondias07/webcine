import React, { useCallback } from "react";
import { Modal, PasswordInput, ActionIcon } from "@mantine/core";
import { IconKey } from "@tabler/icons-react";
import { addAndSavePassword } from "../../utils/utils";

export const PasswordModal = ({ roomId }: { roomId: string }) => {
  const setPassword = useCallback(() => {
    const password = (
      document.getElementById("roomPassword") as HTMLInputElement
    )?.value;
    addAndSavePassword(roomId, password);
    window.location.reload();
  }, [roomId]);
  return (
    <Modal
      onClose={() => {}}
      withCloseButton={false}
      opened
      centered
      size="md"
      title="Esta sala exige senha"
    >
      <PasswordInput
        id="roomPassword"
        placeholder="Digite a senha da sala"
        aria-label="Senha da sala"
        onKeyDown={(e: any) => {
          if (e.key === "Enter") {
            e.preventDefault();
            setPassword();
          }
        }}
        rightSection={
          <ActionIcon
            onClick={setPassword}
            aria-label="Entrar na sala"
            title="Entrar"
          >
            <IconKey size={16} />
          </ActionIcon>
        }
      />
    </Modal>
  );
};
