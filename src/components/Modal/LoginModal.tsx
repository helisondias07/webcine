import React from "react";
import {
  Modal,
  Button,
  Alert,
  TextInput,
  PasswordInput,
  Divider,
} from "@mantine/core";
import firebase from "firebase/compat/app";
import "firebase/compat/auth";
import { IconBrandGoogleFilled } from "@tabler/icons-react";
import { t } from "../../i18n";
import styles from "./LoginModal.module.css";

function getAuthErrorMessage(error: any) {
  const code = String(error?.code ?? "");
  if (code === "auth/invalid-email") {
    return "E-mail inválido.";
  }
  if (code === "auth/missing-password" || code === "auth/wrong-password") {
    return "Senha incorreta.";
  }
  if (code === "auth/user-not-found") {
    return "Conta não encontrada.";
  }
  if (code === "auth/email-already-in-use") {
    return "Este e-mail já está em uso.";
  }
  if (code === "auth/weak-password") {
    return "Use uma senha mais forte (mínimo de 6 caracteres).";
  }
  if (code === "auth/too-many-requests") {
    return "Muitas tentativas. Aguarde e tente novamente.";
  }
  if (code === "auth/popup-closed-by-user") {
    return "Janela de login fechada antes da confirmação.";
  }
  if (code === "auth/account-exists-with-different-credential") {
    return "Já existe uma conta com este e-mail em outro provedor. Entre com o método já existente.";
  }
  if (code === "auth/unauthorized-domain") {
    return "Este dominio nao esta autorizado no Firebase Auth. Adicione o dominio de producao em Authentication > Settings > Authorized domains.";
  }
  return "Não foi possível concluir a autenticação agora. Tente novamente.";
}

async function getEmailLoginErrorMessage(error: any, email: string) {
  const code = String(error?.code ?? "");
  if (code === "auth/user-not-found") {
    return "Usuário não existe.";
  }
  if (code === "auth/wrong-password") {
    return "Senha incorreta.";
  }
  if (
    code === "auth/invalid-credential" ||
    code === "auth/invalid-login-credentials"
  ) {
    try {
      const methods = await firebase.auth().fetchSignInMethodsForEmail(email);
      if (!methods.length) {
        return "Usuário não existe.";
      }
      if (methods.includes("password")) {
        return "Senha incorreta.";
      }
      if (methods.includes("google.com")) {
        return "Este e-mail está vinculado ao login com Google.";
      }
    } catch {
      // fallback handled below
    }
  }
  return getAuthErrorMessage(error);
}

export class LoginModal extends React.Component<{
  closeModal: () => void;
}> {
  public state = {
    email: "",
    password: "",
    showCreate: false,
    showReset: false,
    error: "",
  };

  emailSignIn = async (email: string, password: string) => {
    try {
      await firebase.auth().signInWithEmailAndPassword(email, password);
      this.props.closeModal();
    } catch (e: any) {
      this.setState({ error: await getEmailLoginErrorMessage(e, email) });
    }
  };

  googleSignIn = async () => {
    try {
      const provider = new firebase.auth.GoogleAuthProvider();
      await firebase.auth().signInWithPopup(provider);
      this.props.closeModal();
    } catch (e: any) {
      const code = String(e?.code ?? "");
      console.error("[googleSignIn]", code || "unknown_error", e);
      if (
        code === "auth/popup-blocked" ||
        code === "auth/popup-blocked-by-browser" ||
        code === "auth/operation-not-supported-in-this-environment"
      ) {
        try {
          const provider = new firebase.auth.GoogleAuthProvider();
          await firebase.auth().signInWithRedirect(provider);
          return;
        } catch (redirectError: any) {
          this.setState({ error: getAuthErrorMessage(redirectError) });
          return;
        }
      }
      this.setState({ error: getAuthErrorMessage(e) });
    }
  };

  render() {
    const { closeModal } = this.props;

    return (
      <>
        {this.state.showCreate && (
          <CreateModal
            closeModal={() => this.setState({ showCreate: false })}
          />
        )}
        {this.state.showReset && (
          <ResetModal closeModal={() => this.setState({ showReset: false })} />
        )}
        <Modal
          opened
          onClose={closeModal}
          title={t("login")}
          centered
          size={380}
          classNames={{
            content: styles.modalContent,
            header: styles.modalHeader,
            title: styles.modalTitle,
            body: styles.modalBody,
          }}
        >
          <div className={styles.loginRoot}>
            <div className={styles.modalLead}>
              Entre para salvar salas permanentes e liberar recursos premium.
            </div>

            {this.state.error && (
              <Alert color="red" title={t("error")}>
                {this.state.error}
              </Alert>
            )}

            <div className={styles.socialRow}>
              <Button
                fullWidth
                leftSection={<IconBrandGoogleFilled />}
                onClick={this.googleSignIn}
                className={styles.socialButton}
              >
                Continuar com Google
              </Button>
            </div>

            <Divider label="Ou entre com e-mail" labelPosition="center" my="lg" />
            <form
              onSubmit={(e) => {
                e.preventDefault();
                this.emailSignIn(this.state.email, this.state.password);
              }}
              className={styles.formStack}
            >
              <TextInput
                type="email"
                label={t("email")}
                placeholder={t("email")}
                value={this.state.email}
                onChange={(e) => this.setState({ email: e.target.value })}
              />
              <PasswordInput
                label={t("password")}
                placeholder={t("password")}
                value={this.state.password}
                onChange={(e) =>
                  this.setState({ password: e.target.value })
                }
              />
              <Button type="submit" fullWidth color="webgold">
                {t("login")}
              </Button>
            </form>
            <Divider label="Ou" labelPosition="center" my="lg" />
            <div className={styles.footerActions}>
              <Button
                size="xs"
                variant="light"
                onClick={() => this.setState({ showCreate: true })}
              >
                {t("createAccount")}
              </Button>
              <Button
                size="xs"
                variant="light"
                onClick={() => this.setState({ showReset: true })}
              >
                {t("resetPassword")}
              </Button>
            </div>
          </div>
        </Modal>
      </>
    );
  }
}

export class CreateModal extends React.Component<{
  closeModal: () => void;
}> {
  public state = { email: "", password: "", error: "" };

  createAccount = async (email: string, password: string) => {
    try {
      await firebase.auth().createUserWithEmailAndPassword(email, password);
      this.props.closeModal();
    } catch (e: any) {
      this.setState({ error: getAuthErrorMessage(e) });
    }
  };

  render() {
    const { closeModal } = this.props;
    return (
      <Modal
        opened
        onClose={closeModal}
        title={t("createAccount")}
        size={360}
        centered
        classNames={{
          content: styles.modalContent,
          header: styles.modalHeader,
          title: styles.modalTitle,
          body: styles.modalBody,
        }}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            this.createAccount(this.state.email, this.state.password);
          }}
          className={styles.formStack}
        >
          {this.state.error && (
            <Alert color="red" title={t("error")}>
              {this.state.error}
            </Alert>
          )}
          <TextInput
            type="email"
            label={t("email")}
            placeholder={t("email")}
            value={this.state.email}
            onChange={(e) => this.setState({ email: e.target.value })}
          />
          <PasswordInput
            label={t("password")}
            placeholder={t("password")}
            value={this.state.password}
            onChange={(e) => this.setState({ password: e.target.value })}
          />
          <Button type="submit" fullWidth color="webgold">
            {t("createAccount")}
          </Button>
        </form>
      </Modal>
    );
  }
}

export class ResetModal extends React.Component<{
  closeModal: () => void;
}> {
  public state = { email: "", error: "", success: "", loading: false };

  resetPassword = async () => {
    try {
      if (!this.state.email.trim()) {
        this.setState({ error: "Digite um e-mail para redefinir a senha." });
        return;
      }
      this.setState({ loading: true, error: "", success: "" });
      await firebase.auth().sendPasswordResetEmail(this.state.email);
      this.setState({
        success:
          "Se o e-mail estiver cadastrado, você receberá as instruções de redefinição em instantes. Verifique também as pastas Spam e Lixeira.",
        loading: false,
      });
    } catch (e: any) {
      this.setState({ error: getAuthErrorMessage(e), loading: false });
    }
  };

  render() {
    const { closeModal } = this.props;
    return (
      <Modal
        opened
        onClose={closeModal}
        title={t("resetPassword")}
        centered
        size={360}
        classNames={{
          content: styles.modalContent,
          header: styles.modalHeader,
          title: styles.modalTitle,
          body: styles.modalBody,
        }}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            this.resetPassword();
          }}
          className={styles.formStack}
        >
          {this.state.error && (
            <Alert color="red" title={t("error")}>
              {this.state.error}
            </Alert>
          )}
          {this.state.success && (
            <Alert color="green" title="E-mail enviado">
              {this.state.success}
            </Alert>
          )}
          <TextInput
            type="email"
            label={t("email")}
            placeholder={t("email")}
            value={this.state.email}
            onChange={(e) => this.setState({ email: e.target.value })}
          />
          <Button
            type="submit"
            fullWidth
            color="webgold"
            loading={this.state.loading}
          >
            {t("resetPassword")}
          </Button>
        </form>
      </Modal>
    );
  }
}
