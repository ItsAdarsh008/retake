# Setting up Retake

Retake doesn't take payments. Each visitor brings their own API keys for the cheap parts, and your Magic Hour key covers the expensive part for everyone, up to a daily cap you set.

| Service | Whose key | Used for | Cost |
| --- | --- | --- | --- |
| OpenAI | **The visitor's**, entered under **Keys** | Transcripts (Whisper, word timings) | About $0.006 per minute of video, billed to them |
| Anthropic | **The visitor's**, optional | The Clean up button | A fraction of a cent per video, billed to them |
| Magic Hour | **Yours**, set on the server | Voice cloning and lip sync | Billed to you, capped per day (see below) |

Visitors' keys stay in their browser. Each key is sent to your server with the one request that needs it, passed straight to OpenAI or Anthropic, and never saved or logged. Videos are tied to the browser that uploaded them, so visitors only ever see their own.

---

## 1. Get your Magic Hour key (5 min)

1. Sign up at **magichour.ai**, then go to **Developer → API keys** and create one (`mhk_live_...`).
2. Buy credits. The yearly Creator plan is $144 for 144,000 credits, so each credit costs about $0.001. Check your own dashboard, because their FAQ lists monthly prices that don't match.
3. Turn on auto top-up or a low-balance email, so lip sync doesn't stop when credits run out.

## 2. Run it locally (5 min)

Needs Node 20+.

```bash
npm install
cp .env.example .env.local   # paste your MAGIC_HOUR_API_KEY
npm run dev                  # http://localhost:3000
```

Click **Keys** in the top bar and paste your own OpenAI key (and Anthropic key if you have one). The keys are checked when you save. Then upload a 20-second clip of yourself talking to the camera.

For local testing you can also put `OPENAI_API_KEY` and `ANTHROPIC_API_KEY` in `.env.local`. Visitors' own keys always take priority over these. **Leave both unset on a public deploy**, or every visitor's transcripts get billed to you. The one exception is a password-protected site for creators (section 5).

## 3. Deploy to Railway (20 min)

Retake renders video with ffmpeg and a render can run for several minutes, so it needs an always-on server with a disk. Vercel and Netlify won't work: their functions time out and have no permanent storage.

1. Sign up at **railway.com** with GitHub. The Hobby plan is about $5/month including some usage.
2. **New Project → Deploy from GitHub repo → ItsAdarsh008/retake.** Railway runs `npm run build` and `npm start` on its own. It deploys the `main` branch and redeploys after every push. Projects on the volume are kept across deploys.
3. **Attach a volume** at mount path `/data` (right-click the service → *Attach volume*). Start with 5 GB.
4. In the **Variables** tab, add:

   ```
   MAGIC_HOUR_API_KEY=mhk_live_...
   RETAKE_DATA_DIR=/data
   MAGIC_HOUR_DAILY_CREDITS=3000
   MAGIC_HOUR_VISITOR_DAILY_CREDITS=400
   ```

   Don't add `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` here unless the site is password-protected (section 5).

   Variable changes take effect on the next deploy. If Railway shows a **Deploy** button for pending changes, click it.

5. **Settings → Networking → Generate Domain** gives you a `*.up.railway.app` URL.
6. Open it, add your own keys under **Keys**, and run one full test: a short clip, one cut and one rewrite, rendered on Lite. Check that the result downloads and plays.

If a deploy fails, **Deployments → View logs** shows why. It's usually a mistyped variable or a missing volume.

## 4. Choose your Magic Hour caps

Lip sync is almost all of the cost. Magic Hour charges 1 credit per frame on Lite and Standard (2 on Pro), and Retake syncs at up to 30 fps, so **one second of lip sync costs 30 credits, or about $0.03**. A rewritten sentence averages about 4 seconds. Voice cloning adds about 10 credits per line.

Two caps, both reset at midnight UTC:

| Variable | Default | What it allows | Most it can cost you |
| --- | --- | --- | --- |
| `MAGIC_HOUR_VISITOR_DAILY_CREDITS` | 400 | About 13 s of lip sync, or 3 rewritten sentences per person per day | $0.40 per person per day |
| `MAGIC_HOUR_DAILY_CREDITS` | 3000 | Everyone combined, about 100 s of lip sync per day | $3 per day, about $90 per month |

Set either one to `unlimited` to remove it. The render panel shows each visitor how many credits they have left and the estimate for their render. A render that wouldn't fit is refused before anything is sent to Magic Hour. If a render fails partway, the unused credits are returned to their allowance.

The per-person cap goes by IP address, so someone determined can get around it by switching networks. **The site-wide cap is your real ceiling.** Set it to what you're happy to lose on a bad day.

Cuts and Clean up never touch Magic Hour, so they're unlimited.

## 5. Share it with creators (private, no keys needed)

Most creators don't have an OpenAI API key. For a creator preview, password-protect the site and pay for their transcripts yourself, so all they need is the link and the password.

In Railway's **Variables** tab, add:

```
SITE_PASSWORD=pick-something-shareable
OPENAI_API_KEY=sk-...
MAGIC_HOUR_VISITOR_DAILY_CREDITS=1000
```

- **`SITE_PASSWORD`**: the browser asks for it once. Any username works.
- **`OPENAI_API_KEY`**: your key now does every transcript. The Keys panel shows the OpenAI key as optional, so creators aren't asked for one. Transcripts cost about $0.006 per minute, so a 3-minute video costs about 2 cents. Set a monthly limit at **platform.openai.com → Settings → Limits** anyway.
- **`MAGIC_HOUR_VISITOR_DAILY_CREDITS=1000`**: about 8 rewritten sentences per creator per day (about $1). Keep `MAGIC_HOUR_DAILY_CREDITS` at what you're happy to spend in total.

Send each creator their own tracked link (section 6) plus the password.

**Before a public launch**, remove `SITE_PASSWORD` *and* `OPENAI_API_KEY` together. With no password and your OpenAI key on the server, anyone could run transcripts on your bill.

## 6. Analytics and creator links

Retake can report visits, where they came from and what people did, through [Umami](https://umami.is). Umami is cookieless, so there's no cookie banner. Its Cloud Hobby plan is free, at about 100,000 events a month when this was written; check their pricing page.

1. Sign up at **cloud.umami.is**, then **Settings → Websites → Add website**. Enter your Railway domain.
2. Copy the **Website ID** and add it in Railway's **Variables** tab: `UMAMI_WEBSITE_ID=...`. Then deploy the change. The analytics script is added when the site is built, so it needs a fresh deploy.
3. Open the site, then check that a visit appears in Umami within a minute.

**What gets recorded**

- Page views. Project pages all count as `/p/[id]`, so no project ID is stored.
- Where each visit came from, including the `utm_` tags on creator links.
- These events:

| Event | When |
| --- | --- |
| `upload` | A video finished uploading |
| `keys-saved` | Someone saved their own API keys |
| `render` | A render started (with the lip sync mode) |
| `render-done` | A render finished |
| `download` | Someone downloaded the result |

No API keys, file names, transcripts or videos are sent.

**Creator links.** Give each creator their own link, so every visit and upload can be traced back to them:

```
https://your-app.up.railway.app/?utm_source=CREATOR&utm_medium=social&utm_campaign=launch
```

Replace `CREATOR` with a short lowercase name, such as `utm_source=jane`. Use the same `utm_campaign` for the whole push.

**Reading the results.** In Umami, open the website and filter by **UTM source** (or open the UTM report). You'll see that creator's visits, and the **Events** tab shows their uploads, renders and downloads. That gives you views (from the platform) → visits → uploads → renders for each creator.

## Optional settings

| Variable | Default | What it does |
| --- | --- | --- |
| `SITE_PASSWORD` | unset | Password-protects the whole site (any username works). Use it for a creator preview (section 5) or to share only with friends. |
| `UMAMI_WEBSITE_ID` | unset | Turns on analytics (section 6) |
| `UMAMI_SCRIPT_URL` | Umami Cloud's | Only if you host Umami yourself |
| `MAX_UPLOAD_MB` | 500 | Largest video a visitor can upload |
| `ANTHROPIC_MODEL` | `claude-haiku-5-5` | The model behind Clean up |
| `OPENAI_TRANSCRIBE_MODEL` | `whisper-1` | Must return word timestamps |

## Running costs

| | Monthly |
| --- | --- |
| Railway (server + 5 GB volume) | About $5–10 |
| Magic Hour | Up to your site-wide cap: about $90 at the default, usually far less |
| OpenAI and Anthropic | $0. Visitors pay their own. During a creator preview, about 2 cents per 3-minute video |
| Umami | $0 on the free Hobby plan |

## Before you share the link

- [ ] One full render on the live URL with your own face. Use your own keys in the Keys panel, or the server's key during a creator preview.
- [ ] `OPENAI_API_KEY` and `ANTHROPIC_API_KEY` are **not** set on Railway, unless `SITE_PASSWORD` is set too (section 5)
- [ ] `UMAMI_WEBSITE_ID` is set, and a test visit shows up in Umami
- [ ] Each creator has their own `utm_source` link
- [ ] Both Magic Hour caps are set to amounts you're comfortable with
- [ ] Auto top-up or a low-balance alert is on in Magic Hour
- [ ] A short Terms page saying people may only upload footage of themselves, or of people who agreed to it. Retake clones voices and changes what people appear to say.
- [ ] A way to watch disk use. Projects are never deleted automatically. When the volume fills up, delete old folders under `/data/projects`.
