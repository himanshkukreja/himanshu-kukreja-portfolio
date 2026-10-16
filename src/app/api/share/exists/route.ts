import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { isValidHandle } from "@/lib/share/handle";
import { settingsForHandle, shareFixtures } from "@/lib/share/store";
import { shareTag } from "@/lib/share/stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const published = (h: string) =>
  settingsForHandle(h)
    .then((o) => !!o?.settings.enabled)
    .catch(() => false);

/**
 * GET /api/share/exists?h=… → { ok } — is /u/<h> published? Used by the middleware so unknown and
 * unpublished handles answer a real HTTP 404 (the page itself streams behind the root loading UI,
 * where notFound() can only render a 404 page with status 200). Cached per handle; the settings
 * API revalidates the tag, so unpublishing is immediate.
 */
export async function GET(request: Request) {
  const h = new URL(request.url).searchParams.get("h") || "";
  if (!isValidHandle(h)) return NextResponse.json({ ok: false }, { headers: { "Cache-Control": "no-store" } });
  const ok = shareFixtures() ? await published(h) : await unstable_cache(() => published(h), ["share-exists-v1", h], { revalidate: 300, tags: [shareTag(h), "share"] })();
  return NextResponse.json({ ok }, { headers: { "Cache-Control": "no-store" } });
}
