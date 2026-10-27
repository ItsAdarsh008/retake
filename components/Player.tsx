"use client";
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { formatTime, type Unit } from "@/lib/timeline";
import type { Suggestion } from "@/lib/types";
import type { VoiceState } from "./Transcript";
import { Icon } from "./bits";

export type PlayerHandle = {
  seek: (t: number, play?: boolean) => void;
  toggle: () => void;
  playing: () => boolean;
};

type Props = {
  src: string;
  duration: number;
  peaks: number[];
  skips: [number, number][];
  units: Unit[];
  suggestions: Suggestion[];
  wordStarts: number[];
  voices: Record<string, VoiceState>;
  preview: boolean;
  editedLength: number;
  aspect: number;
  onPreviewChange: (v: boolean) => void;
  onTime: (t: number, playing: boolean) => void;
};

/**
 * The video plus an edit-aware playback engine: with preview on it jumps over
 * cut material and, for rewritten lines, mutes the take and plays the cloned
 * voice, holding the frame if the new line runs longer.
 */
export const Player = forwardRef<PlayerHandle, Props>(function Player(props, ref) {
  const video = useRef<HTMLVideoElement>(null);
  const audio = useRef<HTMLAudioElement>(null);
  const head = useRef<HTMLDivElement>(null);
  const eng = useRef({ unit: null as Unit | null, holding: false, intent: false });
  const live = useRef(props);
  live.current = props;
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [voiceLine, setVoiceLine] = useState<string | null>(null);

  const stopUnit = () => {
    const e = eng.current;
    if (!e.unit) return;
    audio.current?.pause();
    e.unit = null;
    e.holding = false;
    if (video.current) video.current.muted = false;
    setVoiceLine(null);
  };
  const start = () => {
    const v = video.current;
    if (!v) return;
    if (v.ended || v.currentTime >= live.current.duration - 0.05) v.currentTime = 0;
    eng.current.intent = true;
    setPlaying(true);
    if (eng.current.unit) {
      audio.current?.play().catch(() => {});
      if (!eng.current.holding) v.play().catch(() => {});
    } else v.play().catch(() => {});
  };
  const pause = () => {
    eng.current.intent = false;
    setPlaying(false);
    video.current?.pause();
    audio.current?.pause();
  };

  useImperativeHandle(ref, () => ({
    seek(t, play) {
      stopUnit();
      if (video.current) video.current.currentTime = Math.max(0, Math.min(t, live.current.duration - 0.01));
      if (play) start();
    },
    toggle() {
      if (eng.current.intent) pause();
      else start();
    },
    playing: () => eng.current.intent,
  }));

  useEffect(() => {
    let raf = 0;
    let lastShown = -1;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const v = video.current;
      const a = audio.current;
      if (!v || !a) return;
      const p = live.current;
      const e = eng.current;
      const t = v.currentTime;
      if (e.intent && p.preview) {
        if (e.unit) {
          if (!e.holding && t >= e.unit.end - 0.04) {
            v.pause();
            e.holding = true;
          }
        } else if (!v.paused) {
          const skip = p.skips.find(([s, en]) => t >= s - 0.005 && t < en - 0.02);
          if (skip) v.currentTime = skip[1];
          else {
            const u = p.units.find((u) => t >= u.start && t < u.end - 0.08);
            const vs = u && p.voices[u.text];
            if (u && vs?.status === "ready" && vs.url) {
              e.unit = u;
              e.holding = false;
              v.muted = true;
              if (t > u.start + 0.1) v.currentTime = u.start;
              a.src = vs.url;
              a.currentTime = 0;
              a.play().catch(() => {});
              setVoiceLine(u.text);
            }
          }
        }
      }
      const shown = e.unit && e.holding ? e.unit.end : t;
      if (head.current) head.current.style.left = `${(shown / (p.duration || 1)) * 100}%`;
      p.onTime(shown, e.intent);
      if (Math.abs(shown - lastShown) > 0.2) {
        lastShown = shown;
        setTime(shown);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    if (!props.preview) stopUnit();
  }, [props.preview]);

  const onAudioEnded = () => {
    const e = eng.current;
    const v = video.current;
    if (!e.unit || !v) return;
    const end = e.unit.end;
    e.unit = null;
    e.holding = false;
    v.muted = false;
    v.currentTime = end;
    setVoiceLine(null);
    if (e.intent) v.play().catch(() => {});
  };

  return (
    <div className="player">
      <div
        className="screen"
        style={{ aspectRatio: String(props.aspect || 16 / 9), width: `min(100%, calc(var(--screen-h, 56dvh) * ${props.aspect || 16 / 9}))` }}
      >
        <video
          ref={video}
          src={props.src}
          preload="auto"
          playsInline
          onClick={() => (eng.current.intent ? pause() : start())}
          onEnded={() => {
            if (!eng.current.unit) {
              eng.current.intent = false;
              setPlaying(false);
            }
          }}
        />
        <audio ref={audio} preload="auto" onEnded={onAudioEnded} />
        {voiceLine && (
          <p className="voice-line" aria-live="polite">
            <span className="voice-dot" /> {voiceLine}
          </p>
        )}
        {!playing && (
          <button className="big-play" onClick={start} aria-label="Play">
            <Icon name="play" size={28} />
          </button>
        )}
      </div>

      <div className="transport">
        <button className="round" onClick={() => (eng.current.intent ? pause() : start())} aria-label={playing ? "Pause" : "Play"}>
          <Icon name={playing ? "pause" : "play"} size={16} />
        </button>
        <span className="clock">
          {formatTime(time)} <span>/ {formatTime(props.duration)}</span>
        </span>
        <label className="switch" title="Hear the video with your cuts and rewrites applied">
          <input type="checkbox" checked={props.preview} onChange={(e) => props.onPreviewChange(e.target.checked)} />
          <span className="switch-track" aria-hidden />
          Play with edits
        </label>
        <span className="edited-len" title="Length after your edits (rewrites estimated until their voice is ready)">
          {Math.abs(props.editedLength - props.duration) > 0.25 ? (
            <>
              New length <b>{formatTime(props.editedLength)}</b>
            </>
          ) : null}
        </span>
      </div>

      <Timeline {...props} headRef={head} onSeek={(t) => {
        stopUnit();
        if (video.current) video.current.currentTime = t;
      }} />
    </div>
  );
});

function Timeline({
  duration,
  peaks,
  skips,
  units,
  suggestions,
  wordStarts,
  headRef,
  onSeek,
}: Props & { headRef: React.RefObject<HTMLDivElement | null>; onSeek: (t: number) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [w, setW] = useState(0);

  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    if (wrap.current) ro.observe(wrap.current);
    return () => ro.disconnect();
  }, []);

  const kinds = useMemo(() => {
    const n = peaks.length;
    const k = new Uint8Array(n);
    const mark = (s: number, e: number, v: number) => {
      const a = Math.floor((s / duration) * n);
      const b = Math.ceil((e / duration) * n);
      for (let i = Math.max(0, a); i < Math.min(n, b); i++) k[i] = v;
    };
    for (const [s, e] of skips) mark(s, e, 1);
    for (const u of units) mark(u.start, u.end, 2);
    return k;
  }, [peaks, skips, units, duration]);

  useEffect(() => {
    const c = canvas.current;
    if (!c || !w || !peaks.length) return;
    const dpr = window.devicePixelRatio || 1;
    const H = 56;
    c.width = w * dpr;
    c.height = H * dpr;
    const ctx = c.getContext("2d")!;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, H);
    const css = getComputedStyle(c);
    const col = [css.getPropertyValue("--wave").trim(), css.getPropertyValue("--wave-cut").trim(), css.getPropertyValue("--wave-rw").trim()];
    const bar = 2;
    const gap = 1;
    const count = Math.floor(w / (bar + gap));
    for (let x = 0; x < count; x++) {
      const i0 = Math.floor((x / count) * peaks.length);
      const i1 = Math.max(i0 + 1, Math.floor(((x + 1) / count) * peaks.length));
      let m = 0;
      let kind = 0;
      for (let i = i0; i < i1; i++) {
        if (peaks[i] > m) m = peaks[i];
        if (kinds[i] > kind) kind = kinds[i];
      }
      const h = Math.max(2, Math.pow(m, 0.7) * (H - 8));
      ctx.fillStyle = col[kind];
      ctx.fillRect(x * (bar + gap), (H - h) / 2, bar, h);
    }
  }, [w, peaks, kinds]);

  const tAt = (clientX: number) => {
    const r = wrap.current!.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * duration;
  };
  // Snap to the nearest word start so scrubbing lands on speech, not mid-syllable.
  const snap = (t: number) => {
    let best = t;
    let d = 0.25;
    for (const s of wordStarts) {
      if (Math.abs(s - t) < d) {
        d = Math.abs(s - t);
        best = s;
      }
      if (s > t + 0.25) break;
    }
    return best;
  };

  return (
    <div
      className="timeline"
      ref={wrap}
      onPointerDown={(e) => {
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        onSeek(snap(tAt(e.clientX)));
      }}
      onPointerMove={(e) => {
        setHover(tAt(e.clientX));
        if (e.buttons === 1) onSeek(tAt(e.clientX));
      }}
      onPointerLeave={() => setHover(null)}
      role="slider"
      aria-label="Timeline"
      aria-valuemin={0}
      aria-valuemax={Math.round(duration)}
    >
      <canvas ref={canvas} style={{ width: "100%", height: 56 }} />
      {suggestions.map((s, k) => (
        <span
          key={k}
          className="tl-sugg"
          style={{ left: `${(wordStarts[s.from] / duration) * 100}%` }}
        />
      ))}
      <div className="tl-head" ref={headRef} />
      {hover !== null && (
        <span className="tl-hover" style={{ left: `${(hover / duration) * 100}%` }}>
          {formatTime(hover)}
        </span>
      )}
    </div>
  );
}
