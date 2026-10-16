#!/usr/bin/env node
/**
 * Import case-file bundles into the CMS as DRAFTS (never published by this script).
 *
 *   node --experimental-strip-types scripts/case-files/import-drafts.mjs <bundle-dir>... [options]
 *
 * A bundle dir is named after the slug and holds:
 *   <slug>.md          frontmatter (slug, title, excerpt, date, type, tags, debrief, cover…) + markdown body
 *   activity.json      optional: neutral activity ({ kind: quiz|timeline|spot|decide, title, blurb, minutes, steps })
 *                      or the CMS data shape; mapped by fromNeutralActivity (src/components/stories/activities/data.ts)
 *   cover.png          optional (cover.webp is not needed: next/image serves optimised formats)
 *   cover.motion.svg   optional animated layer
 *   notes.md           optional; a "CASE-0NN" mentioned next to the word "cover" reserves that case number
 *
 * Options:
 *   --dry-run                 print what would happen, write nothing
 *   --update                  re-import over an existing row (drafts that were never published only)
 *   --number <slug>=<n>       reserve a case number (repeatable); overrides notes.md
 *   --no-numbers              don't reserve any case numbers
 *
 * Target: Supabase (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from the env, .env.local or .env):
 * rows in public.case_files (+ an "import" revision), covers uploaded to the public "case-files" bucket.
 * Apply supabase/migrations/20261016_case_files_cms.sql first.
 * Dev: CASE_FILES_STORE=file CASE_FILES_STORE_FILE=/abs/store.json [CASE_FILES_PUBLIC_DIR=/abs/public] writes the
 * local JSON store instead and copies covers to <public>/case-files/_cms/<slug>/.
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import matter from "gray-matter";
import { fromNeutralActivity, parseActivityData, checkActivity } from "../../src/components/stories/activities/data.ts";
import { parseDebrief, resolveCaseType } from "../../src/components/stories/case-types.ts";
import { RESERVED_SLUGS, SLUG_RE } from "../../src/lib/case-files/types.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const BUCKET = "case-files";

/* ───────────── args + env ───────────── */
const argv = process.argv.slice(2);
const flags = { dry: argv.includes("--dry-run"), update: argv.includes("--update"), noNumbers: argv.includes("--no-numbers") };
const numbers = new Map();
const dirs = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--number") {
    const [slug, n] = String(argv[++i] || "").split("=");
    if (slug && Number(n)) numbers.set(slug, Number(n));
  } else if (!a.startsWith("--")) dirs.push(path.resolve(a));
}
if (!dirs.length) {
  console.error("usage: node --experimental-strip-types scripts/case-files/import-drafts.mjs <bundle-dir>... [--dry-run] [--update] [--number slug=n] [--no-numbers]");
  process.exit(1);
}
for (const f of [".env.local", ".env"]) {
  const p = path.join(ROOT, f);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
const FILE_MODE = process.env.CASE_FILES_STORE === "file" && process.env.CASE_FILES_STORE_FILE;

/* ───────────── bundle → fields ───────────── */
function readBundle(dir) {
  const slugGuess = path.basename(dir);
  const mdName = fs.existsSync(path.join(dir, `${slugGuess}.md`)) ? `${slugGuess}.md` : fs.readdirSync(dir).find((n) => n.endsWith(".md") && n !== "notes.md");
  if (!mdName) throw new Error("no <slug>.md in the bundle");
  const { data, content } = matter(fs.readFileSync(path.join(dir, mdName), "utf8"));
  const slug = String(data.slug || slugGuess).trim();
  if (!SLUG_RE.test(slug) || RESERVED_SLUGS.has(slug)) throw new Error(`bad slug "${slug}"`);
  if (fs.existsSync(path.join(ROOT, "content", "stories", `${slug}.md`))) throw new Error(`content/stories/${slug}.md exists: that slug belongs to a repo story`);
  const title = String(data.title || "").trim();
  let activity = null;
  const actPath = path.join(dir, "activity.json");
  if (fs.existsSync(actPath)) {
    const raw = JSON.parse(fs.readFileSync(actPath, "utf8"));
    const isData = Array.isArray(raw.steps) && raw.steps.some((s) => ["choice", "order", "spot", "decide"].includes(s?.type) && ("prompt" in s));
    activity = isData ? parseActivityData(raw) : fromNeutralActivity(raw);
  }
  const date = data.date instanceof Date ? data.date.toISOString().slice(0, 10) : String(data.date || "").slice(0, 10);
  const debrief = parseDebrief(data.debrief);
  const fields = {
    slug,
    title,
    excerpt: String(data.excerpt || "").trim(),
    type: resolveCaseType(slug, data.type),
    tags: [...new Set((Array.isArray(data.tags) ? data.tags : []).map((t) => String(t).trim()).filter(Boolean))],
    date,
    coverUrl: "",
    coverAlt: String(data.coverAlt || data.cover_alt || "").trim() || `Blueprint cover for the case file "${title}"`,
    motionCoverUrl: "",
    bodyMd: content.replace(/^\n+/, ""),
    debrief,
    activity,
    seoTitle: String(data.seoTitle || data.seo_title || "").trim(),
    seoDescription: String(data.seoDescription || data.seo_description || "").trim(),
  };
  // case number baked into the cover (notes.md: "Cover is rendered as **CASE-014** …")
  let caseNumber = numbers.get(slug) ?? null;
  const notes = path.join(dir, "notes.md");
  if (caseNumber == null && !flags.noNumbers && fs.existsSync(notes)) {
    // the line itself, or the line under a "Case ID on the cover" heading
    const lines = fs.readFileSync(notes, "utf8").split("\n");
    const i = lines.findIndex((l, k) => /CASE-0\d\d/.test(l) && (/cover/i.test(l) || /cover/i.test(lines[k - 1] || "")));
    const m = i >= 0 && /CASE-0(\d\d)/.exec(lines[i]);
    if (m) caseNumber = Number(m[1]);
  }
  const covers = [
    ["cover.png", "image/png", "cover"],
    ["cover.motion.svg", "image/svg+xml", "motion"],
  ]
    .map(([name, type, kind]) => ({ file: path.join(dir, name), type, kind, name }))
    .filter((c) => fs.existsSync(c.file));
  return { fields, caseNumber, covers, debriefOk: !!debrief, activityIssues: activity ? checkActivity(activity) : [] };
}

const objectPath = (slug, kind, name, ext) => `${slug}/${kind}-${Date.now().toString(36)}-${name.replace(/\..*$/, "")}.${ext}`;

/* ───────────── targets ───────────── */
async function supabaseTarget() {
  const { createClient } = await import("@supabase/supabase-js");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  const sb = createClient(url, key, { auth: { persistSession: false } });
  const probe = await sb.from("case_files").select("id", { head: true, count: "exact" }).limit(1);
  if (probe.error) throw new Error(`case_files is not reachable (${probe.error.message}). Apply supabase/migrations/20261016_case_files_cms.sql first.`);
  return {
    name: "supabase",
    async existing(slug) {
      const { data, error } = await sb.from("case_files").select("id,status,published_at,version").eq("slug", slug).maybeSingle();
      if (error) throw new Error(error.message);
      return data ? { id: data.id, status: data.status, publishedAt: data.published_at, version: data.version } : null;
    },
    async numberTaken(n, exceptId) {
      const { data } = await sb.from("case_files").select("id,slug").eq("case_number", n).maybeSingle();
      return data && data.id !== exceptId ? data.slug : null;
    },
    async upload(slug, c) {
      const ext = c.type === "image/svg+xml" ? "svg" : "png";
      const p = objectPath(slug, c.kind, "cover", ext);
      const { error } = await sb.storage.from(BUCKET).upload(p, fs.readFileSync(c.file), { contentType: c.type, upsert: false });
      if (error) throw new Error(`upload ${c.name}: ${error.message}`);
      return sb.storage.from(BUCKET).getPublicUrl(p).data.publicUrl;
    },
    async write(f, caseNumber, prev) {
      const row = {
        slug: f.slug,
        title: f.title,
        excerpt: f.excerpt,
        type: f.type,
        tags: f.tags,
        date: f.date || null,
        cover_url: f.coverUrl || null,
        cover_alt: f.coverAlt,
        motion_cover_url: f.motionCoverUrl || null,
        body_md: f.bodyMd,
        debrief: f.debrief,
        activity: f.activity,
        seo_title: f.seoTitle || null,
        seo_description: f.seoDescription || null,
        case_number: caseNumber,
        status: "draft",
        updated_by: "import-drafts",
      };
      let id = prev?.id;
      let version = 1;
      if (prev) {
        version = (prev.version || 1) + 1;
        const { error } = await sb.from("case_files").update({ ...row, version, validation: null }).eq("id", prev.id);
        if (error) throw new Error(error.message);
      } else {
        const { data, error } = await sb.from("case_files").insert({ ...row, version, created_by: "import-drafts" }).select("id").single();
        if (error) throw new Error(error.message);
        id = data.id;
      }
      const { error: rErr } = await sb.from("case_file_revisions").insert({ case_file_id: id, version, action: "import", snapshot: f, created_by: "import-drafts" });
      if (rErr) throw new Error(rErr.message);
      return id;
    },
  };
}

function fileTarget() {
  const storePath = process.env.CASE_FILES_STORE_FILE;
  const publicDir = process.env.CASE_FILES_PUBLIC_DIR || path.join(ROOT, "public");
  const read = () => (fs.existsSync(storePath) ? JSON.parse(fs.readFileSync(storePath, "utf8")) : { rows: [], revisions: [], seq: 0 });
  const save = (db) => fs.writeFileSync(storePath, JSON.stringify(db, null, 1));
  return {
    name: `file ${storePath}`,
    async existing(slug) {
      const r = read().rows.find((x) => x.slug === slug);
      return r ? { id: r.id, status: r.status, publishedAt: r.publishedAt, version: r.version } : null;
    },
    async numberTaken(n, exceptId) {
      const r = read().rows.find((x) => x.caseNumber === n && x.id !== exceptId);
      return r ? r.slug : null;
    },
    async upload(slug, c) {
      const ext = c.type === "image/svg+xml" ? "svg" : "png";
      const p = objectPath(slug, c.kind, "cover", ext);
      const full = path.join(publicDir, "case-files", "_cms", p);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.copyFileSync(c.file, full);
      return `/case-files/_cms/${p}`;
    },
    async write(f, caseNumber, prev) {
      const db = read();
      const now = new Date().toISOString();
      let id = prev?.id;
      let version = 1;
      if (prev) {
        const i = db.rows.findIndex((r) => r.id === prev.id);
        version = db.rows[i].version + 1;
        db.rows[i] = { ...db.rows[i], ...f, caseNumber, status: "draft", version, validation: null, updatedBy: "import-drafts", updatedAt: now };
      } else {
        id = crypto.randomUUID();
        db.rows.push({ ...f, id, status: "draft", overridesFile: false, caseNumber, publishedAt: null, lastPublishedAt: null, archivedAt: null, version, liveVersion: null, live: null, createdBy: "import-drafts", updatedBy: "import-drafts", validation: null, createdAt: now, updatedAt: now });
      }
      db.seq = (db.seq || 0) + 1;
      db.revisions.push({ id: String(db.seq), caseFileId: id, version, action: "import", snapshot: f, createdBy: "import-drafts", createdAt: now });
      save(db);
      return id;
    },
  };
}

/* ───────────── run ───────────── */
const target = flags.dry ? null : FILE_MODE ? fileTarget() : await supabaseTarget();
console.log(`import-drafts → ${flags.dry ? "dry run" : target.name}`);
let failed = 0;
const repoCount = fs.readdirSync(path.join(ROOT, "content", "stories")).filter((n) => n.endsWith(".md")).length;
for (const dir of dirs) {
  const tag = path.basename(dir);
  try {
    const b = readBundle(dir);
    const f = b.fields;
    const notes = [];
    if (!b.debriefOk) notes.push("no valid debrief (publishing will be blocked until one is added)");
    const actErr = b.activityIssues.filter((x) => x.level === "error");
    if (f.activity) notes.push(`activity: ${f.activity.steps.length} steps (${f.activity.steps.map((s) => s.type).join(", ")})${actErr.length ? `, ${actErr.length} issue(s): ${actErr[0].message}` : ""}`);
    else notes.push("no activity");
    let caseNumber = b.caseNumber;
    if (caseNumber != null && caseNumber <= repoCount) {
      notes.push(`CASE-${String(caseNumber).padStart(3, "0")} belongs to a repo story: not reserved`);
      caseNumber = null;
    }
    if (flags.dry) {
      console.log(`  ${tag}: would import "${f.title}" (${f.bodyMd.split(/\s+/).length} words, ${b.covers.map((c) => c.name).join(" + ") || "no cover"}${caseNumber ? `, reserve CASE-${String(caseNumber).padStart(3, "0")}` : ""}); ${notes.join("; ")}`);
      continue;
    }
    const prev = await target.existing(f.slug);
    if (prev && !flags.update) {
      console.log(`  ${tag}: skipped, already in the CMS (${prev.status}); pass --update to overwrite a draft`);
      continue;
    }
    if (prev && (prev.status !== "draft" || prev.publishedAt)) {
      console.log(`  ${tag}: skipped, the CMS row was published once (${prev.status}); edit it in the admin instead`);
      continue;
    }
    if (caseNumber != null) {
      const by = await target.numberTaken(caseNumber, prev?.id);
      if (by) {
        notes.push(`CASE-${String(caseNumber).padStart(3, "0")} is taken by ${by}: not reserved`);
        caseNumber = null;
      }
    }
    for (const c of b.covers) {
      const url = await target.upload(f.slug, c);
      if (c.kind === "cover") f.coverUrl = url;
      else f.motionCoverUrl = url;
    }
    const id = await target.write(f, caseNumber, prev);
    console.log(`  ${tag}: ${prev ? "updated" : "created"} draft ${id}${caseNumber ? ` · CASE-${String(caseNumber).padStart(3, "0")} reserved` : ""} · cover ${f.coverUrl ? "uploaded" : "missing"}${f.motionCoverUrl ? " + motion" : ""}; ${notes.join("; ")}`);
  } catch (e) {
    failed++;
    console.log(`  ${tag}: FAILED ${e.message}`);
  }
}
console.log(failed ? `${failed} bundle(s) failed` : "done: open /admin/case-files to review, validate and publish");
process.exit(failed ? 1 : 0);
