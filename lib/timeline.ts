// Shared (client + server) edit model. Everything is expressed in original
// word indices; times are always in the ORIGINAL video's timeline.
import type { Edit, LipSyncMode, Scope, Word } from "./types";

export type Unit = {
  /** first / last original word covered by the regenerated speech */
  from: number;
  to: number;
  /** what the speaker will say instead */
  text: string;
  /** original-time interval this unit replaces (word-owned, cut to cut) */
  start: number;
  end: number;
  /** where speech actually begins/ends inside [start, end] */
  speechStart: number;
  speechEnd: number;
};

export type Piece =
  | { kind: "keep"; start: number; end: number }
  | { kind: "unit"; unit: Unit };

const overlaps = (a: { from: number; to: number }, f: number, t: number) =>
  a.from <= t && f <= a.to;

export function sortEdits(edits: Edit[]): Edit[] {
  return [...edits].sort((a, b) => a.from - b.from);
}

/** Cut point k sits between word k-1 and word k (midpoint of the pause). */
export function cutPoints(words: Word[], duration: number): number[] {
  const n = words.length;
  const c = new Array<number>(n + 1);
  c[0] = 0;
  c[n] = duration;
  for (let k = 1; k < n; k++) {
    const a = words[k - 1].end;
    const b = words[k].start;
    c[k] = b > a ? (a + b) / 2 : b;
  }
  return c;
}

/** Per-word lookup of the edit covering it (or null). */
export function editIndex(n: number, edits: Edit[]): (Edit | null)[] {
  const idx = new Array<Edit | null>(n).fill(null);
  for (const e of edits) for (let i = e.from; i <= e.to && i < n; i++) idx[i] = e;
  return idx;
}

export function applyDelete(edits: Edit[], from: number, to: number): Edit[] {
  let lo = from;
  let hi = to;
  let rest = [...edits];
  let changed = true;
  while (changed) {
    changed = false;
    for (const e of rest) {
      const touching =
        overlaps(e, lo, hi) || (e.kind === "delete" && (e.to === lo - 1 || e.from === hi + 1));
      if (touching) {
        lo = Math.min(lo, e.from);
        hi = Math.max(hi, e.to);
        rest = rest.filter((x) => x !== e);
        changed = true;
        break;
      }
    }
  }
  return sortEdits([...rest, { kind: "delete", from: lo, to: hi }]);
}

export function applyReplace(edits: Edit[], from: number, to: number, text: string): Edit[] {
  let lo = from;
  let hi = to;
  let changed = true;
  while (changed) {
    changed = false;
    for (const e of edits) {
      if (e.kind === "replace" && overlaps(e, lo, hi) && (e.from < lo || e.to > hi)) {
        lo = Math.min(lo, e.from);
        hi = Math.max(hi, e.to);
        changed = true;
      }
    }
  }
  const out: Edit[] = [];
  for (const e of edits) {
    if (!overlaps(e, lo, hi)) {
      out.push(e);
      continue;
    }
    if (e.kind === "delete") {
      if (e.from < lo) out.push({ kind: "delete", from: e.from, to: lo - 1 });
      if (e.to > hi) out.push({ kind: "delete", from: hi + 1, to: e.to });
    }
  }
  out.push({ kind: "replace", from: lo, to: hi, text: text.trim() });
  return sortEdits(out);
}

export function restoreRange(edits: Edit[], from: number, to: number): Edit[] {
  const out: Edit[] = [];
  for (const e of edits) {
    if (!overlaps(e, from, to)) {
      out.push(e);
      continue;
    }
    if (e.kind === "delete") {
      if (e.from < from) out.push({ kind: "delete", from: e.from, to: from - 1 });
      if (e.to > to) out.push({ kind: "delete", from: to + 1, to: e.to });
    }
  }
  return sortEdits(out);
}

export const normWord = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}']+/gu, "");

export function originalText(words: Word[], from: number, to: number): string {
  return words
    .slice(from, to + 1)
    .map((w) => w.text)
    .join(" ");
}

/** True when a rewrite says the same words as the original (ignoring punctuation/case). */
export function sameWords(a: string, b: string): boolean {
  const n = (s: string) => s.split(/\s+/).map(normWord).filter(Boolean).join(" ");
  return n(a) === n(b);
}

const SENTENCE_END = /[.?!…]["'”’)\]]*$/;
const MAX_UNIT_WORDS = 40;

function sentenceBounds(words: Word[]): { start: number[]; end: number[] } {
  const n = words.length;
  const start = new Array<number>(n);
  const end = new Array<number>(n);
  let s = 0;
  for (let i = 0; i < n; i++) {
    start[i] = s;
    const gapAfter = i + 1 < n ? words[i + 1].start - words[i].end : Infinity;
    if (SENTENCE_END.test(words[i].text) || gapAfter > 1.2 || i === n - 1) {
      for (let k = s; k <= i; k++) end[k] = i;
      s = i + 1;
    }
  }
  return { start, end };
}

/**
 * Turn rewrites into "units" of speech to regenerate. With scope "sentence",
 * a rewrite is widened to its whole sentence so the cloned voice has natural
 * prosody, instead of splicing a lone synthetic word into real speech.
 */
export function buildUnits(words: Word[], edits: Edit[], duration: number, scope: Scope): Unit[] {
  const replaces = edits.filter((e) => e.kind === "replace");
  if (!replaces.length) return [];
  const cuts = cutPoints(words, duration);
  const sb = sentenceBounds(words);

  let ranges = replaces.map((e) => {
    if (scope === "words") return { from: e.from, to: e.to };
    let from = sb.start[e.from];
    let to = sb.end[e.to];
    if (to - from + 1 > MAX_UNIT_WORDS) {
      from = Math.max(from, e.from - 6);
      to = Math.min(to, e.to + 6);
    }
    return { from, to };
  });
  ranges.sort((a, b) => a.from - b.from);
  const merged: { from: number; to: number }[] = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r.from <= last.to) last.to = Math.max(last.to, r.to);
    else merged.push({ ...r });
  }
  ranges = merged;

  const idx = editIndex(words.length, edits);
  return ranges.map(({ from, to }) => {
    const parts: string[] = [];
    for (let i = from; i <= to; i++) {
      const e = idx[i];
      if (!e) parts.push(words[i].text);
      else if (e.kind === "replace" && i === Math.max(e.from, from)) parts.push(e.text);
    }
    return {
      from,
      to,
      text: parts.join(" ").replace(/\s+/g, " ").trim(),
      start: cuts[from],
      end: cuts[to + 1],
      speechStart: words[from].start,
      speechEnd: words[to].end,
    };
  });
}

export function buildPieces(
  words: Word[],
  edits: Edit[],
  duration: number,
  scope: Scope
): Piece[] {
  if (!words.length) return [{ kind: "keep", start: 0, end: duration }];
  const cuts = cutPoints(words, duration);
  const units = buildUnits(words, edits, duration, scope);
  const idx = editIndex(words.length, edits);
  const pieces: Piece[] = [];
  let u = 0;
  let i = 0;
  while (i < words.length) {
    if (u < units.length && units[u].from === i) {
      pieces.push({ kind: "unit", unit: units[u] });
      i = units[u].to + 1;
      u++;
      continue;
    }
    if (idx[i]?.kind === "delete") {
      i++;
      continue;
    }
    const last = pieces[pieces.length - 1];
    if (last && last.kind === "keep" && Math.abs(last.end - cuts[i]) < 1e-6) last.end = cuts[i + 1];
    else pieces.push({ kind: "keep", start: cuts[i], end: cuts[i + 1] });
    i++;
  }
  return pieces.filter((p) => p.kind === "unit" || p.end - p.start > 0.02);
}

/** Original-time ranges that playback should jump over (deleted material). */
export function skipRanges(pieces: Piece[], duration: number): [number, number][] {
  const covered = pieces.map((p) => (p.kind === "keep" ? [p.start, p.end] : [p.unit.start, p.unit.end]));
  const out: [number, number][] = [];
  let t = 0;
  for (const [s, e] of covered) {
    if (s - t > 0.02) out.push([t, s]);
    t = Math.max(t, e);
  }
  if (duration - t > 0.02) out.push([t, duration]);
  return out;
}

export function estimateUnitSeconds(u: Unit, ttsDuration?: number): number {
  const speech = ttsDuration ?? Math.max(u.speechEnd - u.speechStart, u.text.length * 0.065);
  return u.speechStart - u.start + speech + (u.end - u.speechEnd);
}

export function editedDuration(
  pieces: Piece[],
  ttsDur: (text: string) => number | undefined
): number {
  let d = 0;
  for (const p of pieces) {
    if (p.kind === "keep") d += p.end - p.start;
    else d += estimateUnitSeconds(p.unit, ttsDur(p.unit.text));
  }
  return d;
}

export const lipSyncFps = (sourceFps: number) => Math.min(sourceFps || 30, 30);

export function estimateCredits(
  units: Unit[],
  fps: number,
  mode: LipSyncMode,
  ttsDur: (text: string) => number | undefined
): number {
  const perFrame = mode === "pro" ? 2 : 1;
  let credits = 0;
  for (const u of units) {
    credits += Math.ceil(estimateUnitSeconds(u, ttsDur(u.text)) * lipSyncFps(fps)) * perFrame;
    credits += Math.ceil(u.text.length * 0.1);
  }
  return credits;
}

export function formatTime(t: number, tenths = false): string {
  if (!isFinite(t) || t < 0) t = 0;
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return tenths ? `${m}:${s.toFixed(1).padStart(4, "0")}` : `${m}:${Math.floor(s).toString().padStart(2, "0")}`;
}
