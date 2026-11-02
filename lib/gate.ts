// Shared by the middleware and the upload route (which the middleware skips:
// Next.js truncates request bodies over 10 MB when middleware runs on them).

/** True when SITE_PASSWORD is unset, or the Basic auth header carries it. Any username works. */
export function passwordOk(authorization: string | null) {
  const password = process.env.SITE_PASSWORD;
  if (!password) return true;
  if (!authorization?.startsWith("Basic ")) return false;
  try {
    const decoded = atob(authorization.slice(6));
    return decoded.slice(decoded.indexOf(":") + 1) === password;
  } catch {
    return false;
  }
}

export const passwordChallenge = () =>
  new Response("Password required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Retake", charset="UTF-8"' },
  });
