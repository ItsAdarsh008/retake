"use client";
import { forwardRef, memo, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";
import type { Edit, Paragraph, Word } from "@/lib/types";
import type { Unit } from "@/lib/timeline";
import { Icon, Spinner } from "./bits";

export type VoiceState = { status: "loading" | "ready" | "error"; url?: string; duration?: number; error?: string; demo?: boolean };
export type Range = { from: number; to: number };

export type TranscriptHandle = {
  highlight: (i: number, follow: boolean) => void;
  anchorRect: (i: number) => DOMRect | null;
  container: () => HTMLDivElement | null;
};

type Props = {
  words: Word[];
  paragraphs: Paragraph[];
  idx: (Edit | null)[];
  unitOf: (Unit | null)[];
  sugg: Uint8Array;
  range: Range | null;
  voices: Record<string, VoiceState>;
  onPointerWord: (i: number, kind: "down" | "enter", e: React.PointerEvent) => void;
  onBlank: () => void;
  onOpenRewrite: (e: Edit) => void;
  onPreviewUnit: (u: Unit) => void;
  children?: React.ReactNode;
};

export const Transcript = forwardRef<TranscriptHandle, Props>(function Transcript(props, ref) {
  const root = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const now = useRef<HTMLElement | null>(null);
  const lastUserScroll = useRef(0);

  useImperativeHandle(ref, () => ({
    highlight(i, follow) {
      const el = i >= 0 ? (root.current?.querySelector(`[data-i="${i}"]`) as HTMLElement | null) : null;
      if (el === now.current) return;
      now.current?.classList.remove("is-now");
      el?.classList.add("is-now");
      now.current = el;
      if (follow && el && scroller.current && Date.now() - lastUserScroll.current > 2500) {
        const s = scroller.current.getBoundingClientRect();
        const r = el.getBoundingClientRect();
        if (r.top < s.top + 60 || r.bottom > s.bottom - 80) {
          scroller.current.scrollBy({ top: r.top - s.top - s.height * 0.35, behavior: "smooth" });
        }
      }
    },
    anchorRect(i) {
      const el = root.current?.querySelector(`[data-i="${i}"]`);
      return el ? el.getBoundingClientRect() : null;
    },
    container: () => scroller.current,
  }), []);

  const { words, paragraphs, range } = props;

  return (
    <div
      className="page-scroll"
      ref={scroller}
      onWheel={() => (lastUserScroll.current = Date.now())}
      onTouchMove={() => (lastUserScroll.current = Date.now())}
    >
      <div
        className="page"
        ref={root}
        onPointerDown={(e) => {
          const t = e.target as HTMLElement;
          if (t.closest("ins, button, textarea, .toolbar, .rewrite")) return;
          const w = t.closest("[data-i]") as HTMLElement | null;
          if (w) {
            e.preventDefault();
            props.onPointerWord(Number(w.dataset.i), "down", e);
          } else props.onBlank();
        }}
        onPointerOver={(e) => {
          const w = (e.target as HTMLElement).closest("[data-i]") as HTMLElement | null;
          if (w) props.onPointerWord(Number(w.dataset.i), "enter", e);
        }}
      >
        {paragraphs.map((p) => {
          const selFrom = range && range.to >= p.from && range.from <= p.to ? range.from : -1;
          const selTo = selFrom >= 0 ? range!.to : -1;
          return (
            <Para
              key={p.from}
              p={p}
              words={words}
              idx={props.idx}
              unitOf={props.unitOf}
              sugg={props.sugg}
              selFrom={selFrom}
              selTo={selTo}
              voices={props.voices}
              onOpenRewrite={props.onOpenRewrite}
              onPreviewUnit={props.onPreviewUnit}
            />
          );
        })}
        {props.children}
      </div>
    </div>
  );
});

type ParaProps = {
  p: Paragraph;
  words: Word[];
  idx: (Edit | null)[];
  unitOf: (Unit | null)[];
  sugg: Uint8Array;
  selFrom: number;
  selTo: number;
  voices: Record<string, VoiceState>;
  onOpenRewrite: (e: Edit) => void;
  onPreviewUnit: (u: Unit) => void;
};

// Keep the last word glued to the voice button so it never wraps alone.
const lead = (t: string) => (t.includes(" ") ? t.slice(0, t.lastIndexOf(" ") + 1) : "");
const tail = (t: string) => (t.includes(" ") ? t.slice(t.lastIndexOf(" ") + 1) : t);

const Para = memo(function Para({ p, words, idx, unitOf, sugg, selFrom, selTo, voices, onOpenRewrite, onPreviewUnit }: ParaProps) {
  const out: React.ReactNode[] = [];
  for (let i = p.from; i <= p.to; i++) {
    const e = idx[i];
    const u = unitOf[i];
    let cls = "w";
    if (e?.kind === "delete") cls += " is-cut";
    else if (e?.kind === "replace") cls += " is-rw";
    else if (u) cls += " in-unit";
    if (sugg[i] && !e) cls += " is-sugg";
    if (i >= selFrom && i <= selTo) {
      cls += " is-sel";
      if (i === selFrom) cls += " sel-first";
      if (i === selTo) cls += " sel-last";
    }
    out.push(
      <span key={i} data-i={i} className={cls}>
        {words[i].text}
      </span>
    );
    if (e?.kind === "replace" && i === e.to) {
      const v = u ? voices[u.text] : undefined;
      out.push(
        <ins key={`r${i}`} className="rw" onClick={() => onOpenRewrite(e)} title="Edit this rewrite">
          {lead(e.text)}
          <span className="rw-tail">
            {tail(e.text)}
            {u && (
              <span className="rw-voice" onClick={(ev) => ev.stopPropagation()}>
                {v?.status === "ready" ? (
                  <button
                    className="rw-play"
                    onClick={() => onPreviewUnit(u)}
                    title={v.demo ? "Play with placeholder voice" : "Hear it in the cloned voice"}
                    aria-label="Hear this line"
                  >
                    <Icon name="play" size={10} />
                  </button>
                ) : v?.status === "error" ? (
                  <span className="rw-err" title={v.error}>
                    <Icon name="alert" size={12} />
                  </span>
                ) : (
                  <span className="rw-wait" title="Cloning the voice for this line">
                    <Spinner size={10} />
                  </span>
                )}
              </span>
            )}
          </span>
        </ins>
      );
    }
    out.push(" ");
  }
  return <p className="para">{out}</p>;
});

/** Floating actions above the selection, plus the inline rewrite box. */
export function SelectionLayer({
  transcript,
  range,
  rewrite,
  hasEdits,
  isSugg,
  original,
  onCut,
  onRewrite,
  onRestore,
  onPlay,
  onDraft,
  onApply,
  onCancel,
}: {
  transcript: React.RefObject<TranscriptHandle | null>;
  range: Range | null;
  rewrite: { from: number; to: number; draft: string } | null;
  hasEdits: boolean;
  isSugg: boolean;
  original: string;
  onCut: () => void;
  onRewrite: () => void;
  onRestore: () => void;
  onPlay: () => void;
  onDraft: (s: string) => void;
  onApply: () => void;
  onCancel: () => void;
}) {
  const [pos, setPos] = useState<{ top: number; left: number; below: number } | null>(null);
  const box = rewrite ?? range;
  const ta = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    if (!box) return setPos(null);
    const place = () => {
      const t = transcript.current;
      const page = t?.container()?.querySelector(".page") as HTMLElement | null;
      const a = t?.anchorRect(box.from);
      const b = t?.anchorRect(box.to);
      if (!page || !a || !b) return;
      const pr = page.getBoundingClientRect();
      const w = rewrite ? Math.min(440, pr.width - 8) : 330;
      const left = Math.min(Math.max(0, a.left - pr.left), Math.max(0, pr.width - w));
      setPos({ top: a.top - pr.top, left, below: b.bottom - pr.top });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [box?.from, box?.to, !!rewrite, transcript]);

  useLayoutEffect(() => {
    if (!rewrite || !ta.current) return;
    const el = ta.current;
    el.focus();
    if (el.dataset.opened !== `${rewrite.from}-${rewrite.to}`) {
      el.dataset.opened = `${rewrite.from}-${rewrite.to}`;
      if (rewrite.draft.length > 1) el.select();
      else el.setSelectionRange(el.value.length, el.value.length);
    }
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }, [rewrite]);

  if (!box || !pos) return null;

  if (rewrite) {
    return (
      <div className="rewrite" style={{ top: pos.below + 10, left: pos.left }} role="dialog" aria-label="Rewrite">
        <p className="rewrite-was">
          <span>Was</span> <del>{original}</del>
        </p>
        <textarea
          ref={ta}
          value={rewrite.draft}
          rows={1}
          spellCheck
          aria-label="New words"
          onChange={(e) => onDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onApply();
            } else if (e.key === "Escape") {
              e.preventDefault();
              onCancel();
            }
            e.stopPropagation();
          }}
        />
        <div className="rewrite-foot">
          <span>Spoken again in the same voice, lips re-synced.</span>
          <div>
            <button className="btn btn-quiet" onClick={onCancel}>
              Cancel
            </button>
            <button className="btn btn-blue" onClick={onApply} disabled={!rewrite.draft.trim()}>
              Apply
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="toolbar" style={{ top: pos.top - 46, left: pos.left }} role="toolbar" aria-label="Selection">
      <button onClick={onCut} title="Cut (Delete)">
        <Icon name="scissors" /> Cut
      </button>
      <button onClick={onRewrite} title="Rewrite (Enter, or just start typing)">
        <Icon name="pen" /> Rewrite
      </button>
      {hasEdits && (
        <button onClick={onRestore} title="Put the original words back">
          <Icon name="restore" /> Restore
        </button>
      )}
      <button onClick={onPlay} title="Play from here (Space)">
        <Icon name="play" size={12} /> Play
      </button>
      {isSugg && <span className="toolbar-note">Claude suggests cutting this</span>}
    </div>
  );
}
