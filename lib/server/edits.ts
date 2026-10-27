import { sortEdits } from "../timeline";
import type { Edit } from "../types";

export function cleanEdits(raw: unknown, n: number): Edit[] {
  if (!Array.isArray(raw)) return [];
  const out: Edit[] = [];
  for (const e of raw) {
    const from = Number(e?.from);
    const to = Number(e?.to);
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to >= n || from > to) continue;
    if (e.kind === "delete") out.push({ kind: "delete", from, to });
    else if (e.kind === "replace" && typeof e.text === "string" && e.text.trim())
      out.push({ kind: "replace", from, to, text: e.text.trim().slice(0, 900) });
  }
  return sortEdits(out);
}
