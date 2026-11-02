import { NextResponse, type NextRequest } from "next/server";
import { passwordChallenge, passwordOk } from "./lib/gate";

const OWNER = "retake_owner";

export function middleware(req: NextRequest) {
  // Optional password gate for private deploys (SITE_PASSWORD).
  if (!passwordOk(req.headers.get("authorization"))) return passwordChallenge();

  // Give every browser a random id, so each visitor sees only the videos they uploaded.
  if (/^[A-Za-z0-9]{16,64}$/.test(req.cookies.get(OWNER)?.value || "")) return NextResponse.next();
  const owner = crypto.randomUUID().replace(/-/g, "");
  const headers = new Headers(req.headers);
  const cookie = headers.get("cookie");
  headers.set("cookie", `${OWNER}=${owner}${cookie ? `; ${cookie}` : ""}`);
  const res = NextResponse.next({ request: { headers } });
  res.cookies.set(OWNER, owner, {
    httpOnly: true,
    sameSite: "lax",
    secure: req.nextUrl.protocol === "https:",
    path: "/",
    maxAge: 60 * 60 * 24 * 400,
  });
  return res;
}

export const config = {
  // api/upload is left out on purpose: middleware would cap the video at 10 MB.
  // That route checks the password and owner cookie itself.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/upload).*)"],
};
