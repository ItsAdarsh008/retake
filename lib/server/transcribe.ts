import fs from "node:fs/promises";
import { env } from "./env";
import { normWord } from "../timeline";
import type { Paragraph, Word } from "../types";

type WhisperWord = { word: string; start: number; end: number };
type WhisperSegment = { start: number; end: number; text: string };

const OPENAI_LIMIT = 25 * 1024 * 1024;

export async function whisper(audioFile: string): Promise<{ words: Word[]; paragraphs: Paragraph[] }> {
  const buf = await fs.readFile(audioFile);
  if (buf.byteLength > OPENAI_LIMIT) {
    throw new Error("This video's audio is over OpenAI's 25 MB limit (roughly 70+ minutes). Trim it and try again.");
  }
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(buf)], { type: "audio/mpeg" }), "audio.mp3");
  form.append("model", env.whisperModel);
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "word");
  form.append("timestamp_granularities[]", "segment");

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.openaiKey}` },
    body: form,
  });
  if (!res.ok) {
    const body = await res.text();
    let msg = body;
    try {
      msg = JSON.parse(body).error?.message ?? body;
    } catch {}
    if (res.status === 401) msg = "OpenAI rejected the API key. Check OPENAI_API_KEY in .env.local.";
    if (res.status === 429) msg = "OpenAI says the account is out of credit or rate-limited. Check billing at platform.openai.com.";
    throw new Error(`Transcription failed: ${msg}`);
  }
  const data = await res.json();
  return align(data.words ?? [], data.segments ?? []);
}

/**
 * Whisper's word list has timings but no punctuation; its segments have
 * punctuation but only coarse timing. Walk them together so every word gets
 * both.
 */
export function align(raw: WhisperWord[], segments: WhisperSegment[]) {
  const words: Word[] = [];
  let wi = 0;
  const pushWord = (text: string, w: WhisperWord) => {
    const start = Math.max(0, w.start);
    const end = Math.max(start + 0.04, w.end);
    words.push({ i: words.length, text, start, end });
  };

  for (const seg of segments) {
    const segWords: WhisperWord[] = [];
    while (wi < raw.length && (raw[wi].start + raw[wi].end) / 2 <= seg.end + 0.05) segWords.push(raw[wi++]);
    const tokens = seg.text.trim().split(/\s+/).filter(Boolean);
    if (tokens.length === segWords.length) {
      segWords.forEach((w, k) => pushWord(tokens[k], w));
      continue;
    }
    let t = 0;
    for (const w of segWords) {
      const target = normWord(w.word);
      let found = -1;
      for (let k = t; k < Math.min(tokens.length, t + 4); k++) {
        if (normWord(tokens[k]) === target) {
          found = k;
          break;
        }
      }
      if (found >= 0) {
        pushWord(tokens[found], w);
        t = found + 1;
      } else pushWord(w.word.trim(), w);
    }
  }
  while (wi < raw.length) pushWord(raw[wi].word.trim(), raw[wi++]);
  return { words: words.filter((w) => w.text), paragraphs: paragraphsFor(words) };
}

export function paragraphsFor(words: Word[]): Paragraph[] {
  const out: Paragraph[] = [];
  let from = 0;
  for (let i = 0; i < words.length; i++) {
    const gap = i + 1 < words.length ? words[i + 1].start - words[i].end : Infinity;
    const ends = /[.?!]["'”’)]*$/.test(words[i].text);
    const len = i - from + 1;
    if (gap === Infinity || gap > 1.6 || (ends && (gap > 0.9 || len > 60)) || len > 120) {
      out.push({ from, to: i });
      from = i + 1;
    }
  }
  return out;
}

const DEMO_LINES = [
  "This is a demo transcript, because no OpenAI key is set yet.",
  "Every word here is timed against your video, so clicking one jumps playback to it.",
  "Try selecting a few words and pressing delete to cut them out.",
  "Or select a phrase, start typing, and rewrite what was said.",
  "Add your keys to the env file to get a real transcript and real lip sync.",
];

/** Evenly timed placeholder words so the editor is usable without an OpenAI key. */
export function demoTranscript(duration: number) {
  const words: Word[] = [];
  let t = 0.4;
  let line = 0;
  while (t < duration - 0.5) {
    for (const tok of DEMO_LINES[line % DEMO_LINES.length].split(" ")) {
      const len = 0.18 + Math.min(tok.length, 10) * 0.035;
      if (t + len > duration - 0.2) break;
      words.push({ i: words.length, text: tok, start: t, end: t + len });
      t += len + 0.07;
    }
    t += 1.0;
    line++;
  }
  return { words, paragraphs: paragraphsFor(words) };
}
