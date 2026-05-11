import type { FirebaseUser } from "./utils/firebaseClient";
import React from "react";

export const DEFAULT_STATE = {
  user: undefined as FirebaseUser | undefined,
  isSubscriber: undefined as boolean | undefined,
  plan: "free" as "free" | "premium" | "family",
  subscriptionStatus: "canceled" as
    | "active"
    | "trialing"
    | "past_due"
    | "canceled"
    | "incomplete",
  entitlements: {
    virtualBrowser: false,
    maxParticipants: 10,
  },
  streamPath: undefined as string | undefined,
  convertPath: undefined as string | undefined,
  beta: false,
};

export const MetadataContext = React.createContext(DEFAULT_STATE);
