import React from "react";
import { ActionIcon } from "@mantine/core";
import { decodeEntities, formatTimestamp } from "../../utils/utils";

import classes from "./ChatVideoCard.module.css";
import {
  IconArrowUp,
  IconBrandYoutubeFilled,
  IconFile,
  IconMagnetFilled,
  IconPlayerPlayFilled,
  IconPlaylistAdd,
  IconTrash,
} from "@tabler/icons-react";

const ChatVideoCard: React.FC<{
  video: PlaylistVideo;
  index: number;
  controls?: boolean;
  onPlay?: (index: number) => void;
  onRemove?: (index: number) => void;
  onPlayNext?: (index: number) => void;
  onSetMedia?: (value: string) => void;
  onPlaylistAdd?: (value: string) => void;
  disabled?: boolean;
}> = (props) => {
  const {
    video,
    index,
    controls,
    onPlay,
    onPlayNext,
    onRemove,
    onSetMedia,
    disabled,
    onPlaylistAdd,
  } = props;
  const displayTitle = decodeEntities(video.name || video.url);
  const displayChannel =
    (video.channel || "").trim() ||
    (video.type === "youtube" ? "Canal do YouTube" : "Fonte externa");

  const getYouTubeVideoId = React.useCallback((input: string) => {
    try {
      const parsed = new URL(input);
      const host = parsed.hostname.toLowerCase();
      if (host.includes("youtu.be")) {
        return parsed.pathname.split("/").filter(Boolean)[0] ?? "";
      }
      return parsed.searchParams.get("v") ?? "";
    } catch {
      return "";
    }
  }, []);

  const thumbCandidates = React.useMemo(() => {
    const unique = new Set<string>();
    const list: string[] = [];
    const add = (value?: string) => {
      const next = String(value ?? "").trim();
      if (!next || unique.has(next)) {
        return;
      }
      unique.add(next);
      list.push(next);
    };
    if (video.type === "youtube") {
      const id = getYouTubeVideoId(video.url);
      if (id) {
        add(`https://i.ytimg.com/vi_webp/${id}/maxresdefault.webp`);
        add(`https://i.ytimg.com/vi/${id}/maxresdefault.jpg`);
        add(`https://i.ytimg.com/vi_webp/${id}/sddefault.webp`);
        add(`https://i.ytimg.com/vi/${id}/sddefault.jpg`);
        add(`https://i.ytimg.com/vi/${id}/hqdefault.jpg`);
        add(`https://i.ytimg.com/vi/${id}/mqdefault.jpg`);
      }
    }
    add(video.img);
    return list;
  }, [getYouTubeVideoId, video.img, video.type, video.url]);

  const [thumbIndex, setThumbIndex] = React.useState(0);

  React.useEffect(() => {
    setThumbIndex(0);
  }, [video.url, video.img, video.type]);

  const handlePlayClick = React.useCallback(
    (e: any) => {
      if (onPlay) {
        onPlay(index);
      }
    },
    [onPlay, index],
  );

  const handlePlayNextClick = React.useCallback(
    (e: any) => {
      e.stopPropagation();
      e.nativeEvent.stopImmediatePropagation();
      if (onPlayNext) {
        onPlayNext(index);
      }
    },
    [onPlayNext, index],
  );

  const handleRemoveClick = React.useCallback(
    (e: any) => {
      e.stopPropagation();
      e.nativeEvent.stopImmediatePropagation();
      if (onRemove) {
        onRemove(index);
      }
    },
    [onRemove, index],
  );

  return (
    <div
      title={displayTitle}
      className={classes.Card}
      onClick={
        onSetMedia
          ? (e) => {
              onSetMedia(video.url);
            }
          : undefined
      }
    >
      <div className={classes.Wrapper}>
        <div className={classes.ThumbnailWrapper}>
          {!!video.duration && (
            <div className={classes.DurationLabel}>
              {formatTimestamp(video.duration)}
            </div>
          )}
          {thumbCandidates.length > 0 && (
            <img
              className={classes.Thumbnail}
              src={thumbCandidates[thumbIndex] ?? video.img}
              alt={displayTitle}
              onError={() => {
                setThumbIndex((current) =>
                  Math.min(current + 1, Math.max(thumbCandidates.length - 1, 0)),
                );
              }}
            />
          )}
        </div>
        <div style={{ flexShrink: 0 }}>
          {video.type === "youtube" && <IconBrandYoutubeFilled color="red" />}
          {video.type === "file" && <IconFile />}
          {video.type === "magnet" && <IconMagnetFilled />}
        </div>
        <div className={classes.Content}>
          <div className={classes.Title}>{displayTitle}</div>
          <div className={classes.ChannelName}>{displayChannel}</div>
        </div>
        {onPlaylistAdd && (
          <div className={classes.Controls}>
            <ActionIcon
              title="Adicionar na fila"
              onClick={(e) => {
                e.stopPropagation();
                e.nativeEvent.stopImmediatePropagation();
                onPlaylistAdd(video.url);
              }}
            >
              <IconPlaylistAdd />
            </ActionIcon>
          </div>
        )}
        {controls && (
          <div className={classes.Controls}>
            <ActionIcon
              color="green"
              title="Reproduzir agora"
              onClick={handlePlayClick}
              disabled={disabled}
            >
              <IconPlayerPlayFilled size={16} />
            </ActionIcon>
            <ActionIcon
              color="black"
              title="Reproduzir em seguida"
              onClick={handlePlayNextClick}
              disabled={disabled}
            >
              <IconArrowUp size={16} />
            </ActionIcon>
            <ActionIcon
              color="red"
              title="Remover"
              onClick={handleRemoveClick}
              disabled={disabled}
            >
              <IconTrash size={16} />
            </ActionIcon>
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatVideoCard;
