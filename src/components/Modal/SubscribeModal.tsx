import React from "react";
import { Modal, Title, Table, Button, Group, Badge } from "@mantine/core";
import { SignInButton } from "../TopBar/TopBar";
import { serverPath } from "../../utils/utils";
import { MetadataContext } from "../../MetadataContext";
import { IconCheck } from "@tabler/icons-react";
import { t } from "../../i18n";

type PlanId =
  | "premium_monthly"
  | "premium_annual"
  | "family_monthly"
  | "family_annual";

export class SubscribeModal extends React.Component<{
  closeSubscribe: () => void;
}> {
  static contextType = MetadataContext;
  declare context: React.ContextType<typeof MetadataContext>;
  state = {
    loadingPlan: "" as PlanId | "",
    error: "",
  };

  onSubscribe = async (planId: PlanId) => {
    if (!this.context.user) {
      return;
    }
    this.setState({ loadingPlan: planId, error: "" });
    try {
      const token = await this.context.user.getIdToken();
      const response = await fetch(serverPath + "/api/billing/create-checkout-session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          uid: this.context.user.uid,
          token,
          planId,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error ?? "checkout_failed");
      }
      if (!data?.checkoutUrl) {
        throw new Error("checkout_url_missing");
      }
      window.location.assign(data.checkoutUrl);
    } catch (e: any) {
      this.setState({
        error: e?.message ?? "Falha ao iniciar checkout.",
        loadingPlan: "",
      });
    }
  };
  render() {
    const { closeSubscribe } = this.props;
    const actionButton = (label: string, planId: PlanId) => (
      <Button
        loading={this.state.loadingPlan === planId}
        onClick={() => this.onSubscribe(planId)}
      >
        {this.state.loadingPlan === planId ? t("processing") : label}
      </Button>
    );

    return (
      <Modal
        opened
        onClose={closeSubscribe}
        centered
        size="auto"
        title={t("pricingTitle")}
      >
        <div>
          Assinaturas ajudam a manter a plataforma e desbloqueiam recursos
          premium para a sua sala.
        </div>
        <Title order={6}>Comparativo</Title>
        <Table striped>
          <Table.Thead>
            <Table.Tr>
              <Table.Th />
              <Table.Th>{t("planFree")}</Table.Th>
              <Table.Th>{t("planPremium")}</Table.Th>
              <Table.Th>{t("planFamily")}</Table.Th>
            </Table.Tr>
          </Table.Thead>

          <Table.Tbody>
            <Table.Tr>
              <Table.Td>Ver juntos + chat + compartilhamento de tela</Table.Td>
              <Table.Td>
                <IconCheck />
              </Table.Td>
              <Table.Td>
                <IconCheck />
              </Table.Td>
              <Table.Td>
                <IconCheck />
              </Table.Td>
            </Table.Tr>
            <Table.Tr>
              <Table.Td>Salas permanentes</Table.Td>
              <Table.Td>1</Table.Td>
              <Table.Td>20</Table.Td>
              <Table.Td>Ilimitadas</Table.Td>
            </Table.Tr>
            <Table.Tr>
              <Table.Td>Participantes por sala</Table.Td>
              <Table.Td>10</Table.Td>
              <Table.Td>50</Table.Td>
              <Table.Td>50</Table.Td>
            </Table.Tr>
            <Table.Tr>
              <Table.Td>Navegador virtual</Table.Td>
              <Table.Td>-</Table.Td>
              <Table.Td>
                <IconCheck />
              </Table.Td>
              <Table.Td>
                <IconCheck />
              </Table.Td>
            </Table.Tr>
            <Table.Tr>
              <Table.Td>Fila colaborativa de vídeos</Table.Td>
              <Table.Td>-</Table.Td>
              <Table.Td>
                <IconCheck />
              </Table.Td>
              <Table.Td>
                <IconCheck />
              </Table.Td>
            </Table.Tr>
            <Table.Tr>
              <Table.Td>Preço mensal</Table.Td>
              <Table.Td>{t("priceFree")}</Table.Td>
              <Table.Td>{t("pricePremiumMonthly")}</Table.Td>
              <Table.Td>{t("priceFamilyMonthly")}</Table.Td>
            </Table.Tr>
            <Table.Tr>
              <Table.Td>Preço anual</Table.Td>
              <Table.Td>-</Table.Td>
              <Table.Td>{t("pricePremiumAnnual")}</Table.Td>
              <Table.Td>{t("priceFamilyAnnual")}</Table.Td>
            </Table.Tr>
          </Table.Tbody>
        </Table>

        <Group mt="md">
          <Badge color="webgreen">PIX</Badge>
          <Badge color="webgold">Cartão</Badge>
          <Badge color="webgreen" variant="light">
            Boleto
          </Badge>
        </Group>

        {this.state.error && (
          <div style={{ marginTop: 8, color: "#ff6b6b" }}>{this.state.error}</div>
        )}

        <div style={{ textAlign: "right" }}>
          {this.context.user && this.context.user.email ? (
            <Group justify="flex-end" mt="sm">
              {actionButton("Premium mensal", "premium_monthly")}
              {actionButton("Premium anual", "premium_annual")}
              {actionButton("Família mensal", "family_monthly")}
              {actionButton("Família anual", "family_annual")}
            </Group>
          ) : (
            <div>
              {t("loginToSubscribe")}: <SignInButton />
            </div>
          )}
        </div>
      </Modal>
    );
  }
}
