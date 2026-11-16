import { NextResponse } from "next/server";
import { getLearner } from "@/app/api/learn/_lib/auth";
import { DSA_FULL } from "@/lib/dsa/flags";
import { isFileId, PLAYGROUND_FILES_ON, setSharing } from "@/lib/dsa/playground/files-server";

/**
 * POST /api/dsa/playground/share { id, on: boolean } → { slug, path } | { slug: null }
 *
 * Turns a saved Playground file's read-only link on (a random slug; the same one when already shared) or off. Behind
 * DSA_PLAYGROUND_FILES=on (the dsa_playground_files migration applied first); 404 until then. Signed in, own files only.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };
const fail = (status: number, error: string) => NextResponse.json({ error }, { status, headers: NO_STORE });

export async function POST(req: Request) {
  if (!DSA_FULL || !PLAYGROUND_FILES_ON) return fail(404, "Not found");
  const me = await getLearner(req);
  if (!me) return fail(401, "Sign in to share files.");
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return fail(400, "Send JSON.");
  }
  if (!isFileId(body.id)) return fail(400, "Unknown file.");
  try {
    const slug = await setSharing(me.id, body.id, body.on !== false);
    if (slug === "missing") return fail(404, "Unknown file.");
    return NextResponse.json(slug ? { slug, path: `/dsa/playground/s/${slug}` } : { slug: null }, { headers: NO_STORE });
  } catch (e) {
    console.warn("[dsa-playground] share:", (e as Error).message);
    return fail(502, "Couldn't change sharing.");
  }
}
