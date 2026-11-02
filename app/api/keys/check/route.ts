import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Confirms a visitor's key works before they upload, using each provider's
// free model-list endpoint. The key is not stored.
export async function POST(req: Request) {
  const { provider, key } = await req.json().catch(() => ({}));
  if (typeof key !== "string" || key.trim().length < 8 || key.length > 400)
    return NextResponse.json({ ok: false, error: "That doesn't look like an API key." });
  const k = key.trim();

  let res: Response;
  try {
    if (provider === "openai") {
      res = await fetch("https://api.openai.com/v1/models", { headers: { Authorization: `Bearer ${k}` } });
    } else if (provider === "anthropic") {
      res = await fetch("https://api.anthropic.com/v1/models?limit=1", {
        headers: { "x-api-key": k, "anthropic-version": "2023-06-01" },
      });
    } else {
      return NextResponse.json({ ok: false, error: "Unknown provider" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ ok: false, error: "Couldn't reach the provider. Try again in a moment." });
  }

  if (res.ok) return NextResponse.json({ ok: true });
  const name = provider === "openai" ? "OpenAI" : "Anthropic";
  if (res.status === 401 || res.status === 403)
    return NextResponse.json({ ok: false, error: `${name} rejected this key. Copy it again from your ${name} dashboard.` });
  if (res.status === 429)
    return NextResponse.json({ ok: false, error: `${name} says this account is rate-limited or out of credit.` });
  return NextResponse.json({ ok: false, error: `${name} returned an error (${res.status}). Try again in a moment.` });
}
