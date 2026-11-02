import fs from "node:fs/promises";
import path from "node:path";
import { env } from "./env";
import { ffmpeg, probe, sceneCuts } from "./ffmpeg";
import { newId, projectDir, saveJob, updateProject } from "./store";
import { synthesize } from "./voice";
import { record, reserve } from "./budget";
import * as mh from "./magichour";
import { buildPieces, estimateCredits, buildUnits, lipSyncFps, type Unit } from "../timeline";
import type { LipSyncMode, Project, RenderJob, RenderStep, Scope } from "../types";

const live = new Map<string, RenderJob>();
export const liveJob = (id: string) => live.get(id);

const even = (n: number) => Math.max(2, n - (n % 2));
const clip = (s: string, n = 48) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);

/** Starts a render billed to `visitor`. Throws BudgetError if their lip sync allowance can't cover it. */
export async function startRender(p: Project, mode: LipSyncMode, scope: Scope, visitor: string): Promise<RenderJob> {
  const pieces = buildPieces(p.words, p.edits, p.duration, scope);
  const units = pieces.flatMap((x) => (x.kind === "unit" ? [x.unit] : []));
  const keeps = pieces.filter((x) => x.kind === "keep").length;
  const steps: RenderStep[] = [
    ...units.map((u, k) => ({ key: `u${k}`, label: `“${clip(u.text)}”`, status: "waiting" as const })),
    { key: "cut", label: `Cutting ${keeps} kept section${keeps === 1 ? "" : "s"}`, status: "waiting" },
    { key: "stitch", label: "Stitching the final video", status: "waiting" },
  ];
  const job: RenderJob = {
    id: newId(),
    projectId: p.id,
    status: "running",
    createdAt: new Date().toISOString(),
    mode,
    scope,
    steps,
    creditsEstimate: estimateCredits(units, p.fps, mode, () => undefined),
    creditsCharged: 0,
    demo: !env.magicHourKey,
  };
  // Hold the estimate up front; run() settles it to what Magic Hour actually charged.
  const held = job.demo ? 0 : job.creditsEstimate;
  if (held) await reserve(visitor, held);
  live.set(job.id, job);
  await saveJob(job);
  run(p, job, pieces)
    .catch(() => {})
    .finally(() => record(visitor, job.creditsCharged - held).catch(() => {}));
  return job;
}

async function run(p: Project, job: RenderJob, pieces: ReturnType<typeof buildPieces>) {
  const dir = projectDir(p.id);
  const work = path.join(dir, "renders", job.id);
  await fs.mkdir(work, { recursive: true });
  const src = path.join(dir, p.sourceFile);
  const W = even(p.width);
  const H = even(p.height);
  const F = p.fps || 30;
  const step = (key: string, patch: Partial<RenderStep>) => {
    const s = job.steps.find((x) => x.key === key);
    if (s) Object.assign(s, patch);
    saveJob(job).catch(() => {});
  };

  const vnorm = `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${F},format=yuv420p`;
  const anorm = "aresample=48000,aformat=sample_fmts=s16:channel_layouts=stereo";
  const venc = ["-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-c:a", "pcm_s16le"];
  const fade = (len: number) =>
    `afade=t=in:d=0.012,afade=t=out:st=${Math.max(0, len - 0.012).toFixed(3)}:d=0.012`;

  try {
    // 1. Regenerate each rewritten line (voice clone → lip sync), two at a time.
    const units = pieces.flatMap((x) => (x.kind === "unit" ? [x.unit] : []));
    const unitOut = new Map<Unit, { video: string; audio: string; len: number }>();
    let next = 0;
    const worker = async () => {
      while (next < units.length) {
        const k = next++;
        const u = units[k];
        unitOut.set(u, await renderUnit(p, job, u, k, path.join(work, `u${k}`), src, step));
      }
    };
    await Promise.all([worker(), worker()]);

    // 2. Encode every piece to identical parameters so they concatenate cleanly.
    step("cut", { status: "active" });
    const segs: string[] = [];
    let n = 0;
    for (const piece of pieces) {
      const out = path.join(work, `seg${String(n++).padStart(4, "0")}.mov`);
      if (piece.kind === "keep") {
        const len = piece.end - piece.start;
        const audioIn = p.hasAudio ? [] : ["-f", "lavfi", "-t", len.toFixed(3), "-i", "anullsrc=r=48000:cl=stereo"];
        await ffmpeg([
          "-ss", piece.start.toFixed(3), "-t", len.toFixed(3), "-i", src, ...audioIn,
          "-map", "0:v:0", "-map", p.hasAudio ? "0:a:0" : "1:a:0",
          "-vf", vnorm, "-af", `${anorm},${fade(len)}`, "-t", len.toFixed(3), ...venc, out,
        ]);
      } else {
        const r = unitOut.get(piece.unit)!;
        await ffmpeg([
          "-i", r.video, "-i", r.audio, "-map", "0:v:0", "-map", "1:a:0",
          "-vf", `${vnorm},tpad=stop_mode=clone:stop_duration=3`, "-af", `${anorm},apad,${fade(r.len)}`,
          "-t", r.len.toFixed(3), ...venc, out,
        ]);
      }
      segs.push(out);
      step("cut", { detail: `${segs.length} of ${pieces.length}` });
    }
    step("cut", { status: "done", detail: undefined });

    // 3. Join.
    step("stitch", { status: "active" });
    const list = path.join(work, "list.txt");
    // ffmpeg reads relative entries against the list's own folder, so write absolute
    // paths (a relative RETAKE_DATA_DIR like ./.data would otherwise be doubled).
    await fs.writeFile(list, segs.map((s) => `file '${path.resolve(s).replace(/'/g, "'\\''")}'`).join("\n"));
    const final = path.join(dir, "renders", `${job.id}.mp4`);
    await ffmpeg([
      "-f", "concat", "-safe", "0", "-i", list, "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
      "-movflags", "+faststart", final,
    ]);
    step("stitch", { status: "done" });

    job.output = `renders/${job.id}.mp4`;
    job.outputDuration = (await probe(final)).duration;
    job.status = "done";
    job.finishedAt = new Date().toISOString();
    await fs.rm(work, { recursive: true, force: true });
    await updateProject(p.id, (pp) => {
      pp.lastRenderId = job.id;
    });
  } catch (e: any) {
    job.status = "error";
    job.error = e?.message || String(e);
    job.finishedAt = new Date().toISOString();
    for (const s of job.steps) if (s.status === "active") s.status = "error";
  } finally {
    await saveJob(job);
    setTimeout(() => live.delete(job.id), 60_000);
  }
}

async function renderUnit(
  p: Project,
  job: RenderJob,
  u: Unit,
  k: number,
  base: string,
  src: string,
  step: (key: string, patch: Partial<RenderStep>) => void
) {
  const key = `u${k}`;
  const fps = lipSyncFps(p.fps);
  step(key, { status: "active", detail: job.demo ? "Placeholder voice (demo mode)" : "Cloning the voice" });
  try {
    const voice = await synthesize(p, u.text);
    if (voice.fresh) job.creditsCharged += voice.credits;

    // Rebuild the pauses around the line, then the new speech in between.
    const lead = Math.max(0.02, u.speechStart - u.start);
    const trail = Math.max(0.02, u.end - u.speechEnd);
    const len = lead + voice.duration + trail;
    const audio = `${base}.wav`;
    await ffmpeg([
      "-f", "lavfi", "-t", lead.toFixed(3), "-i", "anullsrc=r=48000:cl=mono",
      "-i", voice.file,
      "-f", "lavfi", "-t", trail.toFixed(3), "-i", "anullsrc=r=48000:cl=mono",
      "-filter_complex", "[0:a][1:a][2:a]concat=n=3:v=0:a=1[a]", "-map", "[a]", "-ac", "1", "-ar", "48000", audio,
    ]);

    // Driver footage: the original take. If the new line runs longer, extend it
    // by playing the take forward then backward (ping-pong) so there are no freezes.
    // A take that ends in a cut or transition would ping-pong back through it, so it
    // ends just before any cut in its final second.
    const orig = u.end - u.start;
    const tailCut = (await sceneCuts(src, u.start, orig)).filter((c) => c > 0.6 && c > orig - 1).sort((a, b) => a - b)[0];
    const take = tailCut === undefined ? orig : tailCut - 0.12;
    const driver = `${base}.driver.mp4`;
    // Cap the short side at 1080 so portrait clips aren't shrunk to 608x1080.
    const scale = "scale='if(gte(iw,ih),-2,min(iw,1080))':'if(gte(iw,ih),min(ih,1080),-2)',fps=" + fps;
    const enc = ["-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "17", "-pix_fmt", "yuv420p"];
    if (len <= take + 0.02) {
      await ffmpeg(["-ss", u.start.toFixed(3), "-t", len.toFixed(3), "-i", src, "-vf", scale, ...enc, driver]);
    } else {
      const fwd = `${base}.fwd.mp4`;
      const pp = `${base}.pp.mp4`;
      await ffmpeg(["-ss", u.start.toFixed(3), "-t", take.toFixed(3), "-i", src, "-vf", scale, ...enc, fwd]);
      await ffmpeg([
        "-i", fwd, "-filter_complex", "[0:v]split[a][b];[b]reverse[r];[a][r]concat=n=2:v=1:a=0[v]",
        "-map", "[v]", ...enc, pp,
      ]);
      await ffmpeg(["-stream_loop", "-1", "-i", pp, "-t", len.toFixed(3), ...enc, driver]);
    }

    let video = driver;
    if (!job.demo) {
      step(key, { detail: "Uploading to Magic Hour" });
      const [videoPath, audioPath] = await Promise.all([mh.upload(driver, "video"), mh.upload(audio, "audio")]);
      const created = await mh.createLipSync({
        videoPath,
        audioPath,
        seconds: len,
        fps,
        mode: job.mode,
        name: `Retake · ${p.name}`.slice(0, 80),
      });
      job.creditsCharged += created.credits_charged;
      step(key, { detail: "Waiting for a lip sync slot" });
      const t0 = Date.now();
      const done = await mh.waitFor("video", created.id, (s) => {
        if (s === "rendering") step(key, { detail: "Lip syncing" });
      });
      job.creditsCharged += (done.credits || created.credits_charged) - created.credits_charged;
      video = `${base}.synced.mp4`;
      await mh.download(done.url, video);
      step(key, { detail: `Lip synced in ${Math.round((Date.now() - t0) / 1000)}s` });
    }
    step(key, { status: "done" });
    return { video, audio, len };
  } catch (e: any) {
    step(key, { status: "error", detail: e?.message });
    throw e;
  }
}

export { buildUnits };
