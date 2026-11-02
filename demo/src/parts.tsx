import React from "react";
import { Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { C, serif } from "./theme";
import type { Cam } from "./timeline";
import { VIEW } from "./timeline";

const ease = Easing.bezier(0.16, 1, 0.3, 1);
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** Fades and lifts its children in, starting `delay` frames into the scene. */
export const Rise: React.FC<{ delay?: number; dur?: number; dy?: number; style?: React.CSSProperties; children: React.ReactNode }> = ({
  delay = 0,
  dur = 16,
  dy = 22,
  style,
  children,
}) => {
  const frame = useCurrentFrame();
  return (
    <div
      style={{
        ...style,
        opacity: interpolate(frame, [delay, delay + dur], [0, 1], { ...clamp, easing: ease }),
        translate: `0px ${interpolate(frame, [delay, delay + dur], [dy, 0], { ...clamp, easing: ease })}px`,
      }}
    >
      {children}
    </div>
  );
};

/** The app's wordmark: an italic blue "Re" with a proofreader's caret under it. */
export const Wordmark: React.FC<{ size: number }> = ({ size }) => (
  <div style={{ fontFamily: serif, fontSize: size, fontWeight: 500, letterSpacing: "-0.01em", color: C.onSlate, lineHeight: 1 }}>
    <span style={{ position: "relative", color: C.blueLight, fontStyle: "italic", marginRight: "0.04em" }}>
      Re
      <span
        style={{
          position: "absolute",
          left: "50%",
          bottom: "-0.16em",
          translate: "-50% 0",
          fontStyle: "normal",
          fontSize: "0.7em",
        }}
      >
        ‸
      </span>
    </span>
    take
  </div>
);

/**
 * Pans and zooms over the screen recording, easing between keyframes (in seconds).
 * Fills a `width` x `height` window (the whole frame by default), scaling the recording
 * evenly to cover it, so a tall phone recording can sit in a wide panel and pan.
 */
export const Camera: React.FC<{ cams: Cam[]; width?: number; height?: number; children: React.ReactNode }> = ({
  cams,
  width: w,
  height: h,
  children,
}) => {
  const frame = useCurrentFrame();
  const { fps, width: fw, height: fh } = useVideoConfig();
  const width = w ?? fw;
  const height = h ?? fh;
  const t = frame / fps;
  const at = cams.map((c) => c.at);
  const opts = { ...clamp, easing: Easing.bezier(0.65, 0, 0.35, 1) };
  const base = Math.max(width / VIEW.width, height / VIEW.height);
  const cw = VIEW.width * base;
  const ch = VIEW.height * base;
  const z = interpolate(t, at, cams.map((c) => c.zoom), opts);
  const fx = interpolate(t, at, cams.map((c) => c.x), opts) * base;
  const fy = interpolate(t, at, cams.map((c) => c.y), opts) * base;
  const tx = Math.min(0, Math.max(width - cw * z, width / 2 - fx * z));
  const ty = Math.min(0, Math.max(height - ch * z, height / 2 - fy * z));
  return (
    <div style={{ position: "relative", width, height, overflow: "hidden", backgroundColor: C.slate }}>
      <div style={{ position: "absolute", left: 0, top: 0, width: cw, height: ch, transformOrigin: "0 0", translate: `${tx}px ${ty}px`, scale: String(z) }}>
        {children}
      </div>
    </div>
  );
};
