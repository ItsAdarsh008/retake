import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { projectDir } from "@/lib/server/store";
import { ownedProject } from "@/lib/server/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED = /^(source\.\w+|preview\.mp4|renders\/[A-Za-z0-9]+\.mp4|voice\/[a-f0-9]{16}\.wav)$/;
const TYPES: Record<string, string> = {
  ".mp4": "video/mp4", ".m4v": "video/mp4", ".mov": "video/quicktime", ".webm": "video/webm",
  ".mkv": "video/x-matroska", ".wav": "audio/wav",
};

// Streams media with HTTP Range support so the player can seek instantly.
export async function GET(req: Request, { params }: { params: Promise<{ id: string; path: string[] }> }) {
  const { id, path: parts } = await params;
  const rel = parts.join("/");
  if (!ALLOWED.test(rel) || !(await ownedProject(req, id))) return new Response("Not found", { status: 404 });
  let file: string;
  let size: number;
  try {
    file = path.join(projectDir(id), rel);
    size = fs.statSync(file).size;
  } catch {
    return new Response("Not found", { status: 404 });
  }
  const type = TYPES[path.extname(file).toLowerCase()] || "application/octet-stream";
  const download = new URL(req.url).searchParams.get("download");
  const headers: Record<string, string> = {
    "Content-Type": type,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=3600",
  };
  if (download) headers["Content-Disposition"] = `attachment; filename="${download.replace(/[^\w .-]/g, "")}"`;

  const range = req.headers.get("range")?.match(/bytes=(\d*)-(\d*)/);
  if (range) {
    let start = range[1] ? Number(range[1]) : size - Number(range[2]);
    let end = range[1] && range[2] ? Number(range[2]) : size - 1;
    start = Math.max(0, start);
    end = Math.min(end, size - 1);
    if (start > end) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    const stream = Readable.toWeb(fs.createReadStream(file, { start, end })) as ReadableStream;
    return new Response(stream, {
      status: 206,
      headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) },
    });
  }
  const stream = Readable.toWeb(fs.createReadStream(file)) as ReadableStream;
  return new Response(stream, { headers: { ...headers, "Content-Length": String(size) } });
}
