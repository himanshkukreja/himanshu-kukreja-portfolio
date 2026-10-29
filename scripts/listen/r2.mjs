// Cloudflare R2 uploads (S3 API, SigV4 signed here: no SDK), the same way scripts/lecture/publish.mjs
// does it (that file is a script, so its signer is repeated here rather than imported).
// env (.env.local): R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
import crypto from "crypto";

const hmac = (k, s) => crypto.createHmac("sha256", k).update(s).digest();
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");

export function r2Config() {
  const { R2_ACCOUNT_ID: ACC, R2_ACCESS_KEY_ID: KEY, R2_SECRET_ACCESS_KEY: SECRET, R2_BUCKET: BUCKET } = process.env;
  if (!ACC || !KEY || !SECRET || !BUCKET) throw new Error("set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET in .env.local (run with node --env-file=.env.local)");
  return { ACC, KEY, SECRET, BUCKET, HOST: `${ACC}.r2.cloudflarestorage.com` };
}

export async function r2Put(key, body, type, cache) {
  const { KEY, SECRET, BUCKET, HOST } = r2Config();
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
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(`https://${HOST}${uri}`, {
        method: "PUT",
        headers: { ...headers, authorization: `AWS4-HMAC-SHA256 Credential=${KEY}/${scope}, SignedHeaders=${names.join(";")}, Signature=${sig}` },
        body,
      });
      if (!res.ok) throw new Error(`PUT ${key}: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
      return;
    } catch (e) {
      if (attempt >= 3) throw e;
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
}
