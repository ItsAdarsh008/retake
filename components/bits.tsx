"use client";
import type { Status } from "@/lib/types";

export function Wordmark({ href = "/" }: { href?: string }) {
  return (
    <a className="wordmark" href={href} aria-label="Retake home">
      <span className="wm-re">Re</span>take
    </a>
  );
}

export function KeyNotice({ status, compact }: { status: Status; compact?: boolean }) {
  const names: string[] = [];
  const effects: string[] = [];
  if (!status.openai) {
    names.push("OpenAI");
    effects.push("Transcripts are placeholders until an OpenAI key is set.");
  }
  if (!status.magicHour) {
    names.push("Magic Hour");
    effects.push("Rewrites use a placeholder tone and skip lip sync until a Magic Hour key is set.");
  }
  if (!names.length) return null;
  return (
    <p className={`key-notice ${compact ? "is-compact" : ""}`} title={effects.join("\n")}>
      Demo mode{compact ? "" : <>: add your {names.join(" and ")} key{names.length > 1 ? "s" : ""} to <code>.env.local</code></>}
    </p>
  );
}

export const Spinner = ({ size = 14 }: { size?: number }) => (
  <span className="spinner" style={{ width: size, height: size }} aria-hidden />
);

type IconName = "play" | "pause" | "undo" | "redo" | "scissors" | "pen" | "restore" | "spark" | "download" | "close" | "check" | "alert" | "back";

const PATHS: Record<IconName, string> = {
  play: "M7 4.5v15l12-7.5z",
  pause: "M7 4.5h3.5v15H7zM13.5 4.5H17v15h-3.5z",
  undo: "M9 7 4.5 11.5 9 16M5 11.5h9a5 5 0 0 1 0 10h-3",
  redo: "M15 7l4.5 4.5L15 16M19 11.5h-9a5 5 0 0 0 0 10h3",
  scissors: "M6 7a2.5 2.5 0 1 0 0 .01M6 17a2.5 2.5 0 1 0 0 .01M8 8.2 19 17M8 15.8 19 7",
  pen: "M4 20l1-4.5L15.5 5a2.1 2.1 0 0 1 3 3L8 18.5zM13.5 7l3 3",
  restore: "M4.5 12a7.5 7.5 0 1 0 2.2-5.3M4.5 4v4.5H9",
  spark: "M12 3.5l1.8 5 5 1.8-5 1.8-1.8 5-1.8-5-5-1.8 5-1.8zM18.5 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z",
  download: "M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14",
  close: "M6 6l12 12M18 6 6 18",
  check: "M5 12.5l4.5 4.5L19 7.5",
  alert: "M12 8v5M12 16.5v.01M12 3.5 21 19.5H3z",
  back: "M14.5 6 8.5 12l6 6",
};

export function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  const filled = name === "play" || name === "pause";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden
      fill={filled ? "currentColor" : "none"}
      stroke={filled ? "none" : "currentColor"}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

export const isMac = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
