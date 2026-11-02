import { NextResponse } from "next/server";
import { deleteProject, readJob, updateProject } from "@/lib/server/store";
import { cleanEdits } from "@/lib/server/edits";
import { ownedProject } from "@/lib/server/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

const notFound = () => NextResponse.json({ error: "Not found" }, { status: 404 });

export async function GET(req: Request, { params }: Ctx) {
  const { id } = await params;
  const p = await ownedProject(req, id);
  if (!p) return notFound();
  const { owner: _owner, ...rest } = p;
  const lastRender = p.lastRenderId ? await readJob(id, p.lastRenderId) : null;
  return NextResponse.json({ ...rest, lastRender });
}

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!(await ownedProject(req, id))) return notFound();
  const body = await req.json().catch(() => ({}));
  const p = await updateProject(id, (pp) => {
    if (body.edits) pp.edits = cleanEdits(body.edits, pp.words.length);
    if (typeof body.name === "string" && body.name.trim()) pp.name = body.name.trim().slice(0, 80);
  }).catch(() => null);
  if (!p) return notFound();
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!(await ownedProject(req, id))) return notFound();
  await deleteProject(id);
  return NextResponse.json({ ok: true });
}
