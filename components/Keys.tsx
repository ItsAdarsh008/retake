"use client";
import { useEffect, useState } from "react";
import { post } from "@/lib/client";
import { loadKeys, saveKeys, useKeys } from "@/lib/keys";
import type { Status } from "@/lib/types";
import { Icon, Spinner } from "./bits";
import { track } from "@/lib/analytics";

type Provider = "openai" | "anthropic";
type Check = { state: "idle" | "ok" | "bad"; msg?: string };

const OPEN_EVENT = "retake:open-keys";
export const openKeys = () => window.dispatchEvent(new Event(OPEN_EVENT));

/** True when uploads would get a placeholder transcript: no key in this browser or on the server. */
export function useNeedsOpenai(status: Status | null) {
  const keys = useKeys();
  return !!status && !keys.openai && !status.openai;
}

export function KeysButton({ status, compact }: { status: Status | null; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const needed = useNeedsOpenai(status);
  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener(OPEN_EVENT, show);
    return () => window.removeEventListener(OPEN_EVENT, show);
  }, []);
  return (
    <>
      <button className={`btn btn-keys ${needed ? "is-needed" : ""}`} onClick={() => setOpen(true)}>
        <Icon name="key" /> {needed ? (compact ? "Add keys" : "Add your API keys") : "Keys"}
      </button>
      {open && <KeysSheet status={status} onClose={() => setOpen(false)} />}
    </>
  );
}

function KeysSheet({ status, onClose }: { status: Status | null; onClose: () => void }) {
  const [initial] = useState(loadKeys);
  const [openai, setOpenai] = useState(initial.openai);
  const [anthropic, setAnthropic] = useState(initial.anthropic);
  const [checks, setChecks] = useState<Record<Provider, Check>>({ openai: { state: "idle" }, anthropic: { state: "idle" } });
  const [phase, setPhase] = useState<"edit" | "checking" | "saved">("edit");
  const hasSaved = !!(initial.openai || initial.anthropic);

  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);

  async function save() {
    setPhase("checking");
    const entries: [Provider, string][] = [
      ["openai", openai.trim()],
      ["anthropic", anthropic.trim()],
    ];
    const results = await Promise.all(
      entries.map(async ([provider, key]): Promise<[Provider, Check]> => {
        if (!key) return [provider, { state: "idle" }];
        try {
          const r = await post<{ ok: boolean; error?: string }>("/api/keys/check", { provider, key });
          return [provider, r.ok ? { state: "ok" } : { state: "bad", msg: r.error }];
        } catch (e: any) {
          return [provider, { state: "bad", msg: e.message }];
        }
      })
    );
    setChecks(Object.fromEntries(results) as Record<Provider, Check>);
    if (results.some(([, c]) => c.state === "bad")) {
      setPhase("edit");
      return;
    }
    saveKeys({ openai: openai.trim(), anthropic: anthropic.trim() });
    track("keys-saved", { openai: !!openai.trim(), anthropic: !!anthropic.trim() });
    setPhase("saved");
    setTimeout(onClose, 900);
  }

  function forget() {
    saveKeys({ openai: "", anthropic: "" });
    setOpenai("");
    setAnthropic("");
    setChecks({ openai: { state: "idle" }, anthropic: { state: "idle" } });
  }

  const allowance = status?.allowance;

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="sheet" role="dialog" aria-label="API keys">
        <header className="sheet-head">
          <h2>Your API keys</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </button>
        </header>
        <form
          className="sheet-body"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <p className="sheet-summary">
            Retake runs transcripts and Clean up on your own OpenAI and Anthropic accounts.
            {status?.magicHour && " Voice cloning and lip sync are covered by this site."}
          </p>

          <KeyField
            name="OpenAI"
            tag={status?.openai ? "Optional on this site" : "Needed for transcripts"}
            placeholder="sk-..."
            value={openai}
            onChange={setOpenai}
            check={checks.openai}
            href="https://platform.openai.com/api-keys"
          >
            Whisper transcribes your video with a timestamp on every word. About $0.006 per minute of video.
          </KeyField>

          <KeyField
            name="Anthropic"
            tag="Optional"
            placeholder="sk-ant-..."
            value={anthropic}
            onChange={setAnthropic}
            check={checks.anthropic}
            href="https://console.anthropic.com/settings/keys"
          >
            Powers Clean up, where Claude marks the ums, repeats and false starts. A fraction of a cent per video. Without it, Clean up does a
            basic scan.
          </KeyField>

          <div className="key-covered">
            <span className="key-name">Magic Hour</span>
            <p>
              {status?.magicHour ? (
                <>
                  Covered by this site.
                  {allowance && (
                    <>
                      {" "}
                      Each person gets {allowance.limit.toLocaleString()} credits a day, about {Math.floor(allowance.limit / 30)} seconds of lip
                      sync. You have {allowance.left.toLocaleString()} left today.
                    </>
                  )}
                </>
              ) : (
                "Not set up on this server, so rewrites play a placeholder tone and skip lip sync."
              )}
            </p>
          </div>

          <p className="sheet-note">
            Your keys are saved in this browser only. Each one is sent to this server with the request that needs it, passed straight to OpenAI or
            Anthropic, and never written to disk.
          </p>

          <button className="btn btn-ink btn-wide" type="submit" disabled={phase !== "edit"}>
            {phase === "checking" ? (
              <>
                <Spinner /> Checking your keys
              </>
            ) : phase === "saved" ? (
              <>
                <Icon name="check" /> Saved
              </>
            ) : (
              "Save keys"
            )}
          </button>
          {hasSaved && phase === "edit" && (
            <button className="btn btn-quiet btn-wide" type="button" onClick={forget}>
              Forget my keys
            </button>
          )}
        </form>
      </aside>
    </>
  );
}

function KeyField(props: {
  name: string;
  tag: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  check: Check;
  href: string;
  children: React.ReactNode;
}) {
  const id = `key-${props.name.toLowerCase()}`;
  return (
    <div className={`key-field ${props.check.state === "bad" ? "is-bad" : ""}`}>
      <label className="key-head" htmlFor={id}>
        <span className="key-name">{props.name}</span>
        <span className="key-tag">{props.tag}</span>
      </label>
      <input
        id={id}
        type="password"
        autoComplete="off"
        spellCheck={false}
        placeholder={props.placeholder}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        aria-invalid={props.check.state === "bad"}
      />
      {props.check.state === "bad" ? (
        <p className="key-error" role="alert">
          {props.check.msg}
        </p>
      ) : (
        <p className="key-note">
          {props.children}{" "}
          <a href={props.href} target="_blank" rel="noreferrer">
            Get a key
          </a>
        </p>
      )}
    </div>
  );
}
