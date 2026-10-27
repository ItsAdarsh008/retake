import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createProject, listProjects, newId, projectDir } from "@/lib/server/store";
import { processProject } from "@/lib/server/ingest";
import type { Project } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EXT = /\.(mp4|m4v|mov|webm|mkv|avi)$/i;

export async function GET() {
  return NextResponse.json(await listProjects());
}

// Raw upload: the body is the file itself; the name travels in a header.
export async function POST(req: Request) {
  const rawName = decodeURIComponent(req.headers.get("x-filename") || "video.mp4");
  const ext = (rawName.match(EXT)?.[1] || "mp4").toLowerCase();
  if (!req.body) return NextResponse.json({ error: "No file received" }, { status: 400 });

  const id = newId();
  const project: Project = {
    id,
    name: rawName.replace(EXT, "").replace(/[_-]+/g, " ").trim().slice(0, 80) || "Untitled",
    createdAt: new Date().toISOString(),
    status: "processing",
    stage: "Receiving the upload",
    sourceFile: `source.${ext}`,
    playbackFile: `source.${ext}`,
    duration: 0,
    width: 0,
    height: 0,
    fps: 30,
    hasAudio: true,
    words: [],
    paragraphs: [],
    peaks: [],
    edits: [],
  };
  await createProject(project);
  try {
    await pipeline(Readable.fromWeb(req.body as any), fs.createWriteStream(path.join(projectDir(id), project.sourceFile)));
  } catch {
    return NextResponse.json({ error: "The upload was interrupted. Try again." }, { status: 400 });
  }
  processProject(id);
  return NextResponse.json({ id });
}
