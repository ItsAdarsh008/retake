import { env } from "./env";
import { normWord } from "../timeline";
import type { Edit, Suggestion, Word } from "../types";

const FILLERS = new Set(["um", "uh", "umm", "uhh", "erm", "er", "hmm", "mm", "ah"]);

/** Offline fallback: obvious fillers and immediate word repeats ("the the"). */
export function heuristicCleanup(words: Word[]): Suggestion[] {
  const out: Suggestion[] = [];
  for (let i = 0; i < words.length; i++) {
    const w = normWord(words[i].text);
    if (FILLERS.has(w)) out.push({ from: i, to: i, reason: "filler" });
    else if (i > 0 && w && w === normWord(words[i - 1].text) && !/[.?!,]$/.test(words[i - 1].text))
      out.push({ from: i - 1, to: i - 1, reason: "repeat" });
  }
  return out;
}

const PROMPT = `You are cleaning up a spoken-word transcript for a video edit. Each word is shown as index:word.
Find spans that a careful editor would cut so the speech reads cleanly WITHOUT changing meaning:
- filler words and sounds (um, uh, erm, hmm; "like", "you know", "I mean", "sort of", "basically" ONLY when used as verbal filler)
- stutters and immediate repeats ("I I think", "the the")
- false starts, where the speaker abandons a phrase and restarts it (cut the abandoned part)
Never cut content words that carry meaning. Be conservative: when unsure, leave it.
Reply with ONLY JSON: {"cuts":[{"from":<first index>,"to":<last index>,"reason":"filler"|"repeat"|"false start"}]}`;

export async function claudeCleanup(words: Word[], skip: Edit[], apiKey: string): Promise<Suggestion[]> {
  if (!apiKey) return heuristicCleanup(words);
  const taken = new Set<number>();
  for (const e of skip) for (let i = e.from; i <= e.to; i++) taken.add(i);

  const CHUNK = 700;
  const all: Suggestion[] = [];
  for (let s = 0; s < words.length; s += CHUNK) {
    const chunk = words.slice(s, s + CHUNK);
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: env.anthropicModel,
        max_tokens: 4000,
        system: PROMPT,
        messages: [{ role: "user", content: chunk.map((w) => `${w.i}:${w.text}`).join(" ") }],
      }),
    });
    if (!res.ok) {
      const t = await res.text();
      let msg = t;
      try {
        msg = JSON.parse(t).error?.message ?? t;
      } catch {}
      if (res.status === 401) msg = "Anthropic rejected the API key. Check it under Keys.";
      throw new Error(`Claude couldn't review the transcript: ${msg}`);
    }
    const data = await res.json();
    const text: string = data.content?.map((c: any) => c.text ?? "").join("") ?? "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) continue;
    let cuts: any[] = [];
    try {
      cuts = JSON.parse(match[0]).cuts ?? [];
    } catch {
      continue;
    }
    for (const c of cuts) {
      const from = Number(c.from);
      const to = Number(c.to ?? c.from);
      if (!Number.isInteger(from) || !Number.isInteger(to) || from > to) continue;
      if (from < s || to >= s + chunk.length || to - from > 25) continue;
      let clash = false;
      for (let i = from; i <= to; i++) if (taken.has(i)) clash = true;
      if (!clash) all.push({ from, to, reason: String(c.reason || "filler") });
    }
  }
  return all.sort((a, b) => a.from - b.from);
}
