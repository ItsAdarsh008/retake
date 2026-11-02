import React from "react";
import { Audio, Video } from "@remotion/media";
import { AbsoluteFill, Easing, Freeze, interpolate, Sequence, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { C, mono, sans } from "./theme";
import { Camera, Rise } from "./parts";
import { BeatSounds, JumpTag, Panel, Recording, retakeWords, takeWords, Words } from "./scenes";
import { compare, correction, original, retake, take, type AppBeat } from "./timeline";

// The 16:9 layout for LinkedIn and X: 1920x1080, from the same recording as the
// Reel. Both feeds autoplay muted, so every beat explains itself in text.

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const ease = Easing.bezier(0.16, 1, 0.3, 1);
const FW = 1920;
const FH = 1080;

// ---------------------------------------------------------------- face on the left, words on the right
// Crop the portrait clip to the speaker, above its burned-in captions.
const CROP = { x: 90, y: 250, w: 900, h: 1000 };
const CARD_H = 940;
const CARD_W = Math.round((CARD_H * CROP.w) / CROP.h);
const S = CARD_W / CROP.w;
const FACE = { x: (original.width * 0.46 - CROP.x) * S, y: (original.height * 0.31 - CROP.y) * S };
const COL_X = 110 + CARD_W + 100;
const COL_W = FW - COL_X - 110;

const videoStyle: React.CSSProperties = {
  position: "absolute",
  width: original.width * S,
  height: original.height * S,
  left: -CROP.x * S,
  top: -CROP.y * S,
};

const FaceCard: React.FC<{ src: string; from: number; play: number; volume: number; zoom?: (f: number) => number; frozen?: number }> = ({
  src,
  from,
  play,
  volume,
  zoom,
  frozen = 0,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const playF = Math.round(play * fps);
  const trim = Math.round(from * fps);
  return (
    <div
      style={{
        position: "absolute",
        left: 110,
        top: (FH - CARD_H) / 2,
        width: CARD_W,
        height: CARD_H,
        borderRadius: 28,
        overflow: "hidden",
        backgroundColor: "#000",
        border: `1px solid ${C.line}`,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          scale: String(zoom?.(frame) ?? 1),
          transformOrigin: `${FACE.x}px ${FACE.y}px`,
          filter: frozen ? `saturate(${1 - 0.65 * frozen}) brightness(${1 - 0.12 * frozen})` : undefined,
        }}
      >
        <Sequence durationInFrames={playF} layout="none">
          <Video
            src={staticFile(src)}
            trimBefore={trim}
            style={videoStyle}
            volume={(v) => volume * interpolate(v, [0, 2, playF - 2, playF], [0, 1, 1, 0], clamp)}
          />
        </Sequence>
        <Sequence from={playF} layout="none">
          <Freeze frame={playF - 1}>
            <Video src={staticFile(src)} trimBefore={trim} muted style={videoStyle} />
          </Freeze>
        </Sequence>
      </div>
    </div>
  );
};

const Status: React.FC<{ dot: string; label: string }> = ({ dot, label }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 18, fontFamily: mono, fontSize: 30, letterSpacing: "0.14em", color: C.onSlate, marginBottom: 34 }}>
    <span style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: dot }} />
    {label}
  </div>
);

export const WideTake: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const freezeF = Math.round(take.freezeAt * fps);
  const frozen = interpolate(frame, [freezeF, freezeF + 4], [0, 1], clamp);
  const strike = interpolate(frame, [freezeF + 2, freezeF + 9], [0, 1], { ...clamp, easing: ease });
  const flash = interpolate(frame, [freezeF, freezeF + 1, freezeF + 5], [0, 0.35, 0], clamp);
  return (
    <AbsoluteFill style={{ backgroundColor: C.slate }}>
      <FaceCard src="original.mp4" from={0} play={take.freezeAt} volume={1} frozen={frozen} />
      <div style={{ position: "absolute", left: COL_X, top: 270, width: COL_W }}>
        <Status dot={C.red} label="TAKE 1" />
        <Words words={takeWords} t={t} strike={strike} dark size={66} />
        <Sequence from={freezeF + 3} layout="none">
          <Rise dur={10} dy={14} style={{ marginTop: 40 }}>
            <span style={{ fontFamily: sans, fontSize: 54, fontWeight: 600, color: C.onSlate, letterSpacing: "-0.01em" }}>
              There were <span style={{ color: C.blueLight }}>{correction.text}</span>.
            </span>
          </Rise>
        </Sequence>
      </div>
      <AbsoluteFill style={{ backgroundColor: "#fff", opacity: flash }} />
      <Sequence from={freezeF - 1} name="Record scratch">
        <Audio src={staticFile("sfx/record-scratch.wav")} volume={0.22} />
      </Sequence>
    </AbsoluteFill>
  );
};

export const WideRetake: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = retake.from + frame / fps;
  const fixF = Math.round((retake.fix.start - retake.from) * fps);
  const zoom = (fr: number) => interpolate(fr, [fixF - 9, fixF + 3], [1, 1.16], { ...clamp, easing: Easing.bezier(0.65, 0, 0.35, 1) });
  return (
    <AbsoluteFill style={{ backgroundColor: C.slate }}>
      <FaceCard src="edited.mp4" from={retake.from} play={retake.to - retake.from} volume={1.3} zoom={zoom} />
      <div style={{ position: "absolute", left: COL_X, top: 230, width: COL_W }}>
        <Status dot={C.blueLight} label="RETAKE" />
        <Words words={retakeWords} t={t} dark size={66} />
        <div style={{ marginTop: 40, fontFamily: sans, fontSize: 42, color: "#c4cad6" }}>Same voice. Lips re-synced. No reshoot.</div>
      </div>
      <Audio src={staticFile("sfx/whoosh.wav")} volume={0.3} />
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- the real app: words on the left, screen on the right
const PANEL = { x: 960, y: 50, w: 850, h: FH - 100 };

export const WideApp: React.FC<{ beat: AppBeat }> = ({ beat }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const o = interpolate(frame, [0, 7], [0, 1], { ...clamp, easing: ease });
  const jumpF = beat.jump ? Math.round(beat.jump.at * fps) : -1;
  return (
    <AbsoluteFill style={{ backgroundColor: C.slate }}>
      <div
        style={{
          position: "absolute",
          left: 110,
          top: 0,
          bottom: 0,
          width: PANEL.x - 110 - 90,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          opacity: o,
          translate: `0px ${(1 - o) * 16}px`,
        }}
      >
        {beat.step && (
          <span
            style={{
              width: 86,
              height: 86,
              borderRadius: 20,
              backgroundColor: C.blue,
              color: "#fff",
              fontFamily: mono,
              fontSize: 46,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 38,
            }}
          >
            {beat.step}
          </span>
        )}
        <span style={{ fontFamily: sans, fontWeight: 600, fontSize: 76, lineHeight: 1.1, color: C.onSlate, letterSpacing: "-0.02em" }}>{beat.label}</span>
        <span style={{ fontFamily: sans, fontSize: 40, lineHeight: 1.4, color: C.dim, marginTop: 28 }}>{beat.sub}</span>
        <div style={{ position: "relative", height: 110 }}>
          {beat.jump && jumpF >= 0 && (
            <Sequence from={Math.max(0, jumpF - 3)} durationInFrames={Math.round(1.6 * fps)} layout="none">
              <JumpTag label={beat.jump.label} style={{ top: 44, justifyContent: "flex-start" }} />
            </Sequence>
          )}
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          left: PANEL.x,
          top: PANEL.y,
          width: PANEL.w,
          height: PANEL.h,
          borderRadius: 30,
          overflow: "hidden",
          border: `1px solid ${C.line}`,
          boxShadow: "0 30px 80px rgba(0, 0, 0, 0.35)",
        }}
      >
        <Camera cams={beat.cams} width={PANEL.w} height={PANEL.h}>
          <Recording beat={beat} />
        </Camera>
      </div>
      <BeatSounds beat={beat} />
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- before and after
const CMP = { w: 600, h: 700, gap: 110, cropY: 270 };

export const WideCompare: React.FC = () => {
  const { intro, gap, before, after } = compare;
  const afterAt = intro + before.len + gap;
  return (
    <AbsoluteFill style={{ backgroundColor: C.slate }}>
      <Audio src={staticFile("sfx/whoosh.wav")} volume={0.3} />
      <div style={{ position: "absolute", top: 62, left: 0, right: 0, textAlign: "center" }}>
        <Rise dur={14}>
          <span style={{ fontFamily: sans, fontWeight: 600, fontSize: 60, color: C.onSlate, letterSpacing: "-0.015em" }}>Before and after</span>
        </Rise>
      </div>
      <Rise delay={4} dur={16} style={{ position: "absolute", top: 170, left: (FW - CMP.w * 2 - CMP.gap) / 2, display: "flex", gap: CMP.gap }}>
        <Panel src="original.mp4" from={before.from} len={before.len} playAt={intro} label="BEFORE" color={C.redLight} w={CMP.w} h={CMP.h} cropY={CMP.cropY} textSize={48}>
          …film <span style={{ color: C.redLight, textDecoration: `line-through 3px ${C.red}` }}>a few</span> people
        </Panel>
        <Panel src="edited.mp4" from={after.from} len={after.len} playAt={afterAt} label="AFTER" color={C.blueLight} w={CMP.w} h={CMP.h} cropY={CMP.cropY} textSize={48}>
          …film <span style={{ color: "#fff", backgroundColor: C.blue, borderRadius: 6, padding: "0 8px" }}>{correction.text}</span> people
        </Panel>
      </Rise>
    </AbsoluteFill>
  );
};
