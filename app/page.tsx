"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, uploadVideo } from "@/lib/client";
import { track } from "@/lib/analytics";
import { formatTime } from "@/lib/timeline";
import type { ProjectSummary, Status } from "@/lib/types";
import { Wordmark } from "@/components/bits";
import { KeysButton, openKeys, useNeedsOpenai } from "@/components/Keys";

const ACCEPT = "video/mp4,video/quicktime,video/webm,video/x-m4v,.mp4,.mov,.m4v,.webm,.mkv";

export default function Home() {
  const router = useRouter();
  const [status, setStatus] = useState<Status | null>(null);
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [drag, setDrag] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const abortRef = useRef<() => void>(undefined);
  const needsOpenai = useNeedsOpenai(status);

  useEffect(() => {
    api<Status>("/api/status").then(setStatus).catch(() => {});
    api<ProjectSummary[]>("/api/projects").then(setProjects).catch(() => setProjects([]));
  }, []);

  async function start(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("video/") && !/\.(mp4|mov|m4v|webm|mkv)$/i.test(file.name)) {
      setError("That isn't a video file. Try an MP4, MOV or WebM.");
      return;
    }
    setError("");
    setFileName(file.name);
    setProgress(0);
    const { promise, abort } = uploadVideo(file, setProgress);
    abortRef.current = abort;
    try {
      const id = await promise;
      track("upload");
      router.push(`/p/${id}`);
    } catch (e: any) {
      setProgress(null);
      if (e.message !== "Upload canceled") setError(e.message);
    }
  }

  return (
    <main className="home">
      <header className="home-bar">
        <Wordmark />
        <KeysButton status={status} />
      </header>

      <section className="home-stage">
        <div
          className={`drop ${drag ? "is-over" : ""} ${progress !== null ? "is-busy" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            if (progress === null) start(e.dataTransfer.files[0]);
          }}
        >
          {progress === null ? (
            <>
              <div className="drop-frame" aria-hidden>
                <span />
                <span />
                <span />
                <span />
              </div>
              <h2>Drop a video of someone talking</h2>
              <p>MP4, MOV or WebM. One speaker facing the camera works best.</p>
              <button className="btn btn-light" onClick={() => input.current?.click()}>
                Choose a video
              </button>
              <input
                ref={input}
                type="file"
                accept={ACCEPT}
                hidden
                onChange={(e) => start(e.target.files?.[0])}
              />
              {needsOpenai && (
                <p className="drop-keys">
                  Transcripts run on your OpenAI key.{" "}
                  <button type="button" onClick={openKeys}>
                    Add it first
                  </button>{" "}
                  or try the editor with a placeholder transcript.
                </p>
              )}
              {error && <p className="drop-error" role="alert">{error}</p>}
            </>
          ) : (
            <div className="upload-progress">
              <p className="upload-name">{fileName}</p>
              <div className="bar">
                <div style={{ width: `${Math.round(progress * 100)}%` }} />
              </div>
              <p className="upload-pct">
                {progress < 1 ? `Uploading ${Math.round(progress * 100)}%` : "Opening the editor"}
              </p>
              {progress < 1 && (
                <button className="btn btn-ghost-light" onClick={() => abortRef.current?.()}>
                  Cancel
                </button>
              )}
            </div>
          )}
        </div>

        <div className="pitch">
          <h1>Edit the words. The video follows.</h1>
          <p className="pitch-lede">
            Retake transcribes your video so you can edit it like a document. Cut a word and the clip is cut. Rewrite a line and
            it&rsquo;s spoken again in the same voice, with the lips re-synced to match.
          </p>
          <div className="specimen" aria-label="Example of an edited transcript">
            <p>
              <span>So the launch is </span>
              <del className="mk-cut">um, </del>
              <span>happening on </span>
              <del className="mk-rw">Tuesday</del>
              <ins className="mk-ins">Thursday</ins>
              <span>, and </span>
              <del className="mk-cut">like, </del>
              <span>everyone gets early access.</span>
            </p>
          </div>
          <dl className="legend">
            <div>
              <dt><span className="swatch swatch-cut" /> Cut</dt>
              <dd>Select words and press Delete.</dd>
            </div>
            <div>
              <dt><span className="swatch swatch-rw" /> Rewrite</dt>
              <dd>Select words and start typing.</dd>
            </div>
            <div>
              <dt><span className="swatch swatch-clean" /> Clean up</dt>
              <dd>Claude marks the ums, repeats and false starts for you.</dd>
            </div>
          </dl>
        </div>
      </section>

      {projects && projects.length > 0 && (
        <section className="recent">
          <h3>Your videos</h3>
          <ul>
            {projects.map((p) => (
              <li key={p.id}>
                <a href={`/p/${p.id}`}>
                  <span className="recent-name">{p.name}</span>
                  <span className="recent-meta">
                    {p.status === "processing"
                      ? p.stage || "Processing"
                      : p.status === "error"
                        ? "Couldn't process"
                        : `${formatTime(p.duration)}${p.edits ? `, ${p.edits} edit${p.edits === 1 ? "" : "s"}` : ""}`}
                  </span>
                  <span className="recent-date">
                    {new Date(p.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
