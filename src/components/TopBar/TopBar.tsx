import React, { useContext, useState } from "react";
import { serverPath, getUserImage } from "../../utils/utils";
import { Avatar, Button } from "@mantine/core";
import firebase from "firebase/compat/app";
import "firebase/compat/auth";
import { LoginModal } from "../Modal/LoginModal";
import { ProfileModal } from "../Modal/ProfileModal";
import { MetadataContext } from "../../MetadataContext";
import {
  IconCirclePlusFilled,
  IconLogin,
  IconMoonStars,
  IconSun,
} from "@tabler/icons-react";
import styles from "./TopBar.module.css";
import { t } from "../../i18n";
import { ThemeModeContext } from "../../ThemeModeContext";

const roomSlugPattern = /^[a-z0-9-]{3,80}$/;

function normalizeDisplayName(value: string) {
  return value.trim().replace(/\s+/g, " ").slice(0, 40);
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 70);
}

export async function createRoom(
  user: firebase.User | undefined,
  openNewTab: boolean | undefined,
  options?: {
    video?: string;
    username?: string;
    roomSlug?: string;
  },
) {
  const uid = user?.uid;
  const token = await user?.getIdToken();
  const roomSlug =
    options?.roomSlug && roomSlugPattern.test(options.roomSlug)
      ? options.roomSlug
      : "";
  let response: Response;
  try {
    response = await fetch(serverPath + "/createRoom", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        uid,
        token,
        video: options?.video ?? "",
        username: options?.username ?? "",
        roomSlug,
      }),
    });
  } catch {
    throw new Error(
      "Não foi possível conectar ao servidor. Verifique se o backend está online.",
    );
  }
  let data: any = undefined;
  try {
    data = await response.json();
  } catch {
    throw new Error("Resposta inválida do servidor.");
  }
  if (!response.ok || !data?.name) {
    throw new Error(
      typeof data?.error === "string"
        ? data.error
        : "Não foi possível criar a sala.",
    );
  }
  const { name } = data;
  if (openNewTab) {
    window.open("/watch" + name);
  } else {
    window.location.assign("/watch" + name);
  }
}

export const NewRoomButton = (props: {
  size?: string;
  openNewTab?: boolean;
}) => {
  const context = useContext(MetadataContext);
  const [isCreating, setIsCreating] = useState(false);

  const submitCreateRoom = async () => {
    const storedName = window.localStorage.getItem("watchparty-username") ?? "";
    const cleanName = normalizeDisplayName(storedName) || "convidado";
    const slugBase = slugify(cleanName) || "sala";
    const roomSlug = `cinema-${slugBase}`;
    window.localStorage.setItem("watchparty-username", cleanName);
    setIsCreating(true);
    try {
      await createRoom(context.user, props.openNewTab, {
        username: cleanName,
        roomSlug,
      });
    } catch (e: any) {
      const message =
        typeof e?.message === "string" && e.message
          ? e.message
          : "Não foi possível criar a sala. Tente novamente.";
      window.alert(message);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Button
      size={props.size}
      onClick={() => void submitCreateRoom()}
      leftSection={<IconCirclePlusFilled />}
      loading={isCreating}
    >
      {t("newRoom")}
    </Button>
  );
};
type SignInButtonProps = {};

export class SignInButton extends React.Component<SignInButtonProps> {
  static contextType = MetadataContext;
  declare context: React.ContextType<typeof MetadataContext>;
  public state = { isLoginOpen: false, isProfileOpen: false, userImage: null };

  loadUserImage = async () => {
    if (!this.context.user) {
      return;
    }
    const customImage = window.localStorage.getItem("watchparty-custom-avatar");
    if (customImage) {
      this.setState({ userImage: customImage });
      return;
    }
    this.setState({ userImage: await getUserImage(this.context.user) });
  };

  onProfileUpdated = (event: Event) => {
    const customEvent = event as CustomEvent<{ avatar?: string }>;
    const avatar = customEvent.detail?.avatar || null;
    if (avatar !== null) {
      this.setState({ userImage: avatar });
    }
  };

  componentDidMount() {
    void this.loadUserImage();
    window.addEventListener("watchparty-profile-updated", this.onProfileUpdated);
  }

  componentWillUnmount() {
    window.removeEventListener(
      "watchparty-profile-updated",
      this.onProfileUpdated,
    );
  }

  async componentDidUpdate(prevProps: SignInButtonProps) {
    if (this.context.user && !this.state.userImage) {
      void this.loadUserImage();
    }
  }

  render() {
    if (this.context.user) {
      return (
        <div className={styles.avatarButton}>
          <Avatar
            src={this.state.userImage}
            onClick={() => this.setState({ isProfileOpen: true })}
          />
          {this.state.isProfileOpen && this.context.user && (
            <ProfileModal
              userImage={this.state.userImage}
              onProfileUpdated={(data) =>
                this.setState({ userImage: data.avatar || this.state.userImage })
              }
              close={() => this.setState({ isProfileOpen: false })}
            />
          )}
        </div>
      );
    }
    return (
      <React.Fragment>
        {this.state.isLoginOpen && (
          <LoginModal
            closeModal={() => this.setState({ isLoginOpen: false })}
          />
        )}
        <Button
          className={styles.signInButton}
          leftSection={<IconLogin />}
          title={t("signIn")}
          onClick={() => this.setState({ isLoginOpen: true })}
        >
          {t("signIn")}
        </Button>
      </React.Fragment>
    );
  }
}

const ThemeToggle = () => {
  const { mode, toggleMode } = useContext(ThemeModeContext);
  const isLight = mode === "light";

  return (
    <button
      type="button"
      aria-label={isLight ? "Ativar modo escuro" : "Ativar modo claro"}
      title={isLight ? "Modo claro" : "Modo escuro"}
      onClick={toggleMode}
      className={styles.themeSwitch}
      data-mode={mode}
    >
      <span className={styles.themeIconSun}>
        <IconSun size={14} />
      </span>
      <span className={styles.themeIconMoon}>
        <IconMoonStars size={14} />
      </span>
      <span className={styles.themeThumb} />
    </button>
  );
};

export const TopBar = (props: {
  hideNewRoom?: boolean;
  hideSignin?: boolean;
  hideMyRooms?: boolean;
  roomTitle?: string;
  roomDescription?: string;
  roomTitleColor?: string;
}) => {
  return (
    <div className={styles.topbar} data-testid="topbar">
      <div className={styles.topbarInner}>
        <div className={styles.leftControls}>
          <ThemeToggle />
        </div>
        <a href="/" className={styles.brandLink} aria-label="WebCineTV">
          <div className={styles.brandText}>
            <span className={styles.brandWord}>WEBCINE</span>
            <span className={styles.brandTv}>tv</span>
          </div>
        </a>
        <div className={styles.actionsWrap}>
          <div className={styles.actions}>
            {!props.hideNewRoom && <NewRoomButton openNewTab />}
            {!props.hideSignin && <SignInButton />}
          </div>
        </div>
      </div>
    </div>
  );
};

