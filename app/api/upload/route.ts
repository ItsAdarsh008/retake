import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createProject, deleteProject, newId, projectDir } from "@/lib/server/store";
import { processProject } from "@/lib/server/ingest";
import { env } from "@/lib/server/env";
import { apiKeys, ownerOf } from "@/lib/server/request";
import { passwordChallenge, passwordOk } from "@/lib/gate";
import type { Project } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EXT = /\.(mp4|m4v|mov|webm|mkv|avi)$/i;

// Raw upload: the body is the file itself; the name travels in a header.
// The middleware skips this route (it would truncate the body at 10 MB), so the
// password and owner checks happen here.
export async function POST(req: Request) {
  if (!passwordOk(req.headers.get("authorization"))) return passwordChallenge();
  const owner = ownerOf(req);
  if (!owner) return NextResponse.json({ error: "Your session expired. Reload the page and try again." }, { status: 400 });

  const limit = env.maxUploadBytes;
  const tooBig = `That video is over ${Math.round(limit / 1024 / 1024)} MB. Trim or compress it and try again.`;
  if (Number(req.headers.get("content-length") || 0) > limit) return NextResponse.json({ error: tooBig }, { status: 413 });

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
    owner,
  };
  await createProject(project);

  // Count bytes as they arrive too, in case the client didn't send a length.
  let received = 0;
  const cap = new Transform({
    transform(chunk, _enc, done) {
      received += chunk.length;
      done(received > limit ? new Error("too big") : null, chunk);
    },
  });
  try {
    await pipeline(Readable.fromWeb(req.body as any), cap, fs.createWriteStream(path.join(projectDir(id), project.sourceFile)));
  } catch {
    await deleteProject(id);
    if (received > limit) return NextResponse.json({ error: tooBig }, { status: 413 });
    return NextResponse.json({ error: "The upload was interrupted. Try again." }, { status: 400 });
  }
  processProject(id, apiKeys(req).openai);
  return NextResponse.json({ id });
}
