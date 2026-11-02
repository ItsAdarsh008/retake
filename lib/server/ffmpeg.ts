import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";

const require = createRequire(import.meta.url);

function resolveBin(envVar: string, load: () => string | undefined, fallback: string) {
  if (process.env[envVar]) return process.env[envVar] as string;
  try {
    const p = load();
    if (p && fs.existsSync(p)) return p;
  } catch {}
  return fallback;
}

export const FFMPEG = resolveBin("FFMPEG_PATH", () => {
  const m = require("ffmpeg-static");
  return m?.default ?? m;
}, "ffmpeg");
export const FFPROBE = resolveBin("FFPROBE_PATH", () => require("ffprobe-static")?.path, "ffprobe");

export function run(bin: string, args: string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    const out: Buffer[] = [];
    let err = "";
    p.stdout.on("data", (d) => out.push(d));
    p.stderr.on("data", (d) => {
      err += d.toString();
      if (err.length > 20000) err = err.slice(-20000);
    });
    p.on("error", reject);
    p.on("close", (code) => {
      if (code === 0) resolve(Buffer.concat(out));
      else reject(new Error(`${bin.split(/[\\/]/).pop()} exited ${code}: ${err.split("\n").slice(-6).join(" ").trim()}`));
    });
  });
}

export const ffmpeg = (args: string[]) => run(FFMPEG, ["-hide_banner", "-loglevel", "error", "-y", ...args]);

/** Integrated loudness in LUFS of a file's audio (optionally a window of it), or null if silent or unreadable. */
export async function loudness(file: string, start = 0, dur?: number): Promise<number | null> {
  try {
    const out = await run(FFMPEG, [
      "-hide_banner", "-loglevel", "error", "-ss", start.toFixed(3), ...(dur ? ["-t", dur.toFixed(3)] : []), "-i", file, "-vn",
      "-af", "ebur128=metadata=1,ametadata=print:key=lavfi.r128.I:file=-", "-f", "null", "-",
    ]);
    const all = [...out.toString().matchAll(/lavfi\.r128\.I=(-?[\d.]+)/g)];
    const v = all.length ? Number(all[all.length - 1][1]) : NaN;
    return Number.isFinite(v) && v > -70 ? v : null;
  } catch {
    return null;
  }
}

/** Seconds (from `start`) where the picture changes abruptly: a hard cut, or a whip or flash transition. */
export async function sceneCuts(file: string, start: number, dur: number, threshold = 10): Promise<number[]> {
  try {
    const out = await run(FFMPEG, [
      "-hide_banner", "-loglevel", "error", "-ss", start.toFixed(3), "-t", dur.toFixed(3), "-i", file, "-an",
      "-vf", `scdet=threshold=${threshold},metadata=select:key=lavfi.scd.time,metadata=print:file=-`,
      "-f", "null", "-",
    ]);
    return [...out.toString().matchAll(/lavfi\.scd\.time=([\d.]+)/g)].map((m) => Number(m[1]));
  } catch {
    return [];
  }
}

export type Probe = {
  duration: number;
  width: number;
  height: number;
  fps: number;
  hasAudio: boolean;
  videoCodec: string;
};

export async function probe(file: string): Promise<Probe> {
  const out = await run(FFPROBE, [
    "-v", "error", "-print_format", "json", "-show_streams", "-show_format", file,
  ]);
  const j = JSON.parse(out.toString());
  const v = j.streams.find((s: any) => s.codec_type === "video");
  const a = j.streams.find((s: any) => s.codec_type === "audio");
  const rate = (r?: string) => {
    if (!r) return 0;
    const [n, d] = r.split("/").map(Number);
    return d ? n / d : n;
  };
  let fps = rate(v?.avg_frame_rate) || rate(v?.r_frame_rate) || 30;
  if (fps > 120) fps = 30;
  let width = v?.width ?? 0;
  let height = v?.height ?? 0;
  const rot = Math.abs(Number(v?.tags?.rotate ?? v?.side_data_list?.find((s: any) => s.rotation != null)?.rotation ?? 0));
  if (rot === 90 || rot === 270) [width, height] = [height, width];
  return {
    duration: Number(j.format?.duration ?? v?.duration ?? 0),
    width,
    height,
    fps: Math.round(fps * 1000) / 1000,
    hasAudio: !!a,
    videoCodec: v?.codec_name ?? "",
  };
}

export async function audioDuration(file: string): Promise<number> {
  const out = await run(FFPROBE, ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]);
  return Number(out.toString().trim()) || 0;
}

/** Downsampled absolute-peak envelope for drawing a waveform. */
export async function peaks(file: string, buckets = 1600): Promise<number[]> {
  const raw = await run(FFMPEG, [
    "-hide_banner", "-loglevel", "error", "-i", file, "-vn", "-ac", "1", "-ar", "4000", "-f", "s16le", "-",
  ]);
  const samples = new Int16Array(raw.buffer, raw.byteOffset, Math.floor(raw.byteLength / 2));
  if (!samples.length) return [];
  const n = Math.min(buckets, samples.length);
  const size = samples.length / n;
  const out: number[] = [];
  let max = 1;
  for (let b = 0; b < n; b++) {
    let m = 0;
    const s0 = Math.floor(b * size);
    const s1 = Math.floor((b + 1) * size);
    for (let s = s0; s < s1; s++) {
      const v = Math.abs(samples[s]);
      if (v > m) m = v;
    }
    out.push(m);
    if (m > max) max = m;
  }
  return out.map((v) => Math.round((v / max) * 1000) / 1000);
}
