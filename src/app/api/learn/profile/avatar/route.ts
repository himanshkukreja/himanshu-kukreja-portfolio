import { NextResponse } from "next/server";
import { noStore, requireLearner } from "@/app/api/learn/_lib/auth";
import { avatarBackend as db } from "@/lib/avatars/backend";
import { AVATAR_LIMITS, avatarKind, catalogAvatarPath, uploadedAvatarPath } from "@/lib/avatars/catalog";
import { inspectStoredImage, sniffImage, stripMetadata } from "@/lib/avatars/image-check";
import { RateLimiter } from "@/lib/design-week/core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The learner's avatar.
 *   GET                                       → { avatarUrl, kind, googlePhoto }
 *   PUT  { kind: "cartoon", id: "people/maya" } | { kind: "google" } | { kind: "none" } → { avatarUrl }
 *   POST <image/webp | image/jpeg bytes>      → { avatarUrl }   the in-browser 256×256 crop
 * A replaced or removed upload is deleted from Storage. Uploads: 10 a day per learner.
 *
 * The browser does the crop / resize / re-encode on a canvas (sharp isn't a dependency), which also
 * drops EXIF and GPS. This route trusts none of it: it checks the magic bytes and the exact 256×256
 * size, and strips any EXIF / XMP / IPTC block that is still there before anything is stored.
 */

const uploadBurst = new RateLimiter(AVATAR_LIMITS.uploadsPerDay, 24 * 60 * 60 * 1000); // backstop when the log table is missing
const changeBurst = new RateLimiter(30, 60 * 60 * 1000);

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: noStore });
const fail = (status: number, error: string, code: string) => json({ error, code }, status);

export async function GET(req: Request) {
  const me = await requireLearner(req);
  if (me instanceof NextResponse) return me;
  try {
    const [avatarUrl, googlePhoto] = await Promise.all([db.getAvatar(me.id), db.googlePhoto(me.id)]);
    return json({ avatarUrl, kind: avatarKind(avatarUrl, googlePhoto), googlePhoto });
  } catch (e) {
    console.error("[avatar] get", e);
    return fail(500, "Couldn't load your avatar. Try again.", "error");
  }
}

export async function PUT(req: Request) {
  const me = await requireLearner(req);
  if (me instanceof NextResponse) return me;
  if (!changeBurst.hit(me.id)) return fail(429, "That's a lot of changes. Try again in a while.", "rate");
  let body: Record<string, unknown> = {};
  try {
    const v = await req.json();
    if (v && typeof v === "object" && !Array.isArray(v)) body = v as Record<string, unknown>;
  } catch {
    /* empty body → invalid below */
  }
  try {
    let next: string | null;
    if (body.kind === "cartoon") {
      next = typeof body.id === "string" ? catalogAvatarPath(body.id) : null;
      if (!next) return fail(400, "That avatar isn't one of ours.", "invalid");
    } else if (body.kind === "google") {
      next = await db.googlePhoto(me.id);
      if (!next) return fail(400, "There's no Google photo on your account.", "no_google");
    } else if (body.kind === "none") {
      next = null;
    } else {
      return fail(400, "Pick an avatar.", "invalid");
    }
    const prev = await db.getAvatar(me.id);
    if (!(await db.setAvatar(me.id, next))) return fail(409, "Your profile isn't ready yet. Reload and try again.", "no_profile");
    await dropOldUploads(me.id, prev, next);
    await db.afterChange(me.id);
    return json({ avatarUrl: next, kind: avatarKind(next, body.kind === "google" ? next : null) });
  } catch (e) {
    console.error("[avatar] put", e);
    return fail(500, "Couldn't save your avatar. Try again.", "error");
  }
}

export async function POST(req: Request) {
  const me = await requireLearner(req);
  if (me instanceof NextResponse) return me;

  const declared = Number(req.headers.get("content-length") || "0");
  if (declared > AVATAR_LIMITS.maxInputBytes) return fail(413, "That photo is over 2 MB.", "too_large");
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await req.arrayBuffer());
  } catch {
    return fail(400, "The upload didn't arrive. Try again.", "invalid");
  }
  if (bytes.length > AVATAR_LIMITS.maxInputBytes) return fail(413, "That photo is over 2 MB.", "too_large");
  const info = inspectStoredImage(bytes);
  if (!info) {
    // A real PNG / HEIC here means the crop step was skipped; anything else isn't an image at all.
    if (sniffImage(bytes)) return fail(422, `Send the ${AVATAR_LIMITS.size}×${AVATAR_LIMITS.size} crop from the picker, not the original photo.`, "bad_format");
    return fail(415, "That isn't a JPEG, PNG or WebP image.", "not_image");
  }
  if (info.width !== AVATAR_LIMITS.size || info.height !== AVATAR_LIMITS.size) return fail(422, `Send the ${AVATAR_LIMITS.size}×${AVATAR_LIMITS.size} crop, not the original photo.`, "bad_size");
  if (info.hasMetadata) {
    bytes = stripMetadata(bytes);
    const again = inspectStoredImage(bytes);
    if (!again || again.hasMetadata || again.width !== info.width) return fail(422, "Couldn't remove the photo's metadata. Try another photo.", "metadata");
  }

  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const used = await db.uploadsSince(me.id, since);
    if (used === null ? !uploadBurst.hit(me.id) : used >= AVATAR_LIMITS.uploadsPerDay)
      return fail(429, `That's ${AVATAR_LIMITS.uploadsPerDay} photo uploads today. Pick a cartoon for now, or try again tomorrow.`, "rate");

    const ext = info.format === "webp" ? "webp" : "jpg";
    const path = `${me.id}/${crypto.randomUUID().replace(/-/g, "")}.${ext}`;
    let url: string;
    try {
      url = await db.putObject(path, bytes, info.format === "webp" ? "image/webp" : "image/jpeg");
    } catch (e) {
      if ((e as { missingBucket?: boolean }).missingBucket) return fail(503, "Photo uploads aren't switched on yet. Pick a cartoon for now.", "no_bucket");
      throw e;
    }
    if (used !== null) await db.logUpload(me.id, bytes.length).catch(() => {});

    const prev = await db.getAvatar(me.id);
    if (!(await db.setAvatar(me.id, url))) {
      await db.removeObjects([path]).catch(() => {});
      return fail(409, "Your profile isn't ready yet. Reload and try again.", "no_profile");
    }
    await dropOldUploads(me.id, prev, url);
    await db.afterChange(me.id);
    return json({ avatarUrl: url, kind: "upload" });
  } catch (e) {
    console.error("[avatar] upload", e);
    return fail(500, "Couldn't save your photo. Try again.", "error");
  }
}

/**
 * Delete this learner's stored photos that are no longer their avatar: the one just replaced, plus
 * any strays from an upload that failed half-way. Only ever inside "<their id>/".
 */
async function dropOldUploads(userId: string, prev: string | null, next: string | null) {
  const keep = uploadedAvatarPath(next);
  try {
    const listed = await db.listObjects(userId);
    const prevPath = uploadedAvatarPath(prev);
    const all = new Set(listed);
    if (prevPath?.startsWith(`${userId}/`)) all.add(prevPath);
    const drop = [...all].filter((p) => p !== keep && p.startsWith(`${userId}/`));
    await db.removeObjects(drop);
  } catch (e) {
    // The avatar itself is saved; a leftover file is only storage, so don't fail the request.
    console.error("[avatar] cleanup", e);
  }
}
