import { NextResponse } from "next/server";
import { getLearner, type Learner } from "@/app/api/learn/_lib/auth";
import { DSA_FULL } from "@/lib/dsa/flags";
import { createFile, deleteFile, isFileId, listFiles, MAX_FILES, PLAYGROUND_FILES_ON, readFileInput, updateFile } from "@/lib/dsa/playground/files-server";

/**
 * The Playground's named files (behind DSA_PLAYGROUND_FILES=on, after supabase/migrations/20261116_dsa_playground_files.sql
 * is applied; 404 until then). Signed in; every query is scoped to the learner.
 *
 *   GET                                          → { files: PlaygroundFile[] }
 *   POST   { name, language, code, stdin }       → { file }   a new file (at most 200)
 *   POST   { id, name, language, code, stdin }   → { file }   save over one of yours
 *   DELETE ?id=<uuid>                            → { ok }
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };
const fail = (status: number, error: string) => NextResponse.json({ error }, { status, headers: NO_STORE });

async function gate(req: Request): Promise<NextResponse | Learner> {
  if (!DSA_FULL || !PLAYGROUND_FILES_ON) return fail(404, "Not found");
  const me = await getLearner(req);
  return me ?? fail(401, "Sign in to keep files.");
}

export async function GET(req: Request) {
  const g = await gate(req);
  if (g instanceof NextResponse) return g;
  try {
    return NextResponse.json({ files: await listFiles(g.id) }, { headers: NO_STORE });
  } catch (e) {
    console.warn("[dsa-playground] list:", (e as Error).message);
    return fail(502, "Couldn't load your files.");
  }
}

export async function POST(req: Request) {
  const g = await gate(req);
  if (g instanceof NextResponse) return g;
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return fail(400, "Send JSON.");
  }
  const f = readFileInput(body);
  if (typeof f === "string") return fail(f.includes("limited") ? 413 : 400, f);
  try {
    if (body.id !== undefined) {
      if (!isFileId(body.id)) return fail(400, "Unknown file.");
      const file = await updateFile(g.id, body.id, f);
      return file ? NextResponse.json({ file }, { headers: NO_STORE }) : fail(404, "Unknown file.");
    }
    const file = await createFile(g.id, f);
    if (file === "full") return fail(409, `You can keep up to ${MAX_FILES} files. Delete one to make room.`);
    return NextResponse.json({ file }, { headers: NO_STORE });
  } catch (e) {
    console.warn("[dsa-playground] save:", (e as Error).message);
    return fail(502, "Couldn't save the file.");
  }
}

export async function DELETE(req: Request) {
  const g = await gate(req);
  if (g instanceof NextResponse) return g;
  const id = new URL(req.url).searchParams.get("id");
  if (!isFileId(id)) return fail(400, "Unknown file.");
  try {
    return (await deleteFile(g.id, id)) ? NextResponse.json({ ok: true }, { headers: NO_STORE }) : fail(404, "Unknown file.");
  } catch (e) {
    console.warn("[dsa-playground] delete:", (e as Error).message);
    return fail(502, "Couldn't delete the file.");
  }
}
