# Retake

Edit a video by editing its transcript.

- **Cut**: select words and press Delete. The clip is cut there.
- **Rewrite**: select words and start typing. The line is spoken again in the speaker's cloned voice, and Magic Hour re-syncs their lips to it.
- **Clean up**: Claude marks fillers, stutters and false starts; cut them all in one click.

Playback previews your edits live: cut material is skipped and rewritten lines play in the cloned voice, before you spend anything on lip sync.

## Run it

Needs Node 20+.

```bash
npm install
cp .env.example .env.local   # add your keys
npm run dev                  # http://localhost:3000
```

| Key | Used for | Without it |
| --- | --- | --- |
| `OPENAI_API_KEY` | Whisper transcription with word timestamps (about $0.006 per minute) | Placeholder transcript |
| `MAGIC_HOUR_API_KEY` | Voice cloning and lip sync | Placeholder tone, no lip sync |
| `ANTHROPIC_API_KEY` | The Clean up button | Basic um/uh/repeat scan |

With no keys at all the whole app still runs in demo mode, so you can try the editor first. ffmpeg ships with the app via `ffmpeg-static`, so there's nothing else to install.

## How a render works

1. Each rewrite becomes a **unit**. By default it widens to the whole sentence, so the cloned voice speaks naturally instead of a lone synthetic word spliced into real speech. You can switch to "only the changed words" in the render panel.
2. The unit's text goes to Magic Hour's **AI Voice Cloner**, using up to 45 seconds of the original speaker as the reference. The result is cached, and the same clip is what you hear in the editor's preview.
3. The original footage for that unit becomes the lip sync driver. If the new line runs longer than the original, the footage is extended by playing it forward then backward, so there's no frozen frame.
4. Magic Hour **Lip Sync** re-animates the mouth on just that clip (`start_seconds`/`end_seconds`), billed per frame at up to 30 fps.
5. Kept sections and synced units are encoded to identical settings and joined, with 12 ms audio fades at every seam to avoid clicks.

Cuts happen at the midpoint of the pause between words, so jump cuts keep natural breathing room.

Credits: Lite and Standard cost 1 credit per frame, Pro costs 2. A 4-second rewritten sentence at 30 fps is about 120 credits on Standard. The render panel shows the estimate before you commit.

## Deploying

See [DEPLOY.md](DEPLOY.md) for step-by-step hosting on Railway, pricing and payments. In short: it needs a long-running Node server with a persistent disk (not Vercel), and you should set `SITE_PASSWORD` so strangers can't spend your API credits.

## Layout

- `lib/timeline.ts`: the edit model shared by browser and server (cuts, rewrites, units, playback skips, credit estimates)
- `lib/server/`: ingest (probe, Whisper, waveform), voice cloning, render pipeline, Magic Hour client, Claude cleanup
- `components/`: `Editor` (state, shortcuts), `Transcript` (marked-up page, selection, rewrite box), `Player` (edit-aware playback, timeline), `RenderSheet`
