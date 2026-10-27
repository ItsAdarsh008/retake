import path from "node:path";
import { env } from "./env";
import { ffmpeg, peaks, probe } from "./ffmpeg";
import { projectDir, readProject, updateProject } from "./store";
import { demoTranscript, whisper } from "./transcribe";

const BROWSER_SAFE = new Set(["h264", "vp8", "vp9", "av1"]);

/** Probe → playable proxy if needed → transcript → waveform. Runs in the background after upload. */
export async function processProject(id: string) {
  const stage = (s: string) => updateProject(id, (p) => void (p.stage = s));
  try {
    const p = await readProject(id);
    if (!p) return;
    const dir = projectDir(id);
    const src = path.join(dir, p.sourceFile);

    await stage("Reading the video");
    const info = await probe(src);
    if (!info.width) throw new Error("That file doesn't have a video track.");
    if (info.duration < 1) throw new Error("That video is too short to edit.");

    let playbackFile = p.sourceFile;
    if (!BROWSER_SAFE.has(info.videoCodec) || /\.(mkv|avi|wmv|flv)$/i.test(p.sourceFile)) {
      await stage("Making a preview your browser can play");
      playbackFile = "preview.mp4";
      await ffmpeg([
        "-i", src, "-vf", "scale=-2:'min(ih,720)'", "-c:v", "libx264", "-preset", "veryfast", "-crf", "24",
        "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", path.join(dir, playbackFile),
      ]);
    }
    await updateProject(id, (pp) => {
      Object.assign(pp, {
        duration: info.duration,
        width: info.width,
        height: info.height,
        fps: info.fps,
        hasAudio: info.hasAudio,
        playbackFile,
      });
    });

    let transcript;
    let demo = false;
    if (!info.hasAudio) throw new Error("That video has no audio track, so there's nothing to transcribe.");
    if (env.openaiKey) {
      await stage("Transcribing");
      const audio = path.join(dir, "audio.mp3");
      await ffmpeg(["-i", src, "-vn", "-ac", "1", "-ar", "16000", "-b:a", "40k", audio]);
      transcript = await whisper(audio);
      if (!transcript.words.length) throw new Error("Whisper didn't hear any speech in that video.");
    } else {
      demo = true;
      transcript = demoTranscript(info.duration);
    }

    await stage("Drawing the waveform");
    const wave = await peaks(src);

    await updateProject(id, (pp) => {
      Object.assign(pp, {
        words: transcript.words,
        paragraphs: transcript.paragraphs,
        peaks: wave,
        demoTranscript: demo,
        status: "ready",
        stage: undefined,
      });
    });
  } catch (e: any) {
    await updateProject(id, (pp) => {
      pp.status = "error";
      pp.error = e?.message || String(e);
      pp.stage = undefined;
    }).catch(() => {});
  }
}
