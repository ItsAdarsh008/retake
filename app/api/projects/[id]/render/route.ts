import { NextResponse } from "next/server";
import { readJob, readProject, updateProject } from "@/lib/server/store";
import { liveJob, startRender } from "@/lib/server/render";
import { cleanEdits } from "@/lib/server/edits";
import type { LipSyncMode, Scope } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const mode: LipSyncMode = ["lite", "standard", "pro"].includes(body.mode) ? body.mode : "standard";
  const scope: Scope = body.scope === "words" ? "words" : "sentence";
  const existing = await readProject(id);
  if (!existing || existing.status !== "ready") return NextResponse.json({ error: "Project isn't ready" }, { status: 400 });
  const p = await updateProject(id, (pp) => {
    if (body.edits) pp.edits = cleanEdits(body.edits, pp.words.length);
  });
  if (!p.edits.length) return NextResponse.json({ error: "Make an edit first" }, { status: 400 });
  const job = await startRender(p, mode, scope);
  return NextResponse.json(job);
}

export async function GET(req: Request, { params }: Ctx) {
  const { id } = await params;
  const jobId = new URL(req.url).searchParams.get("job") || "";
  const job = liveJob(jobId) ?? (await readJob(id, jobId).catch(() => null));
  if (!job || job.projectId !== id) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(job);
}
