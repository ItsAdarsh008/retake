"use client";
import { useEffect, useState } from "react";
import { fileUrl, plural } from "@/lib/client";
import { formatTime, type Unit } from "@/lib/timeline";
import type { LipSyncMode, RenderJob, Scope, Status } from "@/lib/types";
import { Icon, Spinner } from "./bits";
import { track } from "@/lib/analytics";

const MODES: { id: LipSyncMode; name: string; note: string }[] = [
  { id: "lite", name: "Lite", note: "Fastest. Fine for simple, steady shots." },
  { id: "standard", name: "Standard", note: "Natural mouth shapes. Best for most videos." },
  { id: "pro", name: "Pro", note: "Finest detail, twice the credits. Needs a Creator plan or above." },
];

export function RenderSheet(props: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  projectName: string;
  status: Status | null;
  cuts: number;
  units: Unit[];
  lipSyncSeconds: number;
  credits: (mode: LipSyncMode) => number;
  mode: LipSyncMode;
  scope: Scope;
  onMode: (m: LipSyncMode) => void;
  onScope: (s: Scope) => void;
  job: RenderJob | null;
  starting: boolean;
  startError: string;
  onStart: () => void;
  onNew: () => void;
  sourceUrl: string;
  dirty: boolean;
  stage: "setup" | "job";
}) {
  const { job } = props;
  const [view, setView] = useState<"edited" | "original">("edited");
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (job?.status !== "running") return;
    const t0 = new Date(job.createdAt).getTime();
    const i = setInterval(() => setElapsed((Date.now() - t0) / 1000), 500);
    return () => clearInterval(i);
  }, [job?.status, job?.createdAt]);

  useEffect(() => {
    if (!props.open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && props.onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [props.open]);

  if (!props.open) return null;
  const setup = !job || props.stage === "setup" || job.status === "error";
  const running = !setup && job!.status === "running";
  const done = !setup && job!.status === "done";
  const demoMH = props.status && !props.status.magicHour;
  const allowance = props.status?.allowance;
  const needed = props.credits(props.mode);
  const over = !!allowance && needed > allowance.left;

  return (
    <>
      <div className="scrim" onClick={props.onClose} />
      <aside className="sheet" role="dialog" aria-label="Render">
        <header className="sheet-head">
          <h2>
            {running ? "Rendering" : done ? "Your new take" : "Render the edit"}
          </h2>
          <button className="icon-btn" onClick={props.onClose} aria-label="Close">
            <Icon name="close" />
          </button>
        </header>

        {setup && (
          <div className="sheet-body">
            <p className="sheet-summary">
              {plural(props.cuts, "cut")} and {plural(props.units.length, "re-voiced line")}.
              {props.units.length > 0 && <> About {props.lipSyncSeconds.toFixed(1)}s of footage gets lip synced.</>}
            </p>

            {props.units.length > 0 ? (
              <>
                <fieldset className="choice">
                  <legend>Lip sync quality</legend>
                  {MODES.map((m) => (
                    <label key={m.id} className={props.mode === m.id ? "is-on" : ""}>
                      <input type="radio" name="mode" checked={props.mode === m.id} onChange={() => props.onMode(m.id)} />
                      <span className="choice-name">{m.name}</span>
                      <span className="choice-note">{m.note}</span>
                      <span className="choice-cost">≈ {props.credits(m.id).toLocaleString()} credits</span>
                    </label>
                  ))}
                </fieldset>
                <fieldset className="choice">
                  <legend>What gets re-voiced</legend>
                  <label className={props.scope === "sentence" ? "is-on" : ""}>
                    <input type="radio" name="scope" checked={props.scope === "sentence"} onChange={() => props.onScope("sentence")} />
                    <span className="choice-name">The whole sentence</span>
                    <span className="choice-note">Smoother. The new words sit inside natural-sounding speech.</span>
                  </label>
                  <label className={props.scope === "words" ? "is-on" : ""}>
                    <input type="radio" name="scope" checked={props.scope === "words"} onChange={() => props.onScope("words")} />
                    <span className="choice-name">Only the changed words</span>
                    <span className="choice-note">Cheaper, but the seam can be audible.</span>
                  </label>
                </fieldset>
              </>
            ) : (
              <p className="sheet-note">Only cuts, so this render is free: no Magic Hour credits needed.</p>
            )}

            {demoMH && props.units.length > 0 && (
              <p className="sheet-warn">
                Magic Hour isn&rsquo;t set up on this server, so rewrites will use a placeholder tone and no lip sync.
              </p>
            )}
            {!demoMH && allowance && props.units.length > 0 && (
              <p className={over ? "sheet-warn" : "sheet-note"}>
                {over
                  ? `This needs about ${needed.toLocaleString()} credits and you have ${allowance.left.toLocaleString()} left today. Re-voice fewer lines or choose “Only the changed words”.`
                  : `Lip sync is on this site. You have ${allowance.left.toLocaleString()} of your ${allowance.limit.toLocaleString()} daily credits left.`}
              </p>
            )}
            {(props.startError || (job?.status === "error" && props.stage === "job")) && (
              <p className="sheet-error" role="alert">
                {props.startError || job?.error}
              </p>
            )}
            <button className="btn btn-ink btn-wide" onClick={props.onStart} disabled={props.starting}>
              {props.starting ? <Spinner /> : null}
              {job?.status === "error" && props.stage === "job" ? "Try again" : "Render video"}
            </button>
          </div>
        )}

        {running && job && (
          <div className="sheet-body">
            <ol className="steps">
              {job.steps.map((s) => (
                <li key={s.key} className={`step is-${s.status}`}>
                  <span className="step-mark">
                    {s.status === "done" ? <Icon name="check" size={14} /> : s.status === "active" ? <Spinner size={12} /> : s.status === "error" ? <Icon name="alert" size={13} /> : null}
                  </span>
                  <span className="step-text">
                    <span className={s.key.startsWith("u") ? "step-quote" : ""}>{s.label}</span>
                    {s.detail && <span className="step-detail">{s.detail}</span>}
                  </span>
                </li>
              ))}
            </ol>
            <p className="sheet-note">
              {formatTime(elapsed)} elapsed. Lip sync usually takes two to four minutes per line, and lines render two at a time. You can keep editing; this
              render uses the edits as they were when you started it.
            </p>
          </div>
        )}

        {done && job?.output && (
          <div className="sheet-body">
            <div className="ab">
              <button className={view === "edited" ? "is-on" : ""} onClick={() => setView("edited")}>
                Edited {job.outputDuration ? formatTime(job.outputDuration) : ""}
              </button>
              <button className={view === "original" ? "is-on" : ""} onClick={() => setView("original")}>
                Original
              </button>
            </div>
            <video
              key={view}
              className="result"
              src={view === "edited" ? fileUrl(props.projectId, job.output) : props.sourceUrl}
              controls
              autoPlay
              playsInline
            />
            <a
              className="btn btn-ink btn-wide"
              href={`${fileUrl(props.projectId, job.output)}?download=${encodeURIComponent(props.projectName + " (retake).mp4")}`}
              onClick={() => track("download")}
            >
              <Icon name="download" /> Download MP4
            </a>
            <p className="sheet-note">
              {job.demo
                ? "Rendered in demo mode, so rewrites have a placeholder tone."
                : job.creditsCharged
                  ? `Used ${job.creditsCharged.toLocaleString()} Magic Hour credits.`
                  : "No Magic Hour credits used."}
            </p>
            {props.dirty && (
              <button className="btn btn-quiet btn-wide" onClick={props.onNew}>
                You&rsquo;ve edited since this render. Render again
              </button>
            )}
          </div>
        )}
      </aside>
    </>
  );
}
