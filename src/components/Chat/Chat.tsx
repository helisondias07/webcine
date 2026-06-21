import React, { RefObject } from "react";
import { ActionIcon, Avatar, Button, TextInput } from "@mantine/core";
//@ts-expect-error
import Linkify from "react-linkify";
import { SecureLink } from "react-secure-link";
import styles from "./Chat.module.css";

import {
  formatTimestamp,
  getColorForStringHex,
  getDefaultPicture,
  getOrCreateClientId,
} from "../../utils/utils";
import { UserMenu } from "../UserMenu/UserMenu";
import { Socket } from "socket.io-client";
import { IconSend } from "@tabler/icons-react";

interface ChatProps {
  chat: ChatMessage[];
  nameMap: StringDict;
  nameColorMap: StringDict;
  pictureMap: StringDict;
  socket: Socket | null;
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
  typingUsers: Record<string, number>;
}

export class Chat extends React.Component<ChatProps, ChatState> {
  public state: ChatState = {
    chatMsg: "",
    isNearBottom: true,
    typingUsers: {},
  };
  messagesRef = React.createRef<HTMLDivElement>();
  typingEmitDebounce: number | undefined = undefined;
  typingEmitLastAt = 0;

  async componentDidMount() {
    this.scrollToBottom();
    this.messagesRef.current?.addEventListener("scroll", this.onScroll);
    this.props.socket?.on("REC:typing", this.handleTypingEvent);
  }

  componentWillUnmount() {
    this.messagesRef.current?.removeEventListener("scroll", this.onScroll);
    this.props.socket?.off("REC:typing", this.handleTypingEvent);
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
    if (this.props.chat !== prevProps.chat && this.props.chat.length > prevProps.chat.length) {
      const lastMsg = this.props.chat[this.props.chat.length - 1];
      if (lastMsg && lastMsg.id) {
        const sender = lastMsg.id;
        if (this.state.typingUsers[sender]) {
          this.setState((prevState) => {
            const nextTypingUsers = { ...prevState.typingUsers };
            delete nextTypingUsers[sender];
            return { typingUsers: nextTypingUsers };
          });
        }
      }
    }
  }

  updateChatMsg = (e: any) => {
    const val = e.target.value;
    this.setState({ chatMsg: val });

    if (val) {
      const now = Date.now();
      if (now - this.typingEmitLastAt > 2000) {
        this.typingEmitLastAt = now;
        this.props.socket?.emit("CMD:typing", { isTyping: true });
      }

      window.clearTimeout(this.typingEmitDebounce);
      this.typingEmitDebounce = window.setTimeout(() => {
        this.props.socket?.emit("CMD:typing", { isTyping: false });
        this.typingEmitLastAt = 0;
      }, 1500);
    } else {
      window.clearTimeout(this.typingEmitDebounce);
      this.props.socket?.emit("CMD:typing", { isTyping: false });
      this.typingEmitLastAt = 0;
    }
  };

  sendChatMsg = () => {
    if (!this.state.chatMsg) {
      return;
    }
    if (this.chatTooLong()) {
      return;
    }
    this.setState({ chatMsg: "" });
    window.clearTimeout(this.typingEmitDebounce);
    this.props.socket?.emit("CMD:typing", { isTyping: false });
    this.typingEmitLastAt = 0;
    this.props.socket?.emit("CMD:chat", this.state.chatMsg);
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
      this.messagesRef.current.scrollTop =
        this.messagesRef.current.scrollHeight;
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

  handleTypingEvent = (payload: { user: string; isTyping?: boolean; timestamp: string }) => {
    const user = String(payload?.user ?? "");
    if (!user) {
      return;
    }
    const isTyping = payload.isTyping !== false;
    this.setState((prevState) => {
      const nextTypingUsers = { ...prevState.typingUsers };
      if (isTyping) {
        nextTypingUsers[user] = Date.now() + 3000;
      } else {
        delete nextTypingUsers[user];
      }
      return { typingUsers: nextTypingUsers };
    });

    if (isTyping) {
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
    }
  };

  render() {
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
          rightSectionWidth={42}
          rightSection={
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
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
  socket: Socket | null;
  owner: string | undefined;
  isChatDisabled: boolean | undefined;
  className: string;
}) => {
  const { id, timestamp, cmd, msg, system, videoTS } = message;
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
          {socket ? (
            <UserMenu
              displayName={nameMap[id] || id}
              timestamp={timestamp}
              socket={socket}
              userToManage={id}
              isChatMessage
              disabled={!Boolean(owner && owner === getOrCreateClientId())}
              trigger={
                <div
                  style={{
                    cursor: "pointer",
                    fontWeight: 700,
                    color: nameColorMap[id] || undefined,
                  }}
                  className={`${styles.light} ${styles.hoverEffect}`}
                >
                  {Boolean(system) && "Sistema"}
                  {nameMap[id] || id}
                </div>
              }
            />
          ) : (
            <div
              style={{
                fontWeight: 700,
                color: nameColorMap[id] || undefined,
              }}
              className={styles.light}
            >
              {Boolean(system) && "Sistema"}
              {nameMap[id] || id}
            </div>
          )}
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
          <div className={styles.light}>{!cmd && msg}</div>
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
