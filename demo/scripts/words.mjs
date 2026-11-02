// Times each word of the corrected line in the rendered video, so the demo can
// caption it karaoke-style. prepare.mjs runs this; it can also run on its own:
//
//   OPENAI_API_KEY=sk-... node scripts/words.mjs
//
// Reads src/data.json and public/edited.mp4, adds `afterWords` to src/data.json.
// With a key, Whisper hears the new line (well under a cent). Without one, the
// words are spread over the line by length, which is close enough for captions.

import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** The sentence as it reads after the edits, each token tagged with the rewrite it came from. */
function editedTokens(sentence, rewrites) {
  const out = [];
  for (const w of sentence) {
    const r = rewrites.find((r) => w.i >= r.from && w.i <= r.to);
    if (!r) {
      out.push({ text: w.text });
      continue;
    }
    if (w.i !== r.from) continue;
    const toks = r.text.split(/\s+/).filter(Boolean);
    // Keep the trailing punctuation of the words that were replaced ("few," → "three,").
    const tail = sentence.find((x) => x.i === r.to)?.text.match(/[.,!?;:]+$/)?.[0] ?? "";
    toks.forEach((tok, k) => out.push({ text: k === toks.length - 1 ? tok + tail : tok, rewrite: r.from }));
  }
  return out;
}

async function whisper(file, key) {
  const form = new FormData();
  form.append("file", new Blob([await fs.readFile(file)]), path.basename(file));
  form.append("model", "whisper-1");
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "word");
  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });
  if (!res.ok) throw new Error(`Whisper returned ${res.status}`);
  return (await res.json()).words ?? [];
}

/** Give every token a start and end: matched ones from what was heard, the rest spread over the gaps. */
function align(tokens, heard, from, to) {
  let p = 0;
  for (const t of tokens) {
    for (let k = p; k < Math.min(heard.length, p + 4); k++) {
      if (norm(heard[k].word) === norm(t.text)) {
        t.start = from + heard[k].start;
        t.end = from + heard[k].end;
        p = k + 1;
        break;
      }
    }
  }
  for (let k = 0; k < tokens.length; k++) {
    if (tokens[k].start !== undefined) continue;
    let j = k;
    while (j < tokens.length && tokens[j].start === undefined) j++;
    const a = k ? tokens[k - 1].end : from;
    const b = j < tokens.length ? tokens[j].start : to;
    const weights = tokens.slice(k, j).map((t) => t.text.length + 2);
    const total = weights.reduce((s, x) => s + x, 0);
    let at = a;
    for (let m = k; m < j; m++) {
      const len = (Math.max(0, b - a) * weights[m - k]) / total;
      tokens[m].start = at;
      tokens[m].end = at + len;
      at += len;
    }
    k = j - 1;
  }
  return tokens.map((t) => ({ ...t, start: +t.start.toFixed(3), end: +t.end.toFixed(3) }));
}

export async function addAfterWords(root, key = process.env.OPENAI_API_KEY || process.env.CAPTURE_OPENAI_KEY) {
  const dataFile = path.join(root, "src", "data.json");
  const data = JSON.parse(await fs.readFile(dataFile, "utf8"));
  const tokens = editedTokens(data.sentence, data.rewrites);
  const { start, end } = data.after;
  let heard = [];
  if (key) {
    const wav = path.join(root, "out", "after-line.wav");
    await fs.mkdir(path.dirname(wav), { recursive: true });
    execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-ss", String(start), "-t", String(end - start + 1.2),
      "-i", path.join(root, "public", "edited.mp4"), "-vn", "-ac", "1", "-ar", "16000", wav]);
    heard = await whisper(wav, key);
    await fs.rm(wav, { force: true });
  }
  data.afterWords = align(tokens, heard, start, end);
  await fs.writeFile(dataFile, JSON.stringify(data, null, 2));
  const matched = heard.length ? "from Whisper" : "spread by length (no OpenAI key)";
  console.log(`Timed ${data.afterWords.length} words of the corrected line, ${matched}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await addAfterWords(path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."));
}
