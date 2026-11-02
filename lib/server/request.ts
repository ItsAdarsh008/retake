import crypto from "node:crypto";
import { env } from "./env";
import { readProject } from "./store";
import type { Project } from "../types";

const hash = (s: string) => crypto.createHash("sha256").update(s).digest("hex").slice(0, 24);

// API keys arrive as headers and are used for that one request. They are never
// written to disk or logged.
function headerKey(req: Request, name: string) {
  const v = req.headers.get(name)?.trim() || "";
  return v.length >= 8 && v.length <= 400 && /^[\x21-\x7e]+$/.test(v) ? v : "";
}

/** The visitor's own keys, falling back to the server's (if the owner set any). */
export function apiKeys(req: Request) {
  return {
    openai: headerKey(req, "x-openai-key") || env.openaiKey,
    anthropic: headerKey(req, "x-anthropic-key") || env.anthropicKey,
  };
}

export const OWNER_COOKIE = "retake_owner";

/**
 * Which browser is asking. The middleware gives every browser a random
 * cookie; projects remember a hash of it, so visitors only see their own videos.
 */
export function ownerOf(req: Request): string {
  const m = (req.headers.get("cookie") || "").match(/(?:^|;\s*)retake_owner=([A-Za-z0-9]{16,64})/);
  return m ? hash(m[1]) : "";
}

/** Projects made before ownership existed have no owner and open for anyone with the link. */
export const canAccess = (p: Pick<Project, "owner">, owner: string) => !p.owner || p.owner === owner;

/** Read a project only if this browser owns it. A miss and a refusal look the same. */
export async function ownedProject(req: Request, id: string): Promise<Project | null> {
  const p = await readProject(id).catch(() => null);
  return p && canAccess(p, ownerOf(req)) ? p : null;
}

/**
 * Who to bill Magic Hour usage against: the client IP, hashed. Behind Railway's
 * proxy the real address is in x-real-ip or the last x-forwarded-for hop.
 */
export function visitorOf(req: Request): string {
  const real = req.headers.get("x-real-ip")?.trim();
  const fwd = req.headers.get("x-forwarded-for")?.split(",").map((s) => s.trim()).filter(Boolean);
  const ip = real || fwd?.[fwd.length - 1] || "local";
  return hash(ip);
}
