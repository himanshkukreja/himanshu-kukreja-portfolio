/**
 * Middleware gate for /cert/<code>/** (edge-safe: no DB client here). Unknown, private and
 * malformed codes get a real HTTP 404 with the page's own not-found UI; lower-case codes redirect
 * to the canonical upper-case URL. Same pattern as the /u/<handle> gate (src/lib/share/gate.ts).
 */
import { NextResponse, type NextRequest } from "next/server";
import { normalizeCode } from "./core";

export async function certGate(req: NextRequest): Promise<NextResponse> {
  const seg = req.nextUrl.pathname.split("/")[2] || "";
  // OG / Twitter images answer for any code (a plain card when it isn't public)
  if (/\/(opengraph|twitter)-image/.test(req.nextUrl.pathname)) return NextResponse.next();
  const code = normalizeCode(seg);
  if (code && seg !== code) {
    const url = req.nextUrl.clone();
    url.pathname = req.nextUrl.pathname.replace(`/cert/${seg}`, `/cert/${code}`);
    return NextResponse.redirect(url, 308);
  }
  let ok = false;
  if (code) {
    try {
      // path-based so the answer is CDN-cached per code (revalidated on every status change)
      const r = await fetch(new URL(`/api/cert/exists/${code}`, req.nextUrl.origin), { headers: { "x-cert-gate": "1" } });
      // a server error (database down) fails open: the page shows "couldn't check right now"
      ok = r.status >= 500 || (r.ok && ((await r.json()) as { ok?: boolean }).ok === true);
    } catch {
      ok = true; // failing open still leaves the page's own notFound() in charge
    }
  }
  if (ok) return NextResponse.next();
  return NextResponse.rewrite(new URL("/cert/__not-found", req.url), { status: 404, headers: { "x-robots-tag": "noindex" } });
}
