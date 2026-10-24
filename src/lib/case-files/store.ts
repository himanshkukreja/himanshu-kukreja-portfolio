/**
 * Persistence for the case files CMS. Server-only.
 *
 *   supabase (default): public.case_files + public.case_file_revisions
 *     (supabase/migrations/20261016_case_files_cms.sql). Until that migration is applied every read
 *     reports the tables as missing: the public site simply shows the repo stories, the admin shows
 *     an "apply the migration" banner.
 *   file (dev only, CASE_FILES_STORE=file + CASE_FILES_STORE_FILE=/abs/path.json): the same
 *     operations on a local JSON file, for end-to-end QA without touching the production database.
 */
import "server-only";
import crypto from "crypto";
import fs from "fs";
import { supabase } from "@/lib/supabase";
import { parseActivityData } from "@/components/stories/activities/data";
import { parseDebrief, resolveCaseType } from "@/components/stories/case-types";
import type { CaseFileFields, CaseFileRevision, CaseFileRow, CaseFileStatus, RevisionAction, Validation } from "./types";
import { EMPTY_FIELDS } from "./types";

export const TABLES = ["case_files", "case_file_revisions"] as const;
export const BUCKET = "case-files";

export class TablesMissingError extends Error {
  status = 503;
  code = "tables-missing";
  missing: string[];
  constructor(missing: string[]) {
    super(`Case file tables are missing (${missing.join(", ")}). Apply supabase/migrations/20261016_case_files_cms.sql.`);
    this.missing = missing;
  }
}

export type StoredRow = CaseFileRow & { validation: Validation | null };
/** What a public read needs: only published rows, only their live snapshot. */
export type LiveRow = { id: string; slug: string; live: CaseFileFields; caseNumber: number | null; publishedAt: string | null; overridesFile: boolean; updatedAt: string };
export type NewRow = Partial<Omit<StoredRow, "id" | "createdAt" | "updatedAt">> & { slug: string };
export type Patch = Partial<Omit<StoredRow, "id" | "createdAt">>;

export interface CaseFileStore {
  kind: "supabase" | "file";
  ready(): Promise<{ ready: boolean; missing: string[] }>;
  list(): Promise<StoredRow[]>;
  listLive(): Promise<LiveRow[]>;
  get(id: string): Promise<StoredRow | null>;
  getBySlug(slug: string): Promise<StoredRow | null>;
  insert(row: NewRow): Promise<StoredRow>;
  /** `expectVersion` = optimistic lock: null when the row's version moved on (edited elsewhere). */
  update(id: string, patch: Patch, expectVersion?: number): Promise<StoredRow | null>;
  remove(id: string): Promise<void>;
  maxCaseNumber(): Promise<number>;
  revisions(id: string, limit?: number): Promise<CaseFileRevision[]>;
  revision(id: string, revisionId: string): Promise<CaseFileRevision | null>;
  addRevision(r: Omit<CaseFileRevision, "id" | "createdAt">, opts?: { coalesceAutosaveMs?: number }): Promise<void>;
}

/* ─────────────────────────────── coercion ─────────────────────────────── */

const s = (v: unknown) => (typeof v === "string" ? v : "");
const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

export function coerceFields(raw: unknown): CaseFileFields {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const pick = (camel: string, snake: string) => r[camel] ?? r[snake];
  return {
    ...EMPTY_FIELDS,
    slug: s(r.slug),
    title: s(r.title),
    excerpt: s(r.excerpt),
    type: resolveCaseType("", r.type),
    tags: Array.isArray(r.tags) ? r.tags.filter((t): t is string => typeof t === "string") : [],
    date: s(r.date).slice(0, 10),
    coverUrl: s(pick("coverUrl", "cover_url")),
    coverAlt: s(pick("coverAlt", "cover_alt")),
    motionCoverUrl: s(pick("motionCoverUrl", "motion_cover_url")),
    bodyMd: s(pick("bodyMd", "body_md")),
    debrief: looseDebrief(r.debrief),
    activity: parseActivityData(r.activity),
    seoTitle: s(pick("seoTitle", "seo_title")),
    seoDescription: s(pick("seoDescription", "seo_description")),
  };
}

/** Editor-state debrief: keep half-filled drafts (parseDebrief would drop them). */
function looseDebrief(v: unknown): CaseFileFields["debrief"] {
  if (!v || typeof v !== "object") return null;
  const r = v as Record<string, unknown>;
  return {
    question: s(r.question),
    options: Array.isArray(r.options) ? r.options.map((o) => s(o)) : [],
    answer: Number.isInteger(Number(r.answer)) ? Number(r.answer) : 0,
    explain: s(r.explain) || undefined,
  };
}

type DbRow = Record<string, unknown>;

function fromDb(r: DbRow): StoredRow {
  const f = coerceFields(r);
  return {
    ...f,
    id: s(r.id),
    status: (["draft", "published", "archived"].includes(s(r.status)) ? s(r.status) : "draft") as CaseFileStatus,
    overridesFile: r.overrides_file === true,
    caseNumber: n(r.case_number),
    publishedAt: (r.published_at as string) || null,
    lastPublishedAt: (r.last_published_at as string) || null,
    publishAt: (r.publish_at as string) || null,
    archivedAt: (r.archived_at as string) || null,
    version: n(r.version) ?? 1,
    liveVersion: n(r.live_version),
    live: r.live && typeof r.live === "object" ? { ...coerceFields(r.live), debrief: parseDebrief((r.live as DbRow).debrief) } : null,
    createdBy: (r.created_by as string) || null,
    updatedBy: (r.updated_by as string) || null,
    createdAt: s(r.created_at),
    updatedAt: s(r.updated_at),
    validation: (r.validation as Validation) || null,
  };
}

const FIELD_COLS: Record<keyof CaseFileFields, string> = {
  slug: "slug",
  title: "title",
  excerpt: "excerpt",
  type: "type",
  tags: "tags",
  date: "date",
  coverUrl: "cover_url",
  coverAlt: "cover_alt",
  motionCoverUrl: "motion_cover_url",
  bodyMd: "body_md",
  debrief: "debrief",
  activity: "activity",
  seoTitle: "seo_title",
  seoDescription: "seo_description",
};
const META_COLS: Record<string, string> = {
  status: "status",
  overridesFile: "overrides_file",
  caseNumber: "case_number",
  publishedAt: "published_at",
  lastPublishedAt: "last_published_at",
  publishAt: "publish_at",
  archivedAt: "archived_at",
  version: "version",
  liveVersion: "live_version",
  live: "live",
  createdBy: "created_by",
  updatedBy: "updated_by",
  validation: "validation",
  updatedAt: "updated_at",
};

function toDb(p: Patch): DbRow {
  const out: DbRow = {};
  for (const [k, v] of Object.entries(p)) {
    const col = (FIELD_COLS as Record<string, string>)[k] || META_COLS[k];
    if (!col) continue;
    out[col] = k === "date" ? (v ? v : null) : v === undefined ? null : v;
  }
  return out;
}

const missingTable = (e: { code?: string; message?: string } | null | undefined) =>
  !!e && (e.code === "42P01" || e.code === "PGRST205" || /could not find the table|does not exist/i.test(e.message || ""));

function fail(e: { code?: string; message?: string }, table: string): never {
  if (missingTable(e)) throw new TablesMissingError([table]);
  throw Object.assign(new Error(e.message || "Database error"), { status: 500 });
}

/* ─────────────────────────────── supabase ─────────────────────────────── */

const LIST_COLS =
  "id,slug,status,title,excerpt,type,tags,date,cover_url,cover_alt,motion_cover_url,overrides_file,case_number,published_at,last_published_at,publish_at,archived_at,version,live_version,created_by,updated_by,created_at,updated_at,validation";

function supabaseStore(): CaseFileStore {
  const t = () => supabase.from("case_files");
  const rv = () => supabase.from("case_file_revisions");
  return {
    kind: "supabase",
    async ready() {
      const missing: string[] = [];
      await Promise.all(
        TABLES.map(async (name) => {
          const { error } = await supabase.from(name).select("id", { head: true, count: "exact" }).limit(1);
          if (missingTable(error)) missing.push(name);
        })
      );
      return { ready: !missing.length, missing };
    },
    async list() {
      const { data, error } = await t().select(LIST_COLS).order("updated_at", { ascending: false }).limit(500);
      if (error) fail(error, "case_files");
      return (data || []).map((r) => fromDb(r as DbRow));
    },
    async listLive() {
      const { data, error } = await t().select("id,slug,live,case_number,published_at,overrides_file,updated_at").eq("status", "published").not("live", "is", null).limit(500);
      if (error) fail(error, "case_files");
      return (data || []).map((r) => {
        const row = r as DbRow;
        return {
          id: s(row.id),
          slug: s(row.slug),
          live: { ...coerceFields(row.live), debrief: parseDebrief((row.live as DbRow)?.debrief) },
          caseNumber: n(row.case_number),
          publishedAt: (row.published_at as string) || null,
          overridesFile: row.overrides_file === true,
          updatedAt: s(row.updated_at),
        };
      });
    },
    async get(id) {
      if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
      const { data, error } = await t().select("*").eq("id", id).maybeSingle();
      if (error) fail(error, "case_files");
      return data ? fromDb(data as DbRow) : null;
    },
    async getBySlug(slug) {
      const { data, error } = await t().select("*").eq("slug", slug).maybeSingle();
      if (error) fail(error, "case_files");
      return data ? fromDb(data as DbRow) : null;
    },
    async insert(row) {
      const { data, error } = await t()
        .insert({ ...toDb({ ...EMPTY_FIELDS, status: "draft", version: 1, ...row }) })
        .select("*")
        .single();
      if (error) {
        if (error.code === "23505") throw Object.assign(new Error(`The slug "${row.slug}" is already used by another case file.`), { status: 409 });
        fail(error, "case_files");
      }
      return fromDb(data as DbRow);
    },
    async update(id, patch, expectVersion) {
      let q = t()
        .update({ ...toDb(patch), updated_at: new Date().toISOString() })
        .eq("id", id);
      if (typeof expectVersion === "number") q = q.eq("version", expectVersion);
      const { data, error } = await q.select("*").maybeSingle();
      if (error) {
        if (error.code === "23505") throw Object.assign(new Error("That slug or case number is already used by another case file."), { status: 409 });
        fail(error, "case_files");
      }
      return data ? fromDb(data as DbRow) : null;
    },
    async remove(id) {
      const { error } = await t().delete().eq("id", id);
      if (error) fail(error, "case_files");
    },
    async maxCaseNumber() {
      const { data, error } = await t().select("case_number").not("case_number", "is", null).order("case_number", { ascending: false }).limit(1);
      if (error) fail(error, "case_files");
      return n((data?.[0] as DbRow | undefined)?.case_number) ?? 0;
    },
    async revisions(id, limit = 100) {
      const { data, error } = await rv().select("id,case_file_id,version,action,snapshot,created_by,created_at").eq("case_file_id", id).order("created_at", { ascending: false }).limit(limit);
      if (error) fail(error, "case_file_revisions");
      return (data || []).map((r) => {
        const row = r as DbRow;
        return { id: String(row.id), caseFileId: s(row.case_file_id), version: n(row.version) ?? 0, action: s(row.action) as RevisionAction, snapshot: coerceFields(row.snapshot), createdBy: (row.created_by as string) || null, createdAt: s(row.created_at) };
      });
    },
    async revision(id, revisionId) {
      if (!/^\d+$/.test(revisionId)) return null;
      const { data, error } = await rv().select("*").eq("case_file_id", id).eq("id", Number(revisionId)).maybeSingle();
      if (error) fail(error, "case_file_revisions");
      if (!data) return null;
      const row = data as DbRow;
      return { id: String(row.id), caseFileId: s(row.case_file_id), version: n(row.version) ?? 0, action: s(row.action) as RevisionAction, snapshot: coerceFields(row.snapshot), createdBy: (row.created_by as string) || null, createdAt: s(row.created_at) };
    },
    async addRevision(r, opts) {
      const snapshot = r.snapshot;
      if (r.action === "autosave" && opts?.coalesceAutosaveMs) {
        // one autosave revision per editing burst: refresh the latest one instead of piling up rows
        const { data } = await rv().select("id,action,created_by,created_at").eq("case_file_id", r.caseFileId).order("created_at", { ascending: false }).limit(1);
        const last = data?.[0] as DbRow | undefined;
        if (last && last.action === "autosave" && last.created_by === r.createdBy && Date.now() - new Date(s(last.created_at)).getTime() < opts.coalesceAutosaveMs) {
          const { error } = await rv().update({ version: r.version, snapshot }).eq("id", last.id as number);
          if (error) fail(error, "case_file_revisions");
          return;
        }
      }
      const { error } = await rv().insert({ case_file_id: r.caseFileId, version: r.version, action: r.action, snapshot, created_by: r.createdBy });
      if (error) fail(error, "case_file_revisions");
    },
  };
}

/* ─────────────────────────────── file (dev) ─────────────────────────────── */

type FileDb = { rows: StoredRow[]; revisions: CaseFileRevision[]; seq: number };

function fileStore(path: string): CaseFileStore {
  const read = (): FileDb => {
    try {
      const j = JSON.parse(fs.readFileSync(path, "utf8")) as Partial<FileDb>;
      return { rows: j.rows || [], revisions: j.revisions || [], seq: j.seq || 0 };
    } catch {
      return { rows: [], revisions: [], seq: 0 };
    }
  };
  const write = (db: FileDb) => {
    fs.writeFileSync(path + ".tmp", JSON.stringify(db, null, 1));
    fs.renameSync(path + ".tmp", path);
  };
  const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
  return {
    kind: "file",
    async ready() {
      return { ready: true, missing: [] };
    },
    async list() {
      return read()
        .rows.slice()
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .map(clone);
    },
    async listLive() {
      return read()
        .rows.filter((r) => r.status === "published" && r.live)
        .map((r) => ({ id: r.id, slug: r.slug, live: clone(r.live!), caseNumber: r.caseNumber, publishedAt: r.publishedAt, overridesFile: r.overridesFile, updatedAt: r.updatedAt }));
    },
    async get(id) {
      const r = read().rows.find((x) => x.id === id);
      return r ? clone(r) : null;
    },
    async getBySlug(slug) {
      const r = read().rows.find((x) => x.slug === slug);
      return r ? clone(r) : null;
    },
    async insert(row) {
      const db = read();
      if (db.rows.some((r) => r.slug === row.slug)) throw Object.assign(new Error(`The slug "${row.slug}" is already used by another case file.`), { status: 409 });
      const now = new Date().toISOString();
      const full: StoredRow = {
        ...EMPTY_FIELDS,
        status: "draft",
        overridesFile: false,
        caseNumber: null,
        publishedAt: null,
        lastPublishedAt: null,
        publishAt: null,
        archivedAt: null,
        version: 1,
        liveVersion: null,
        live: null,
        createdBy: null,
        updatedBy: null,
        validation: null,
        ...row,
        id: crypto.randomUUID(),
        createdAt: now,
        updatedAt: now,
      };
      db.rows.push(full);
      write(db);
      return clone(full);
    },
    async update(id, patch, expectVersion) {
      const db = read();
      const i = db.rows.findIndex((r) => r.id === id);
      if (i < 0) return null;
      if (typeof expectVersion === "number" && db.rows[i].version !== expectVersion) return null;
      if (patch.slug && db.rows.some((r) => r.id !== id && r.slug === patch.slug)) throw Object.assign(new Error("That slug is already used by another case file."), { status: 409 });
      if (patch.caseNumber != null && db.rows.some((r) => r.id !== id && r.caseNumber === patch.caseNumber)) throw Object.assign(new Error("That case number is taken."), { status: 409 });
      db.rows[i] = { ...db.rows[i], ...patch, updatedAt: new Date().toISOString() };
      write(db);
      return clone(db.rows[i]);
    },
    async remove(id) {
      const db = read();
      db.rows = db.rows.filter((r) => r.id !== id);
      db.revisions = db.revisions.filter((r) => r.caseFileId !== id);
      write(db);
    },
    async maxCaseNumber() {
      return read().rows.reduce((m, r) => Math.max(m, r.caseNumber ?? 0), 0);
    },
    async revisions(id, limit = 100) {
      return read()
        .revisions.filter((r) => r.caseFileId === id)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || Number(b.id) - Number(a.id))
        .slice(0, limit)
        .map(clone);
    },
    async revision(id, revisionId) {
      const r = read().revisions.find((x) => x.caseFileId === id && x.id === revisionId);
      return r ? clone(r) : null;
    },
    async addRevision(r, opts) {
      const db = read();
      const mine = db.revisions.filter((x) => x.caseFileId === r.caseFileId).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || Number(b.id) - Number(a.id));
      const last = mine[0];
      if (r.action === "autosave" && opts?.coalesceAutosaveMs && last && last.action === "autosave" && last.createdBy === r.createdBy && Date.now() - new Date(last.createdAt).getTime() < opts.coalesceAutosaveMs) {
        last.version = r.version;
        last.snapshot = r.snapshot;
      } else {
        db.seq += 1;
        db.revisions.push({ ...r, id: String(db.seq), createdAt: new Date().toISOString() });
      }
      write(db);
    },
  };
}

let fileSingleton: CaseFileStore | null = null;
let dbSingleton: CaseFileStore | null = null;

export function getCaseFileStore(): CaseFileStore {
  if (process.env.NODE_ENV !== "production" && process.env.CASE_FILES_STORE === "file" && process.env.CASE_FILES_STORE_FILE) {
    fileSingleton ??= fileStore(process.env.CASE_FILES_STORE_FILE);
    return fileSingleton;
  }
  dbSingleton ??= supabaseStore();
  return dbSingleton;
}

/** Dev JSON store: uploads are written under public/case-files/_cms instead of Supabase Storage. */
export const usesLocalUploads = () => getCaseFileStore().kind === "file";
