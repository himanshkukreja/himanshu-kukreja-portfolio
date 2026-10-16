import { NextRequest, NextResponse } from "next/server";
import { cfError, NO_STORE, readJson, requireCaseFilesAdmin } from "@/lib/case-files/api";
import { BUCKET, usesLocalUploads } from "@/lib/case-files/store";
import { SLUG_RE, UPLOAD_LIMITS } from "@/lib/case-files/types";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/avif": "avif", "image/gif": "gif", "image/svg+xml": "svg" };
const KINDS = ["cover", "motion", "image"] as const;
type Kind = (typeof KINDS)[number];

/** Images only (SVG only for the motion cover layer), size-capped, stored under <slug>/<kind>-<stamp>-<name>.<ext>. */
function check(kind: Kind, type: string, size: number): string | null {
  const types: readonly string[] = kind === "motion" ? UPLOAD_LIMITS.motionTypes : UPLOAD_LIMITS.types;
  if (!types.includes(type)) return kind === "motion" ? "The motion cover must be an SVG." : "Only PNG, JPEG, WebP, AVIF or GIF images.";
  const max = kind === "motion" ? UPLOAD_LIMITS.motion : UPLOAD_LIMITS.image;
  if (!(size > 0) || size > max) return `Too large: max ${Math.round(max / 1024 / 1024)} MB.`;
  return null;
}

function objectPath(slug: string, kind: Kind, name: string, type: string): string {
  const folder = SLUG_RE.test(slug) ? slug : "unsorted";
  const base =
    name
      .replace(/\.[^.]+$/, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || kind;
  return `${folder}/${kind}-${Date.now().toString(36)}-${base}.${EXT[type]}`;
}

/**
 * POST { slug, kind: "cover" | "motion" | "image", name, type, size } →
 *   { mode: "signed", bucket, path, token, publicUrl }  upload straight to Supabase Storage (no 4.5 MB function limit)
 *   { mode: "local", uploadUrl, publicUrl }             dev JSON store: PUT the bytes to uploadUrl
 */
export async function POST(req: NextRequest) {
  const admin = await requireCaseFilesAdmin(req);
  if (admin instanceof NextResponse) return admin;
  try {
    const b = await readJson(req);
    const kind = String(b.kind) as Kind;
    if (!KINDS.includes(kind)) return NextResponse.json({ error: "Unknown upload kind" }, { status: 400 });
    const type = String(b.type || "").toLowerCase();
    const size = Number(b.size);
    const problem = check(kind, type, size);
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });
    const path = objectPath(String(b.slug || ""), kind, String(b.name || ""), type);

    if (usesLocalUploads()) {
      return NextResponse.json({ mode: "local", uploadUrl: `/api/admin/case-files/upload?path=${encodeURIComponent(path)}&kind=${kind}`, publicUrl: `/case-files/_cms/${path}` }, { headers: NO_STORE });
    }
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path);
    if (error || !data) {
      const msg = /not found|bucket/i.test(error?.message || "") ? `Storage bucket "${BUCKET}" is missing: apply supabase/migrations/20261016_case_files_cms.sql.` : error?.message || "Could not start the upload";
      return NextResponse.json({ error: msg }, { status: 503 });
    }
    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return NextResponse.json({ mode: "signed", bucket: BUCKET, path, token: data.token, publicUrl: pub.publicUrl }, { headers: NO_STORE });
  } catch (e) {
    return cfError(e);
  }
}

/** Dev JSON store only: PUT ?path=…&kind=… with the image bytes → written to public/case-files/_cms/<path>. */
export async function PUT(req: NextRequest) {
  const admin = await requireCaseFilesAdmin(req);
  if (admin instanceof NextResponse) return admin;
  if (process.env.NODE_ENV === "production" || !usesLocalUploads()) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const path = req.nextUrl.searchParams.get("path") || "";
    const kind = (req.nextUrl.searchParams.get("kind") || "image") as Kind;
    if (!/^[a-z0-9-]+\/[a-z0-9-]+\.(png|jpg|webp|avif|gif|svg)$/.test(path) || !KINDS.includes(kind)) return NextResponse.json({ error: "Bad path" }, { status: 400 });
    const type = (req.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    const buf = Buffer.from(await req.arrayBuffer());
    const problem = check(kind, type, buf.length);
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });
    if (EXT[type] !== path.split(".").pop()) return NextResponse.json({ error: "Type does not match the file name" }, { status: 400 });
    const fs = await import("fs/promises");
    const p = await import("path");
    const full = p.join(process.cwd(), "public", "case-files", "_cms", path);
    await fs.mkdir(p.dirname(full), { recursive: true });
    await fs.writeFile(full, buf);
    return NextResponse.json({ ok: true, publicUrl: `/case-files/_cms/${path}` }, { headers: NO_STORE });
  } catch (e) {
    return cfError(e);
  }
}
