import React from "react";
import { Composition } from "remotion";
import { Demo } from "./Demo";
import { FPS, H, W } from "./theme";
import { totalFrames } from "./timeline";

// RetakeReel: 1080x1920 for Reels, Shorts and TikTok.
// RetakeWide: 1920x1080 for LinkedIn and X.
// Set `cta` (e.g. "Link in bio" or a URL) to add a call to action to the end card.
export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="RetakeReel" component={Demo} durationInFrames={totalFrames} fps={FPS} width={W} height={H} defaultProps={{ cta: "", layout: "reel" as const }} />
    <Composition id="RetakeWide" component={Demo} durationInFrames={totalFrames} fps={FPS} width={H} height={W} defaultProps={{ cta: "", layout: "wide" as const }} />
  </>
);
