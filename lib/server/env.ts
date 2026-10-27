import path from "node:path";
import type { Status } from "../types";

// Read lazily so values from .env.local are always picked up.
export const env = {
  get openaiKey() {
    return process.env.OPENAI_API_KEY?.trim() || "";
  },
  get magicHourKey() {
    return process.env.MAGIC_HOUR_API_KEY?.trim() || "";
  },
  get anthropicKey() {
    return process.env.ANTHROPIC_API_KEY?.trim() || "";
  },
  get anthropicModel() {
    return process.env.ANTHROPIC_MODEL?.trim() || "claude-haiku-5-5";
  },
  get whisperModel() {
    return process.env.OPENAI_TRANSCRIBE_MODEL?.trim() || "whisper-1";
  },
  get dataDir() {
    return process.env.RETAKE_DATA_DIR || path.join(process.cwd(), ".retake-data");
  },
};

export function status(): Status {
  return {
    openai: !!env.openaiKey,
    magicHour: !!env.magicHourKey,
    anthropic: !!env.anthropicKey,
  };
}
