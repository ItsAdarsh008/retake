# Retake

**Edit the words. The video follows.**

Retake fixes a video by editing its transcript, like a doc. Delete words and they're cut from the video. Type new words and the speaker says them in their own voice, with their lips re-synced to match. No reshoot.

**Watch the demo** in the [demo folder](https://drive.google.com/drive/folders/1oRdGkvuHgx4K9GDVt6YJ8utbkKUT9SXM):

- **Retake reel (45s)**: vertical, for Instagram Reels, TikTok and YouTube Shorts.
- **Retake demo - LinkedIn and X (45s)**: horizontal, with an on-screen explanation of each step.
- **Retake demo (15s)**: horizontal, a quicker cut for X.

In the demo, the speaker says "we're gonna film a few people". The fix "three" is typed into the transcript, and the rendered clip says "three" in the same voice, lips matching.

## What it does

| Feature | How you use it | What happens |
| --- | --- | --- |
| **Cut** | Select words, press Delete | That part of the video is removed, cut in the natural pause between words |
| **Rewrite** | Select words, start typing | The sentence is spoken again in the speaker's cloned voice, and their lips are re-synced to the new words |
| **Clean up** | One button | Finds the ums, stutters and false starts so you can cut them all in one click |
| **Preview** | Press play | Plays the video with your edits, new lines in the cloned voice, before you render anything |

## Who it's for

- **Creators who misspoke on camera:** a wrong number, name, date or price.
- **Anyone tidying a take:** a swear, a stumble, a long pause, filler words.
- **Brands with evergreen videos:** a price or date changes and one line is out of date, but the rest of the video is fine.
- **Founders making product videos:** record once, fix the script afterwards.

## How it works for the person using it

1. **Upload a video** (MP4, MOV, WebM or MKV, up to 500 MB). The transcript appears with every word timed. A three-minute video took about 15 seconds.
2. **Edit the text.** Cut, rewrite or clean up.
3. **Preview** with play.
4. **Render and download.** A rewrite takes a few minutes because the lips are re-synced; the one in the demo took about 5.

No sign-up, no account, no payment. Each browser only sees the videos it uploaded.

## What it costs, and who pays

| | Who pays | Cost |
| --- | --- | --- |
| Transcripts (OpenAI) | Us | About $0.006 per minute of video, so a 3-minute video costs about 2 cents |
| Voice and lip sync (Magic Hour) | Us | About $0.13 per rewritten sentence |
| Clean up | Free | A basic um/uh scan, or Claude if we add an Anthropic key |

Users don't need any API keys or an account. Lip sync is free for them up to about 3 rewritten sentences per person per day, and our total lip-sync spend is capped at about $3 a day. Both limits can be changed; see [SETUP.md](SETUP.md).

## What to promise, and what not to

**Safe to say:**

- "Fix what you said without a reshoot."
- "In your own voice, lips synced."
- "Edit video like a doc."

**Avoid:**

- **"Instant."** Cuts are quick, but a rewrite takes a few minutes to render.
- **"Works on any video."** It works best on talking-head clips: one speaker, face visible and facing the camera, clear audio.
- **"Changes the captions too."** Captions burned into the picture (the TikTok style) keep the old words. Captions added on the platform are fine.
- **"Unlimited."** Each person gets about 3 rewritten sentences a day, and the whole site has a daily limit.

**Consent:** Retake clones voices and changes what people appear to say. Only show or encourage it on footage of yourself, or of people who agreed. Every campaign and creator brief should say so.

## Brand basics

- **Name:** Retake. **Tagline:** "Edit the words. The video follows."
- **Wordmark:** "Retake" in Newsreader, with "Re" in italic blue and a proofreader's caret (‸) under it.
- **Look:** an editing desk. The video sits on a dark desk and the transcript is a sheet of paper, marked up in red for cuts and blue for rewrites.
- **Colours:**
  - Slate `#1D2026` (background)
  - Paper `#F4F6F8`
  - Blue `#2A54D6` (rewrites)
  - Light blue `#8EABFF`
  - Red `#CF3346` (cuts)
- **Fonts:** all free on Google Fonts.
  - Newsreader for headlines and transcripts
  - Schibsted Grotesk for interface text
  - JetBrains Mono for small labels

## Measuring results

Retake can report the whole path for each creator: views (on the platform), then visits, uploads, renders and downloads (in [Umami](https://umami.is), a free, cookieless analytics tool).

- **Give every creator their own link,** like `https://<our site>/?utm_source=jane&utm_medium=social&utm_campaign=launch`.
- **In Umami, filter by UTM source** to see that creator's visits, uploads, renders and downloads.
- **There are no accounts,** so there are no signups. The closest thing is a first upload.
- **Transcript spend** shows in our OpenAI dashboard, and lip-sync spend in Magic Hour's.

Setting this up takes about 5 minutes; see [SETUP.md](SETUP.md), section 4.

## Sharing with creators

While it's in preview, the site can be password-protected. Creators then get just the link and the password: no API keys, no sign-up. See [SETUP.md](SETUP.md), section 3.

## More

- [SETUP.md](SETUP.md): putting it online (Railway, about 15 minutes; it can't run on Vercel), what it can cost, and analytics.
- [DEVELOPING.md](DEVELOPING.md): running it locally, how a render works, where the code lives.
- [demo/README.md](demo/README.md): how the demo video is made and how to remake it with new footage.
