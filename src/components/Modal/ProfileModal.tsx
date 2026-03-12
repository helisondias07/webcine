import React from "react";
import { Modal, Button, Avatar, Text, TextInput } from "@mantine/core";
import firebase from "firebase/compat/app";
import "firebase/compat/auth";
import { MetadataContext } from "../../MetadataContext";
import {
  IconDatabase,
  IconEdit,
  IconKeyFilled,
  IconLogout,
  IconPhoto,
  IconStarFilled,
} from "@tabler/icons-react";
import { t } from "../../i18n";

function normalizeDisplayName(value: string) {
  return value.trim().replace(/\s+/g, " ").slice(0, 40);
}

export class ProfileModal extends React.Component<{
  close: () => void;
  userImage: string | null;
  onProfileUpdated?: (data: { name: string; avatar: string }) => void;
}, {
  resetDisabled: boolean;
  resetStatus: string;
  resetError: string;
  isEditing: boolean;
  profileName: string;
  profileAvatar: string;
  profileError: string;
}> {
  static contextType = MetadataContext;
  declare context: React.ContextType<typeof MetadataContext>;
  fileInputRef = React.createRef<HTMLInputElement>();
  public state = {
    resetDisabled: false,
    resetStatus: "",
    resetError: "",
    isEditing: false,
    profileName: window.localStorage.getItem("watchparty-username") ?? "",
    profileAvatar:
      window.localStorage.getItem("watchparty-custom-avatar") ??
      this.props.userImage ??
      "",
    profileError: "",
  };

  onSignOut = () => {
    firebase.auth().signOut();
    window.localStorage.removeItem("watchparty-loginname");
    window.location.reload();
  };

  resetPassword = async () => {
    try {
      if (this.context.user?.email) {
        await firebase.auth().sendPasswordResetEmail(this.context.user.email);
        this.setState({
          resetDisabled: true,
          resetError: "",
          resetStatus:
            "Se o e-mail estiver cadastrado, voce recebera as instrucoes de redefinicao. Verifique tambem Spam e Lixeira.",
        });
      }
    } catch (e: any) {
      this.setState({
        resetError:
          "Nao foi possivel enviar o e-mail de redefinicao agora. Tente novamente.",
      });
      console.warn(e);
    }
  };

  saveProfile = () => {
    const normalizedName = normalizeDisplayName(this.state.profileName);
    if (normalizedName.length < 2) {
      this.setState({
        profileError: "Digite um nickname com pelo menos 2 caracteres.",
      });
      return;
    }
    const avatar = this.state.profileAvatar.trim();
    window.localStorage.setItem("watchparty-username", normalizedName);
    window.localStorage.setItem("watchparty-loginname", "custom");
    if (avatar) {
      window.localStorage.setItem("watchparty-custom-avatar", avatar);
    } else {
      window.localStorage.removeItem("watchparty-custom-avatar");
    }
    const payload = { name: normalizedName, avatar };
    this.props.onProfileUpdated?.(payload);
    window.dispatchEvent(
      new CustomEvent("watchparty-profile-updated", {
        detail: payload,
      }),
    );
    this.setState({
      isEditing: false,
      profileError: "",
    });
  };

  onSelectAvatarFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    if (!file.type.startsWith("image/")) {
      this.setState({
        profileError: "Escolha um arquivo de imagem valido.",
      });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      this.setState({
        profileAvatar: String(reader.result ?? ""),
        profileError: "",
      });
    };
    reader.onerror = () => {
      this.setState({
        profileError: "Nao foi possivel carregar essa imagem.",
      });
    };
    reader.readAsDataURL(file);
  };

  render() {
    const { close, userImage } = this.props;
    const avatarPreview = this.state.profileAvatar || userImage || "";
    return (
      <Modal opened onClose={close} centered>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
          }}
        >
          <Avatar src={avatarPreview} />
          {this.context.user?.email}
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "10px",
            margin: "10px",
          }}
        >
          <Button
            leftSection={<IconEdit />}
            variant="light"
            color="gray"
            onClick={() =>
              this.setState((state) => ({
                isEditing: !state.isEditing,
                profileError: "",
              }))
            }
          >
            Alterar meus dados
          </Button>
          {this.state.isEditing && (
            <div
              style={{ display: "flex", flexDirection: "column", gap: 8 }}
            >
              <TextInput
                label="Nickname"
                value={this.state.profileName}
                maxLength={40}
                onChange={(e) =>
                  this.setState({
                    profileName: e.target.value,
                  })
                }
              />
              <input
                ref={this.fileInputRef}
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={this.onSelectAvatarFile}
              />
              <Button
                leftSection={<IconPhoto />}
                variant="light"
                color="gray"
                onClick={() => this.fileInputRef.current?.click()}
              >
                Enviar foto
              </Button>
              <Button color="webgold" onClick={this.saveProfile}>
                Salvar dados
              </Button>
              {this.state.profileError && (
                <Text size="sm" c="red">
                  {this.state.profileError}
                </Text>
              )}
            </div>
          )}
          <Button
            leftSection={<IconDatabase />}
            disabled
            variant="light"
            color="gray"
            style={{ opacity: 0.65 }}
          >
            Minhas salas (em breve...)
          </Button>
          <Button
            leftSection={<IconStarFilled />}
            disabled
            variant="light"
            color="gray"
            style={{ opacity: 0.65 }}
          >
            Assinar (em breve...)
          </Button>
          <Button
            disabled={this.state.resetDisabled}
            leftSection={<IconKeyFilled />}
            color="webgold"
            onClick={this.resetPassword}
          >
            {t("resetPassword")}
          </Button>
          <Button leftSection={<IconLogout />} onClick={this.onSignOut}>
            Sair
          </Button>
          {this.state.resetStatus && (
            <Text size="sm" c="green">
              {this.state.resetStatus}
            </Text>
          )}
          {this.state.resetError && (
            <Text size="sm" c="red">
              {this.state.resetError}
            </Text>
          )}
        </div>
      </Modal>
    );
  }
}
