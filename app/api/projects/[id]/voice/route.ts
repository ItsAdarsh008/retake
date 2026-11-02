import { NextResponse } from "next/server";
import { synthesize, voiceKey } from "@/lib/server/voice";
import { allowance, record } from "@/lib/server/budget";
import { env } from "@/lib/server/env";
import { ownedProject, visitorOf } from "@/lib/server/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Generates (or returns cached) cloned-voice audio for one rewritten line.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { text: raw } = await req.json().catch(() => ({}));
  if (typeof raw !== "string" || !raw.trim()) return NextResponse.json({ error: "No text" }, { status: 400 });
  const text = raw.trim().slice(0, 1000);
  const p = await ownedProject(req, id);
  if (!p) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const visitor = visitorOf(req);
  if (env.magicHourKey) {
    const a = await allowance(visitor);
    if (a && a.left < Math.ceil(text.length * 0.1))
      return NextResponse.json({ error: "Today's free voice and lip sync on this site is used up. It resets at midnight UTC." }, { status: 429 });
  }
  try {
    const v = await synthesize(p, text);
    if (v.fresh && v.credits) await record(visitor, v.credits);
    return NextResponse.json({
      duration: v.duration,
      demo: v.demo,
      url: `/api/projects/${id}/file/voice/${voiceKey(text)}.wav`,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Voice generation failed" }, { status: 502 });
  }
}
