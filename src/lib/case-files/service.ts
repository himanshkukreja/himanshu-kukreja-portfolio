/**
 * Case files CMS operations (server-only): list, create (template / duplicate / import), save with
 * optimistic locking + revisions, publish / update live, unpublish, archive / restore, delete,
 * restore a revision, preview render. Every change to what the public can see revalidates the
 * story pages, the index, the home teaser and the guide.
 */
import "server-only";
import { revalidatePath } from "next/cache";
import { supabase } from "@/lib/supabase";
import { getRepoStories, listStorySources, type StorySource } from "@/lib/stories";
import { caseIdsFor, toCaseFile } from "@/components/stories/case-files";
import { formatCaseId, parseDebrief, resolveCaseType } from "@/components/stories/case-types";
import { renderStoryBody } from "@/components/stories/render-story";
import { parseActivityData } from "@/components/stories/activities/data";
import type { AdminUser } from "@/lib/admin/auth";
import { BUCKET, coerceFields, getCaseFileStore, TablesMissingError, type StoredRow } from "./store";
import { validateCaseFile, type ValidateCtx } from "./validate";
import { newCaseFileFields } from "./template";
import {
  EMPTY_FIELDS,
  FIELD_KEYS,
  sameFields,
  slugify,
  type CaseFileDetail,
  type CaseFileFields,
  type CaseFileListItem,
  type CaseFilesList,
  type CaseFilesSetup,
  type CaseFileRow,
  type RenderResult,
  type RevisionAction,
} from "./types";

export const httpError = (message: string, status = 400, extra: Record<string, unknown> = {}) => Object.assign(new Error(message), { status, ...extra });

const store = () => getCaseFileStore();

export async function getSetup(): Promise<CaseFilesSetup> {
  const s = store();
  const r = await s.ready().catch(() => ({ ready: false, missing: ["case_files", "case_file_revisions"] }));
  return { store: s.kind, ready: r.ready, missing: r.missing, bucket: BUCKET, storage: s.kind === "file" ? "local" : "supabase" };
}

/** Public-facing row (without the validator's stored summary). */
function publicRow(r: StoredRow): CaseFileRow {
  const { validation: _v, ...row } = r;
  void _v;
  return row;
}

function fieldsOf(r: Partial<CaseFileFields>): CaseFileFields {
  const out = { ...EMPTY_FIELDS } as Record<string, unknown>;
  for (const k of FIELD_KEYS) if (r[k] !== undefined) out[k] = r[k];
  return out as CaseFileFields;
}

/** Coerce a posted form into fields (lengths capped, junk dropped). */
export function parseFields(raw: unknown): CaseFileFields {
  const f = coerceFields(raw);
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const cap = (s: string, n: number) => s.slice(0, n);
  return {
    ...f,
    slug: cap(f.slug.trim().toLowerCase(), 80),
    title: cap(f.title, 200),
    excerpt: cap(f.excerpt, 600),
    tags: f.tags.map((t) => cap(t.trim(), 60)).filter(Boolean).slice(0, 20),
    coverUrl: cap(f.coverUrl.trim(), 1000),
    coverAlt: cap(f.coverAlt, 400),
    motionCoverUrl: cap(f.motionCoverUrl.trim(), 1000),
    bodyMd: cap(f.bodyMd, 400_000),
    seoTitle: cap(f.seoTitle, 200),
    seoDescription: cap(f.seoDescription, 400),
    activity: r.activity === null ? null : parseActivityData(r.activity),
  };
}

/* ─────────────────────────────── ids + context ─────────────────────────────── */

async function context(rows: StoredRow[], id?: string, overridesFile = false, origin?: string): Promise<ValidateCtx> {
  const [repo, sources] = await Promise.all([getRepoStories(), listStorySources()]);
  return {
    id,
    cmsSlugs: new Map(rows.map((r) => [r.slug, r.id])),
    repoSlugs: new Set(repo.map((r) => r.slug)),
    liveSlugs: new Set(sources.map((s) => s.slug)),
    overridesFile,
    origin,
  };
}

/** Case id this row has (or will get on publish). */
async function caseIdFor(row: Pick<CaseFileRow, "slug" | "caseNumber" | "overridesFile">): Promise<{ caseId: string; pending: boolean }> {
  const sources = await listStorySources();
  const ids = caseIdsFor(sources);
  if (row.overridesFile) return { caseId: ids.get(row.slug) || "CASE-000", pending: false };
  if (row.caseNumber) return { caseId: formatCaseId(row.caseNumber), pending: false };
  return { caseId: formatCaseId(await nextCaseNumber()), pending: true };
}

/** Lowest free number after the repo stories (published, archived and reserved numbers are taken). */
async function nextCaseNumber(): Promise<number> {
  const [repo, rows] = await Promise.all([getRepoStories(), store().list()]);
  const taken = new Set(rows.map((r) => r.caseNumber).filter((n): n is number => n != null));
  let n = repo.length + 1;
  while (taken.has(n)) n++;
  return n;
}

/**
 * Reserve (or clear) the case number a draft will get at its first publish, e.g. when its cover
 * already says CASE-012. Never for a case file that was published once (its number is public).
 */
export async function reserveCaseNumber(id: string, n: number | null, admin: AdminUser, origin?: string): Promise<CaseFileDetail> {
  const setup = await getSetup();
  if (!setup.ready) throw new TablesMissingError(setup.missing);
  const row = await store().get(id);
  if (!row) throw httpError("Case file not found", 404);
  if (row.publishedAt) throw httpError(`It was published as ${row.caseNumber ? formatCaseId(row.caseNumber) : "a repo story"}: its number can't change.`, 409);
  if (row.overridesFile) throw httpError("Imported repo stories keep their repo case number.", 409);
  if (n != null) {
    const repo = await getRepoStories();
    if (!Number.isInteger(n) || n < 1 || n > 999) throw httpError("Case number must be 1 to 999.");
    if (n <= repo.length) throw httpError(`CASE-001…${formatCaseId(repo.length).slice(5)} belong to the repo stories.`, 409);
    const other = (await store().list()).find((r) => r.id !== id && r.caseNumber === n);
    if (other) throw httpError(`${formatCaseId(n)} is already taken by "${other.title || other.slug}".`, 409);
  }
  const saved = await store().update(id, { caseNumber: n, updatedBy: admin.email });
  if (!saved) throw httpError("Case file not found", 404);
  const { caseId } = await caseIdFor(saved);
  return { row: publicRow(saved), validation: saved.validation || (await validateCaseFile(fieldsOf(saved), await context(await store().list(), id, saved.overridesFile, origin))), caseId: saved.caseNumber ? caseId : null, setup };
}

/* ─────────────────────────────── revalidation ─────────────────────────────── */

export function revalidatePublic(slug: string) {
  try {
    revalidatePath("/stories");
    revalidatePath(`/stories/${slug}`);
    // prev/next links, "N of M closed" totals: every story page
    revalidatePath("/stories/[slug]", "page");
    revalidatePath("/");
    revalidatePath("/learn/guide");
    revalidatePath("/api/stories");
    revalidatePath("/api/search");
  } catch (e) {
    console.warn("[case-files] revalidate failed:", (e as Error)?.message);
  }
}

/* ─────────────────────────────── list ─────────────────────────────── */

async function viewsBySlug(): Promise<Map<string, { total: number; unique: number }>> {
  try {
    const { data, error } = await supabase.from("story_views").select("story_id,total_views,unique_views");
    if (error) return new Map();
    return new Map((data || []).map((v) => [String(v.story_id), { total: Number(v.total_views) || 0, unique: Number(v.unique_views) || 0 }]));
  } catch {
    return new Map();
  }
}

export async function listCaseFiles(): Promise<CaseFilesList> {
  const setup = await getSetup();
  const [rows, repo, sources, views] = await Promise.all([
    setup.ready ? store().list() : Promise.resolve([] as StoredRow[]),
    getRepoStories(),
    listStorySources(),
    viewsBySlug(),
  ]);
  const ids = caseIdsFor(sources);
  const items: CaseFileListItem[] = [];
  const overriding = new Map(rows.filter((r) => r.overridesFile).map((r) => [r.slug, r]));
  for (const r of rows) {
    const v = views.get(r.slug);
    const caseId = r.overridesFile ? ids.get(r.slug) || null : r.caseNumber ? formatCaseId(r.caseNumber) : null;
    items.push({
      id: r.id,
      origin: "db",
      slug: r.slug,
      title: r.title || "Untitled case file",
      status: r.status,
      type: r.type,
      caseId,
      date: r.date || null,
      cover: r.coverUrl || null,
      updatedAt: r.updatedAt,
      updatedBy: r.updatedBy,
      version: r.version,
      unpublishedChanges: r.status === "published" && r.liveVersion !== r.version && !sameFields(r.live, fieldsOf(r)),
      everPublished: !!r.publishedAt,
      publishAt: r.status === "draft" ? r.publishAt : null,
      overrides: r.overridesFile,
      overriddenBy: null,
      views: v?.total ?? null,
      uniqueViews: v?.unique ?? null,
      errors: r.validation?.errors ?? null,
      warnings: r.validation?.warnings ?? null,
    });
  }
  for (const s of repo) {
    const v = views.get(s.slug);
    const o = overriding.get(s.slug);
    items.push({
      id: `file:${s.slug}`,
      origin: "file",
      slug: s.slug,
      title: s.title,
      status: "repo",
      type: resolveCaseType(s.slug, s.type),
      caseId: ids.get(s.slug) || null,
      date: s.date || null,
      cover: s.cover || null,
      updatedAt: null,
      updatedBy: null,
      version: null,
      publishAt: null,
      unpublishedChanges: false,
      everPublished: true,
      overrides: false,
      overriddenBy: o ? o.id : null,
      views: v?.total ?? null,
      uniqueViews: v?.unique ?? null,
      errors: null,
      warnings: null,
    });
  }
  return { setup, items, nextCaseId: formatCaseId(setup.ready ? await nextCaseNumber() : repo.length + 1) };
}

/* ─────────────────────────────── read ─────────────────────────────── */

export async function getCaseFile(id: string, origin?: string): Promise<CaseFileDetail> {
  const setup = await getSetup();
  if (!setup.ready) throw new TablesMissingError(setup.missing);
  const row = await store().get(id);
  if (!row) throw httpError("Case file not found", 404);
  const rows = await store().list();
  const validation = row.validation || (await validateCaseFile(fieldsOf(row), await context(rows, row.id, row.overridesFile, origin)));
  const { caseId, pending } = await caseIdFor(row);
  return { row: publicRow(row), validation, caseId: pending ? null : caseId, setup };
}

/* ─────────────────────────────── create ─────────────────────────────── */

async function uniqueSlug(base: string): Promise<string> {
  const [rows, repo] = await Promise.all([store().list(), getRepoStories()]);
  const taken = new Set([...rows.map((r) => r.slug), ...repo.map((r) => r.slug)]);
  const root = slugify(base) || "case-file";
  if (!taken.has(root)) return root;
  for (let i = 2; i < 500; i++) {
    const s = `${root}-${i}`.slice(0, 80);
    if (!taken.has(s)) return s;
  }
  return `${root}-${Date.now().toString(36)}`;
}

function repoFields(s: StorySource): CaseFileFields {
  return {
    ...EMPTY_FIELDS,
    slug: s.slug,
    title: s.title,
    excerpt: s.excerpt || "",
    type: resolveCaseType(s.slug, s.type),
    tags: Array.isArray(s.tags) ? [...new Set(s.tags)] : [],
    date: (s.date || "").slice(0, 10),
    coverUrl: s.cover || "",
    coverAlt: s.title,
    motionCoverUrl: s.cover && /^\/covers\/[\w-]+\.png$/.test(s.cover) ? s.cover.replace(/\.png$/, ".motion.svg") : "",
    bodyMd: s.body.replace(/^\n+/, ""),
    debrief: parseDebrief(s.debrief),
    activity: null,
  };
}

export type CreateInput = { from: "template" | "blank" | "duplicate" | "import"; sourceId?: string; title?: string };

export async function createCaseFile(input: CreateInput, admin: AdminUser): Promise<CaseFileRow> {
  const setup = await getSetup();
  if (!setup.ready) throw new TablesMissingError(setup.missing);
  let fields: CaseFileFields;
  let overridesFile = false;
  let action: RevisionAction = "create";

  if (input.from === "import" || (input.from === "duplicate" && input.sourceId?.startsWith("file:"))) {
    const slug = (input.sourceId || "").replace(/^file:/, "");
    const src = (await getRepoStories()).find((s) => s.slug === slug);
    if (!src) throw httpError("Repo story not found", 404);
    fields = repoFields(src);
    if (input.from === "import") {
      const existing = await store().getBySlug(slug);
      if (existing) throw httpError("This story is already in the CMS.", 409, { id: existing.id });
      overridesFile = true;
      action = "import";
    } else {
      fields = { ...fields, slug: await uniqueSlug(`${slug}-copy`), title: fields.title, date: new Date().toISOString().slice(0, 10) };
      action = "duplicate";
    }
  } else if (input.from === "duplicate") {
    const src = input.sourceId ? await store().get(input.sourceId) : null;
    if (!src) throw httpError("Case file not found", 404);
    fields = { ...fieldsOf(src), slug: await uniqueSlug(`${src.slug}-copy`), date: new Date().toISOString().slice(0, 10) };
    action = "duplicate";
  } else {
    const title = (input.title || "").trim();
    fields = { ...newCaseFileFields(input.from === "blank"), title, slug: await uniqueSlug(title || `untitled-case-file`) };
  }

  const row = await store().insert({ ...fields, status: "draft", overridesFile, version: 1, createdBy: admin.email, updatedBy: admin.email });
  const rows = await store().list();
  const validation = await validateCaseFile(fields, { ...(await context(rows, row.id, overridesFile)), offline: true });
  const saved = (await store().update(row.id, { validation })) || row;
  await store().addRevision({ caseFileId: row.id, version: 1, action, snapshot: fields, createdBy: admin.email });
  return publicRow(saved);
}

/* ─────────────────────────────── save ─────────────────────────────── */

function lockedSlug(row: StoredRow): boolean {
  return row.overridesFile || row.caseNumber != null || row.publishedAt != null;
}

export async function saveCaseFile(
  id: string,
  posted: CaseFileFields,
  baseVersion: number,
  opts: { autosave?: boolean; origin?: string; action?: RevisionAction },
  admin: AdminUser
): Promise<CaseFileDetail> {
  const setup = await getSetup();
  if (!setup.ready) throw new TablesMissingError(setup.missing);
  const row = await store().get(id);
  if (!row) throw httpError("Case file not found", 404);
  if (row.status === "archived") throw httpError("Archived case files are read-only. Restore it first.", 409);
  if (row.version !== baseVersion) throw httpError("This case file was changed somewhere else (another tab?). Reload to get the latest version.", 409, { code: "conflict", version: row.version });
  const fields = { ...posted };
  if (lockedSlug(row) && fields.slug !== row.slug) fields.slug = row.slug; // links, comments and views hang off it
  if (sameFields(fields, fieldsOf(row)) && opts.autosave) {
    return { row: publicRow(row), validation: row.validation || (await validateCaseFile(fields, await context(await store().list(), id, row.overridesFile, opts.origin))), caseId: (await caseIdFor(row)).caseId, setup };
  }
  const rows = await store().list();
  const validation = await validateCaseFile(fields, await context(rows, id, row.overridesFile, opts.origin));
  const version = row.version + 1;
  const saved = await store().update(id, { ...fields, version, validation, updatedBy: admin.email }, baseVersion);
  if (!saved) throw httpError("This case file was changed somewhere else. Reload to get the latest version.", 409, { code: "conflict" });
  await store().addRevision({ caseFileId: id, version, action: opts.action || (opts.autosave ? "autosave" : "save"), snapshot: fields, createdBy: admin.email }, { coalesceAutosaveMs: 10 * 60_000 });
  const { caseId, pending } = await caseIdFor(saved);
  return { row: publicRow(saved), validation, caseId: pending ? null : caseId, setup };
}

/* ─────────────────────────────── lifecycle ─────────────────────────────── */

export type Action = "publish" | "unpublish" | "archive" | "restore";

export async function runAction(id: string, action: Action, admin: AdminUser, origin?: string): Promise<CaseFileDetail> {
  const setup = await getSetup();
  if (!setup.ready) throw new TablesMissingError(setup.missing);
  const row = await store().get(id);
  if (!row) throw httpError("Case file not found", 404);
  const now = new Date().toISOString();
  const fields = fieldsOf(row);
  let patch: Partial<StoredRow> = {};
  let revalidate = false;

  if (action === "publish") {
    if (row.status === "archived") throw httpError("Restore the case file before publishing it.", 409);
    const rows = await store().list();
    const validation = await validateCaseFile(fields, await context(rows, id, row.overridesFile, origin));
    if (!validation.ok) {
      await store().update(id, { validation });
      throw httpError(`Fix ${validation.errors} error${validation.errors === 1 ? "" : "s"} before publishing.`, 422, { code: "invalid", validation });
    }
    const caseNumber = row.overridesFile ? null : (row.caseNumber ?? (await nextCaseNumber()));
    patch = {
      status: "published",
      live: { ...fields, debrief: parseDebrief(fields.debrief), activity: fields.activity && fields.activity.steps.length ? fields.activity : null },
      liveVersion: row.version,
      caseNumber,
      publishedAt: row.publishedAt || now,
      lastPublishedAt: now,
      archivedAt: null,
      publishAt: null,
      validation,
      updatedBy: admin.email,
    };
    revalidate = true;
  } else if (action === "unpublish") {
    if (row.status !== "published") throw httpError("Only published case files can be unpublished.", 409);
    patch = { status: "draft", live: null, liveVersion: null, updatedBy: admin.email };
    revalidate = true;
  } else if (action === "archive") {
    if (row.status === "archived") throw httpError("Already archived.", 409);
    revalidate = row.status === "published";
    patch = { status: "archived", live: null, liveVersion: null, archivedAt: now, publishAt: null, updatedBy: admin.email };
  } else if (action === "restore") {
    if (row.status !== "archived") throw httpError("Only archived case files can be restored.", 409);
    patch = { status: "draft", archivedAt: null, updatedBy: admin.email };
  } else throw httpError("Unknown action");

  const saved = await store().update(id, patch);
  if (!saved) throw httpError("Case file not found", 404);
  await store().addRevision({ caseFileId: id, version: saved.version, action, snapshot: fields, createdBy: admin.email });
  if (revalidate) revalidatePublic(saved.slug);
  const { caseId, pending } = await caseIdFor(saved);
  const validation = saved.validation || (await validateCaseFile(fields, await context(await store().list(), id, saved.overridesFile, origin)));
  return { row: publicRow(saved), validation, caseId: pending ? null : caseId, setup };
}

/* ─────────────────────────────── scheduled publishing ─────────────────────────────── */

/** Set (ISO time) or clear (null) a draft's scheduled publish. The hourly scheduler publishes it. */
export async function scheduleCaseFile(id: string, publishAt: string | null, admin: AdminUser, origin?: string): Promise<CaseFileDetail> {
  const setup = await getSetup();
  if (!setup.ready) throw new TablesMissingError(setup.missing);
  const row = await store().get(id);
  if (!row) throw httpError("Case file not found", 404);
  if (row.status !== "draft") throw httpError("Only drafts can be scheduled. Published case files are already live.", 409);
  let when: string | null = null;
  if (publishAt) {
    const t = new Date(publishAt);
    if (Number.isNaN(t.getTime())) throw httpError("That isn't a valid date and time.");
    if (t.getTime() < Date.now() - 60_000) throw httpError("Pick a time in the future, or publish it now instead.");
    when = t.toISOString();
  }
  const saved = await store().update(id, { publishAt: when, updatedBy: admin.email });
  if (!saved) throw httpError("Case file not found", 404);
  const { caseId, pending } = await caseIdFor(saved);
  const validation = saved.validation || (await validateCaseFile(fieldsOf(saved), await context(await store().list(), id, saved.overridesFile, origin)));
  return { row: publicRow(saved), validation, caseId: pending ? null : caseId, setup };
}

const SCHEDULER: AdminUser = { id: "scheduler", email: "scheduler" };

/**
 * Publish every draft whose scheduled time has passed (the cron route calls this). A draft that fails
 * validation stays a draft and loses its schedule, so it isn't retried every hour; the reason is returned.
 */
export async function publishDueCaseFiles(now = new Date()): Promise<{ published: string[]; failed: { slug: string; error: string }[] }> {
  const rows = await store().list();
  const due = rows.filter((r) => r.status === "draft" && r.publishAt && new Date(r.publishAt).getTime() <= now.getTime());
  const published: string[] = [];
  const failed: { slug: string; error: string }[] = [];
  for (const r of due) {
    try {
      await runAction(r.id, "publish", SCHEDULER);
      published.push(r.slug);
    } catch (e) {
      failed.push({ slug: r.slug, error: (e as Error).message });
      await store().update(r.id, { publishAt: null }).catch(() => null);
    }
  }
  return { published, failed };
}

export async function deleteCaseFile(id: string): Promise<void> {
  const setup = await getSetup();
  if (!setup.ready) throw new TablesMissingError(setup.missing);
  const row = await store().get(id);
  if (!row) throw httpError("Case file not found", 404);
  if (row.status === "published") throw httpError("Unpublish or archive it first: only drafts can be deleted.", 409);
  if (row.publishedAt) throw httpError(`It was published${row.caseNumber ? ` as ${formatCaseId(row.caseNumber)}` : ""}, so its case number stays reserved: archive it instead.`, 409);
  await store().remove(id);
}

/* ─────────────────────────────── revisions ─────────────────────────────── */

export async function listRevisions(id: string) {
  const setup = await getSetup();
  if (!setup.ready) throw new TablesMissingError(setup.missing);
  const row = await store().get(id);
  if (!row) throw httpError("Case file not found", 404);
  return (await store().revisions(id, 200)).map((r) => ({
    id: r.id,
    version: r.version,
    action: r.action,
    createdBy: r.createdBy,
    createdAt: r.createdAt,
    title: r.snapshot.title,
    words: r.snapshot.bodyMd.split(/\s+/).filter(Boolean).length,
    live: row.liveVersion === r.version && (r.action === "publish" || r.action === "save" || r.action === "autosave"),
  }));
}

export async function restoreRevision(id: string, revisionId: string, baseVersion: number, admin: AdminUser, origin?: string): Promise<CaseFileDetail> {
  const row = await store().get(id);
  if (!row) throw httpError("Case file not found", 404);
  const rev = await store().revision(id, revisionId);
  if (!rev) throw httpError("Revision not found", 404);
  const snap = { ...rev.snapshot, slug: lockedSlug(row) ? row.slug : rev.snapshot.slug };
  return saveCaseFile(id, snap, baseVersion, { origin, action: "revert" }, admin);
}

/* ─────────────────────────────── preview ─────────────────────────────── */

/** Render a (possibly unsaved) working copy with the public pipeline + validate it. */
export async function renderPreview(fields: CaseFileFields, id: string | undefined, origin?: string): Promise<RenderResult & { meta: ReturnType<typeof toCaseFile>; totalCases: number }> {
  const setup = await getSetup();
  const row = id && setup.ready ? await store().get(id) : null;
  const rows = setup.ready ? await store().list() : [];
  const [rendered, validation, sources] = await Promise.all([
    renderStoryBody(fields.bodyMd),
    validateCaseFile(fields, await context(rows, id, row?.overridesFile ?? false, origin)),
    listStorySources(),
  ]);
  const { caseId } = row ? await caseIdFor(row) : { caseId: formatCaseId(await nextCaseNumber().catch(() => 99)) };
  const src: StorySource = {
    origin: "db",
    slug: fields.slug || "preview",
    title: fields.title || "Untitled case file",
    excerpt: fields.excerpt || undefined,
    cover: fields.coverUrl || undefined,
    coverAlt: fields.coverAlt || undefined,
    motionCover: fields.motionCoverUrl || undefined,
    date: fields.date || undefined,
    tags: fields.tags,
    type: fields.type,
    debrief: fields.debrief,
    body: fields.bodyMd,
  };
  const meta = toCaseFile(src, caseId);
  const totalCases = sources.some((s) => s.slug === fields.slug) ? sources.length : sources.length + 1;
  return { html: rendered.htmlContent, checkpoints: rendered.checkpoints, minutes: meta.mins, caseId, validation, meta, totalCases };
}
