/**
 * The DSA content bundle (src/lib/dsa/bundle.ts): the manifest entry and bundle checks, reads with their fallbacks,
 * the problem heads the index is built from, the per-commit memo, and the SD link title tokens (src/lib/dsa/sdm-links.ts).
 * With DSA_CONTENT_DIR (a dsa-mastery checkout, default ~/.cache/hk-render/dsa-content) it also checks every real
 * problem.md, and the repo's own bundle builder when the checkout has it (.github/scripts/r2-bundle.mjs).
 *   node --test scripts/tests/dsa-bundle.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import matter from "gray-matter";
import { MAX_BUNDLE_BYTES, MAX_PAGE_BYTES, blurbOf, bundleLoader, bundleRefOf, bundleText, pageDirOf, pageLoader, pageRefsOf, pageText, parseBundle, parsePageBundle, problemHead, versionedMemo } from "../../src/lib/dsa/bundle.ts";
import { hasLinkTokens, linkToken, resolveLinkTokens, tokenLinker } from "../../src/lib/dsa/sdm-links.ts";

const SHA = "a".repeat(40);
const PROBLEM = `---
id: busiest-shard
title: Busiest shard
tags:
  patterns: [counting]
---

## Scenario

The **ops** team counts \`writes\` per shard:

\`\`\`text
shard-1 shard-2
\`\`\`

## Your task

Return the busiest one.

## Examples

Input: [1, 2]

## Hints

### Rung 1: count
Count them.
`;

function makeBundle(over = {}) {
  const j = {
    format: "dsa-content-bundle",
    v: 1,
    sha: SHA,
    generatedAt: "2026-11-11T00:00:00.000Z",
    files: { "resources/concepts.yml": "concepts: []\n", "resources/worlds/academy.yml": "id: academy\n" },
    missing: ["generated/problem-index.json"],
    heads: { "resources/problems/busiest-shard/problem.md": problemHead(PROBLEM) },
    ...over,
  };
  const body = Buffer.from(JSON.stringify(j));
  const ref = { key: `bundles/${j.sha}.json`, sha: j.sha, bytes: body.length, sha256: createHash("sha256").update(body).digest("hex") };
  return { body, ref };
}

test("manifest entry: only this commit's bundle, within the size cap", () => {
  const { ref } = makeBundle();
  assert.deepEqual(bundleRefOf({ sha: SHA, bundle: ref }), ref);
  assert.equal(bundleRefOf({ sha: SHA }), null, "no bundle named");
  assert.equal(bundleRefOf(null), null);
  assert.equal(bundleRefOf({ sha: "b".repeat(40), bundle: ref }), null, "another commit's bundle");
  assert.equal(bundleRefOf({ sha: SHA, bundle: { ...ref, key: "bundles/../x.json" } }), null, "key must be bundles/<sha>.json");
  assert.equal(bundleRefOf({ sha: SHA, bundle: { ...ref, bytes: MAX_BUNDLE_BYTES + 1 } }), null, "too big");
  assert.equal(bundleRefOf({ sha: SHA, bundle: { ...ref, sha256: "nope" } }), null);
});

test("bundle checks: length, hash, format, commit and paths", () => {
  const { body, ref } = makeBundle();
  const b = parseBundle(body, ref);
  assert.ok(b);
  assert.equal(b.sha, SHA);
  assert.equal(b.files.get("resources/concepts.yml"), "concepts: []\n");
  assert.equal(parseBundle(body.toString("utf8"), ref)?.sha, SHA, "text works like bytes");

  const tampered = Buffer.from(body);
  tampered[tampered.length - 3] ^= 1;
  assert.equal(parseBundle(tampered, ref), null, "hash mismatch");
  assert.equal(parseBundle(body.subarray(0, body.length - 1), ref), null, "truncated");
  for (const over of [{ format: "other" }, { v: 2 }, { sha: "c".repeat(40) }, { files: { "../etc/passwd": "x" } }, { files: { "resources/a.yml": 1 } }, { missing: "x" }, { heads: { "resources/concepts.yml": "x" } }]) {
    const bad = makeBundle(over);
    // a bundle that names another commit is refused whatever its manifest entry says
    const r = over.sha ? { ...bad.ref, sha: SHA, key: `bundles/${SHA}.json` } : bad.ref;
    assert.equal(parseBundle(bad.body, r), null, JSON.stringify(over));
  }
  const notJson = Buffer.from("{not json");
  assert.equal(parseBundle(notJson, { ...ref, bytes: notJson.length, sha256: createHash("sha256").update(notJson).digest("hex") }), null);
});

test("reads: the bundle's text, its known-missing files, else the file itself", () => {
  const { body, ref } = makeBundle();
  const b = parseBundle(body, ref);
  assert.equal(bundleText(b, "resources/worlds/academy.yml"), "id: academy\n");
  assert.equal(bundleText(b, "generated/problem-index.json"), null, "known missing: null, no read");
  assert.equal(bundleText(b, "resources/modules/m1/x/lesson.md"), undefined, "not in the bundle: read the file");
  assert.equal(bundleText(null, "resources/concepts.yml"), undefined, "no bundle: read the file");
});

test("loader: reads a commit's bundle once, falls back on any failure, retries later, never serves an old commit's", async () => {
  const one = makeBundle();
  const two = makeBundle({ sha: "d".repeat(40) });
  let manifest = { sha: SHA, bundle: one.ref };
  let t = 1_000;
  const reads = [];
  let store = { [one.ref.key]: one.body, [two.ref.key]: two.body };
  const warns = [];
  const load = bundleLoader({ manifest: async () => manifest, read: async (k) => (reads.push(k), store[k] ?? null), now: () => t, retryMs: 60_000, warn: (m) => warns.push(m) });

  const [a, b] = await Promise.all([load(), load()]);
  assert.equal(a?.sha, SHA);
  assert.equal(a, b);
  assert.equal(reads.length, 1, "concurrent callers share one read");
  await load();
  assert.equal(reads.length, 1, "kept for the commit");

  manifest = { sha: two.ref.sha, bundle: two.ref };
  assert.equal((await load())?.sha, two.ref.sha, "a new commit's manifest: its own bundle");
  assert.equal(reads.length, 2);

  manifest = { sha: "e".repeat(40), bundle: undefined };
  assert.equal(await load(), null, "a manifest without a bundle: none, never the previous commit's");

  const three = makeBundle({ sha: "f".repeat(40) });
  manifest = { sha: three.ref.sha, bundle: three.ref };
  assert.equal(await load(), null, "bundle object missing: fall back");
  assert.match(warns.at(-1), /missing/);
  const before = reads.length;
  t += 30_000;
  assert.equal(await load(), null);
  assert.equal(reads.length, before, "no retry within the minute");
  store = { ...store, [three.ref.key]: three.body };
  t += 31_000;
  assert.equal((await load())?.sha, three.ref.sha, "retried after a minute");

  const four = makeBundle({ sha: "9".repeat(40) });
  manifest = { sha: four.ref.sha, bundle: { ...four.ref, sha256: "0".repeat(64) } };
  store = { ...store, [four.ref.key]: four.body };
  assert.equal(await load(), null, "hash mismatch: fall back");
  assert.match(warns.at(-1), /failed its checks/);

  const flaky = bundleLoader({ manifest: async () => ({ sha: SHA, bundle: one.ref }), read: async () => { throw new Error("R2 down"); }, now: () => t });
  assert.equal(await flaky(), null, "a throwing read: fall back");
  const noManifest = bundleLoader({ manifest: async () => { throw new Error("no manifest"); }, read: async () => one.body });
  assert.equal(await noManifest(), null);
});

const LESSON = "resources/structures/s7-tries/tries";
function makePage(over = {}, dir = LESSON) {
  const j = {
    format: "dsa-page-bundle",
    v: 1,
    dir,
    files: { [`${dir}/lesson.md`]: "# Tries\n", [`${dir}/lab/starter/starter.py`]: "def f():\n  pass\n" },
    skipped: [`${dir}/lab/solutions/solution.py`],
    ...over,
  };
  const body = Buffer.from(JSON.stringify(j));
  const ref = { key: `pages/v1-${"b".repeat(40)}.json`, bytes: body.length, sha256: createHash("sha256").update(body).digest("hex") };
  return { body, ref };
}

test("page bundles: named in the manifest's bundle entry, checked, and what they say about each path", () => {
  const { ref: bundleRef } = makeBundle();
  const page = makePage();
  const problem = makePage({}, "resources/problems/busiest-shard");
  const manifest = { sha: SHA, bundle: { ...bundleRef, pages: { [LESSON]: page.ref, "resources/problems/busiest-shard": problem.ref } } };
  const refs = pageRefsOf(manifest);
  assert.equal(refs.size, 2);
  assert.deepEqual(refs.get(LESSON), page.ref);
  assert.equal(bundleRefOf(manifest)?.key, bundleRef.key, "the bundle entry still checks out with pages in it");
  assert.equal(pageRefsOf({ sha: SHA, bundle: { ...bundleRef } }).size, 0, "no pages named");
  assert.equal(pageRefsOf({ sha: "b".repeat(40), bundle: { ...bundleRef, pages: { [LESSON]: page.ref } } }).size, 0, "no usable bundle: no pages either");
  for (const [dir, r] of [
    ["resources/../x/y", page.ref],
    ["resources/concepts.yml", page.ref],
    [LESSON, { ...page.ref, key: "pages/../bundles/x.json" }],
    [LESSON, { ...page.ref, bytes: MAX_PAGE_BYTES + 1 }],
    [LESSON, { ...page.ref, sha256: "x" }],
  ])
    assert.equal(pageRefsOf({ sha: SHA, bundle: { ...bundleRef, pages: { [dir]: r } } }).size, 0, `${dir} ${JSON.stringify(r)}`);

  const pb = parsePageBundle(page.body, page.ref, LESSON);
  assert.ok(pb);
  assert.equal(pageText(pb, `${LESSON}/lesson.md`), "# Tries\n");
  assert.equal(pageText(pb, `${LESSON}/lab/solutions/solution.py`), undefined, "in the folder, not carried: read it");
  assert.equal(pageText(pb, `${LESSON}/quiz.md`), null, "not in the folder: no read");
  assert.equal(pageText(pb, "resources/structures/s2-stacks/stacks/lesson.md"), undefined, "another folder: not this bundle's to say");
  assert.equal(pageText(null, `${LESSON}/lesson.md`), undefined);

  assert.equal(parsePageBundle(page.body, page.ref, "resources/structures/s2-stacks/stacks"), null, "another folder's bundle");
  const tampered = Buffer.from(page.body);
  tampered[tampered.length - 3] ^= 1;
  assert.equal(parsePageBundle(tampered, page.ref, LESSON), null, "hash mismatch");
  for (const over of [{ format: "x" }, { v: 2 }, { files: { "resources/structures/s2-stacks/stacks/lesson.md": "x" } }, { files: { [`${LESSON}/a.md`]: 1 } }, { skipped: "x" }, { skipped: ["resources/concepts.yml"] }, { skipped: [`${LESSON}/../x`] }]) {
    const bad = makePage(over);
    assert.equal(parsePageBundle(bad.body, bad.ref, LESSON), null, JSON.stringify(over));
  }

  assert.equal(pageDirOf(`${LESSON}/lab/starter/starter.py`), LESSON);
  assert.equal(pageDirOf("resources/problems/busiest-shard/tests/visible.json"), "resources/problems/busiest-shard");
  assert.equal(pageDirOf("resources/modules/m5-sliding-window/at-most-k/lesson.md"), "resources/modules/m5-sliding-window/at-most-k");
  assert.equal(pageDirOf("resources/concepts.yml"), null);
  assert.equal(pageDirOf("generated/traces/x.json"), null);
});

test("page loader: one read per folder version, shared, retried after a failure, oldest dropped past its limit", async () => {
  const page = makePage();
  let t = 1_000;
  const reads = [];
  let store = { [page.ref.key]: page.body };
  const load = pageLoader({ read: async (k) => (reads.push(k), store[k] ?? null), now: () => t, retryMs: 60_000, max: 2 });
  const [a, b] = await Promise.all([load(page.ref, LESSON), load(page.ref, LESSON)]);
  assert.ok(a);
  assert.equal(a, b);
  assert.equal(reads.length, 1, "concurrent reads share one");

  const gone = { ...page.ref, key: `pages/v1-${"c".repeat(40)}.json` };
  assert.equal(await load(gone, LESSON), null, "missing object: null (the files are read one by one)");
  assert.equal(await load(gone, LESSON), null);
  assert.equal(reads.length, 2, "no retry within the minute");
  store = { ...store, [gone.key]: page.body };
  t += 61_000;
  assert.ok(await load(gone, LESSON), "retried after a minute");

  const third = makePage({}, "resources/problems/busiest-shard");
  store = { ...store, [`pages/v1-${"d".repeat(40)}.json`]: third.body };
  await load({ ...third.ref, key: `pages/v1-${"d".repeat(40)}.json` }, "resources/problems/busiest-shard");
  const before = reads.length;
  await load(page.ref, LESSON);
  assert.equal(reads.length, before + 1, "the oldest was dropped past the limit, so it is read again");

  const flaky = pageLoader({ read: async () => { throw new Error("R2 down"); } });
  assert.equal(await flaky(page.ref, LESSON), null);
});

test("problem heads: same front matter and blurb as the whole file, and much smaller", () => {
  const head = problemHead(PROBLEM);
  assert.ok(head.length < PROBLEM.length);
  assert.ok(!head.includes("## Examples"));
  assert.deepEqual(matter(head, {}).data, matter(PROBLEM, {}).data);
  assert.equal(blurbOf(head), blurbOf(PROBLEM));
  assert.equal(blurbOf(PROBLEM), "The ops team counts writes per shard: Return the busiest one.");
  // a "## Examples" line inside the front matter doesn't cut it short
  const odd = `---\ntitle: x\n## Examples is a yaml comment\n---\n\nBody text.\n\n## Constraints\n\nn < 10\n`;
  assert.deepEqual(matter(problemHead(odd), {}).data, matter(odd, {}).data);
  assert.equal(blurbOf(problemHead(odd)), blurbOf(odd));
  assert.equal(problemHead("no front matter, no sections"), "no front matter, no sections");
});

test("memo: one run per key and commit, dropped when the commit changes, failures not kept", async () => {
  const m = versionedMemo();
  let runs = 0;
  const run = async () => ++runs;
  assert.equal(await m.get("v1", "k", run), 1);
  assert.equal(await m.get("v1", "k", run), 1);
  assert.equal(await m.get("v1", "other", run), 2);
  assert.equal(await m.get("v2", "k", run), 3, "new commit: built again");
  assert.equal(m.size, 1, "the old commit's entries are gone");
  await assert.rejects(m.get("v2", "bad", async () => { throw new Error("boom"); }));
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(await m.get("v2", "bad", async () => "ok"), "ok", "a failure is tried again");
});

test("SD links: tokens in cached items, titles when served (escaped in HTML, plain in link objects)", () => {
  const l = tokenLinker();
  const lesson = l.sdm("/week-04-caching/day-04-feed-caching.md");
  assert.equal(lesson.href, "/week-04-caching/day-04-feed-caching");
  assert.equal(lesson.kind, "lesson");
  assert.equal(l.sdm("problem-bank/problem-01-x").kind, "problem");
  const lab = l.lab("idempotency-key-store");
  assert.deepEqual([lab.href, lab.kind], ["/labs/idempotency-key-store", "lab"]);

  const html = `<a href="/week-04-caching/day-04-feed-caching"><span>Lesson</span>${lesson.title}</a><a>${lab.title}</a>`;
  const item = { html, sdmLinks: [lesson, lab], n: 3, nested: { list: [html] } };
  assert.ok(hasLinkTokens(item));
  const titles = { "sdm:week-04-caching/day-04-feed-caching": "Feeds & <caching>", "lab:idempotency-key-store": "Idempotency key store" };
  const out = resolveLinkTokens(item, (k, ref) => titles[`${k}:${ref}`]);
  assert.equal(out.html, `<a href="/week-04-caching/day-04-feed-caching"><span>Lesson</span>Feeds &amp; &lt;caching&gt;</a><a>Idempotency key store</a>`);
  assert.equal(out.sdmLinks[0].title, "Feeds & <caching>", "a link object's title stays plain text");
  assert.equal(out.nested.list[0], out.html);
  assert.equal(out.n, 3);
  assert.ok(!hasLinkTokens(out));
  assert.ok(hasLinkTokens(item), "the cached item itself is left as it was");
  assert.equal(linkToken("sdm", "has space"), "has space", "a ref a token can't carry keeps its own text");
});

const contentDir = process.env.DSA_CONTENT_DIR || join(homedir(), ".cache/hk-render/dsa-content");
test("real content: every problem's head gives the same summary as the whole file", { skip: !existsSync(join(contentDir, "resources/problems")) && `no content at ${contentDir}` }, () => {
  const dir = join(contentDir, "resources/problems");
  let n = 0;
  for (const id of readdirSync(dir)) {
    const p = join(dir, id, "problem.md");
    if (!existsSync(p)) continue;
    const md = readFileSync(p, "utf8");
    const head = problemHead(md);
    assert.deepEqual(matter(head, {}).data, matter(md, {}).data, id);
    assert.equal(blurbOf(head), blurbOf(md), id);
    n++;
  }
  assert.ok(n > 0);
});

const builder = join(contentDir, ".github/scripts/r2-bundle.mjs");
test("real content: the repo's bundle builder writes a bundle the site accepts, with the site's heads", { skip: !existsSync(builder) && `no ${builder}` }, () => {
  const body = execFileSync(process.execPath, [builder, contentDir], { maxBuffer: 64 * 1024 * 1024 });
  const sha = JSON.parse(body.toString("utf8")).sha;
  const ref = bundleRefOf({ sha, bundle: { key: `bundles/${sha}.json`, sha, bytes: body.length, sha256: createHash("sha256").update(body).digest("hex") } });
  const b = parseBundle(body, ref);
  assert.ok(b, "accepted");
  assert.ok(body.length < 8 * 1024 * 1024);
  for (const f of ["resources/concepts.yml", "resources/course.yml", "resources/worlds/academy.yml"]) assert.equal(b.files.get(f), readFileSync(join(contentDir, f), "utf8"), f);
  assert.ok(b.heads.size > 0);
  for (const [p, head] of b.heads) assert.equal(head, problemHead(readFileSync(join(contentDir, p), "utf8")), p);
});

const pagesBuilder = existsSync(builder) && readFileSync(builder, "utf8").includes("--pages");
test("real content: the builder's page bundles are accepted, carry each folder's files as they are, and list the rest", { skip: !pagesBuilder && `no page bundles in ${builder}` }, () => {
  const out = mkdtempSync(join(tmpdir(), "dsa-pages-"));
  try {
    const body = execFileSync(process.execPath, [builder, contentDir, "--pages", out], { maxBuffer: 64 * 1024 * 1024 });
    const sha = JSON.parse(body.toString("utf8")).sha;
    const index = JSON.parse(readFileSync(join(out, "index.json"), "utf8"));
    const manifest = { sha, bundle: { key: `bundles/${sha}.json`, sha, bytes: body.length, sha256: createHash("sha256").update(body).digest("hex"), pages: index } };
    const refs = pageRefsOf(manifest);
    assert.ok(refs.size > 0);
    assert.equal(refs.size, Object.keys(index).length, "every page bundle named is well-formed");
    for (const [dir, ref] of refs) {
      const pb = parsePageBundle(readFileSync(join(out, ref.key.slice("pages/".length))), ref, dir);
      assert.ok(pb, dir);
      for (const [p, t] of pb.files) assert.equal(t, readFileSync(join(contentDir, p), "utf8"), p);
    }
    const b = parseBundle(body, bundleRefOf(manifest));
    assert.ok([...b.files.keys()].some((k) => k.startsWith("generated/traces/")), "traces in the content bundle");
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});
