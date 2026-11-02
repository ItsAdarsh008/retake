// Drives the real Retake app in headless Chrome and screen-records it for the demo.
//
//   node scripts/capture.mjs --clip <video> [--app http://localhost:3000] [--plan plan.json]
//
// Keys: if CAPTURE_OPENAI_KEY / CAPTURE_ANTHROPIC_KEY are set they're typed into the
// Keys panel (a password field, so they never appear on screen). Otherwise the app's
// own server keys are used and the Keys step is skipped.
//
// plan.json sets the edits, and optionally:
//   "viewport": { "width": 432, "height": 768, "scale": 2.5 }   phone layout, 1080x1920 frames
//   "redact": ["word"]   blurs matching transcript words on screen (e.g. a swear)
//
// Writes capture/screen.mp4 (30 fps), capture/markers.json (when each action
// happened, plus the on-screen box it happened in) and capture/project.json.

import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith("--") ? [...acc, [a.slice(2), all[i + 1]]] : acc), [])
);
const APP = args.app || "http://localhost:3000";
const CLIP = path.resolve(args.clip || "");
const OUT = path.resolve(args.out || path.join(root, "capture"));
const plan = JSON.parse(await fs.readFile(args.plan || path.join(root, "plan.json"), "utf8"));

// Desktop by default: 2880x1620 frames, so the video can zoom in and stay sharp.
const VIEW = { width: plan.viewport?.width ?? 1440, height: plan.viewport?.height ?? 810 };
const DSF = plan.viewport?.scale ?? 2;
const TOUCH = VIEW.width < 700; // a phone-sized layout gets a finger, not a mouse pointer

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const FRAMES = path.join(OUT, "frames");
await fs.rm(OUT, { recursive: true, force: true });
await fs.mkdir(FRAMES, { recursive: true });

// ---------- browser ----------
// The screencast ignores Playwright's emulated pixel ratio, so scale Chrome itself
// and size the window to leave exactly VIEW for the page.
const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: [
    "--autoplay-policy=no-user-gesture-required",
    `--force-device-scale-factor=${DSF}`,
    `--window-size=${VIEW.width + 26},${VIEW.height + 100}`,
  ],
});
const context = await browser.newContext({ viewport: null, colorScheme: "light" });
await context.addInitScript(CURSOR_SCRIPT(TOUCH));
if (plan.redact?.length) await context.addInitScript(REDACT_SCRIPT(plan.redact));
const page = await context.newPage();
page.setDefaultTimeout(10 * 60 * 1000);

// ---------- recording ----------
const frames = [];
const writes = [];
let pausedTotal = 0;
let pausedAt = 0;
let t0 = 0;
const clock = () => Date.now() / 1000 - pausedTotal;

const cdp = await context.newCDPSession(page);
// Chrome won't size a window narrower than about 475 px, so a phone viewport is set by
// emulation instead. The forced scale factor still applies, so frames stay sharp.
if (plan.viewport) await cdp.send("Emulation.setDeviceMetricsOverride", { width: VIEW.width, height: VIEW.height, deviceScaleFactor: 0, mobile: false });
cdp.on("Page.screencastFrame", ({ data, metadata, sessionId }) => {
  cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
  if (pausedAt) return;
  const t = metadata.timestamp - pausedTotal;
  if (!t0) t0 = t;
  const file = path.join(FRAMES, `${String(frames.length).padStart(6, "0")}.jpg`);
  frames.push({ file, t: t - t0 });
  writes.push(fs.writeFile(file, Buffer.from(data, "base64")));
});
const startCast = () =>
  cdp.send("Page.startScreencast", {
    format: "jpeg",
    quality: 90,
    maxWidth: VIEW.width * DSF,
    maxHeight: VIEW.height * DSF,
    everyNthFrame: 1,
  });
const pause = async () => {
  await cdp.send("Page.stopScreencast");
  pausedAt = Date.now() / 1000;
};
const resume = async () => {
  pausedTotal += Date.now() / 1000 - pausedAt;
  pausedAt = 0;
  await startCast();
};

const markers = [];
async function mark(name, locator, extra = {}) {
  let box = null;
  if (locator) {
    const b = await locator.boundingBox().catch(() => null);
    if (b) box = { x: b.x, y: b.y, w: b.width, h: b.height };
  }
  const t = t0 ? clock() - t0 : 0;
  markers.push({ name, t: Math.round(t * 1000) / 1000, box, ...extra });
  console.log(`  ${t.toFixed(2).padStart(7)}s  ${name}`);
}

// ---------- a human-looking mouse ----------
let cur = { x: VIEW.width * 0.62, y: VIEW.height * 0.72 };
async function moveTo(x, y, ms = 650) {
  const from = { ...cur };
  const steps = Math.max(10, Math.round(ms / 16));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    await page.mouse.move(from.x + (x - from.x) * e, from.y + (y - from.y) * e);
    await sleep(ms / steps);
  }
  cur = { x, y };
}
async function hover(locator, ms) {
  const b = await locator.boundingBox();
  await moveTo(b.x + b.width / 2, b.y + b.height / 2, ms);
}
async function click(locator, ms) {
  await locator.scrollIntoViewIfNeeded();
  await sleep(150);
  await hover(locator, ms);
  await sleep(140);
  await page.mouse.down();
  await sleep(80);
  await page.mouse.up();
}
async function type(text, delay = 70) {
  for (const ch of text) {
    await page.keyboard.type(ch);
    await sleep(delay + Math.random() * 40);
  }
}
/** Locate a phrase in the transcript (case and punctuation ignored). Returns its first and last word. */
async function phrase(text) {
  const want = text.toLowerCase().split(/\s+/).map((w) => w.replace(/[^a-z0-9']/g, "")).filter(Boolean);
  const hit = await page.evaluate((want) => {
    const els = [...document.querySelectorAll(".page [data-i]")];
    const norm = els.map((el) => [Number(el.dataset.i), el.textContent.toLowerCase().replace(/[^a-z0-9']/g, "")]);
    for (let k = 0; k + want.length <= norm.length; k++) {
      let ok = true;
      for (let j = 0; j < want.length; j++)
        if (norm[k + j][1] !== want[j] || (j && norm[k + j][0] !== norm[k + j - 1][0] + 1)) ok = false;
      if (ok) return [norm[k][0], norm[k + want.length - 1][0]];
    }
    return null;
  }, want);
  if (!hit) {
    const said = await page.locator(".page").innerText();
    throw new Error(`The transcript has no "${text}". It starts:
${said.slice(0, 800)}`);
  }
  const first = page.locator(`.page [data-i="${hit[0]}"]`);
  const last = page.locator(`.page [data-i="${hit[1]}"]`);
  return { first, last, single: hit[0] === hit[1] };
}

/**
 * Scroll an element into the clear part of the page before touching it. On a phone
 * layout the player sticks to the top, and a word just under it would be covered.
 */
async function reveal(locator) {
  await locator.waitFor();
  const moved = await locator.evaluate((el) => {
    const studio = document.querySelector(".studio");
    const sticky = studio && getComputedStyle(studio).position === "sticky";
    const top = sticky ? studio.getBoundingClientRect().bottom : 0;
    const r = el.getBoundingClientRect();
    const mid = r.top + r.height / 2;
    if (mid > top + 30 && mid < innerHeight - 30) return false;
    if (sticky) window.scrollBy({ top: mid - (top + (innerHeight - top) * 0.35), behavior: "smooth" });
    else el.scrollIntoView({ block: "center", behavior: "smooth" });
    return true;
  });
  if (moved) await sleep(800);
}

/** Click the first word, shift-click the last: how a person selects a phrase. */
async function select(p) {
  await reveal(p.first);
  await click(p.first, 850);
  if (!p.single) {
    await sleep(250);
    await page.keyboard.down("Shift");
    await click(p.last, 450);
    await page.keyboard.up("Shift");
  }
}

// ---------- the walkthrough ----------
console.log("Recording");
await page.goto(APP);
await page.waitForLoadState("networkidle");
// Window chrome varies between runs, so nudge the window until the page is exactly VIEW.
for (let k = 0; k < (plan.viewport ? 0 : 4); k++) {
  const [w, h] = await page.evaluate(() => [innerWidth, innerHeight]);
  if (w === VIEW.width && h === VIEW.height) break;
  const { windowId, bounds } = await cdp.send("Browser.getWindowForTarget");
  await cdp.send("Browser.setWindowBounds", {
    windowId,
    bounds: { width: bounds.width + VIEW.width - w, height: bounds.height + VIEW.height - h },
  });
  await sleep(400);
}
const inner = await page.evaluate(() => [innerWidth, innerHeight, devicePixelRatio]);
if (inner[0] !== VIEW.width || inner[1] !== VIEW.height || inner[2] !== DSF)
  console.warn(`  ! viewport is ${inner.join("x")}, expected ${VIEW.width}x${VIEW.height}@${DSF}`);
await page.mouse.move(cur.x, cur.y);
await sleep(400);
await startCast();
await sleep(1200);
await mark("home");

// 1. Keys (only when the capture brings its own)
const openaiKey = process.env.CAPTURE_OPENAI_KEY || "";
const anthropicKey = process.env.CAPTURE_ANTHROPIC_KEY || "";
if (openaiKey || anthropicKey) {
  const keysBtn = page.locator(".btn-keys");
  await click(keysBtn, 900);
  await page.locator(".sheet").waitFor();
  await sleep(500);
  await mark("keys-open", page.locator(".sheet"));
  if (openaiKey) {
    await click(page.locator("#key-openai"), 500);
    await type(openaiKey.slice(0, 14), 45);
    await page.locator("#key-openai").fill(openaiKey);
  }
  if (anthropicKey) {
    await click(page.locator("#key-anthropic"), 450);
    await type(anthropicKey.slice(0, 14), 45);
    await page.locator("#key-anthropic").fill(anthropicKey);
  }
  await sleep(300);
  await click(page.getByRole("button", { name: "Save keys" }), 600);
  await mark("keys-save");
  await page.locator(".sheet").waitFor({ state: "detached" });
  await mark("keys-saved");
  await sleep(700);
}

// 2. Upload
const chooser = page.waitForEvent("filechooser");
await click(page.getByRole("button", { name: "Choose a video" }), 800);
await mark("upload-click");
await (await chooser).setFiles(CLIP);
await page.waitForURL(/\/p\//);
const projectId = page.url().split("/p/")[1];
await mark("processing");
// Wait for the transcript, but stop at once if the app reports an error.
let ready = false;
const failed = (async () => {
  while (!ready) {
    await sleep(1500);
    if (ready) break;
    const p = await page.evaluate((id) => fetch(`/api/projects/${id}`).then((r) => r.json()), projectId).catch(() => null);
    if (p?.status === "error") throw new Error(`The app couldn't process the clip: ${p.error}`);
  }
})();
await Promise.race([page.locator(".page [data-i]").first().waitFor().then(() => (ready = true)), failed]);
ready = true;
await sleep(400);
await mark("transcript", page.locator(".desk"));
await moveTo(VIEW.width * 0.7, VIEW.height * 0.55, 700);
await sleep(1500);

// 3. Cut by hand: select, press Delete
for (const w of plan.cut ?? []) {
  const p = await phrase(w);
  await select(p);
  await sleep(700);
  await mark("cut-select", p.first, { phrase: w });
  await page.keyboard.press("Delete");
  await mark("cut", p.first, { phrase: w });
  await sleep(1300);
}

// 4. Clean up (skipped when the plan says so, e.g. without an Anthropic key)
if (plan.cleanup !== false) {
  const cleanBtn = page.getByRole("button", { name: /Clean up/ });
  await click(cleanBtn, 900);
  await mark("cleanup-click", cleanBtn);
  const banner = page.locator(".banner");
  await banner.waitFor();
  await sleep(600);
  await mark("cleanup-banner", banner);
  await sleep(1600);
  const cutAll = page.getByRole("button", { name: /Cut all/ });
  if (await cutAll.count()) {
    await click(cutAll, 700);
    await mark("cleanup-cut", page.locator(".page"));
  } else {
    await click(page.locator(".banner .btn-quiet"), 600);
  }
  await sleep(1200);
}

// 5. Rewrites: select the words, just start typing
for (const r of plan.rewrites ?? []) {
  const p = await phrase(r.find);
  await select(p);
  await sleep(600);
  await mark("rewrite-select", p.first, { find: r.find, to: r.to });
  await type(r.to, 95);
  await sleep(500);
  await mark("rewrite-typed", page.locator(".rewrite"), { find: r.find, to: r.to });
  await page.keyboard.press("Enter");
  await sleep(250);
  await mark("rewrite-applied", page.locator("ins.rw").first(), { find: r.find, to: r.to });
  await sleep(1100);
}

// 6. Wait for the cloned voice, then preview the line
await moveTo(VIEW.width * 0.72, VIEW.height * 0.6, 600);
const play = page.locator(".rw-play").last();
await play.waitFor({ timeout: 5 * 60 * 1000 });
await reveal(play);
await sleep(600);
const voiceSrc = await page.evaluate(() => {
  // The newest voice clip the editor fetched.
  const urls = performance.getEntriesByType("resource").map((e) => e.name).filter((n) => /\/voice\/[a-f0-9]{16}\.wav/.test(n));
  return urls[urls.length - 1] || null;
});
await click(play, 700);
await mark("preview", page.locator(".screen"), { voice: voiceSrc });
await sleep(plan.previewSeconds ? plan.previewSeconds * 1000 : 6000);
await click(page.locator(".transport .round"), 500); // pause
await sleep(600);

// 7. Render
await click(page.locator(".btn-render"), 800);
await page.locator(".sheet").waitFor();
await sleep(900);
await mark("render-sheet", page.locator(".sheet"));
if (plan.mode && plan.mode !== "standard") await click(page.locator(`.choice input[type=radio]`).nth(["lite", "standard", "pro"].indexOf(plan.mode)), 600);
await sleep(800);
await click(page.getByRole("button", { name: /Render video/ }), 700);
await mark("render-start", page.locator(".sheet"));
await sleep(5000);
await mark("render-progress", page.locator(".sheet"));
await pause();
console.log("  (paused while Magic Hour renders)");
const waitStart = Date.now();
await page.getByRole("heading", { name: "Your new take" }).waitFor({ timeout: 30 * 60 * 1000 });
const waited = Math.round((Date.now() - waitStart) / 1000);
await sleep(300);
await resume();
await sleep(200);
await mark("render-done", page.locator(".sheet"), { waitedSeconds: waited });
await sleep(4500);
await mark("end");
await cdp.send("Page.stopScreencast");
const tEnd = clock() - t0;

const project = await page.evaluate((id) => fetch(`/api/projects/${id}`).then((r) => r.json()), projectId);
await browser.close();
await Promise.all(writes);

// ---------- frames → 30 fps video ----------
console.log(`Encoding ${frames.length} frames (${tEnd.toFixed(1)}s)`);
const list = ["ffconcat version 1.0"];
frames.forEach((f, i) => {
  const next = i + 1 < frames.length ? frames[i + 1].t : tEnd;
  list.push(`file '${path.basename(f.file)}'`, `duration ${Math.max(0.001, next - f.t).toFixed(4)}`);
});
list.push(`file '${path.basename(frames[frames.length - 1].file)}'`);
await fs.writeFile(path.join(FRAMES, "list.txt"), list.join("\n"));
execFileSync(
  "ffmpeg",
  ["-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", path.join(FRAMES, "list.txt"),
   "-vf", "fps=30,format=yuv420p", "-c:v", "libx264", "-preset", "slow", "-crf", "14", "-movflags", "+faststart",
   path.join(OUT, "screen.mp4")],
  { stdio: "inherit" }
);
await fs.writeFile(
  path.join(OUT, "markers.json"),
  JSON.stringify({ view: VIEW, dsf: DSF, duration: tEnd, projectId, markers }, null, 2)
);
await fs.writeFile(path.join(OUT, "project.json"), JSON.stringify(project, null, 2));
if (!process.env.KEEP_FRAMES) await fs.rm(FRAMES, { recursive: true, force: true });
console.log(`Done: ${path.join(OUT, "screen.mp4")}`);

// ---------- injected into every page: a visible cursor with click ripples ----------
// On a phone-sized layout it's a soft fingertip instead of an arrow.
function CURSOR_SCRIPT(touch) {
  const icon = touch
    ? `'<div style="width:30px;height:30px;border-radius:50%;background:rgba(20,24,31,.28);border:2px solid rgba(255,255,255,.9);box-sizing:border-box"></div>'`
    : `'<svg width="24" height="24" viewBox="0 0 24 24"><path d="M5 2.8v16.6l4.4-4.1 2.9 6.5 2.8-1.2-2.9-6.4 6.2-.2z" fill="#14181f" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>'`;
  const dx = touch ? 15 : 5;
  const dy = touch ? 15 : 3;
  return `(() => {
    const install = () => {
      if (document.getElementById("__demo_cursor")) return;
      const c = document.createElement("div");
      c.id = "__demo_cursor";
      c.innerHTML = ${icon};
      Object.assign(c.style, { position: "fixed", left: 0, top: 0, zIndex: 2147483647, pointerEvents: "none",
        transform: "translate(-200px,-200px)", filter: "drop-shadow(0 1px 1.5px rgba(0,0,0,.35))" });
      document.documentElement.appendChild(c);
      addEventListener("mousemove", (e) => { c.style.transform = "translate(" + (e.clientX - ${dx}) + "px," + (e.clientY - ${dy}) + "px)"; }, true);
      addEventListener("mousedown", (e) => {
        const r = document.createElement("div");
        Object.assign(r.style, { position: "fixed", left: e.clientX - 18 + "px", top: e.clientY - 18 + "px", width: "36px", height: "36px",
          borderRadius: "50%", background: "rgba(42,84,214,.28)", zIndex: 2147483646, pointerEvents: "none" });
        document.documentElement.appendChild(r);
        r.animate([{ transform: "scale(.2)", opacity: 1 }, { transform: "scale(1.15)", opacity: 0 }], { duration: 420, easing: "ease-out" }).onfinish = () => r.remove();
      }, true);
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install); else install();
  })();`;
}

// ---------- injected into every page: blur listed words wherever the transcript shows them ----------
function REDACT_SCRIPT(words) {
  const want = JSON.stringify(words.map((w) => w.toLowerCase().replace(/[^a-z0-9']/g, "")));
  return `(() => {
    const want = new Set(${want});
    const norm = (t) => (t || "").toLowerCase().replace(/[^a-z0-9']/g, "");
    const scan = () => {
      for (const el of document.querySelectorAll("[data-i]")) {
        if (want.has(norm(el.textContent))) el.style.filter = "blur(5px)";
      }
    };
    new MutationObserver(scan).observe(document, { subtree: true, childList: true, characterData: true });
  })();`;
}
