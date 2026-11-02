// Gathers everything the Remotion composition needs from a capture run.
//
//   node scripts/prepare.mjs --data <RETAKE_DATA_DIR> [--capture capture]
//
// Copies the screen recording, the original clip, the rendered result and the
// cloned voice into public/, and writes src/data.json with timings.

import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { addAfterWords } from "./words.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith("--") ? [...acc, [a.slice(2), all[i + 1]]] : acc), [])
);
const CAPTURE = path.resolve(args.capture || path.join(root, "capture"));
const DATA = path.resolve(args.data || "");
const PUBLIC = path.join(root, "public");

const markers = JSON.parse(await fs.readFile(path.join(CAPTURE, "markers.json"), "utf8"));
const dir = path.join(DATA, "projects", markers.projectId);
// Read the project from the data folder rather than the capture snapshot, so a
// re-render after the capture is picked up.
const project = JSON.parse(await fs.readFile(path.join(dir, "project.json"), "utf8"));
const job = project.lastRenderId
  ? JSON.parse(await fs.readFile(path.join(dir, "renders", `${project.lastRenderId}.json`), "utf8"))
  : null;
if (job?.status !== "done" || !job.output) throw new Error("The captured project has no finished render.");

const probe = (file) =>
  Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]).toString().trim());

await fs.mkdir(PUBLIC, { recursive: true });
await fs.copyFile(path.join(CAPTURE, "screen.mp4"), path.join(PUBLIC, "screen.mp4"));
await fs.copyFile(path.join(dir, project.sourceFile), path.join(PUBLIC, "original.mp4"));
await fs.copyFile(path.join(dir, job.output), path.join(PUBLIC, "edited.mp4"));

// The newest cloned-voice clip is the one for the final wording of the line.
const voices = [];
for (const f of await fs.readdir(path.join(dir, "voice"))) {
  if (!/^[a-f0-9]{16}\.wav$/.test(f)) continue;
  voices.push({ f, t: (await fs.stat(path.join(dir, "voice", f))).mtimeMs });
}
voices.sort((a, b) => b.t - a.t);
await fs.copyFile(path.join(dir, "voice", voices[0].f), path.join(PUBLIC, "voice.wav"));
const voiceDuration = probe(path.join(PUBLIC, "voice.wav"));

// The re-voiced sentence: from the first word to the end of the sentence holding the last rewrite.
const words = project.words;
const rewrites = project.edits.filter((e) => e.kind === "replace");
const lastTo = Math.max(...rewrites.map((e) => e.to));
let end = lastTo;
while (end < words.length - 1 && !/[.?!]["')]*$/.test(words[end].text)) end++;
const firstFrom = Math.min(...rewrites.map((e) => e.from));
let start = firstFrom;
while (start > 0 && !/[.?!]["')]*$/.test(words[start - 1].text)) start--;
const sentence = words.slice(start, end + 1);
const gapAfter = end + 1 < words.length ? (words[end].end + words[end + 1].start) / 2 : words[end].end + 0.3;
// Stop before a transition at the end of the sentence, so the panel doesn't freeze on a blurred frame.
const sStart = Math.max(0, sentence[0].start - 0.15);
const cuts = execFileSync(
  "ffmpeg",
  ["-hide_banner", "-loglevel", "error", "-ss", String(sStart), "-t", String(gapAfter - sStart + 0.3), "-i", path.join(dir, project.sourceFile),
   "-an", "-vf", "scdet=threshold=10,metadata=select:key=lavfi.scd.time,metadata=print:file=-", "-f", "null", "-"]
)
  .toString()
  .match(/lavfi\.scd\.time=[\d.]+/g)
  ?.map((s) => sStart + Number(s.split("=")[1])) ?? [];
const tailCut = cuts.find((c) => c > words[end].end - 0.6);
const before = { start: sStart, end: tailCut ? Math.min(gapAfter, tailCut - 0.08) : gapAfter };
// Nothing before the sentence was cut, so in the edited video the line starts at the same
// place and runs as long as the cloned voice plus the original pauses around it.
const after = {
  start: before.start,
  end: gapAfter - (sentence[sentence.length - 1].end - sentence[0].start) + voiceDuration,
};

const data = {
  capture: markers,
  sentence: sentence.map((w) => ({ i: w.i, text: w.text, start: w.start, end: w.end })),
  rewrites,
  before,
  after,
  voiceDuration,
  original: { duration: project.duration, width: project.width, height: project.height },
  edited: { duration: probe(path.join(PUBLIC, "edited.mp4")) },
  credits: job.creditsCharged,
};
await fs.writeFile(path.join(root, "src", "data.json"), JSON.stringify(data, null, 2));
console.log(`Prepared: sentence ${before.start.toFixed(2)}–${before.end.toFixed(2)}s, after ends ${after.end.toFixed(2)}s, voice ${voiceDuration.toFixed(2)}s`);

// Caption timings for the corrected line.
await addAfterWords(root);

// Sound effects (public/ is git-ignored, so fetch any that are missing).
await fs.mkdir(path.join(PUBLIC, "sfx"), { recursive: true });
for (const name of ["mouse-click", "whoosh", "record-scratch", "ding", "switch"]) {
  const file = path.join(PUBLIC, "sfx", `${name}.wav`);
  if (await fs.stat(file).catch(() => null)) continue;
  const res = await fetch(`https://remotion.media/${name}.wav`);
  if (!res.ok) throw new Error(`Couldn't download the ${name} sound (${res.status})`);
  await fs.writeFile(file, Buffer.from(await res.arrayBuffer()));
}
