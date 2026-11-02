"use client";
import { useEffect, useState } from "react";

// Visitors bring their own OpenAI and Anthropic keys. They live in this
// browser's localStorage and ride along as headers only on the requests that need them.

export type Keys = { openai: string; anthropic: string };

const STORE = "retake.keys.v1";
const EVENT = "retake:keys";
const EMPTY: Keys = { openai: "", anthropic: "" };

export function loadKeys(): Keys {
  try {
    const j = JSON.parse(localStorage.getItem(STORE) || "{}");
    return {
      openai: typeof j.openai === "string" ? j.openai : "",
      anthropic: typeof j.anthropic === "string" ? j.anthropic : "",
    };
  } catch {
    return EMPTY;
  }
}

export function saveKeys(k: Keys) {
  try {
    if (k.openai || k.anthropic) localStorage.setItem(STORE, JSON.stringify(k));
    else localStorage.removeItem(STORE);
  } catch {}
  window.dispatchEvent(new Event(EVENT));
}

export function useKeys(): Keys {
  const [keys, setKeys] = useState<Keys>(EMPTY);
  useEffect(() => {
    const sync = () => setKeys(loadKeys());
    sync();
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return keys;
}

export function openaiHeaders(): Record<string, string> {
  const k = loadKeys().openai;
  return k ? { "x-openai-key": k } : {};
}

export function anthropicHeaders(): Record<string, string> {
  const k = loadKeys().anthropic;
  return k ? { "x-anthropic-key": k } : {};
}
