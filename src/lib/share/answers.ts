import "server-only";
/**
 * Storage for shared smart-search answers (`shared_answers`, supabase/migrations/20261029_shared_answers.sql).
 * Until the migration is applied everything reports "not enabled": the endpoint returns { enabled: false },
 * the button stays hidden and /learn/answer/<id> is a 404.
 *
 * Dev QA (NODE_ENV !== "production" AND SHARE_FIXTURES=1, like Share my progress): shares live in memory and
 * /learn/answer/fxdemo0001 is a sample. Production never takes that branch.
 */
import { randomBytes } from "node:crypto";
import { unstable_cache } from "next/cache";
import { supabase } from "@/lib/supabase";
import { isMissingTable } from "@/lib/search/smart/querylog";
import { ID_RE, readShared, SHARED_ANSWERS_TABLE, SHARES_PER_DAY, type SharedAnswer, type ShareInput } from "./answer-model";
import { shareFixtures } from "./store";

export const answerTag = (id: string) => `answer:${id}`;

/* ------------------------------------------------------------------ enabled (the table exists) */

let enabledState: { at: number; on: boolean } | null = null;

export async function answersEnabled(): Promise<boolean> {
  if (shareFixtures()) return true;
  // once on, it stays on for the instance; off is re-checked every minute (the owner may apply it any time)
  if (enabledState && (enabledState.on || Date.now() - enabledState.at < 60_000)) return enabledState.on;
  // a GET, not a HEAD: postgrest-js reads a HEAD's empty 404 (missing table) as success
  const { error } = await supabase.from(SHARED_ANSWERS_TABLE).select("id").limit(1);
  const on = !error;
  if (error && !isMissingTable(error)) console.error("[share-answer] probe", error.message);
  enabledState = { at: Date.now(), on };
  return on;
}

/* ------------------------------------------------------------------ dev fixtures */

type Row = { id: string; created_at: string; user_id: string; question: string; answer: unknown; cites: unknown; hidden: boolean };

const FIXTURE: Row = {
  id: "fxdemo0001",
  created_at: "2026-10-29T09:30:00.000Z",
  user_id: "fx-ada",
  question: "How does consistent hashing keep most keys in place when a cache node is added?",
  answer: [
    "Consistent hashing puts both nodes and keys on the same ring, and each key belongs to the first node clockwise from it. Adding a node only takes over the keys between it and its neighbour, so roughly 1/N of the keys move instead of nearly all of them",
    0,
    ". Virtual nodes give each server many points on the ring, which evens out the load and spreads a new node's share across every existing server",
    1,
    ". The same idea shows up again when you partition a database or a cache cluster",
    2,
    ".",
  ],
  cites: [
    { kind: "concept", title: "Consistent hashing", sub: "Taught in Partitioning deep dive", href: "/learn/concepts/consistent-hashing" },
    { kind: "concept", title: "Virtual nodes", sub: "Taught in Partitioning deep dive", href: "/learn/concepts/virtual-nodes" },
    { kind: "section", title: "Consistent hashing: the elegant solution", sub: "W01 · Day 1 · Partitioning deep dive", href: "/learn/system-design-mastery/week-01-data-at-scale/day-01-partitioning-deep-dive#s-3-2-consistent-hashing-the-elegant-solution" },
  ],
  hidden: false,
};
const fixtureRows = new Map<string, Row>([[FIXTURE.id, FIXTURE]]);

/* ------------------------------------------------------------------ create */

const B62 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
export function newAnswerId(): string {
  // 62^10 ≈ 8e17; rejection sampling keeps every letter equally likely
  let out = "";
  while (out.length < 10) for (const b of randomBytes(16)) if (b < 248 && out.length < 10) out += B62[b % 62];
  return out;
}

export class ShareLimitError extends Error {
  constructor() {
    super(`You can share up to ${SHARES_PER_DAY} answers a day. Try again tomorrow.`);
  }
}

const same = (a: Pick<Row, "answer" | "cites">, v: ShareInput) => JSON.stringify(a.answer) === JSON.stringify(v.answer) && JSON.stringify(a.cites) === JSON.stringify(v.cites);

/** Store a validated share; the same answer shared again within a day returns the first link. */
export async function createShare(userId: string, v: ShareInput): Promise<{ id: string; reused: boolean }> {
  const dayAgo = new Date(Date.now() - 86_400_000).toISOString();
  if (shareFixtures()) {
    const mine = [...fixtureRows.values()].filter((r) => r.user_id === userId && r.created_at >= dayAgo);
    const dup = mine.find((r) => r.question === v.question && same(r, v));
    if (dup) return { id: dup.id, reused: true };
    if (mine.length >= SHARES_PER_DAY) throw new ShareLimitError();
    const id = newAnswerId();
    fixtureRows.set(id, { id, created_at: new Date().toISOString(), user_id: userId, question: v.question, answer: v.answer, cites: v.cites, hidden: false });
    return { id, reused: false };
  }
  const recent = await supabase.from(SHARED_ANSWERS_TABLE).select("id, question, answer, cites").eq("user_id", userId).gte("created_at", dayAgo).order("created_at", { ascending: false }).limit(SHARES_PER_DAY + 1);
  if (recent.error) throw new Error(recent.error.message);
  const rows = (recent.data ?? []) as Pick<Row, "id" | "question" | "answer" | "cites">[];
  const dup = rows.find((r) => r.question === v.question && same(r, v));
  if (dup) return { id: dup.id, reused: true };
  if (rows.length >= SHARES_PER_DAY) throw new ShareLimitError();
  for (let attempt = 0; attempt < 3; attempt++) {
    const id = newAnswerId();
    const { error } = await supabase.from(SHARED_ANSWERS_TABLE).insert({ id, user_id: userId, question: v.question, answer: v.answer, cites: v.cites });
    if (!error) return { id, reused: false };
    if (error.code !== "23505") throw new Error(error.message);
  }
  throw new Error("Couldn't make a link. Try again.");
}

/* ------------------------------------------------------------------ read (the public page) */

async function loadAnswer(id: string): Promise<SharedAnswer | null> {
  if (!ID_RE.test(id)) return null;
  if (shareFixtures()) {
    const r = fixtureRows.get(id);
    return r && !r.hidden ? readShared(r) : null;
  }
  const { data, error } = await supabase.from(SHARED_ANSWERS_TABLE).select("id, created_at, question, answer, cites, hidden").eq("id", id).maybeSingle();
  if (error) {
    if (!isMissingTable(error)) console.error("[share-answer] read", error.message);
    return null;
  }
  const row = data as Row | null;
  return row && !row.hidden ? readShared(row) : null;
}

/** One shared answer for the page and its OG image: cached a day per id; hiding one revalidates its tag. */
export function getSharedAnswer(id: string): Promise<SharedAnswer | null> {
  if (shareFixtures()) return loadAnswer(id);
  return unstable_cache(() => loadAnswer(id), ["shared-answer-v1", id], { revalidate: 86400, tags: [answerTag(id), "shared-answers"] })();
}

/* ------------------------------------------------------------------ admin */

export type AdminShare = { id: string; createdAt: string; question: string; sources: number; hidden: boolean };

export async function listShares(limit = 100): Promise<{ enabled: boolean; shares: AdminShare[]; total: number }> {
  const map = (r: Row): AdminShare => ({ id: r.id, createdAt: r.created_at, question: r.question, sources: Array.isArray(r.cites) ? r.cites.length : 0, hidden: r.hidden });
  if (shareFixtures()) {
    const rows = [...fixtureRows.values()].sort((a, b) => b.created_at.localeCompare(a.created_at));
    return { enabled: true, shares: rows.slice(0, limit).map(map), total: rows.length };
  }
  const { data, error, count } = await supabase.from(SHARED_ANSWERS_TABLE).select("id, created_at, question, cites, hidden", { count: "exact" }).order("created_at", { ascending: false }).limit(limit);
  if (error) {
    if (isMissingTable(error)) return { enabled: false, shares: [], total: 0 };
    throw new Error(error.message);
  }
  return { enabled: true, shares: ((data ?? []) as Row[]).map(map), total: count ?? 0 };
}

export async function setShareHidden(id: string, hidden: boolean): Promise<boolean> {
  if (!ID_RE.test(id)) return false;
  if (shareFixtures()) {
    const r = fixtureRows.get(id);
    if (!r) return false;
    r.hidden = hidden;
    return true;
  }
  const { data, error } = await supabase.from(SHARED_ANSWERS_TABLE).update({ hidden }).eq("id", id).select("id");
  if (error) throw new Error(error.message);
  return !!data?.length;
}
