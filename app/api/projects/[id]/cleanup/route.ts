import { NextResponse } from "next/server";
import { readProject } from "@/lib/server/store";
import { claudeCleanup } from "@/lib/server/cleanup";
import { env } from "@/lib/server/env";
import { cleanEdits } from "@/lib/server/edits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await readProject(id);
  if (!p) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  const edits = cleanEdits(body.edits ?? p.edits, p.words.length);
  try {
    const suggestions = await claudeCleanup(p.words, edits);
    const taken = new Set<number>();
    for (const e of edits) for (let i = e.from; i <= e.to; i++) taken.add(i);
    return NextResponse.json({
      source: env.anthropicKey ? "claude" : "basic",
      suggestions: suggestions.filter((s) => ![...Array(s.to - s.from + 1)].some((_, k) => taken.has(s.from + k))),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Cleanup failed" }, { status: 502 });
  }
}
