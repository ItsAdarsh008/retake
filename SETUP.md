# Setting up Retake

Retake runs on two keys, both yours: **OpenAI** for transcripts and **Magic Hour** for voice and lip sync. Visitors need nothing: no keys, no account, no payment. Setup takes about 15 minutes.

| Service | Used for | Cost |
| --- | --- | --- |
| OpenAI | Transcripts | $0.006 per minute of video. A 3-minute video costs about 2 cents, so $5 covers about 13 hours of video. |
| Magic Hour | Voice cloning and lip sync | About $0.13 per rewritten sentence, capped per day (section 3) |
| Railway | The server and its disk | About $5–10 a month |

## 1. Get your keys (5 min)

1. **OpenAI:** go to **platform.openai.com → API keys → Create new secret key** and copy it (`sk-...`). Under **Settings → Billing**, leave **auto recharge off**. Your prepaid balance is then the most it can ever spend.
2. **Magic Hour:** go to **magichour.ai → Developer → API keys** and create one (`mhk_live_...`). Buy credits; the yearly Creator plan is $144 for 144,000 credits. Turn on a low-balance email.

## 2. Deploy on Railway (10 min)

Retake needs an always-on server with a disk, because a render runs ffmpeg for minutes. That's why it's Railway and not Vercel.

1. Go to **railway.com**, sign in with GitHub, then choose **New Project → Deploy from GitHub repo → ItsAdarsh008/retake**.
2. Right-click the service, choose **Attach volume**, and set the mount path to `/data`.
3. In the service's **Variables** tab, open **Raw Editor** and paste in the block below with your two keys. Then click **Deploy** if Railway shows pending changes.

   ```
   OPENAI_API_KEY=sk-...
   MAGIC_HOUR_API_KEY=mhk_live_...
   RETAKE_DATA_DIR=/data
   MAGIC_HOUR_DAILY_CREDITS=3000
   MAGIC_HOUR_VISITOR_DAILY_CREDITS=400
   ```

4. In **Settings → Networking**, click **Generate Domain**. That's your link (`something.up.railway.app`).
5. **Test it:**
   1. Open the link and upload a 20-second clip of yourself.
   2. Delete a word, then type over another.
   3. Render on **Lite**.

   If the download plays, you're live.

Every push to `main` redeploys. Uploaded projects live on the volume and survive deploys. If a deploy fails, **Deployments → View logs** says why; it's usually a mistyped variable or a missing volume.

## 3. Know what it can cost you

- **OpenAI:** with auto recharge off, it can't spend more than your balance. When the balance runs out, new uploads stop with "OpenAI says the account is out of credit". Top up to fix it. Each video's audio can be up to about 70 minutes, so at most about $0.42 per upload.
- **Magic Hour:** two daily caps, both reset at midnight UTC.

  | Variable | Default | Allows | Most it costs |
  | --- | --- | --- | --- |
  | `MAGIC_HOUR_VISITOR_DAILY_CREDITS` | 400 | About 3 rewritten sentences per person per day | $0.40 per person per day |
  | `MAGIC_HOUR_DAILY_CREDITS` | 3000 | Everyone combined | $3 a day, about $90 a month |

  - **The site-wide cap is your real ceiling.** The per-person cap goes by IP address, so it can be dodged by switching networks.
  - **Removing a cap:** set it to `unlimited`.
  - **Over the cap:** a render that wouldn't fit is refused before anything is sent to Magic Hour.
  - **Free edits:** cuts never touch Magic Hour.
- **Keep it private (recommended while it runs on $5):** add `SITE_PASSWORD=something`. The browser asks for it once, and any username works. Send creators the link and the password. Remove it when you launch publicly.

## 4. Analytics and creator links (optional, 5 min)

[Umami](https://umami.is) is free on its Hobby plan and cookieless, so there's no cookie banner.

1. Go to **cloud.umami.is → Settings → Websites → Add website**, and enter your Railway domain.
2. Copy the **Website ID**, add `UMAMI_WEBSITE_ID=...` in Railway's **Variables**, and deploy.
3. Open your site and check the visit shows up in Umami.

Give each creator their own link, so their visits and uploads can be traced back to them:

```
https://your-app.up.railway.app/?utm_source=CREATOR&utm_medium=social&utm_campaign=launch
```

In Umami, filter by **UTM source** to see one creator's visits. The **Events** tab shows `upload`, `render`, `render-done` and `download`. Project pages count as `/p/[id]`, and no keys, file names, transcripts or videos are sent.

## Other settings

| Variable | Default | What it does |
| --- | --- | --- |
| `SITE_PASSWORD` | unset | Password-protects the whole site |
| `UMAMI_WEBSITE_ID` | unset | Turns on analytics (section 4) |
| `MAX_UPLOAD_MB` | 500 | Largest video someone can upload |
| `ANTHROPIC_API_KEY` | unset | Upgrades Clean up from a basic um/uh scan to Claude, at a fraction of a cent per video |
| `ANTHROPIC_MODEL` | `claude-haiku-5-5` | The model behind Clean up |
| `OPENAI_TRANSCRIBE_MODEL` | `whisper-1` | Must return word timestamps |
| `UMAMI_SCRIPT_URL` | Umami Cloud's | Only if you host Umami yourself |

Visitors can still add their own keys under **Keys**. Their own key is used instead of yours for their requests.

## Before you share the link

- [ ] One full render works on the live link
- [ ] OpenAI auto recharge is off, or a monthly limit is set
- [ ] Both Magic Hour caps are amounts you're comfortable with, and a low-balance alert is on
- [ ] `SITE_PASSWORD` is set if it's only for creators so far
- [ ] A line somewhere saying people may only upload footage of themselves, or of people who agreed. Retake clones voices and changes what people appear to say.
- [ ] Every so often, check disk use. Projects are never deleted automatically; when the volume fills up, delete old folders under `/data/projects`.
