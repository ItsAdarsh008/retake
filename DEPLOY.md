# Deploying Retake

This takes you from the repo to a live, paid product in four stages. Stages 1 and 2 work with the code as it is today. Stage 3 sets the prices. Stage 4 (taking payments) needs code that isn't written yet; the checklist at the end says exactly what.

---

## Stage 1: Get your keys (15 min)

| Service | Where | What it costs you |
| --- | --- | --- |
| OpenAI (transcripts) | platform.openai.com → API keys. Add $5 of credit. | About $0.006 per minute of video |
| Magic Hour (voice + lip sync) | magichour.ai/developer → API keys | Credits, roughly $0.001 each (see Stage 3) |
| Anthropic (Clean up button, optional) | console.anthropic.com → API keys. Add $5 of credit. | A fraction of a cent per video |

Pick a site password too. Until payments exist, it's what stops strangers from spending your credits.

## Stage 2: Deploy to Railway (20 min)

Retake renders video with ffmpeg and a render can run for several minutes, so it needs an always-on server with a disk. Vercel and Netlify won't work: their functions time out and have no permanent storage. Railway is the simplest fit.

1. Sign up at **railway.com** with your GitHub account. The Hobby plan is about $5/month including some usage.
2. **New Project → Deploy from GitHub repo → ItsAdarsh008/retake.** Railway detects Next.js and runs `npm run build` then `npm start` on its own.
3. **Add a volume** (this is where uploaded videos and renders live). Right-click the service → *Attach volume*, mount path `/data`. Start with 5 GB.
4. **Variables** tab, add:

   ```
   OPENAI_API_KEY=sk-...
   MAGIC_HOUR_API_KEY=mhk_live_...
   ANTHROPIC_API_KEY=sk-ant-...      # optional
   RETAKE_DATA_DIR=/data
   SITE_PASSWORD=pick-something-long
   ```

5. **Settings → Networking → Generate Domain.** You get a `*.up.railway.app` URL. Add a custom domain there later if you want one.
6. Open the URL. The browser asks for a password: type anything as the username and your `SITE_PASSWORD` as the password.
7. **Test with a short clip first:** 20 seconds of you talking to the camera, one cut and one rewrite, rendered on Lite. Check that the result downloads and plays.

If a deploy fails, the **Deployments → View logs** tab shows why. The usual causes are a mistyped variable or a missing volume.

**Keep `SITE_PASSWORD` set until Stage 4 is live.** The app has no user accounts yet. Without the password, anyone with the link can render on your Magic Hour balance.

## Stage 3: Pricing

### What a render costs you

- **Lip sync is almost all of the cost.** Magic Hour charges 1 credit per frame on Lite and Standard, and 2 on Pro. Retake caps lip sync at 30 fps, so one second of re-synced video is 30 credits (60 on Pro).
- **Credits cost roughly $0.001 each.** That's from Magic Hour's yearly plans: Creator is $144 for 144,000 credits. Their FAQ also lists monthly prices that don't match, so check your own dashboard before you set prices.
- **So one second of Standard lip sync costs you about $0.03.**
- **One rewrite averages about 4 seconds of lip sync** with the default "whole sentence" setting, which is about $0.12.
- **Everything else is close to free:** voice cloning (about $0.01 per line), transcription ($0.006 per minute) and cuts (just server time).

### The structure: free to edit, pay to re-voice

Charge for the expensive part only. Uploading, transcribing, cutting and cleaning up are where people fall in love with the editor, and they cost you almost nothing.

**Free, no card needed**
- 3 videos a month, up to 5 minutes each
- Unlimited cuts, Clean up and cut-only renders
- 10 free lip sync seconds on sign-up, enough for 2–3 rewrites so people feel the magic once

**Paid: lip sync seconds, sold in packs.** 1 second of re-synced video = 1 credit. Pro quality uses 2 credits per second.

| Pack | Price | Credits | About how many rewrites | Your cost (Magic Hour + Stripe) | Margin |
| --- | --- | --- | --- | --- | --- |
| Starter | $5 | 60 | 15 | $2.25 | 55% |
| Creator | $15 | 200 | 50 | $6.74 | 55% |
| Studio | $40 | 600 | 150 | $19.46 | 51% |

Why packs instead of a subscription first: usage is lumpy, since people edit when they have a video to fix. Packs have no churn to manage and are simpler to build. Once you see repeat buyers, add a $12/month plan with 180 credits that roll over.

Re-check the margins whenever Magic Hour's prices change. The math is in `estimateCredits` in `lib/timeline.ts`, which the render panel already uses to show costs.

## Stage 4: Taking payments

### What you can set up now (no code)

1. Create a **Stripe** account (stripe.com) and finish identity verification so payouts work.
2. **Product catalog → Add product**, three times: *Starter*, *Creator* and *Studio*, each a **one-time** price ($5, $15, $40). Copy each price ID (`price_...`).
3. Keep **test mode** on until everything works.
4. Write short **Terms** and **Privacy** pages. Retake clones voices and changes what people appear to say, so the terms must say users may only upload footage of themselves, or of people who agreed to it. Stripe also asks for these pages.

### What needs building

Each item says what it's for.

- [ ] **User accounts:** something to attach credits to. Clerk or Supabase Auth both work with Google sign-in in an afternoon.
- [ ] **A database:** each user's credit balance, plus which projects belong to whom. Supabase Postgres, or Railway's Postgres add-on.
- [ ] **A Buy credits button:** opens Stripe Checkout with the pack's price ID and the user's ID attached.
- [ ] **A Stripe webhook:** when `checkout.session.completed` arrives, add the pack's credits to that user. Only the webhook adds credits, never the browser, so they can't be faked.
- [ ] **Charging at render:** hold the estimated credits when a render starts. Settle to the actual amount when it finishes, and refund automatically if it fails. Magic Hour refunds failed jobs too.
- [ ] **Limits for free users:** the monthly video count, and the 5-minute length cap enforced on upload.
- [ ] **A consent checkbox on upload:** "I have the right to use this person's face and voice."
- [ ] **Abuse limits:** a cap on uploads per hour per account, so one person can't drain your balance.

When this is live, remove `SITE_PASSWORD`, switch Stripe to live mode and add the live keys:

```
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_STARTER=price_...
STRIPE_PRICE_CREATOR=price_...
STRIPE_PRICE_STUDIO=price_...
```

## Running costs at a glance

| | Monthly |
| --- | --- |
| Railway (server + 5 GB volume) | about $5–10 |
| Magic Hour | Pay as you sell; keep a buffer of credits so renders never fail |
| OpenAI + Anthropic | Pennies per video |
| Stripe | 2.9% + 30¢ per purchase |

## Before you launch

- [ ] One full test render on the live URL with your own face
- [ ] A test-mode purchase that adds credits, then a render that spends them
- [ ] A failed render (e.g. a video with no face) that refunds credits
- [ ] Terms and Privacy pages linked in the footer
- [ ] An auto top-up or a low-balance email on Magic Hour, so a sold render never fails for lack of credits
