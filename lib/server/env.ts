import path from "node:path";

/** "unlimited"/"off" → no cap; a number → that cap; unset → the fallback. */
function cap(raw: string | undefined, fallback: number) {
  const v = raw?.trim().toLowerCase();
  if (!v) return fallback;
  if (v === "unlimited" || v === "off" || v === "none") return Infinity;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

// Read lazily so values from .env.local are always picked up.
export const env = {
  /** Server-side fallbacks. Visitors normally bring their own OpenAI/Anthropic keys. */
  get openaiKey() {
    return process.env.OPENAI_API_KEY?.trim() || "";
  },
  get anthropicKey() {
    return process.env.ANTHROPIC_API_KEY?.trim() || "";
  },
  /** Always the site owner's key: Magic Hour is the one service visitors don't pay for themselves. */
  get magicHourKey() {
    return process.env.MAGIC_HOUR_API_KEY?.trim() || "";
  },
  get anthropicModel() {
    return process.env.ANTHROPIC_MODEL?.trim() || "claude-haiku-5-5";
  },
  get whisperModel() {
    return process.env.OPENAI_TRANSCRIBE_MODEL?.trim() || "whisper-1";
  },
  get dataDir() {
    // Always absolute: ffmpeg runs some steps relative to their own files.
    return path.resolve(process.env.RETAKE_DATA_DIR?.trim() || path.join(process.cwd(), ".retake-data"));
  },
  /** Magic Hour credits the whole site may spend per UTC day. */
  get dailyCredits() {
    return cap(process.env.MAGIC_HOUR_DAILY_CREDITS, 3000);
  },
  /** Magic Hour credits one visitor (by IP) may spend per UTC day. */
  get visitorDailyCredits() {
    return cap(process.env.MAGIC_HOUR_VISITOR_DAILY_CREDITS, 400);
  },
  get maxUploadBytes() {
    return cap(process.env.MAX_UPLOAD_MB, 500) * 1024 * 1024;
  },
};
