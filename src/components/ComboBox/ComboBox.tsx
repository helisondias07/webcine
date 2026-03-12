import React from "react";
import {
  debounce,
  getYouTubeResults,
  isHttp,
  isTwitchLive,
  isYouTube,
} from "../../utils/utils";
import ChatVideoCard from "../ChatVideoCard/ChatVideoCard";
import { IconLink, IconX } from "@tabler/icons-react";
import {
  ActionIcon,
  Autocomplete,
  Loader,
  type AutocompleteProps,
} from "@mantine/core";

type ComboBoxProps = {
  roomSetMedia: (value: string) => void;
  playlistAdd: (value: string) => void;
  roomMedia: string;
  getMediaDisplayName: (input: string) => string;
  disabled?: boolean;
  showClear?: boolean;
};

type ComboBoxState = {
  inputMedia?: string;
  items: SearchResult[];
  loading: boolean;
};

export class ComboBox extends React.Component<ComboBoxProps, ComboBoxState> {
  state: ComboBoxState = {
    inputMedia: undefined as string | undefined,
    items: [] as SearchResult[],
    loading: false,
  };

  setMediaAndClose = (value: string) => {
    this.props.roomSetMedia(value);
    this.setState({ inputMedia: undefined, items: [] });
  };

  doSearch = async () => {
    const value = this.state.inputMedia;
    const query: string = value || "";
    if (!query.trim()) {
      this.setState({ loading: false, items: [] });
      return;
    }
    this.setState({ loading: true });
    try {
      let items: SearchResult[] = [];
      if (isHttp(query)) {
        let type: SearchResult["type"] | null = null;
        if (isYouTube(query)) {
          type = "youtube";
        }
        if (isTwitchLive(query)) {
          type = "file";
        }
        if (type == null) {
          items = [];
        } else {
          items = [
            {
              name: query,
              type,
              url: query,
              duration: 0,
            },
          ];
        }
      } else {
        items = (await getYouTubeResults(query)).slice(0, 40);
      }
      this.setState({ items });
    } finally {
      this.setState({ loading: false });
    }
  };

  debouncedSearch = debounce(this.doSearch);

  onChange = (value: string) => {
    this.setState({ inputMedia: value }, this.debouncedSearch);
  };

  render() {
    const { roomMedia: currentMedia, getMediaDisplayName } = this.props;
    const renderOption: AutocompleteProps["renderOption"] = ({ option }) => {
      const video = this.state.items.find((item) => item.url === option.value);
      return (
        <div
          key={option.value}
          onClick={(e) => this.setMediaAndClose(option.value)}
          style={{ width: "100%" }}
        >
          {video && (
            <ChatVideoCard
              video={video}
              index={0}
              onPlaylistAdd={this.props.playlistAdd}
            />
          )}
        </div>
      );
    };
    return (
      <Autocomplete
        maxDropdownHeight={400}
        style={{ width: "100%" }}
        disabled={this.props.disabled}
        onChange={this.onChange}
        onFocus={(e: any) => {
          this.setState(
            {
              // Display the real string value (currentMedia) when focused
              inputMedia:
                isYouTube(currentMedia) || isTwitchLive(currentMedia)
                  ? currentMedia
                  : getMediaDisplayName(currentMedia),
            },
            () => {
              if (this.state.inputMedia && isHttp(this.state.inputMedia)) {
                this.doSearch();
              }
              e.target.select();
            },
          );
        }}
        onBlur={() => {
          this.setState({
            inputMedia: undefined,
            items: [],
          });
        }}
        onKeyDown={(e: any) => {
          if (e.key === "Enter") {
            const input = (this.state.inputMedia ?? "").trim();
            if (!input) {
              return;
            }
            if (isYouTube(input) || isTwitchLive(input)) {
              this.setMediaAndClose(input);
              e.target.blur();
              return;
            }
            if (this.state.items.length > 0) {
              this.setMediaAndClose(this.state.items[0].url);
              e.target.blur();
            }
          }
        }}
        rightSection={
          this.props.showClear === false ? undefined : (
            <ActionIcon
              color="red"
              onClick={(e: any) => this.setMediaAndClose("")}
              title="Limpar"
            >
              <IconX />
            </ActionIcon>
          )
        }
        leftSection={this.state.loading ? <Loader size="sm" /> : <IconLink />}
        placeholder="Cole o link do YouTube ou Twitch (live), ou pesquise no YouTube"
        name="watchparty-media-search"
        autoComplete="new-password"
        value={
          this.state.inputMedia !== undefined
            ? this.state.inputMedia
            : getMediaDisplayName(currentMedia)
        }
        renderOption={renderOption}
        data={this.state.items.map((item) => item.url)}
        filter={({ options }) => options}
      />
    );
  }
}
