/**
 * Middleware gate for /u/<handle>/** (edge-safe: no DB client here). Unknown, unpublished or
 * malformed handles get a real HTTP 404 with the page's own not-found UI; mixed-case handles
 * redirect to the lowercase URL.
 */
import { NextResponse, type NextRequest } from "next/server";
import { isValidHandle } from "./handle";

export async function shareGate(req: NextRequest): Promise<NextResponse> {
  const seg = req.nextUrl.pathname.split("/")[2] || "";
  let raw = seg;
  try {
    raw = decodeURIComponent(seg);
  } catch {
    /* keep as is */
  }
  // OG / Twitter image routes answer for any handle (a plain course card when unpublished)
  if (/\/(opengraph|twitter)-image/.test(req.nextUrl.pathname)) return NextResponse.next();
  const h = raw.toLowerCase();
  if (isValidHandle(h) && raw !== h) {
    const url = req.nextUrl.clone();
    url.pathname = req.nextUrl.pathname.replace(`/u/${seg}`, `/u/${h}`);
    return NextResponse.redirect(url, 308);
  }
  let ok = false;
  if (isValidHandle(h)) {
    try {
      const r = await fetch(new URL(`/api/share/exists?h=${encodeURIComponent(h)}`, req.nextUrl.origin), { headers: { "x-share-gate": "1" }, cache: "no-store" });
      ok = r.ok && ((await r.json()) as { ok?: boolean }).ok === true;
    } catch {
      ok = true; // the gate failing open still leaves the page's own notFound() in charge
    }
  }
  if (ok) return NextResponse.next();
  return NextResponse.rewrite(new URL("/u/__not-shared", req.url), { status: 404, headers: { "x-robots-tag": "noindex" } });
}
