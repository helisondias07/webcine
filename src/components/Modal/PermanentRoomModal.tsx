import React from "react";
import { Modal, Table } from "@mantine/core";
import { IconCheck } from "@tabler/icons-react";

export const PermanentRoomModal = (props: { closeModal: () => void }) => {
  const { closeModal } = props;
  return (
    <Modal opened onClose={closeModal} title="Salas permanentes">
      <div>
        Usuários cadastrados podem tornar uma sala permanente.
        Assinantes podem criar várias salas permanentes.
      </div>
      <Table striped>
        <Table.Thead>
          <Table.Tr>
            <Table.Th />
            <Table.Th>Temporária</Table.Th>
            <Table.Th>Permanente</Table.Th>
          </Table.Tr>
        </Table.Thead>

        <Table.Tbody>
          <Table.Tr>
            <Table.Td>Expiração</Table.Td>
            <Table.Td>Após 24 horas sem atividade</Table.Td>
            <Table.Td>Nunca</Table.Td>
          </Table.Tr>
          <Table.Tr>
            <Table.Td>Senha da sala</Table.Td>
            <Table.Td></Table.Td>
            <Table.Td>
              <IconCheck />
            </Table.Td>
          </Table.Tr>
          <Table.Tr>
            <Table.Td>Desativar chat</Table.Td>
            <Table.Td></Table.Td>
            <Table.Td>
              <IconCheck />
            </Table.Td>
          </Table.Tr>
          <Table.Tr>
            <Table.Td>Remover usuários</Table.Td>
            <Table.Td></Table.Td>
            <Table.Td>
              <IconCheck />
            </Table.Td>
          </Table.Tr>
          <Table.Tr>
            <Table.Td>URL personalizada (assinantes)</Table.Td>
            <Table.Td></Table.Td>
            <Table.Td>
              <IconCheck />
            </Table.Td>
          </Table.Tr>
          {/* <Table.Tr>
                  <Table.Td>Max Room Capacity (subscribers)</Table.Td>
                    <Table.Td>20</Table.Td>
                    <Table.Td>100</Table.Td>
                  </Table.Tr> */}
        </Table.Tbody>
      </Table>
    </Modal>
  );
};

