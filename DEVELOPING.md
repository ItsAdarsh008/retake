# Developing Retake

The technical side: running it locally, how a render works, and where the code lives. To put it online, see [SETUP.md](SETUP.md).

## Run it

Needs Node 20+.

```bash
npm install
cp .env.example .env.local   # add your Magic Hour key
npm run dev                  # http://localhost:3000
```

Then click **Keys** in the top bar. Each person brings their own API keys for the cheap parts, and the site owner's Magic Hour key covers voice and lip sync, up to a daily cap.

| Key | Whose | Used for | Without it |
| --- | --- | --- | --- |
| OpenAI | The visitor's, in the Keys panel | Whisper transcription with word timestamps (about $0.006 per minute) | Placeholder transcript |
| Anthropic | The visitor's, optional | The Clean up button | Basic um/uh/repeat scan |
| `MAGIC_HOUR_API_KEY` | The site owner's, in `.env.local` | Voice cloning and lip sync | Placeholder tone, no lip sync |

Visitors' keys stay in their browser and go to the server only with the request that needs them. They're never stored there. With no keys at all, the app still runs in demo mode, so you can try the editor first. ffmpeg ships with the app via `ffmpeg-static`, so there's nothing else to install.

## How a render works

1. Each rewrite becomes a **unit**. By default it widens to the whole sentence, so the cloned voice speaks naturally instead of a lone synthetic word spliced into real speech. You can switch to "only the changed words" in the render panel.
2. The unit's text goes to Magic Hour's **AI Voice Cloner**, using up to 45 seconds of the original speaker as the reference. The result is cached, and the same clip is what you hear in the editor's preview. Its loudness is matched to the original speaker.
3. The original footage for that unit becomes the lip sync driver. If the new line runs longer than the original, the footage is extended by playing it forward then backward, turning around before any scene cut, so there's no frozen frame.
4. Magic Hour **Lip Sync** re-animates the mouth on just that clip (`start_seconds`/`end_seconds`), billed per frame at up to 30 fps.
5. Kept sections and synced units are encoded to identical settings and joined, with 12 ms audio fades at every seam to avoid clicks.

Cuts happen at the midpoint of the pause between words, so jump cuts keep natural breathing room.

Credits: Lite and Standard cost 1 credit per frame, Pro costs 2. A 4-second rewritten sentence at 30 fps is about 120 credits on Standard. The render panel shows the estimate before you commit.

## Layout

- `lib/timeline.ts`: the edit model shared by browser and server (cuts, rewrites, units, playback skips, credit estimates)
- `lib/server/`: ingest (probe, Whisper, waveform), voice cloning, render pipeline, Magic Hour client, Claude cleanup, per-visitor keys and ownership (`request.ts`), Magic Hour daily caps (`budget.ts`)
- `app/api/upload`: uploads, kept outside the middleware so large files aren't truncated
- `lib/analytics.ts`: the Umami events (`upload`, `keys-saved`, `render`, `render-done`, `download`). Analytics load only when `UMAMI_WEBSITE_ID` is set.
- `components/`: `Editor` (state, shortcuts), `Transcript` (marked-up page, selection, rewrite box), `Player` (edit-aware playback, timeline), `RenderSheet`, `Keys` (the bring-your-own-key panel)
- `demo/`: the product demo video. A script drives the real app and records it, and Remotion edits the result. See [demo/README.md](demo/README.md).
