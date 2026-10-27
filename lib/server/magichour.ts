import fs from "node:fs/promises";
import path from "node:path";
import { env } from "./env";
import type { LipSyncMode } from "../types";

const BASE = "https://api.magichour.ai";

export class MagicHourError extends Error {
  constructor(message: string, public code?: string, public status?: number) {
    super(message);
  }
}

const FRIENDLY: Record<string, string> = {
  insufficient_credits: "Your Magic Hour account is out of credits. Top up at magichour.ai and render again.",
  subscription_required: "This Magic Hour feature needs a subscription on the account behind MAGIC_HOUR_API_KEY.",
  plan_upgrade_required: "This lip sync mode needs a higher Magic Hour plan. Switch to Lite or Standard and render again.",
  unauthorized: "Magic Hour rejected the API key. Check MAGIC_HOUR_API_KEY in .env.local.",
};

async function call<T>(method: string, route: string, body?: unknown): Promise<T> {
  const res = await fetch(BASE + route, {
    method,
    headers: {
      Authorization: `Bearer ${env.magicHourKey}`,
      accept: "application/json",
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: any = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {}
  if (!res.ok) {
    const code = json.code as string | undefined;
    throw new MagicHourError(
      (code && FRIENDLY[code]) || json.message || `Magic Hour returned ${res.status}`,
      code,
      res.status
    );
  }
  return json as T;
}

/** Upload a local file to Magic Hour storage and return its file_path. */
export async function upload(localPath: string, type: "video" | "audio"): Promise<string> {
  const extension = path.extname(localPath).slice(1).toLowerCase();
  const { items } = await call<{ items: { upload_url: string; file_path: string }[] }>(
    "POST",
    "/v1/files/upload-urls",
    { items: [{ type, extension }] }
  );
  const bytes = await fs.readFile(localPath);
  const put = await fetch(items[0].upload_url, { method: "PUT", body: new Uint8Array(bytes) });
  if (!put.ok) throw new MagicHourError(`Upload to Magic Hour storage failed (${put.status})`);
  return items[0].file_path;
}

export async function createVoiceClone(samplePath: string, text: string, name: string) {
  return call<{ id: string; credits_charged: number }>("POST", "/v1/ai-voice-cloner", {
    name,
    assets: { audio_file_path: samplePath },
    style: { prompt: text.slice(0, 1000) },
  });
}

export async function createLipSync(opts: {
  videoPath: string;
  audioPath: string;
  seconds: number;
  fps: number;
  mode: LipSyncMode;
  name: string;
}) {
  return call<{ id: string; credits_charged: number }>("POST", "/v1/lip-sync", {
    name: opts.name,
    start_seconds: 0,
    end_seconds: Math.max(0.1, Math.round(opts.seconds * 1000) / 1000),
    max_fps_limit: opts.fps,
    assets: { video_source: "file", video_file_path: opts.videoPath, audio_file_path: opts.audioPath },
    style: { generation_mode: opts.mode },
  });
}

type ProjectDetails = {
  status: "draft" | "queued" | "rendering" | "complete" | "error" | "canceled";
  downloads: { url: string }[];
  error?: { message: string; code: string } | null;
  credits_charged?: number;
};

export async function waitFor(
  kind: "video" | "audio",
  id: string,
  onStatus?: (s: ProjectDetails["status"]) => void,
  timeoutMs = 20 * 60 * 1000
): Promise<{ url: string; credits: number }> {
  const t0 = Date.now();
  let last = "";
  for (;;) {
    const d = await call<ProjectDetails>("GET", `/v1/${kind}-projects/${encodeURIComponent(id)}`);
    if (d.status !== last) {
      last = d.status;
      onStatus?.(d.status);
    }
    if (d.status === "complete") {
      const url = d.downloads?.[0]?.url;
      if (!url) throw new MagicHourError("Magic Hour finished but returned no download");
      return { url, credits: d.credits_charged ?? 0 };
    }
    if (d.status === "error") throw new MagicHourError(d.error?.message || "Magic Hour couldn't render this clip", d.error?.code);
    if (d.status === "canceled") throw new MagicHourError("The job was canceled in Magic Hour");
    if (Date.now() - t0 > timeoutMs) throw new MagicHourError("Magic Hour took longer than 20 minutes; try again");
    await new Promise((r) => setTimeout(r, kind === "audio" ? 2000 : 4000));
  }
}

export async function download(url: string, dest: string) {
  const res = await fetch(url);
  if (!res.ok) throw new MagicHourError(`Couldn't download the result (${res.status})`);
  await fs.writeFile(dest, new Uint8Array(await res.arrayBuffer()));
}
