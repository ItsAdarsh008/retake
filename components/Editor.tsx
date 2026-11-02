"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, fileUrl, plural, post, type ProjectView } from "@/lib/client";
import {
  applyDelete,
  applyReplace,
  buildPieces,
  editIndex,
  editedDuration,
  estimateCredits,
  estimateUnitSeconds,
  originalText,
  restoreRange,
  sameWords,
  skipRanges,
  type Unit,
} from "@/lib/timeline";
import type { Edit, LipSyncMode, RenderJob, Scope, Status, Suggestion } from "@/lib/types";
import { Icon, Spinner, Wordmark, isMac } from "./bits";
import { KeysButton } from "./Keys";
import { anthropicHeaders } from "@/lib/keys";
import { Player, type PlayerHandle } from "./Player";
import { SelectionLayer, Transcript, type Range, type TranscriptHandle, type VoiceState } from "./Transcript";
import { RenderSheet } from "./RenderSheet";
import { track } from "@/lib/analytics";

type Rewrite = { from: number; to: number; draft: string };

export default function Editor({ id }: { id: string }) {
  const [project, setProject] = useState<ProjectView | null>(null);
  const [loadError, setLoadError] = useState("");
  const [status, setStatus] = useState<Status | null>(null);

  const [edits, setEdits] = useState<Edit[]>([]);
  const editsRef = useRef(edits);
  editsRef.current = edits;
  const past = useRef<Edit[][]>([]);
  const future = useRef<Edit[][]>([]);
  const [saved, setSaved] = useState<"saved" | "saving" | "error">("saved");
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const [sel, setSel] = useState<{ a: number; b: number } | null>(null);
  const dragging = useRef(false);
  const [rewrite, setRewrite] = useState<Rewrite | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [cleanup, setCleanup] = useState<{ state: "idle" | "loading" | "done" | "error"; msg?: string; source?: string }>({ state: "idle" });

  const [scope, setScope] = useState<Scope>("sentence");
  const [mode, setMode] = useState<LipSyncMode>("standard");
  const [voices, setVoices] = useState<Record<string, VoiceState>>({});
  const voicesRef = useRef(voices);
  voicesRef.current = voices;
  const [preview, setPreview] = useState(true);

  const [sheet, setSheet] = useState(false);
  const [sheetStage, setSheetStage] = useState<"setup" | "job">("setup");
  const [job, setJob] = useState<RenderJob | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState("");
  const renderedKey = useRef<string | null>(null);

  const player = useRef<PlayerHandle>(null);
  const transcript = useRef<TranscriptHandle>(null);
  const loaded = useRef(false);

  // ---------- loading ----------
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      try {
        const p = await api<ProjectView>(`/api/projects/${id}`);
        if (!alive) return;
        setProject(p);
        if (p.status === "processing") timer = setTimeout(load, 1000);
        else if (p.status === "ready" && !loaded.current) {
          loaded.current = true;
          setEdits(p.edits ?? []);
          if (p.lastRender) {
            setJob(p.lastRender);
            setSheetStage("job");
            renderedKey.current = JSON.stringify(p.edits ?? []);
          }
        }
      } catch (e: any) {
        if (alive) setLoadError(e.message);
      }
    };
    load();
    api<Status>("/api/status").then(setStatus).catch(() => {});
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [id]);

  // Poll a running render.
  useEffect(() => {
    if (job?.status !== "running") return;
    const t = setInterval(async () => {
      try {
        const next = await api<RenderJob>(`/api/projects/${id}/render?job=${job.id}`);
        if (next.status === "done") track("render-done", { mode: next.mode });
        setJob(next);
      } catch {}
    }, 1500);
    return () => clearInterval(t);
  }, [job?.id, job?.status, id]);

  // ---------- edit history ----------
  const scheduleSave = useCallback(
    (next: Edit[]) => {
      setSaved("saving");
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        api(`/api/projects/${id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ edits: next }),
        })
          .then(() => setSaved("saved"))
          .catch(() => setSaved("error"));
      }, 500);
    },
    [id]
  );
  const commit = useCallback(
    (next: Edit[]) => {
      past.current.push(editsRef.current);
      if (past.current.length > 300) past.current.shift();
      future.current = [];
      setEdits(next);
      scheduleSave(next);
    },
    [scheduleSave]
  );
  const undo = () => {
    const prev = past.current.pop();
    if (!prev) return;
    future.current.push(editsRef.current);
    setEdits(prev);
    scheduleSave(prev);
  };
  const redo = () => {
    const next = future.current.pop();
    if (!next) return;
    past.current.push(editsRef.current);
    setEdits(next);
    scheduleSave(next);
  };

  // ---------- derived ----------
  const words = project?.words ?? [];
  const duration = project?.duration ?? 0;
  const pieces = useMemo(() => buildPieces(words, edits, duration, scope), [words, edits, duration, scope]);
  const units = useMemo(() => pieces.flatMap((p) => (p.kind === "unit" ? [p.unit] : [])), [pieces]);
  const skips = useMemo(() => skipRanges(pieces, duration), [pieces, duration]);
  const idx = useMemo(() => editIndex(words.length, edits), [words.length, edits]);
  const unitOf = useMemo(() => {
    const a = new Array<Unit | null>(words.length).fill(null);
    for (const u of units) for (let i = u.from; i <= u.to; i++) a[i] = u;
    return a;
  }, [units, words.length]);
  const liveSuggestions = useMemo(
    () => suggestions.filter((s) => !idx.slice(s.from, s.to + 1).some(Boolean)),
    [suggestions, idx]
  );
  const sugg = useMemo(() => {
    const a = new Uint8Array(words.length);
    for (const s of liveSuggestions) a.fill(1, s.from, s.to + 1);
    return a;
  }, [liveSuggestions, words.length]);
  const ttsDur = useCallback((t: string) => voices[t]?.duration, [voices]);
  const editedLength = useMemo(() => editedDuration(pieces, ttsDur), [pieces, ttsDur]);
  const wordStarts = useMemo(() => words.map((w) => w.start), [words]);
  const range: Range | null = sel ? { from: Math.min(sel.a, sel.b), to: Math.max(sel.a, sel.b) } : null;
  const cuts = edits.filter((e) => e.kind === "delete").length;
  const rewrites = edits.filter((e) => e.kind === "replace").length;
  const dirty = renderedKey.current !== JSON.stringify(edits);

  // ---------- cloned-voice previews ----------
  const requestVoice = useCallback(
    (text: string) => {
      voicesRef.current = { ...voicesRef.current, [text]: { status: "loading" } };
      setVoices((v) => ({ ...v, [text]: { status: "loading" } }));
      post<{ url: string; duration: number; demo: boolean }>(`/api/projects/${id}/voice`, { text })
        .then((r) => setVoices((v) => ({ ...v, [text]: { status: "ready", url: r.url, duration: r.duration, demo: r.demo } })))
        .catch((e) => setVoices((v) => ({ ...v, [text]: { status: "error", error: e.message } })));
    },
    [id]
  );
  useEffect(() => {
    if (project?.status !== "ready") return;
    const t = setTimeout(() => {
      for (const u of units) if (!voicesRef.current[u.text]) requestVoice(u.text);
    }, 700);
    return () => clearTimeout(t);
  }, [units, project?.status, requestVoice]);

  // ---------- actions ----------
  const cut = (from: number, to: number) => {
    commit(applyDelete(editsRef.current, from, to));
    setSel(null);
  };
  const restore = (from: number, to: number) => {
    commit(restoreRange(editsRef.current, from, to));
  };
  const openRewrite = (from: number, to: number, typed?: string) => {
    let f = from;
    let t = to;
    for (const e of editsRef.current)
      if (e.kind === "replace" && e.from <= t && f <= e.to) {
        f = Math.min(f, e.from);
        t = Math.max(t, e.to);
      }
    const existing = editsRef.current.find((e) => e.kind === "replace" && e.from === f && e.to === t);
    const draft = typed ?? (existing && existing.kind === "replace" ? existing.text : originalText(words, f, t));
    setSel({ a: f, b: t });
    setRewrite({ from: f, to: t, draft });
  };
  const applyRewrite = () => {
    if (!rewrite) return;
    const text = rewrite.draft.replace(/\s+/g, " ").trim();
    const { from, to } = rewrite;
    if (!text) cut(from, to);
    else if (sameWords(text, originalText(words, from, to))) restore(from, to);
    else commit(applyReplace(editsRef.current, from, to, text));
    setRewrite(null);
    setSel(null);
  };
  const playFrom = (i: number) => player.current?.seek(words[i]?.start ?? 0, true);
  const previewUnit = (u: Unit) => {
    setPreview(true);
    player.current?.seek(u.start, true);
  };

  const runCleanup = async () => {
    setCleanup({ state: "loading" });
    try {
      const r = await post<{ suggestions: Suggestion[]; source: string }>(`/api/projects/${id}/cleanup`, { edits }, anthropicHeaders());
      setSuggestions(r.suggestions);
      setCleanup({ state: "done", source: r.source });
    } catch (e: any) {
      setCleanup({ state: "error", msg: e.message });
    }
  };
  const acceptAll = () => {
    let next = editsRef.current;
    for (const s of liveSuggestions) next = applyDelete(next, s.from, s.to);
    commit(next);
    setSuggestions([]);
    setCleanup({ state: "idle" });
  };

  const openSheet = () => {
    setStartError("");
    api<Status>("/api/status").then(setStatus).catch(() => {});
    setSheetStage(job && (job.status === "running" || !dirty) ? "job" : "setup");
    setSheet(true);
  };
  const startRender = async () => {
    setStarting(true);
    setStartError("");
    try {
      const j = await post<RenderJob>(`/api/projects/${id}/render`, { edits, mode, scope });
      renderedKey.current = JSON.stringify(edits);
      track("render", { mode });
      setJob(j);
      setSheetStage("job");
    } catch (e: any) {
      setStartError(e.message);
    } finally {
      setStarting(false);
    }
  };

  // ---------- pointer selection ----------
  const onPointerWord = (i: number, kind: "down" | "enter", e: React.PointerEvent) => {
    if (rewrite) return;
    if (kind === "down") {
      if (e.shiftKey && sel) setSel({ a: sel.a, b: i });
      else if (e.pointerType === "touch" && range && !(i >= range.from && i <= range.to)) setSel({ a: sel!.a, b: i });
      else {
        setSel({ a: i, b: i });
        dragging.current = true;
        player.current?.seek(words[i].start, player.current.playing());
      }
    } else if (dragging.current && e.buttons === 1) {
      setSel((s) => (s ? { a: s.a, b: i } : s));
    }
  };
  useEffect(() => {
    const up = () => (dragging.current = false);
    window.addEventListener("pointerup", up);
    return () => window.removeEventListener("pointerup", up);
  }, []);

  // ---------- keyboard ----------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (sheet || rewrite || t.closest("input, textarea, [contenteditable]")) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
        return;
      }
      if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
        return;
      }
      if (e.key === " " && !t.closest("button")) {
        e.preventDefault();
        player.current?.toggle();
        return;
      }
      if (e.key === "Escape") {
        setSel(null);
        return;
      }
      if (!range) return;
      if (e.key === "Backspace" || e.key === "Delete") {
        e.preventDefault();
        cut(range.from, range.to);
      } else if (e.key === "Enter") {
        e.preventDefault();
        openRewrite(range.from, range.to);
      } else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        const d = e.key === "ArrowRight" ? 1 : -1;
        const clamp = (n: number) => Math.max(0, Math.min(words.length - 1, n));
        if (e.shiftKey) setSel({ a: sel!.a, b: clamp(sel!.b + d) });
        else {
          const n = clamp(d > 0 ? range.to + 1 : range.from - 1);
          setSel({ a: n, b: n });
          player.current?.seek(words[n].start, player.current.playing());
        }
      } else if (e.key.length === 1 && !mod && !e.altKey) {
        e.preventDefault();
        openRewrite(range.from, range.to, e.key);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // ---------- render ----------
  if (loadError)
    return (
      <Shell>
        <div className="state">
          <h2>That video isn&rsquo;t here</h2>
          <p>{loadError}</p>
          <a className="btn btn-ink" href="/">Upload a video</a>
        </div>
      </Shell>
    );
  if (!project) return <Shell><div className="state"><Spinner size={22} /></div></Shell>;
  if (project.status === "processing") return <Processing project={project} />;
  if (project.status === "error")
    return (
      <Shell>
        <div className="state">
          <h2>We couldn&rsquo;t open that video</h2>
          <p>{project.error}</p>
          <a className="btn btn-ink" href="/">Try another video</a>
        </div>
      </Shell>
    );

  const selHasEdits = !!range && idx.slice(range.from, range.to + 1).some(Boolean);
  const selIsSugg = !!range && sugg.slice(range.from, range.to + 1).some(Boolean);
  const lipSeconds = units.reduce((s, u) => s + estimateUnitSeconds(u, ttsDur(u.text)), 0);
  const mod = isMac() ? "⌘" : "Ctrl+";

  return (
    <div className="editor">
      <header className="topbar">
        <Wordmark />
        <input
          className="title-input"
          defaultValue={project.name}
          aria-label="Video name"
          onBlur={(e) => {
            const name = e.target.value.trim();
            if (name && name !== project.name)
              api(`/api/projects/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) }).then(() =>
                setProject({ ...project, name })
              );
          }}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        />
        <span className={`save-state is-${saved}`}>{saved === "saving" ? "Saving" : saved === "error" ? "Not saved" : edits.length ? "Saved" : ""}</span>
        <div className="topbar-spacer" />
        <KeysButton status={status} compact />
        <div className="history">
          <button className="icon-btn" onClick={undo} disabled={!past.current.length} title={`Undo (${mod}Z)`} aria-label="Undo">
            <Icon name="undo" />
          </button>
          <button className="icon-btn" onClick={redo} disabled={!future.current.length} title={`Redo (${mod}Shift+Z)`} aria-label="Redo">
            <Icon name="redo" />
          </button>
        </div>
        <button className="btn btn-ghost-light" onClick={runCleanup} disabled={cleanup.state === "loading"} title="Find ums, repeats and false starts">
          {cleanup.state === "loading" ? <Spinner /> : <Icon name="spark" />} Clean up
        </button>
        <button className="btn btn-render" onClick={openSheet} disabled={!edits.length && !job}>
          {job?.status === "running" ? (
            <>
              <Spinner /> Rendering
            </>
          ) : (
            "Render"
          )}
        </button>
      </header>

      <section className="studio">
        <Player
          ref={player}
          src={fileUrl(id, project.playbackFile)}
          duration={duration}
          peaks={project.peaks}
          skips={skips}
          units={units}
          suggestions={liveSuggestions}
          wordStarts={wordStarts}
          voices={voices}
          preview={preview}
          editedLength={editedLength}
          aspect={project.width && project.height ? project.width / project.height : 16 / 9}
          onPreviewChange={setPreview}
          onTime={(t, playing) => {
            let lo = 0;
            let hi = words.length - 1;
            let found = -1;
            while (lo <= hi) {
              const m = (lo + hi) >> 1;
              if (words[m].start <= t + 0.02) {
                found = m;
                lo = m + 1;
              } else hi = m - 1;
            }
            if (found >= 0 && t > words[found].end + 0.6) found = -1;
            transcript.current?.highlight(found, playing);
          }}
        />
        <div className="studio-foot">
          <p className="tally">
            {edits.length === 0 ? (
              "No edits yet"
            ) : (
              <>
                <span className="tally-cut">{plural(cuts, "cut")}</span>
                <span className="tally-rw">{plural(rewrites, "rewrite")}</span>
              </>
            )}
          </p>
          <p className="keys">
            <kbd>Space</kbd> play <kbd>Delete</kbd> cut <kbd>Enter</kbd> rewrite <kbd>{mod}Z</kbd> undo
          </p>
        </div>
      </section>

      <section className="desk">
        {(cleanup.state === "done" || cleanup.state === "error") && (
          <div className={`banner ${cleanup.state === "error" ? "is-error" : liveSuggestions.length ? "" : "is-calm"}`} role="status">
            {cleanup.state === "error" ? (
              <p>{cleanup.msg}</p>
            ) : liveSuggestions.length ? (
              <p>
                {cleanup.source === "claude" ? "Claude" : "A quick scan"} marked {plural(liveSuggestions.length, "spot")} to cut: fillers, repeats and false starts.
                They&rsquo;re underlined in the transcript.
              </p>
            ) : (
              <p>Nothing to clean up. The speech is already tidy.</p>
            )}
            <div className="banner-actions">
              {cleanup.state === "done" && liveSuggestions.length > 0 && (
                <button className="btn btn-red" onClick={acceptAll}>
                  Cut all {liveSuggestions.length}
                </button>
              )}
              <button
                className="btn btn-quiet"
                onClick={() => {
                  setSuggestions([]);
                  setCleanup({ state: "idle" });
                }}
              >
                {liveSuggestions.length ? "Dismiss" : "Close"}
              </button>
            </div>
          </div>
        )}
        {project.demoTranscript && (
          <p className="demo-note">This is a placeholder transcript. Add your OpenAI key under Keys, then upload again to transcribe the real speech.</p>
        )}
        <Transcript
          ref={transcript}
          words={words}
          paragraphs={project.paragraphs}
          idx={idx}
          unitOf={unitOf}
          sugg={sugg}
          range={range}
          voices={voices}
          onPointerWord={onPointerWord}
          onBlank={() => {
            setSel(null);
            setRewrite(null);
          }}
          onOpenRewrite={(e) => openRewrite(e.from, e.to)}
          onPreviewUnit={previewUnit}
        >
          <SelectionLayer
            transcript={transcript}
            range={range}
            rewrite={rewrite}
            hasEdits={selHasEdits}
            isSugg={selIsSugg}
            original={rewrite ? originalText(words, rewrite.from, rewrite.to) : ""}
            onCut={() => range && cut(range.from, range.to)}
            onRewrite={() => range && openRewrite(range.from, range.to)}
            onRestore={() => range && (restore(range.from, range.to), setSel(null))}
            onPlay={() => range && playFrom(range.from)}
            onDraft={(draft) => setRewrite((r) => (r ? { ...r, draft } : r))}
            onApply={applyRewrite}
            onCancel={() => setRewrite(null)}
          />
        </Transcript>
      </section>

      <RenderSheet
        open={sheet}
        onClose={() => setSheet(false)}
        projectId={id}
        projectName={project.name}
        status={status}
        cuts={cuts}
        units={units}
        lipSyncSeconds={lipSeconds}
        credits={(m) => estimateCredits(units, project.fps, m, ttsDur)}
        mode={mode}
        scope={scope}
        onMode={setMode}
        onScope={setScope}
        job={job}
        starting={starting}
        startError={startError}
        onStart={startRender}
        onNew={() => setSheetStage("setup")}
        sourceUrl={fileUrl(id, project.playbackFile)}
        dirty={dirty}
        stage={sheetStage}
      />
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="shell">
      <header className="home-bar">
        <Wordmark />
      </header>
      {children}
    </div>
  );
}

const STAGES = ["Receiving the upload", "Reading the video", "Making a preview your browser can play", "Transcribing", "Drawing the waveform"];

function Processing({ project }: { project: ProjectView }) {
  const current = STAGES.indexOf(project.stage ?? "");
  const shown = STAGES.filter((s, i) => i !== 2 || current === 2);
  return (
    <Shell>
      <div className="processing">
        <h2>{project.name}</h2>
        <ol className="steps">
          {shown.map((s) => {
            const i = STAGES.indexOf(s);
            const st = i < current ? "done" : i === current ? "active" : "waiting";
            return (
              <li key={s} className={`step is-${st}`}>
                <span className="step-mark">{st === "done" ? <Icon name="check" size={14} /> : st === "active" ? <Spinner size={12} /> : null}</span>
                <span className="step-text">{s}</span>
              </li>
            );
          })}
        </ol>
        <div className="ghost-page" aria-hidden>
          {[92, 78, 85, 60, 88, 71, 40].map((w, i) => (
            <span key={i} style={{ width: `${w}%` }} />
          ))}
        </div>
      </div>
    </Shell>
  );
}
