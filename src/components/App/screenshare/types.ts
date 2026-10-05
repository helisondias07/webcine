export type ShareQualityMode = "economy" | "auto" | "high";

export type ShareContentHint = "motion" | "detail";

export type ShareQualityProfile = {
  captureWidth: number;
  captureHeight: number;
  maxFramerate: number;
  maxBitratePerPeer: number;
  scaleResolutionDownBy?: number;
};

export type SenderEncoding = {
  maxBitrate: number;
  maxFramerate: number;
  scaleResolutionDownBy: number;
  degradationPreference:
    | "maintain-resolution"
    | "maintain-framerate"
    | "balanced";
};
