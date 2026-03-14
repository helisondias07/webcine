import React, { RefObject, useContext } from "react";
import { ActionIcon, Avatar, Button, TextInput } from "@mantine/core";
import Picker from "@emoji-mart/react";
import { init } from "emoji-mart";
//@ts-expect-error
import Linkify from "react-linkify";
import { SecureLink } from "react-secure-link";
import styles from "./Chat.module.css";

import {
  formatTimestamp,
  getColorForStringHex,
  getDefaultPicture,
  isEmojiString,
} from "../../utils/utils";
import { UserMenu } from "../UserMenu/UserMenu";
import { Socket } from "socket.io-client";
import { MetadataContext } from "../../MetadataContext";
import { IconMoodSmile, IconSend } from "@tabler/icons-react";

interface ChatProps {
  chat: ChatMessage[];
  nameMap: StringDict;
  nameColorMap: StringDict;
  pictureMap: StringDict;
  socket: Socket;
  scrollTimestamp: number;
  className?: string;
  getMediaDisplayName: (input?: string) => string;
  hide?: boolean;
  isChatDisabled?: boolean;
  owner: string | undefined;
  ref: RefObject<Chat>;
}

interface ChatState {
  chatMsg: string;
  isNearBottom: boolean;
  isPickerOpen: boolean;
  typingUsers: Record<string, number>;
}

export class Chat extends React.Component<ChatProps, ChatState> {
  static contextType = MetadataContext;
  declare context: React.ContextType<typeof MetadataContext>;
  public state: ChatState = {
    chatMsg: "",
    isNearBottom: true,
    isPickerOpen: false,
    typingUsers: {},
  };
  messagesRef = React.createRef<HTMLDivElement>();
  typingEmitDebounce: number | undefined = undefined;
  typingEmitLastAt = 0;

  async componentDidMount() {
    this.scrollToBottom();
    this.messagesRef.current?.addEventListener("scroll", this.onScroll);
    init({});
    this.props.socket.on("REC:typing", this.handleTypingEvent);
  }

  componentWillUnmount() {
    this.messagesRef.current?.removeEventListener("scroll", this.onScroll);
    this.props.socket.off("REC:typing", this.handleTypingEvent);
    window.clearTimeout(this.typingEmitDebounce);
  }

  componentDidUpdate(prevProps: ChatProps) {
    if (this.props.scrollTimestamp !== prevProps.scrollTimestamp) {
      if (prevProps.scrollTimestamp === 0 || this.state.isNearBottom) {
        this.scrollToBottom();
      }
    }
    if (this.props.hide !== prevProps.hide) {
      this.scrollToBottom();
    }
  }

  updateChatMsg = (e: any) => {
    this.setState({ chatMsg: e.target.value });
    window.clearTimeout(this.typingEmitDebounce);
    this.typingEmitDebounce = window.setTimeout(() => {
      const now = Date.now();
      if (now - this.typingEmitLastAt < 250) {
        return;
      }
      this.typingEmitLastAt = now;
      this.props.socket.emit("CMD:typing", { isTyping: true });
    }, 250);
  };

  sendChatMsg = () => {
    if (!this.state.chatMsg) {
      return;
    }
    if (this.chatTooLong()) {
      return;
    }
    this.setState({ chatMsg: "" });
    this.props.socket.emit("CMD:chat", this.state.chatMsg);
  };

  chatTooLong = () => {
    return Boolean(this.state.chatMsg?.length > 10000);
  };

  onScroll = () => {
    this.setState({ isNearBottom: this.isChatNearBottom() });
  };

  isChatNearBottom = () => {
    if (!this.messagesRef.current) {
      return true;
    }
    return (
      this.messagesRef.current.scrollHeight -
        this.messagesRef.current.scrollTop -
        this.messagesRef.current.offsetHeight <
      50
    );
  };

  scrollToBottom = () => {
    if (this.messagesRef.current) {
      this.messagesRef.current.scrollTop = this.messagesRef.current.scrollHeight;
    }
  };

  formatMessage = (cmd: string): React.ReactNode | string => {
    if (cmd === "shareStarted") {
      return "iniciou um compartilhamento de tela.";
    }
    if (cmd === "userJoined") {
      return "entrou!";
    }
    return "";
  };

  addEmoji = (emoji: any) => {
    this.setState({ chatMsg: this.state.chatMsg + emoji.native });
  };

  handleTypingEvent = (payload: { user: string; timestamp: string }) => {
    const user = String(payload?.user ?? "");
    if (!user) {
      return;
    }
    this.setState((prevState) => ({
      typingUsers: {
        ...prevState.typingUsers,
        [user]: Date.now() + 3000,
      },
    }));
    window.setTimeout(() => {
      this.setState((prevState) => {
        const expiry = prevState.typingUsers[user];
        if (!expiry || expiry > Date.now()) {
          return null;
        }
        const nextTypingUsers = { ...prevState.typingUsers };
        delete nextTypingUsers[user];
        return { typingUsers: nextTypingUsers };
      });
    }, 3050);
  };

  render() {
    const pickerTheme =
      document.documentElement.getAttribute("data-mantine-color-scheme") ===
      "light"
        ? "light"
        : "dark";
    const activeTypingUsers = (
      Object.entries(this.state.typingUsers) as [string, number][]
    )
      .filter(([, expiry]) => expiry > Date.now())
      .map(([userId]) => userId);
    const typingLabel =
      activeTypingUsers.length > 2
        ? "Várias pessoas estão digitando..."
        : activeTypingUsers.length === 2
          ? `${activeTypingUsers
              .map((userId) => this.props.nameMap[userId] || "Alguém")
              .join(" e ")} estão digitando...`
          : activeTypingUsers.length === 1
            ? `${this.props.nameMap[activeTypingUsers[0]] || "Alguém"} está digitando...`
            : "";

    return (
      <div
        className={`${styles.chatRoot} ${this.props.className || ""}`}
        style={{
          display: this.props.hide ? "none" : undefined,
        }}
      >
        <div
          className={styles.chatContainer}
          ref={this.messagesRef}
          style={{ position: "relative" }}
        >
          <div className={styles.chatList}>
            {this.props.chat.map((msg) => (
              <ChatMessage
                key={msg.timestamp + msg.id}
                className=""
                message={msg}
                pictureMap={this.props.pictureMap}
                nameMap={this.props.nameMap}
                nameColorMap={this.props.nameColorMap}
                formatMessage={this.formatMessage}
                owner={this.props.owner}
                socket={this.props.socket}
                isChatDisabled={this.props.isChatDisabled}
              />
            ))}
          </div>
          {!this.state.isNearBottom && (
            <Button
              size="xs"
              onClick={this.scrollToBottom}
              style={{
                position: "sticky",
                bottom: 0,
                display: "block",
                margin: "0 auto",
              }}
            >
              Ir para o fim
            </Button>
          )}
        </div>
        {this.state.isPickerOpen && (
          <div style={{ position: "absolute", bottom: "60px" }}>
            <Picker
              theme={pickerTheme}
              previewPosition="none"
              maxFrequentRows={1}
              onEmojiSelect={this.addEmoji}
              onClickOutside={() => this.setState({ isPickerOpen: false })}
            />
          </div>
        )}
        <TextInput
          className={styles.chatInput}
          onKeyDown={(e: any) => e.key === "Enter" && this.sendChatMsg()}
          onChange={this.updateChatMsg}
          value={this.state.chatMsg}
          error={this.chatTooLong()}
          disabled={this.props.isChatDisabled}
          placeholder={
            this.props.isChatDisabled
              ? "O chat foi desativado pelo dono da sala."
              : "Digite uma mensagem..."
          }
          rightSectionWidth={78}
          rightSection={
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <ActionIcon
                onClick={() => {
                  const curr = this.state.isPickerOpen;
                  setTimeout(() => this.setState({ isPickerOpen: !curr }), 100);
                }}
                disabled={this.props.isChatDisabled}
                aria-label="Abrir seletor de emojis"
                title="Emojis"
              >
                <IconMoodSmile size={18} />
              </ActionIcon>
              <ActionIcon
                onClick={this.sendChatMsg}
                disabled={this.props.isChatDisabled || !this.state.chatMsg}
                aria-label="Enviar mensagem"
                title="Enviar"
              >
                <IconSend size={16} />
              </ActionIcon>
            </div>
          }
        />
        {activeTypingUsers.length > 0 && (
          <div className={styles.typingIndicator}>
            <span>{typingLabel}</span>
            <span className={styles.typingDots} aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
          </div>
        )}
      </div>
    );
  }
}

const ChatMessage = ({
  message,
  nameMap,
  nameColorMap,
  pictureMap,
  formatMessage,
  socket,
  owner,
  isChatDisabled,
  className,
}: {
  message: ChatMessage;
  nameMap: StringDict;
  nameColorMap: StringDict;
  pictureMap: StringDict;
  formatMessage: (cmd: string, msg?: string) => React.ReactNode;
  socket: Socket;
  owner: string | undefined;
  isChatDisabled: boolean | undefined;
  className: string;
}) => {
  const { user } = useContext(MetadataContext);
  const { id, timestamp, cmd, msg, system, isSub, videoTS } = message;
  const commandMessage = cmd ? formatMessage(cmd, msg) : "";
  const imageMsg = renderImageString(msg);
  return (
    <div
      style={{
        display: "flex",
        gap: "8px",
        alignItems: "center",
        position: "relative",
        overflowWrap: "anywhere",
      }}
      className={`${styles.comment} ${className}`}
    >
      {id ? (
        <Avatar
          src={
            pictureMap[id] ||
            getDefaultPicture(nameMap[id], getColorForStringHex(id))
          }
        />
      ) : null}
      <div>
        <div
          style={{
            display: "flex",
            gap: "8px",
            alignItems: "flex-end",
            fontSize: 14,
          }}
        >
          <UserMenu
            displayName={nameMap[id] || id}
            timestamp={timestamp}
            socket={socket}
            userToManage={id}
            isChatMessage
            disabled={!Boolean(owner && owner === user?.uid)}
            trigger={
              <div
                style={{
                  cursor: "pointer",
                  fontWeight: 700,
                  color: nameColorMap[id] || undefined,
                }}
                title={isSub ? "Assinante Premium" : ""}
                className={`${isSub ? styles.subscriber : styles.light} ${styles.hoverEffect}`}
              >
                {Boolean(system) && "Sistema"}
                {nameMap[id] || id}
              </div>
            }
          />
          <div className={styles.small + " " + styles.dark}>
            <div title={new Date(timestamp).toLocaleDateString()}>
              {new Date(timestamp).toLocaleTimeString()}
              {Boolean(videoTS) && " @ "}
              {formatTimestamp(videoTS)}
            </div>
          </div>
        </div>
        {Boolean(commandMessage) && (
          <div className={styles.light + " " + styles.system}>
            {commandMessage}
          </div>
        )}
        <Linkify
          componentDecorator={(
            decoratedHref: string,
            decoratedText: string,
            key: string,
          ) => (
            <SecureLink href={decoratedHref} key={key}>
              {decoratedText}
            </SecureLink>
          )}
        >
          <div
            className={`${styles.light} ${isEmojiString(msg) ? styles.emoji : ""}`}
          >
            {!cmd && msg}
          </div>
        </Linkify>
        {imageMsg}
      </div>
    </div>
  );
};

export const renderImageString = (
  input: string | undefined,
): React.ReactNode | null => {
  let regex =
    /^https?:\/\/.*\/.*\.(png|gif|webp|jpeg|jpg|heic|heif|jfif)\??.*$/gim;
  if (String(input)?.match(regex)) {
    return <img style={{ maxWidth: "100%" }} src={input} />;
  }
  return null;
};
