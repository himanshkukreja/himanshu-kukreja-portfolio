// Test-set sources. A request can carry tests inline, or reference a stored
// test set by problem id + version (content hash). Stored sets follow the
// plan's layout (section 7.1): visible.json and hidden.json per problem.
//
//   <prefix>/<problemId>/<version>/visible.json
//   <prefix>/<problemId>/<version>/hidden.json
//
// Each file: { "signature"?: {...}, "mode"?: "function"|"stdio", "checker"?: "exact"|...,
//              "limits"?: {timeMs, memoryMb}, "tests": [{input, expected, ...}] }
// Tests from "hidden" files are marked hidden automatically.
//
// R2 is not wired yet: R2TestSetSource is a stub behind the TestSetSource
// interface. LocalDirTestSetSource (JUDGE_TESTSET_DIR) serves the same layout
// from disk for development and for a synced copy on the VM.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { RawTestCase, TestSetRef } from "./validate.ts";
import type { Signature } from "./harness/types.ts";

export interface TestSetFile {
  signature?: Signature;
  mode?: "function" | "stdio";
  checker?: unknown;
  compare?: unknown;
  limits?: { timeMs?: number; memoryMb?: number };
  tests: RawTestCase[];
}

export interface LoadedTestSet {
  signature?: Signature;
  mode?: "function" | "stdio";
  compare?: unknown;
  limits?: { timeMs?: number; memoryMb?: number };
  tests: RawTestCase[];
}

export interface TestSetSource {
  readonly name: string;
  /** Returns the raw JSON text of one file, or null if it does not exist. */
  fetch(problemId: string, version: string, set: string): Promise<string | null>;
}

export class TestSetNotFound extends Error {}

export class LocalDirTestSetSource implements TestSetSource {
  readonly name = "local-dir";
  private readonly root: string;
  constructor(root: string) {
    this.root = root;
  }
  async fetch(problemId: string, version: string, set: string): Promise<string | null> {
    try {
      return await readFile(join(this.root, problemId, version, `${set}.json`), "utf8");
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw e;
    }
  }
}

/**
 * Stub for the production source. To implement: GET
 * https://<account>.r2.cloudflarestorage.com/<bucket>/dsa/tests/<problemId>/<version>/<set>.json
 * signed with SigV4 using a READ-ONLY R2 token (env JUDGE_R2_ACCOUNT_ID,
 * JUDGE_R2_BUCKET, JUDGE_R2_ACCESS_KEY_ID, JUDGE_R2_SECRET_ACCESS_KEY), or a
 * Worker-issued presigned URL. Keep the in-memory cache below in front of it.
 */
export class R2TestSetSource implements TestSetSource {
  readonly name = "r2";
  async fetch(_problemId: string, _version: string, _set: string): Promise<string | null> {
    throw new Error("R2 test-set fetch is not implemented yet; send tests inline or set JUDGE_TESTSET_DIR");
  }
}

/** Small LRU over parsed test sets. Versions are content hashes, so entries never go stale. */
export class CachedTestSets {
  private readonly source: TestSetSource;
  private readonly cache = new Map<string, LoadedTestSet>();
  private readonly max: number;
  constructor(source: TestSetSource, max = 64) {
    this.source = source;
    this.max = max;
  }
  get sourceName(): string {
    return this.source.name;
  }
  async load(ref: TestSetRef): Promise<LoadedTestSet> {
    const sets = ref.sets ?? ["visible", "hidden"];
    const key = `${ref.problemId}@${ref.version}:${sets.join(",")}`;
    const hit = this.cache.get(key);
    if (hit) {
      this.cache.delete(key);
      this.cache.set(key, hit);
      return hit;
    }
    const merged: LoadedTestSet = { tests: [] };
    let found = 0;
    for (const set of sets) {
      const text = await this.source.fetch(ref.problemId, ref.version, set);
      if (text === null) continue;
      found++;
      const file = JSON.parse(text) as TestSetFile;
      merged.signature ??= file.signature;
      merged.mode ??= file.mode;
      merged.compare ??= file.compare ?? file.checker;
      merged.limits ??= file.limits;
      for (const t of file.tests ?? []) merged.tests.push(set === "hidden" ? { ...t, hidden: t.hidden ?? true } : t);
    }
    if (found === 0) throw new TestSetNotFound(`no test set for ${ref.problemId}@${ref.version}`);
    this.cache.set(key, merged);
    if (this.cache.size > this.max) this.cache.delete(this.cache.keys().next().value!);
    return merged;
  }
}
