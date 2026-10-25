// Upload exported lecture media to Cloudflare R2 (S3 API, signed here: no SDK needed).
// usage: node --env-file=.env.local scripts/lecture/publish.mjs <export dir> [<export dir> …]
// env: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_URL
// Each export dir is scripts/lecture/export.mjs output for one quest; it lands at lectures/<slug>/.
// media.json goes last, so a learner never gets timings for audio that isn't there yet.
import crypto from "crypto";
import fs from "fs";
import path from "path";

const { R2_ACCOUNT_ID: ACC, R2_ACCESS_KEY_ID: KEY, R2_SECRET_ACCESS_KEY: SECRET, R2_BUCKET: BUCKET, R2_PUBLIC_URL: PUBLIC } = process.env;
if (!ACC || !KEY || !SECRET || !BUCKET) throw new Error("set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET in .env.local");
const HOST = `${ACC}.r2.cloudflarestorage.com`;
const TYPES = { ".json": "application/json", ".mp3": "audio/mpeg", ".mp4": "video/mp4", ".jpg": "image/jpeg", ".vtt": "text/vtt; charset=utf-8" };
const FILES = ["narration.mp3", "music.mp3", "video.mp4", "poster.jpg", "captions.vtt", "chapters.json", "media.json"];

const hmac = (k, s) => crypto.createHmac("sha256", k).update(s).digest();
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");

async function put(key, body, type, cache) {
  const now = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
  const day = now.slice(0, 8);
  const uri = `/${BUCKET}/${key.split("/").map(encodeURIComponent).join("/")}`;
  const hash = sha(body);
  const headers = { host: HOST, "content-type": type, "cache-control": cache, "x-amz-content-sha256": hash, "x-amz-date": now };
  const names = Object.keys(headers).sort();
  const canon = ["PUT", uri, "", ...names.map((h) => `${h}:${headers[h]}`), "", names.join(";"), hash].join("\n");
  const scope = `${day}/auto/s3/aws4_request`;
  const toSign = ["AWS4-HMAC-SHA256", now, scope, sha(canon)].join("\n");
  const kSign = hmac(hmac(hmac(hmac(`AWS4${SECRET}`, day), "auto"), "s3"), "aws4_request");
  const sig = crypto.createHmac("sha256", kSign).update(toSign).digest("hex");
  const res = await fetch(`https://${HOST}${uri}`, {
    method: "PUT",
    headers: { ...headers, authorization: `AWS4-HMAC-SHA256 Credential=${KEY}/${scope}, SignedHeaders=${names.join(";")}, Signature=${sig}` },
    body,
  });
  if (!res.ok) throw new Error(`PUT ${key}: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
}

for (const dir of process.argv.slice(2)) {
  const media = JSON.parse(fs.readFileSync(path.join(dir, "media.json"), "utf8"));
  const slug = path.basename(path.resolve(dir));
  // version the file URLs by script hash, so browsers never mix an old recording with new timings
  for (const k of ["audio", "music", "video", "poster", "captions"]) if (media[k]) media[k] = `${media[k].split("?")[0]}?v=${media.source}`;
  let bytes = 0;
  for (const f of FILES) {
    const p = path.join(dir, f);
    if (!fs.existsSync(p)) continue;
    const body = f === "media.json" ? Buffer.from(JSON.stringify(media)) : fs.readFileSync(p);
    const cache = f === "media.json" ? "public, max-age=60" : "public, max-age=604800";
    await put(`lectures/${slug}/${f}`, body, TYPES[path.extname(f)], cache);
    bytes += body.length;
  }
  console.log(`${slug}: ${(bytes / 1048576).toFixed(1)} MB → ${PUBLIC ? `${PUBLIC.replace(/\/$/, "")}/lectures/${slug}/media.json` : `r2://${BUCKET}/lectures/${slug}/`}`);
}
