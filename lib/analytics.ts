// Product analytics, through Umami (https://umami.is). Off unless UMAMI_WEBSITE_ID is
// set on the server; see SETUP.md. Umami is cookieless and records page views, where
// visitors came from (including the utm_ tags on creator links) and the events below.
// Never pass keys, file names or transcript text here.

export type TrackEvent = "upload" | "keys-saved" | "render" | "render-done" | "download";

export function track(event: TrackEvent, data?: Record<string, string | number | boolean>) {
  try {
    (window as unknown as { umami?: { track: (e: string, d?: object) => void } }).umami?.track(event, data);
  } catch {
    // Analytics must never break the app.
  }
}

/**
 * Runs in the page before each Umami send. Project pages are /p/<random id>; report
 * them as one page so the id isn't stored and the stats group together.
 */
export const BEFORE_SEND = `window.retakeBeforeSend = function (type, payload) {
  if (payload && typeof payload.url === "string") payload.url = payload.url.replace(/\\/p\\/[^/?#]+/, "/p/[id]");
  if (payload && typeof payload.referrer === "string") payload.referrer = payload.referrer.replace(/\\/p\\/[^/?#]+/, "/p/[id]");
  return payload;
};`;
