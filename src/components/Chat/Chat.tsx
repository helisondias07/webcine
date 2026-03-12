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
import { IconMoodSmile } from "@tabler/icons-react";

interface ChatProps {
  chat: ChatMessage[];
  nameMap: StringDict;
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

export class Chat extends React.Component<ChatProps> {
  static contextType = MetadataContext;
  declare context: React.ContextType<typeof MetadataContext>;
  public state = {
    chatMsg: "",
    isNearBottom: true,
    isPickerOpen: false,
  };
  messagesRef = React.createRef<HTMLDivElement>();

  async componentDidMount() {
    this.scrollToBottom();
    this.messagesRef.current?.addEventListener("scroll", this.onScroll);
    init({});
  }

  componentWillUnmount() {
    this.messagesRef.current?.removeEventListener("scroll", this.onScroll);
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
    return (
      this.messagesRef.current &&
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

  render() {
    const pickerTheme =
      document.documentElement.getAttribute("data-mantine-color-scheme") ===
      "light"
        ? "light"
        : "dark";

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
          rightSection={
            <ActionIcon
              onClick={() => {
                const curr = this.state.isPickerOpen;
                setTimeout(() => this.setState({ isPickerOpen: !curr }), 100);
              }}
              disabled={this.props.isChatDisabled}
            >
              <IconMoodSmile size={18} />
            </ActionIcon>
          }
        />
      </div>
    );
  }
}

const ChatMessage = ({
  message,
  nameMap,
  pictureMap,
  formatMessage,
  socket,
  owner,
  isChatDisabled,
  className,
}: {
  message: ChatMessage;
  nameMap: StringDict;
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
                style={{ cursor: "pointer", fontWeight: 700 }}
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
