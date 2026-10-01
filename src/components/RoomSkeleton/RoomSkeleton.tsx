import React from "react";

/**
 * Lightweight placeholder shown while the room chunk is loading. Uses the
 * global `.wc-skel*` classes from index.css so that the exact same markup can
 * also be injected as static HTML by index.html before any JS runs.
 */
export const RoomSkeleton = () => (
  <div
    className="wc-skel"
    role="status"
    aria-live="polite"
    aria-label="Carregando sala"
  >
    <div className="wc-skel-top">
      <span className="wc-skel-brand">
        WEBCINE<i>tv</i>
      </span>
    </div>
    <div className="wc-skel-deck">
      <div className="wc-skel-bar" />
    </div>
    <div className="wc-skel-player">
      <div className="wc-skel-spinner" />
    </div>
  </div>
);
