import React from "react";
import { Audio, Video } from "@remotion/media";
import { AbsoluteFill, Easing, Freeze, interpolate, Sequence, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { C, H, mono, sans, serif, W } from "./theme";
import { Camera, Rise, Wordmark } from "./parts";
import { compare, correction, edit, original, retake, rewrites, take, type AppBeat, type Word } from "./timeline";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const ease = Easing.bezier(0.16, 1, 0.3, 1);

// Instagram, TikTok and Shorts draw their own buttons over the video: a header
// at the top, the caption at the bottom and a column of icons on the right. Text
// stays inside this box.
const SAFE = { top: 230, left: 60, right: W - 140, bottom: H - 420 };

// ---------------------------------------------------------------- full-screen face
// Scale the portrait clip up from the top so its burned-in captions (which still
// say the old words) fall off the bottom of the frame.
const FACE_SCALE = 1.36;
const FACE = { x: W / 2, y: original.height * 0.31 * FACE_SCALE };
const faceStyle: React.CSSProperties = {
  position: "absolute",
  width: W * FACE_SCALE,
  height: H * FACE_SCALE,
  left: (W - W * FACE_SCALE) / 2,
  top: 0,
};

/** Plays `src` from `from` seconds for `play` seconds, then holds the last frame. */
const FaceFull: React.FC<{
  src: string;
  from: number;
  play: number;
  volume: number;
  zoom?: (frame: number) => number;
  frozen?: number;
}> = ({ src, from, play, volume, zoom, frozen = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const playF = Math.round(play * fps);
  const trim = Math.round(from * fps);
  return (
    <AbsoluteFill
      style={{
        overflow: "hidden",
        backgroundColor: "#000",
      }}
    >
      <AbsoluteFill
        style={{
          scale: String(zoom?.(frame) ?? 1),
          transformOrigin: `${FACE.x}px ${FACE.y}px`,
          filter: frozen ? `saturate(${1 - 0.65 * frozen}) brightness(${1 - 0.12 * frozen})` : undefined,
        }}
      >
        <Sequence durationInFrames={playF} layout="none">
          <Video
            src={staticFile(src)}
            trimBefore={trim}
            style={faceStyle}
            volume={(v) => volume * interpolate(v, [0, 2, playF - 2, playF], [0, 1, 1, 0], clamp)}
          />
        </Sequence>
        <Sequence from={playF} layout="none">
          <Freeze frame={playF - 1}>
            <Video src={staticFile(src)} trimBefore={trim} muted style={faceStyle} />
          </Freeze>
        </Sequence>
      </AbsoluteFill>
      {/* A soft shade behind the caption card, so the card sits on the footage rather than floating. */}
      <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(0,0,0,0) 45%, rgba(0,0,0,0.35) 100%)" }} />
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- the transcript card
// The transcript as paper, marked up like the app: red for what's wrong, blue for the fix.
type Mark = "wrong" | "fixed" | undefined;
export type ShownWord = Word & { show?: string; mark?: Mark };

/** Karaoke transcript: words light up as they're spoken. `dark` sets it on slate instead of paper. */
export const Words: React.FC<{ words: ShownWord[]; t: number; strike?: number; dark?: boolean; size?: number }> = ({
  words,
  t,
  strike = 0,
  dark = false,
  size = 60,
}) => (
  <p style={{ fontFamily: serif, fontSize: size, lineHeight: 1.3, margin: 0, color: dark ? C.onSlate : C.ink }}>
    {words.map((w, k) => {
      const spoken = t >= w.start - 0.04;
      const base: React.CSSProperties = {
        color: spoken ? (dark ? C.onSlate : C.ink) : dark ? C.faint : "#a3abb8",
        whiteSpace: w.mark ? "nowrap" : undefined,
      };
      if (w.mark === "wrong" && spoken)
        Object.assign(base, {
          color: dark ? C.redLight : C.red,
          backgroundColor: `rgba(207, 51, 70, ${(dark ? 0.22 : 0.13) * strike})`,
          borderRadius: 8,
          padding: "0 6px",
          textDecoration: strike > 0 ? `line-through ${4 * strike}px ${C.red}` : undefined,
        });
      if (w.mark === "fixed")
        Object.assign(base, {
          color: spoken ? "#fff" : dark ? C.blueLight : C.blue,
          backgroundColor: spoken ? C.blue : dark ? "rgba(142, 171, 255, 0.16)" : "rgba(42, 84, 214, 0.12)",
          borderRadius: 8,
          padding: "0 8px",
        });
      return (
        <React.Fragment key={k}>
          <span style={base}>{w.show ?? w.text}</span>{" "}
        </React.Fragment>
      );
    })}
  </p>
);

const Card: React.FC<{ dot: string; label: string; top?: number; children: React.ReactNode }> = ({ dot, label, top = 1010, children }) => (
  <div
    style={{
      position: "absolute",
      left: SAFE.left,
      width: SAFE.right - SAFE.left,
      top,
      padding: "30px 38px 36px",
      borderRadius: 30,
      backgroundColor: C.paper,
      boxShadow: "0 24px 60px rgba(0, 0, 0, 0.35)",
    }}
  >
    <div style={{ display: "flex", alignItems: "center", gap: 14, fontFamily: mono, fontSize: 26, letterSpacing: "0.14em", color: C.ink, marginBottom: 16 }}>
      <span style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: dot }} />
      {label}
    </div>
    {children}
  </div>
);

// ---------------------------------------------------------------- take
// Words Whisper misheard show as they were actually said; the wrong words read as one marked phrase.
const fixes = rewrites.filter((r) => r !== correction);
export const takeWords = take.words.flatMap((w): ShownWord[] => {
  const fix = fixes.find((r) => w.i! >= r.from && w.i! <= r.to);
  if (fix) {
    if (w.i !== fix.from) return [];
    return [{ ...w, show: fix.text + (take.words.find((x) => x.i === fix.to)!.text.match(/[.,!?;:]+$/)?.[0] ?? "") }];
  }
  if (w.i! < correction.from || w.i! > correction.to) return [w];
  if (w.i !== correction.from) return [];
  const group = take.words.filter((x) => x.i! >= correction.from && x.i! <= correction.to);
  return [{ ...w, text: group.map((x) => x.text).join(" "), end: group[group.length - 1].end, mark: "wrong" }];
});

export const Take: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const freezeF = Math.round(take.freezeAt * fps);
  const frozen = interpolate(frame, [freezeF, freezeF + 4], [0, 1], clamp);
  const strike = interpolate(frame, [freezeF + 2, freezeF + 9], [0, 1], { ...clamp, easing: ease });
  const flash = interpolate(frame, [freezeF, freezeF + 1, freezeF + 5], [0, 0.35, 0], clamp);
  return (
    <AbsoluteFill>
      <FaceFull src="original.mp4" from={0} play={take.freezeAt} volume={1} frozen={frozen} />
      <Card dot={C.red} label="TAKE 1">
        <Words words={takeWords} t={t} strike={strike} />
        <Sequence from={freezeF + 3} layout="none">
          <Rise dur={10} dy={14} style={{ marginTop: 22 }}>
            <span style={{ fontFamily: sans, fontSize: 48, fontWeight: 600, color: C.ink, letterSpacing: "-0.01em" }}>
              There were <span style={{ color: C.blue }}>{correction.text}</span>.
            </span>
          </Rise>
        </Sequence>
      </Card>
      <AbsoluteFill style={{ backgroundColor: "#fff", opacity: flash }} />
      <Sequence from={freezeF - 1} name="Record scratch">
        <Audio src={staticFile("sfx/record-scratch.wav")} volume={0.22} />
      </Sequence>
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- the real app
const Label: React.FC<{ text: string; step?: string }> = ({ text, step }) => {
  const frame = useCurrentFrame();
  const o = interpolate(frame, [0, 6], [0, 1], { ...clamp, easing: ease });
  return (
    <div
      style={{
        position: "absolute",
        left: SAFE.left,
        top: SAFE.top + 20,
        display: "flex",
        alignItems: "center",
        gap: 22,
        padding: step ? "18px 34px 20px 20px" : "18px 34px 20px",
        borderRadius: 22,
        backgroundColor: C.paper,
        boxShadow: "0 18px 50px rgba(8, 10, 14, 0.4)",
        opacity: o,
        translate: `0px ${(1 - o) * 14}px`,
      }}
    >
      {step && (
        <span
          style={{
            width: 64,
            height: 64,
            borderRadius: 16,
            backgroundColor: C.blue,
            color: "#fff",
            fontFamily: mono,
            fontSize: 36,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {step}
        </span>
      )}
      <span style={{ fontFamily: sans, fontWeight: 600, fontSize: 52, color: C.ink, letterSpacing: "-0.015em" }}>{text}</span>
    </div>
  );
};

export const JumpTag: React.FC<{ label: string; style?: React.CSSProperties }> = ({ label, style }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const o = Math.min(interpolate(frame, [0, 6], [0, 1], clamp), interpolate(frame, [durationInFrames - 8, durationInFrames], [1, 0], clamp));
  return (
    <div style={{ position: "absolute", left: 0, right: 0, top: 1400, display: "flex", justifyContent: "center", ...style, opacity: o }}>
      <span
        style={{
          fontFamily: mono,
          fontSize: 36,
          color: C.onSlate,
          backgroundColor: "rgba(29, 32, 38, 0.94)",
          borderRadius: 16,
          padding: "18px 30px",
        }}
      >
        {label}
      </span>
    </div>
  );
};

/** The beat's pieces of the screen recording, back to back. Goes inside a Camera. */
export const Recording: React.FC<{ beat: AppBeat }> = ({ beat }) => {
  const { fps } = useVideoConfig();
  let acc = 0;
  return (
    <>
      {beat.clips.map((c, k) => {
        const dur = Math.round(((c.to - c.from) / c.speed) * fps);
        const from = acc;
        acc += dur;
        return (
          <Sequence key={k} from={from} durationInFrames={dur} name={`Recording ${k + 1}`}>
            <Video src={staticFile("screen.mp4")} trimBefore={Math.round(c.from * fps)} playbackRate={c.speed} muted style={{ width: "100%", height: "100%" }} />
          </Sequence>
        );
      })}
    </>
  );
};

/** Taps, typing, the ding, and the cloned voice for a beat. */
export const BeatSounds: React.FC<{ beat: AppBeat }> = ({ beat }) => {
  const { fps } = useVideoConfig();
  return (
    <>
      {beat.sfx.map((s, k) => (
        <Sequence key={k} from={Math.max(0, Math.round(s.at * fps))} name="Sound">
          <Audio src={staticFile(s.src)} volume={s.volume} />
        </Sequence>
      ))}
      {beat.voice && beat.voice.at >= 0 && (
        <Sequence from={Math.round(beat.voice.at * fps)} durationInFrames={Math.round(beat.voice.len * fps)} name="Cloned voice">
          <Audio
            src={staticFile("voice.wav")}
            volume={(f) => interpolate(f, [0, 3, beat.voice!.len * fps - 8, beat.voice!.len * fps], [0, 0.85, 0.85, 0], clamp)}
          />
        </Sequence>
      )}
    </>
  );
};

export const AppScene: React.FC<{ beat: AppBeat }> = ({ beat }) => {
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill style={{ backgroundColor: C.slate }}>
      <Camera cams={beat.cams}>
        <Recording beat={beat} />
      </Camera>
      <Label text={beat.label} step={beat.step} />
      <BeatSounds beat={beat} />
      {beat.jump && beat.jump.at >= 0 && (
        <Sequence from={Math.max(0, Math.round(beat.jump.at * fps) - 3)} durationInFrames={Math.round(1.6 * fps)} name="Time jump">
          <JumpTag label={beat.jump.label} />
        </Sequence>
      )}
    </AbsoluteFill>
  );
};

export const Edit: React.FC = () => <AppScene beat={edit} />;

// ---------------------------------------------------------------- retake
export const retakeWords = retake.words.map((w): ShownWord => ({ ...w, mark: w.rewrite === correction.from ? "fixed" : undefined }));

export const Retake: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = retake.from + frame / fps;
  // Push in on the face as the new word is said.
  const fixF = Math.round((retake.fix.start - retake.from) * fps);
  const zoom = (fr: number) => interpolate(fr, [fixF - 9, fixF + 3], [1, 1.14], { ...clamp, easing: Easing.bezier(0.65, 0, 0.35, 1) });
  return (
    <AbsoluteFill>
      <FaceFull src="edited.mp4" from={retake.from} play={retake.to - retake.from} volume={1.3} zoom={zoom} />
      <Card dot={C.blue} label="RETAKE" top={980}>
        <Words words={retakeWords} t={t} />
        <div style={{ marginTop: 20, fontFamily: sans, fontSize: 38, fontWeight: 500, color: "#4a5363" }}>Same voice. Lips re-synced. No reshoot.</div>
      </Card>
      <Audio src={staticFile("sfx/whoosh.wav")} volume={0.3} />
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- title
export const Title: React.FC = () => (
  <AbsoluteFill style={{ backgroundColor: C.slate, alignItems: "center", justifyContent: "center" }}>
    <Audio src={staticFile("sfx/whoosh.wav")} volume={0.3} />
    <Rise dur={16} dy={26}>
      <Wordmark size={210} />
    </Rise>
    <Rise delay={7} dur={16} style={{ marginTop: 110, textAlign: "center" }}>
      <span style={{ fontFamily: serif, fontSize: 66, lineHeight: 1.25, color: C.onSlate }}>
        Edit the words.
        <br />
        The video follows.
      </span>
    </Rise>
  </AbsoluteFill>
);

// ---------------------------------------------------------------- compare
const PANEL_W = 470;
// The speaker's face and shoulders, above the burned-in captions.
const CROP = { x: 240, y: 110, w: 600 };

/** One side of the before/after: plays `src` at `playAt`, held still before and after. */
export const Panel: React.FC<{
  src: string;
  from: number;
  len: number;
  playAt: number;
  label: string;
  color: string;
  w?: number;
  h?: number;
  textSize?: number;
  /** Top of the crop in the source frame; lower it for a squatter panel so the face stays centred. */
  cropY?: number;
  children: React.ReactNode;
}> = ({ src, from, len, playAt, label, color, w: PANEL_W = 470, h: PANEL_H = 820, textSize = 44, cropY = CROP.y, children }) => {
  const cropScale = PANEL_W / CROP.w;
  const panelVideo: React.CSSProperties = {
    position: "absolute",
    width: original.width * cropScale,
    height: original.height * cropScale,
    left: -CROP.x * cropScale,
    top: -cropY * cropScale,
  };
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const playF = Math.round(playAt * fps);
  const lenF = Math.round(len * fps);
  const active = frame >= playF && frame < playF + lenF;
  const lit = interpolate(frame, [playF - 8, playF, playF + lenF, playF + lenF + 8], [0.45, 1, 1, 0.45], clamp);
  const progress = interpolate(frame, [playF, playF + lenF], [0, 1], clamp);
  const trim = Math.round(from * fps);
  return (
    <div style={{ width: PANEL_W, display: "flex", flexDirection: "column", gap: 22 }}>
      <span style={{ fontFamily: mono, fontSize: 30, letterSpacing: "0.14em", color: active ? color : C.dim }}>{label}</span>
      <div
        style={{
          position: "relative",
          width: PANEL_W,
          height: PANEL_H,
          borderRadius: 26,
          overflow: "hidden",
          backgroundColor: "#000",
          border: `3px solid ${active ? color : C.line}`,
          opacity: lit,
        }}
      >
        <Sequence durationInFrames={playF} layout="none">
          <Freeze frame={0}>
            <Video src={staticFile(src)} trimBefore={trim} muted style={panelVideo} />
          </Freeze>
        </Sequence>
        <Sequence from={playF} durationInFrames={lenF} layout="none">
          <Video src={staticFile(src)} trimBefore={trim} style={panelVideo} volume={src === "edited.mp4" ? 1.3 : 1} />
        </Sequence>
        <Sequence from={playF + lenF} layout="none">
          <Freeze frame={lenF - 1}>
            <Video src={staticFile(src)} trimBefore={trim} muted style={panelVideo} />
          </Freeze>
        </Sequence>
        <div style={{ position: "absolute", left: 0, bottom: 0, height: 7, width: `${progress * 100}%`, backgroundColor: color }} />
      </div>
      <p style={{ fontFamily: serif, fontSize: textSize, lineHeight: 1.3, color: C.onSlate, margin: 0, opacity: 0.45 + 0.55 * lit }}>{children}</p>
    </div>
  );
};

export const Compare: React.FC = () => {
  const { intro, gap, before, after } = compare;
  const afterAt = intro + before.len + gap;
  return (
    <AbsoluteFill style={{ backgroundColor: C.slate }}>
      <Audio src={staticFile("sfx/whoosh.wav")} volume={0.3} />
      <div style={{ position: "absolute", top: SAFE.top + 20, left: 0, right: 0, textAlign: "center" }}>
        <Rise dur={14}>
          <span style={{ fontFamily: sans, fontWeight: 600, fontSize: 58, color: C.onSlate, letterSpacing: "-0.015em" }}>Before and after</span>
        </Rise>
      </div>
      <Rise delay={4} dur={16} style={{ position: "absolute", top: 380, left: (W - PANEL_W * 2 - 40) / 2, display: "flex", gap: 40 }}>
        <Panel src="original.mp4" from={before.from} len={before.len} playAt={intro} label="BEFORE" color={C.redLight}>
          …film <span style={{ color: C.redLight, textDecoration: `line-through 3px ${C.red}` }}>a few</span> people
        </Panel>
        <Panel src="edited.mp4" from={after.from} len={after.len} playAt={afterAt} label="AFTER" color={C.blueLight}>
          …film <span style={{ color: "#fff", backgroundColor: C.blue, borderRadius: 6, padding: "0 8px" }}>{correction.text}</span> people
        </Panel>
      </Rise>
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- end card
export const EndCard: React.FC<{ cta?: string }> = ({ cta }) => (
  <AbsoluteFill style={{ backgroundColor: C.slate, alignItems: "center", justifyContent: "center" }}>
    <Audio src={staticFile("sfx/whoosh.wav")} volume={0.3} />
    <Rise dur={16} dy={24}>
      <Wordmark size={190} />
    </Rise>
    <Rise delay={6} dur={16} style={{ marginTop: 100, textAlign: "center" }}>
      <span style={{ fontFamily: serif, fontSize: 60, lineHeight: 1.3, color: C.onSlate }}>
        Fix what you said.
        <br />
        No reshoot.
      </span>
    </Rise>
    {cta && (
      <Rise delay={14} dur={16} style={{ marginTop: 70 }}>
        <span style={{ fontFamily: sans, fontWeight: 600, fontSize: 44, color: "#fff", backgroundColor: C.blue, borderRadius: 18, padding: "20px 36px" }}>
          {cta}
        </span>
      </Rise>
    )}
  </AbsoluteFill>
);
