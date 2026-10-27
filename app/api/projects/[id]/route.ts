import { NextResponse } from "next/server";
import { deleteProject, readJob, readProject, updateProject } from "@/lib/server/store";
import { cleanEdits } from "@/lib/server/edits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function GET(_: Request, { params }: Ctx) {
  const { id } = await params;
  const p = await readProject(id).catch(() => null);
  if (!p) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const lastRender = p.lastRenderId ? await readJob(id, p.lastRenderId) : null;
  return NextResponse.json({ ...p, lastRender });
}

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const p = await updateProject(id, (pp) => {
    if (body.edits) pp.edits = cleanEdits(body.edits, pp.words.length);
    if (typeof body.name === "string" && body.name.trim()) pp.name = body.name.trim().slice(0, 80);
  }).catch(() => null);
  if (!p) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_: Request, { params }: Ctx) {
  const { id } = await params;
  await deleteProject(id);
  return NextResponse.json({ ok: true });
}
