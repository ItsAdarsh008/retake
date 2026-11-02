import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { env } from "./env";
import { audioDuration, ffmpeg, loudness } from "./ffmpeg";
import { projectDir } from "./store";
import * as mh from "./magichour";
import type { Project } from "../types";
import { replaceFile } from "./files";

/** `fresh` is true only when this call generated the clip, so its credits were just spent. */
export type Voice = { file: string; duration: number; credits: number; demo: boolean; fresh: boolean };

export const voiceKey = (text: string) =>
  crypto.createHash("sha1").update(text.trim()).digest("hex").slice(0, 16);

const inflight = new Map<string, Promise<Voice>>();

/** How loud the speaker is in the original footage, measured once per project. */
const reference = new Map<string, Promise<number | null>>();
function speakerLoudness(p: Project) {
  let r = reference.get(p.id);
  if (!r) {
    const start = Math.max(0, (p.words[0]?.start ?? 0) - 0.2);
    r = loudness(path.join(projectDir(p.id), p.sourceFile), start, 45);
    reference.set(p.id, r);
  }
  return r;
}
const SAMPLE_TTL = 60 * 60 * 1000;

/** Up to ~45s of the speaker, used as the voice-clone reference. */
async function voiceSample(p: Project): Promise<string> {
  const dir = path.join(projectDir(p.id), "voice");
  const metaFile = path.join(dir, "sample.json");
  try {
    const meta = JSON.parse(await fs.readFile(metaFile, "utf8"));
    if (Date.now() - meta.at < SAMPLE_TTL) return meta.filePath;
  } catch {}
  const local = path.join(dir, "sample.mp3");
  const start = Math.max(0, (p.words[0]?.start ?? 0) - 0.2);
  await ffmpeg([
    "-ss", String(start), "-t", "45", "-i", path.join(projectDir(p.id), p.sourceFile),
    "-vn", "-ac", "1", "-ar", "44100", "-b:a", "128k", local,
  ]);
  const filePath = await mh.upload(local, "audio");
  await fs.writeFile(metaFile, JSON.stringify({ filePath, at: Date.now() }));
  return filePath;
}

/** Speech for `text` in the speaker's cloned voice, cached per project. */
export function synthesize(p: Project, text: string): Promise<Voice> {
  const key = `${p.id}:${voiceKey(text)}`;
  const existing = inflight.get(key);
  if (existing) return existing;
  const job = doSynthesize(p, text).finally(() => setTimeout(() => inflight.delete(key), 1000));
  inflight.set(key, job);
  return job;
}

async function doSynthesize(p: Project, text: string): Promise<Voice> {
  const dir = path.join(projectDir(p.id), "voice");
  await fs.mkdir(dir, { recursive: true });
  const id = voiceKey(text);
  const out = path.join(dir, `${id}.wav`);
  const metaFile = path.join(dir, `${id}.json`);
  try {
    const meta = JSON.parse(await fs.readFile(metaFile, "utf8"));
    await fs.access(out);
    return { ...meta, file: out, fresh: false };
  } catch {}

  const demo = !env.magicHourKey;
  let credits = 0;
  if (demo) {
    // No Magic Hour key: a soft placeholder tone with a plausible speaking length.
    const d = Math.max(0.5, text.length * 0.062);
    await ffmpeg([
      "-f", "lavfi", "-i", `sine=frequency=330:duration=${d.toFixed(2)}`,
      "-af", "volume=0.12,afade=t=in:d=0.05,afade=t=out:st=" + Math.max(0, d - 0.08).toFixed(2) + ":d=0.08",
      "-ar", "48000", "-ac", "1", out,
    ]);
  } else {
    const sample = await voiceSample(p);
    const created = await mh.createVoiceClone(sample, text, `Retake · ${p.name}`.slice(0, 80));
    const done = await mh.waitFor("audio", created.id, undefined, 5 * 60 * 1000);
    credits = done.credits || created.credits_charged;
    const raw = path.join(dir, `${id}.raw${path.extname(new URL(done.url).pathname) || ".mp3"}`);
    await mh.download(done.url, raw);
    // Trim the clone's leading/trailing silence so we control the pauses.
    await ffmpeg([
      "-i", raw,
      "-af",
      "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.03,areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.05,areverse",
      "-ar", "48000", "-ac", "1", out,
    ]);
    await fs.rm(raw, { force: true });

    // Clones come back several dB quieter than the footage they replace, so the
    // rewritten line would dip. Match it to the speaker's original level.
    const [target, got] = await Promise.all([speakerLoudness(p), loudness(out)]);
    if (target !== null && got !== null && Math.abs(target - got) > 0.5) {
      const gain = Math.max(-12, Math.min(15, target - got));
      const tmp = `${out}.level.wav`;
      await ffmpeg(["-i", out, "-af", `volume=${gain.toFixed(2)}dB,alimiter=limit=0.97:level=false`, "-ar", "48000", "-ac", "1", tmp]);
      await replaceFile(tmp, out);
    }
  }
  const duration = await audioDuration(out);
  const meta = { duration, credits, demo };
  await fs.writeFile(metaFile, JSON.stringify(meta));
  return { ...meta, file: out, fresh: true };
}
