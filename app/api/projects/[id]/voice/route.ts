import { NextResponse } from "next/server";
import { readProject } from "@/lib/server/store";
import { synthesize, voiceKey } from "@/lib/server/voice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Generates (or returns cached) cloned-voice audio for one rewritten line.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { text } = await req.json().catch(() => ({}));
  if (typeof text !== "string" || !text.trim()) return NextResponse.json({ error: "No text" }, { status: 400 });
  const p = await readProject(id);
  if (!p) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const v = await synthesize(p, text.trim().slice(0, 1000));
    return NextResponse.json({
      duration: v.duration,
      demo: v.demo,
      url: `/api/projects/${id}/file/voice/${voiceKey(text.trim().slice(0, 1000))}.wav`,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Voice generation failed" }, { status: 502 });
  }
}
