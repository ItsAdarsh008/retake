import data from "./data.json";
import { FPS } from "./theme";

// A vertical cut for Reels, Shorts and TikTok, about 45 seconds:
//
//   take       the original clip, frozen on the wrong words          (the hook)
//   edit       the real app: select them, type the fix
//   retake     the rendered clip says the new words, lips synced      (the payoff)
//   title      wordmark
//   steps      upload → delete to cut → hear it first → render         (how it works)
//   compare    before and after, side by side
//   end        wordmark, tagline, call to action
//
// Every time comes from the capture's markers and the transcript, so a new capture
// re-times the whole video.

export type Box = { x: number; y: number; w: number; h: number };
type Marker = { name: string; t: number; box: Box | null; [k: string]: unknown };
export type Word = { i?: number; text: string; start: number; end: number; rewrite?: number };
export type Clip = { from: number; to: number; speed: number };
export type Cam = { at: number; zoom: number; x: number; y: number };
export type Sfx = { at: number; src: string; volume: number };
export type AppBeat = {
  clips: Clip[];
  cams: Cam[];
  sfx: Sfx[];
  label: string;
  /** One line of explanation, shown beside the screen in the wide layout. */
  sub: string;
  step?: string;
  /** Plays the cloned voice this many seconds into the beat, for this long. */
  voice?: { at: number; len: number };
  /** A tag where a wait was cut out ("5 minutes later"). */
  jump?: { at: number; label: string };
};

const markers = data.capture.markers as Marker[];
const all = (name: string) => {
  const m = markers.filter((x) => x.name === name);
  if (!m.length) throw new Error(`Capture has no "${name}" marker`);
  return m;
};
const first = (name: string) => all(name)[0];
const last = (name: string) => all(name)[all(name).length - 1];

export const VIEW = data.capture.view;
export const original = data.original;
export const sentence = data.sentence as Word[];
export const rewrites = data.rewrites as { from: number; to: number; text: string }[];
/** The last rewrite is the correction the video is about; the others fix what Whisper misheard. */
export const correction = rewrites[rewrites.length - 1];
export const afterWords = data.afterWords as Word[];
export const voiceDuration = data.voiceDuration as number;

const sec = (s: number) => Math.round(s * FPS);
export const clipsLength = (clips: Clip[]) => clips.reduce((s, c) => s + (c.to - c.from) / c.speed, 0);
/** Beat-local seconds for a moment in the screen recording. */
function local(clips: Clip[], src: number) {
  let acc = 0;
  for (const c of clips) {
    if (src >= c.from && src <= c.to) return acc + (src - c.from) / c.speed;
    acc += (c.to - c.from) / c.speed;
  }
  return -1;
}
const sfxAt = (clips: Clip[], list: [number, string, number][]): Sfx[] =>
  list.map(([s, src, volume]) => ({ at: local(clips, s), src, volume })).filter((x) => x.at >= 0);
const center = (b: Box | null) => (b ? { x: b.x + b.w / 2, y: b.y + b.h / 2 } : { x: VIEW.width / 2, y: VIEW.height / 2 });

// How capture.mjs selects a phrase: click the first word, shift-click the last, wait
// (0.6 s before a rewrite, 0.7 s before a cut), then log the marker. These undo that.
const clicksBefore = (marker: number, wait: number) => {
  const second = marker - wait - 0.08;
  return { first: second - 1.07, second };
};
const KEY_GAP = 0.115; // average gap between typed letters

const CLICK = "sfx/mouse-click.wav";
const TICK = (t: number): [number, string, number] => [t, CLICK, 0.22];

// ---------------------------------------------------------------- take
const wrongEnd = sentence.find((w) => w.i === correction.to + 1) ?? sentence.find((w) => w.i === correction.to)!;
export const take = {
  words: sentence.filter((w) => w.i! <= wrongEnd.i!),
  /** Freeze just after the word that follows the mistake ("a few people|"). */
  freezeAt: wrongEnd.end + 0.04,
  hold: 0.85,
};

// ---------------------------------------------------------------- edit (real app)
const sel = last("rewrite-select");
const typed = last("rewrite-typed");
const applied = last("rewrite-applied");
const rwClicks = clicksBefore(sel.t, 0.6);
const typedEnd = sel.t + correction.text.length * KEY_GAP + 0.15;
const editClips: Clip[] = [
  { from: rwClicks.first - 0.5, to: rwClicks.second + 0.1, speed: 2.2 },
  { from: rwClicks.second + 0.1, to: sel.t - 0.05, speed: 3 },
  { from: sel.t - 0.05, to: typedEnd, speed: 1.1 }, // typing
  { from: typedEnd, to: typed.t - 0.1, speed: 3 },
  { from: typed.t - 0.1, to: applied.t + 0.8, speed: 1 }, // Enter, applied
];
const pop = center(typed.box);
export const edit: AppBeat = {
  label: "Type the fix",
  sub: "Select the words and type what you meant.",
  clips: editClips,
  cams: [
    { at: 0, zoom: 1, x: VIEW.width / 2, y: pop.y },
    { at: 2.5, zoom: 1.04, x: VIEW.width / 2, y: pop.y },
  ],
  sfx: sfxAt(editClips, [
    [rwClicks.first, CLICK, 0.5],
    [rwClicks.second, CLICK, 0.5],
    ...[...correction.text].map((_, k) => TICK(sel.t + k * KEY_GAP)),
    [typed.t, "sfx/ding.wav", 0.16],
  ]),
};

// ---------------------------------------------------------------- retake
// From the start of the clause holding the correction to the end of the first
// clause at least 3.5 s after it, so there's time to watch the lips.
const fixAt = afterWords.findIndex((w) => w.rewrite === correction.from);
const clauseEnd = (w: Word) => /[.,!?;:]$/.test(w.text);
let a = fixAt;
while (a > 0 && !clauseEnd(afterWords[a - 1])) a--;
let b = fixAt;
while (b < afterWords.length - 1 && !(clauseEnd(afterWords[b]) && afterWords[b].end >= afterWords[fixAt].start + 3.5)) b++;
export const retake = {
  words: afterWords.slice(a, b + 1),
  fix: afterWords[fixAt],
  from: a > 0 ? (afterWords[a - 1].end + afterWords[a].start) / 2 : afterWords[a].start,
  to: afterWords[b].end + 0.25,
  hold: 0.4,
};

// ---------------------------------------------------------------- steps (real app)
// 1. Upload: real time around the tap, fast-forward through processing.
const procFrom = first("processing").t + 0.6;
const procTo = first("transcript").t - 0.1;
const uploadClips: Clip[] = [
  { from: first("upload-click").t - 1.1, to: procFrom, speed: 1.2 },
  { from: procFrom, to: procTo, speed: Math.max(1, (procTo - procFrom) / 1.4) },
  { from: procTo, to: first("transcript").t + 1.6, speed: 1 },
];
const upload: AppBeat = {
  step: "1",
  label: "Upload a video",
  sub: "Every word is transcribed with its exact timing.",
  clips: uploadClips,
  cams: [{ at: 0, zoom: 1, x: VIEW.width / 2, y: VIEW.height / 2 }],
  sfx: sfxAt(uploadClips, [[first("upload-click").t - 0.02, CLICK, 0.5]]),
  jump: { at: local(uploadClips, procFrom), label: "Transcribed in seconds" },
};

// 2. Cut: the first cut in the plan is the one shown.
const cs = first("cut-select");
const cutAt = first("cut").t;
const cutClicks = clicksBefore(cs.t, 0.7);
const cutClips: Clip[] = [
  { from: cutClicks.first - 1.2, to: cutClicks.second + 0.1, speed: 1.9 },
  { from: cutClicks.second + 0.1, to: cutAt - 0.08, speed: 3 },
  { from: cutAt - 0.08, to: cutAt + 1.3, speed: 1 },
];
const cutBox = center(cs.box);
const cut: AppBeat = {
  step: "2",
  label: "Delete words to cut them",
  sub: "The cut lands in the natural pause between words.",
  clips: cutClips,
  cams: [
    { at: 0, zoom: 1, x: VIEW.width / 2, y: cutBox.y },
    { at: 2.4, zoom: 1.04, x: VIEW.width / 2, y: cutBox.y },
  ],
  sfx: sfxAt(cutClips, [
    [cutClicks.first, CLICK, 0.5],
    [cutClicks.second, CLICK, 0.5],
    [cutAt, "sfx/switch.wav", 0.5],
  ]),
};

// 3. Preview: the new line in the cloned voice, before any lip sync.
const pv = first("preview");
const hearLen = Math.min(voiceDuration, afterWords[fixAt].end + 1.8);
const previewClips: Clip[] = [{ from: pv.t - 1.3, to: pv.t + 0.15 + hearLen, speed: 1 }];
const preview: AppBeat = {
  step: "3",
  label: "Hear it in their voice",
  sub: "Preview the new line before anything renders.",
  clips: previewClips,
  cams: [
    { at: 0, zoom: 1.04, x: VIEW.width / 2, y: center(pv.box).y },
    { at: 3, zoom: 1, x: VIEW.width / 2, y: VIEW.height / 2 },
  ],
  sfx: sfxAt(previewClips, [[pv.t - 0.02, CLICK, 0.5]]),
  voice: { at: local(previewClips, pv.t + 0.15), len: hearLen },
};

// 4. Render: the wait for Magic Hour was paused out of the recording.
const rs = first("render-sheet").t;
const rStart = first("render-start").t;
const rDone = first("render-done");
const waited = Number(rDone.waitedSeconds ?? 0);
const renderClips: Clip[] = [
  { from: rs - 1.3, to: rs + 0.4, speed: 1.4 },
  { from: rs + 0.4, to: rStart - 0.7, speed: 3 },
  { from: rStart - 0.7, to: rStart + 1.3, speed: 1 },
  { from: rDone.t - 0.05, to: Math.min(first("end").t, rDone.t + 2.4), speed: 1 },
];
const render: AppBeat = {
  step: "4",
  label: "Render. Lips re-synced.",
  sub: "Magic Hour re-animates the mouth to match the new words.",
  clips: renderClips,
  cams: [{ at: 0, zoom: 1, x: VIEW.width / 2, y: VIEW.height / 2 }],
  sfx: sfxAt(renderClips, [
    [rs - 0.95, CLICK, 0.5],
    [rStart - 0.02, CLICK, 0.5],
    [rDone.t, "sfx/ding.wav", 0.14],
  ]),
  jump: {
    at: local(renderClips, rDone.t - 0.05),
    label: waited >= 90 ? `${Math.round(waited / 60)} minutes later` : `${Math.max(1, Math.round(waited))} seconds later`,
  },
};

export const steps = [upload, cut, preview, render];

// ---------------------------------------------------------------- compare
// Both versions from the top of the sentence to just after the corrected words.
const afterPeople = afterWords[Math.min(afterWords.length - 1, fixAt + 1)];
export const compare = {
  before: { from: 0, len: take.freezeAt },
  after: { from: 0, len: afterPeople.end + 0.1 },
  intro: 0.7,
  gap: 0.45,
  outro: 1.3,
};

// ---------------------------------------------------------------- lengths
export const DUR = {
  take: sec(take.freezeAt + take.hold),
  edit: sec(clipsLength(edit.clips)),
  retake: sec(retake.to - retake.from + retake.hold),
  title: sec(2.3),
  steps: steps.map((s) => sec(clipsLength(s.clips))),
  compare: sec(compare.intro + compare.before.len + compare.gap + compare.after.len + compare.outro),
  end: sec(3.2),
};
export const totalFrames =
  DUR.take + DUR.edit + DUR.retake + DUR.title + DUR.steps.reduce((s, x) => s + x, 0) + DUR.compare + DUR.end;
