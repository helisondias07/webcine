import React, { useState, useCallback, useEffect } from "react";
import {
  Button,
  ColorInput,
  Modal,
  Alert,
  ActionIcon,
  Popover,
  TextInput,
  Switch,
  Loader,
  Text,
  Divider,
} from "@mantine/core";
import { getCurrentSettings, updateSettings } from "./LocalSettings";
import { getOrCreateClientId, serverPath } from "../../utils/utils";
import { PermanentRoomModal } from "../Modal/PermanentRoomModal";
import { Socket } from "socket.io-client";
import { HexColorPicker } from "react-colorful";
import {
  IconCheck,
  IconDeviceFloppy,
  IconHelpCircle,
  IconPaintFilled,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import styles from "./Settings.module.css";

const defaultRoomTitleColor = "#FFFFFF";
// Name color presets that read well on both the light and dark chat.
const nameColorSwatches = [
  "#FFFFFF",
  "#E8590C",
  "#F59F00",
  "#2F9E44",
  "#0CA678",
  "#1C7ED6",
  "#7048E8",
  "#D6336C",
];
const PHONE_QUERY = "(max-width: 600px)";
const COMPACT_QUERY = "(max-width: 900px)";

function useMatchMedia(query: string) {
  const [matches, setMatches] = useState(
    () =>
      typeof window !== "undefined" &&
      Boolean(window.matchMedia?.(query).matches),
  );
  useEffect(() => {
    const mql = window.matchMedia?.(query);
    if (!mql) {
      return;
    }
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener?.("change", onChange);
    return () => mql.removeEventListener?.("change", onChange);
  }, [query]);
  return matches;
}
const roomTitleMaxCharLength = 50;
const roomDescriptionMaxCharLength = 120;

interface SettingsModalProps {
  modalOpen: boolean;
  setModalOpen: (open: boolean) => void;
  roomLock: string;
  setRoomLock: (lock: boolean) => Promise<void>;
  socket: Socket;
  roomId: string;
  owner: string | undefined;
  setOwner: (owner: string) => void;
  vanity: string | undefined;
  setVanity: (vanity: string) => void;
  inviteLink: string;
  password: string | undefined;
  hasPassword: boolean;
  setPassword: (password: string) => void;
  isChatDisabled: boolean;
  setIsChatDisabled: (disabled: boolean) => void;
  clearChat: () => void;
  roomTitle: string | undefined;
  setRoomTitle: (title: string) => void;
  roomDescription: string | undefined;
  setRoomDescription: (desc: string) => void;
  roomTitleColor: string | undefined;
  setRoomTitleColor: (color: string) => void;
  mediaPath: string | undefined;
  setMediaPath: (path: string) => void;
  myName: string;
  setMyName: (name: string) => void;
  myNameColor: string;
  setMyNameColor: (color: string) => void;
}

export const SettingsModal = ({
  modalOpen,
  setModalOpen,
  roomLock,
  setRoomLock,
  socket,
  owner,
  setOwner,
  vanity,
  setVanity,
  inviteLink: roomLink,
  password,
  hasPassword,
  setPassword,
  isChatDisabled,
  setIsChatDisabled,
  clearChat,
  roomTitle,
  roomDescription,
  roomTitleColor,
  mediaPath,
  setMediaPath,
  myName,
  setMyName,
  myNameColor,
  setMyNameColor,
}: SettingsModalProps) => {
  const clientId = getOrCreateClientId();
  const [updateTS, setUpdateTS] = useState(0);
  const [permModalOpen, setPermModalOpen] = useState(false);
  const [validVanity, setValidVanity] = useState(true);
  const [validVanityLoading, setValidVanityLoading] = useState(false);
  const [adminSettingsChanged, setAdminSettingsChanged] = useState(false);
  const [roomTitleInput, setRoomTitleInput] = useState<string | undefined>(
    undefined,
  );
  const [roomDescriptionInput, setRoomDescriptionInput] = useState<
    string | undefined
  >(undefined);
  const [roomTitleColorInput, setRoomTitleColorInput] = useState<
    string | undefined
  >("");
  const [passwordInput, setPasswordInput] = useState<string | undefined>(
    undefined,
  );
  const isPhone = useMatchMedia(PHONE_QUERY);
  const isCompact = useMatchMedia(COMPACT_QUERY);
  const [nameColorDraft, setNameColorDraft] = useState(myNameColor);
  useEffect(() => {
    setNameColorDraft(myNameColor);
  }, [myNameColor]);

  const setRoomState = useCallback(
    async (data: any) => {
      socket.emit("CMD:setRoomState", {
        ...data,
      });
    },
    [socket],
  );
  const checkValidVanity = useCallback(
    async (input: string) => {
      if (!input) {
        setValidVanity(true);
        return;
      }
      setValidVanity(false);
      setValidVanityLoading(true);
      const response = await fetch(serverPath + "/resolveRoom/" + input);
      const data = await response.json();
      setValidVanityLoading(false);
      if (
        data &&
        data.vanity &&
        data.vanity !== roomLink.split("/").slice(-1)[0]
      ) {
        // Already exists and doesn't match current room
        setValidVanity(false);
      } else {
        setValidVanity(true);
      }
    },
    [setValidVanity, roomLink],
  );
  const disableLocking = Boolean(roomLock && roomLock !== clientId);
  const disableOwning = Boolean(owner && owner !== clientId);
  const isPermanentRoom = Boolean(owner);
  return (
    <>
      {permModalOpen && (
        <PermanentRoomModal
          closeModal={() => setPermModalOpen(false)}
        ></PermanentRoomModal>
      )}
      <Modal
        opened={modalOpen}
        onClose={() => setModalOpen(false)}
        centered
        fullScreen={isPhone || isCompact}
        size={isPhone || isCompact ? "100%" : "lg"}
        title={"Configurações"}
      >
        <div>
          <div className={styles.sectionHeader}>Configurações da sala</div>
          <div className={styles.settingStack}>
            <SettingRow
              toggle
              name={`Trancar sala`}
              description="Impede que novas pessoas entrem na sala."
              checked={Boolean(roomLock)}
              disabled={disableLocking && disableOwning}
              onChange={(e) => setRoomLock(Boolean(e.currentTarget.checked))}
            />
            <SettingRow
              toggle
              name={`Tornar sala permanente`}
              description="Mantém a sala disponível e permite personalizar seus dados."
              helpIcon={
                <IconHelpCircle
                  onClick={() => setPermModalOpen(true)}
                  style={{ cursor: "pointer" }}
                />
              }
              checked={isPermanentRoom}
              disabled={disableOwning}
              onChange={(e) => {
                const enabled = Boolean(e.currentTarget.checked);
                socket.emit("CMD:setRoomOwner", { undo: !enabled });
                setOwner(enabled ? clientId : "");
              }}
            />
          </div>

          <Divider my="lg" />
          <div className={styles.sectionHeader}>Configurações locais</div>
          <div className={styles.settingStack}>
            <SettingRow
              toggle
              updateTS={updateTS}
              name="Desativar som de notificação do chat"
              description="Não reproduz som quando chegar mensagem e a aba não estiver em foco"
              checked={Boolean(getCurrentSettings().disableChatSound)}
              disabled={false}
              onChange={(e) => {
                updateSettings(
                  JSON.stringify({
                    ...getCurrentSettings(),
                    disableChatSound: e.currentTarget.checked,
                  }),
                );
                setUpdateTS(Date.now());
              }}
            />
            <SettingRow
              content={
                <TextInput
                  label="Nome no chat"
                  description="Como você aparece para a outra pessoa na sala."
                  value={myName}
                  maxLength={40}
                  onChange={(event) => setMyName(event.currentTarget.value)}
                  placeholder="Seu nome"
                  aria-label="Nome no chat"
                />
              }
              disabled={false}
            />
            <SettingRow
              content={
                <ColorInput
                  label="Cor do meu nome"
                  description="Aplica seu nome colorido no chat e na lista de pessoas. Branco usa a cor padrão do tema."
                  format="hex"
                  value={nameColorDraft}
                  onChange={(value) => {
                    setNameColorDraft(value);
                    // Only commit complete colors (typing "#12" must not
                    // reset the saved color).
                    if (/^#[0-9a-fA-F]{6}$/.test(value)) {
                      setMyNameColor(value);
                    }
                  }}
                  swatches={nameColorSwatches}
                  swatchesPerRow={8}
                  withEyeDropper={false}
                  closeOnColorSwatchClick
                  // Portal + fixed positioning: <body> is position:relative and
                  // gets overflow:hidden while the modal is open, which would
                  // clip an absolutely positioned picker on short pages.
                  popoverProps={{
                    withinPortal: true,
                    zIndex: 400,
                    floatingStrategy: "fixed",
                  }}
                  aria-label="Cor do meu nome"
                />
              }
              disabled={false}
            />
          </div>
        </div>

        {isPermanentRoom && <Divider my="lg" />}
        {isPermanentRoom && (
          <div className={styles.sectionHeader}>
            Configurações da sala permanente
          </div>
        )}
        {isPermanentRoom && owner && owner !== clientId && (
          <Alert color="yellow" className={styles.permanentLocked}>
            Apenas o dono da sala pode editar essas configurações.
          </Alert>
        )}
        {isPermanentRoom && owner && owner === clientId && (
          <SettingRow
            toggle={false}
            disabled={false}
            content={
              <TextInput
                label={`Senha da sala`}
                description="Quem entrar na sala precisara informar essa senha."
                value={passwordInput ?? ""}
                placeholder={hasPassword ? "Senha já definida" : "Senha"}
                onChange={(e) => {
                  setAdminSettingsChanged(true);
                  setPasswordInput(e.target.value);
                  setPassword(e.target.value);
                }}
              />
            }
          />
        )}
        {isPermanentRoom && owner && owner === clientId && (
          <SettingRow
            content={
              <TextInput
                label={`Fonte de mídia da sala`}
                description="Define uma fonte de links para substituir sugestões padrão"
                placeholder="Playlist do YouTube ou URL de lista de links"
                value={mediaPath ?? ""}
                onChange={(e) => {
                  setAdminSettingsChanged(true);
                  setMediaPath(e.target.value);
                }}
              />
            }
            disabled={false}
          />
        )}
        {isPermanentRoom && owner && owner === clientId && (
          <SettingRow
            toggle
            name={`Desativar chat`}
            description="Impede que participantes enviem mensagens."
            checked={Boolean(isChatDisabled)}
            disabled={false}
            onChange={(e) => {
              setAdminSettingsChanged(true);
              setIsChatDisabled(Boolean(e.currentTarget.checked));
            }}
          />
        )}
        {isPermanentRoom && owner && owner === clientId && (
          <SettingRow
            disabled={false}
            content={
              <div style={{ display: "flex", gap: "14px" }}>
                <ActionIcon color="red" size="lg" onClick={() => clearChat()}>
                  <IconTrash />
                </ActionIcon>
                <div>
                  <Text>Limpar chat</Text>
                  <Text size="xs" c="grey">
                    Remove todas as mensagens existentes
                  </Text>
                </div>
              </div>
            }
          />
        )}
        {isPermanentRoom && owner && owner === clientId && (
          <SettingRow
            toggle={false}
            disabled={false}
            // name={`Set Custom Room URL`}
            // description="Set a custom URL for this room. Inappropriate names may be revoked."
            checked={Boolean(roomLock)}
            content={
              <TextInput
                label={`URL personalizada da sala`}
                description="Define um link curto para sua sala."
                value={vanity ?? ""}
                onChange={(e: any) => {
                  setAdminSettingsChanged(true);
                  checkValidVanity(e.target.value);
                  setVanity(e.target.value);
                }}
                leftSection={`/r/`}
                rightSection={
                  <>
                    {validVanityLoading && <Loader />}
                    {validVanity ? (
                      <IconCheck color="green" />
                    ) : (
                      <IconX color="red" />
                    )}
                  </>
                }
              ></TextInput>
            }
          />
        )}
        {isPermanentRoom && owner && owner === clientId && (
          <SettingRow
            toggle={false}
            disabled={false}
            content={
              <div
                style={{ display: "flex", flexDirection: "column", gap: "4px" }}
              >
                <TextInput
                  label={`Título, descrição e cor do título`}
                  description="Essas informações aparecem na barra superior."
                  value={roomTitleInput ?? roomTitle ?? ""}
                  maxLength={roomTitleMaxCharLength}
                  onChange={(e) => {
                    setAdminSettingsChanged(true);
                    setRoomTitleInput(e.target.value);
                  }}
                  placeholder={`Título (max. ${roomTitleMaxCharLength} caracteres)`}
                  rightSection={
                    <Popover>
                      <Popover.Dropdown>
                        <React.Fragment>
                          <h5>Editar cor do título</h5>
                          <HexColorPicker
                            color={
                              roomTitleColorInput ||
                              roomTitleColor ||
                              defaultRoomTitleColor
                            }
                            onChange={(e) => {
                              setAdminSettingsChanged(true);
                              setRoomTitleColorInput(e);
                            }}
                          />
                          <div
                            style={{
                              marginTop: 8,
                              paddingLeft: 4,
                              borderLeft: `24px solid ${roomTitleColorInput}`,
                            }}
                          >
                            {roomTitleColorInput?.toUpperCase()}
                          </div>
                        </React.Fragment>
                      </Popover.Dropdown>
                      <Popover.Target>
                        <ActionIcon color={roomTitleColorInput}>
                          <IconPaintFilled size={16} />
                        </ActionIcon>
                      </Popover.Target>
                    </Popover>
                  }
                ></TextInput>
                <TextInput
                  value={roomDescriptionInput ?? roomDescription ?? ""}
                  maxLength={roomDescriptionMaxCharLength}
                  onChange={(e: any) => {
                    setAdminSettingsChanged(true);
                    setRoomDescriptionInput(e.target.value);
                  }}
                  placeholder={`Descrição (max. ${roomDescriptionMaxCharLength} caracteres)`}
                />
              </div>
            }
          />
        )}
        {isPermanentRoom && owner && owner === clientId && (
          <Button
            style={{ marginTop: "8px" }}
            disabled={!validVanity || !adminSettingsChanged}
            onClick={() => {
              const roomStatePayload: AnyDict = {
                vanity: vanity,
                isChatDisabled: isChatDisabled,
                roomTitle: roomTitleInput ?? roomTitle,
                roomDescription: roomDescriptionInput ?? roomDescription,
                roomTitleColor:
                  roomTitleColorInput ||
                  roomTitleColor ||
                  defaultRoomTitleColor,
                mediaPath: mediaPath,
              };
              if (passwordInput !== undefined) {
                roomStatePayload.password = passwordInput;
              }
              setRoomState(roomStatePayload);
              setAdminSettingsChanged(false);
            }}
            leftSection={<IconDeviceFloppy />}
          >
            Salvar configurações
          </Button>
        )}
      </Modal>
    </>
  );
};

const SettingRow = ({
  name,
  description,
  checked,
  disabled,
  onChange,
  content,
  helpIcon,
  toggle,
}: {
  name?: string;
  description?: React.ReactNode;
  checked?: boolean;
  disabled: boolean;
  updateTS?: number;
  onChange?: React.ChangeEventHandler<HTMLInputElement>;
  content?: React.ReactNode;
  helpIcon?: React.ReactNode;
  toggle?: boolean;
}) => {
  return (
    <div className={styles.settingRow}>
      <div className={styles.settingBody}>
        {toggle && (
          <Switch
            label={<span className={styles.rowLabel}>{name}</span>}
            description={
              description ? (
                <span className={styles.rowDescription}>{description}</span>
              ) : undefined
            }
            checked={checked}
            disabled={disabled}
            onChange={onChange}
          />
        )}
        {content && <div className={styles.rowContent}>{content}</div>}
      </div>
      <div className={styles.settingHelp}>{helpIcon}</div>
    </div>
  );
};
