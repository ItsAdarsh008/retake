# Retake demo video

The product demo, built with [Remotion](https://www.remotion.dev), in two layouts from the same recording:

- **`RetakeReel`**: 1080×1920 vertical, for Instagram Reels, TikTok and YouTube Shorts. Full-screen face and app, with text kept clear of each app's own buttons.
- **`RetakeWide`**: 1920×1080 horizontal, for LinkedIn and X. The face sits beside the live captions, and the app screen sits beside a large step title and a one-line explanation, so it reads with the sound off.

Both are about 45 seconds and share every beat and timing. The app footage is the real app at phone size, driven by a script, so remaking the video with new footage is three commands.

It's built around what tends to work on short-form feeds:

- **The payoff comes first.** The lip-synced fix lands within about 7 seconds.
- **No setup on screen.** API keys never appear.
- **Hard cuts.** No fades.
- **Captions that work with the sound off.**
- **Text stays inside the safe zone,** clear of the app's own buttons and caption.

| Beat | What's on screen |
| --- | --- |
| Take | The original clip, full screen, with live captions. It freezes on the wrong words. |
| Edit | The real app: select the words, type the fix |
| Retake | The rendered clip says the new words in the same voice, lips synced, zooming in on the face |
| Title | Wordmark and tagline |
| Steps 1–4 | Upload, delete words to cut, hear the new line in the cloned voice, render |
| Before and after | Both versions side by side, played one after the other |
| End card | Wordmark, line, and an optional call to action |

## Make it

Needs Node 20+, ffmpeg on your PATH and Google Chrome. Run the app with your keys in `.env.local` (Magic Hour, plus OpenAI for transcripts).

```bash
cd demo
npm install

# 1. Run the app on its own data folder
cd .. && npm run build && RETAKE_DATA_DIR=./.demo-data npx next start -p 3474

# 2. Record the walkthrough at phone size (about 7 minutes, most of it waiting on Magic Hour)
cd demo
node scripts/capture.mjs --app http://localhost:3474 --clip "path/to/clip.mp4"

# 3. Collect the clips and timings, then render (the key lets Whisper time the captions of the new line)
OPENAI_API_KEY=sk-... node scripts/prepare.mjs --data ../.demo-data
npx remotion render RetakeReel "out/Retake reel.mp4"
npx remotion render RetakeWide "out/Retake wide.mp4"
```

Level the audio for each platform after rendering: about −14 LUFS for Reels and TikTok, −16 LUFS for LinkedIn and X (ffmpeg's `loudnorm` filter).

`npm run dev` opens Remotion Studio to preview and tweak the video. To add a call to action to the end card, render with `--props='{"cta":"Link in bio"}'`.

The recording costs roughly 250 Magic Hour credits (about $0.25): one voice clone and one lip-synced sentence.

## What to change

- **`plan.json`**: what the script does in the app.
  - `cut`: phrases to select and delete. The first one is the one the video shows.
  - `rewrites`: phrases to type over. Every rewrite except the last is treated as a transcript fix (shown as it was actually said). The last one is the correction the video is about.
  - `redact`: words to blur on screen, such as a swear.
  - `viewport`: the phone size the app is filmed at. Remove it to film the desktop layout.
  - `cleanup`: set it to `true` once an Anthropic key is in the Keys panel.
- **`src/timeline.ts`**: the beats, their speeds, zoom targets and sound effects. All timings come from the markers the capture logs and the transcript, so a new recording re-times the video automatically.
- **`src/scenes.tsx`**: how each beat looks in the vertical layout. **`src/scenes-wide.tsx`**: the horizontal layout. Each app beat's `sub` line in `timeline.ts` is the explanation shown in the horizontal one.

The recording, footage and renders land in `capture/`, `public/` and `out/`, and the timings in `src/data.json`. Git ignores all of them, so a fresh clone needs steps 1–3 before Remotion Studio will open.
