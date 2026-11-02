import { NextResponse } from "next/server";
import { listProjects } from "@/lib/server/store";
import { ownerOf } from "@/lib/server/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** This browser's videos. Uploads go to /api/upload. */
export async function GET(req: Request) {
  return NextResponse.json(await listProjects(ownerOf(req)));
}
