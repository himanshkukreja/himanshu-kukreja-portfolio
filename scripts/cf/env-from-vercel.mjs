// GitHub Actions step for the Cloudflare deploy: the production env pulled from Vercel (`vercel pull`) becomes
// 1. the build's process env ($GITHUB_ENV), not a .env file: OpenNext inlines .env* files into the Worker bundle;
// 2. the Worker's secrets (a JSON file for `wrangler secret bulk`): every server-side variable.
// Vercel never hands out "sensitive" variables (ANTHROPIC_API_KEY, POSTHOG_PERSONAL_API_KEY), so those, and
// anything only Cloudflare needs (BREVO_API_KEY), come from GitHub secrets passed in as EXTRA_* env vars.
// Every value is masked in the job log. Usage: node scripts/cf/env-from-vercel.mjs <pulled env file> <secrets.json>
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { parseEnv } from "node:util";

const [file, out] = process.argv.slice(2);
const env = parseEnv(readFileSync(file, "utf8"));
for (const [k, v] of Object.entries(process.env)) if (k.startsWith("EXTRA_") && v) env[k.slice(6)] = v;

const skip = (k) => /^(VERCEL|TURBO|NX_)/.test(k) || k === "NODE_ENV";
const ghEnv = process.env.GITHUB_ENV;
const secrets = {};
for (const [k, v] of Object.entries(env)) {
  if (skip(k) || v === "") continue;
  for (const line of v.split("\n")) if (line.trim().length > 3) console.log(`::add-mask::${line}`);
  if (ghEnv) {
    const d = `EOF_${randomBytes(8).toString("hex")}`;
    appendFileSync(ghEnv, `${k}<<${d}\n${v}\n${d}\n`);
  }
  if (!k.startsWith("NEXT_PUBLIC_")) secrets[k] = v; // NEXT_PUBLIC_* are inlined at build time
}
writeFileSync(out, JSON.stringify(secrets));
console.log(`env-from-vercel: ${Object.keys(env).length} variables for the build, ${Object.keys(secrets).length} Worker secrets: ${Object.keys(secrets).sort().join(", ")}`);
