"use client";

/**
 * Notebook pages: the client API every part uses (see types.ts). Data lives in Supabase (notebooks,
 * notebook_pages; row-level security: a learner reads and writes only their own rows) and snip images in the
 * private "notebook-snips" storage bucket (<user_id>/<page_id>/<item_id>.webp).
 *
 * CONTRACT (owned by the pages part; capture and AI only call these, never the tables directly):
 *   listNotebooks, createNotebook, renameNotebook, deleteNotebook
 *   listPages, getPage, createPage, savePage (debounced by the caller), deletePage, movePage
 *   inboxPage()                      the open page if one is open in the panel, else the newest "Clips" page
 *   appendItem(pageId, item)         place a clip / snip / text box on a page (auto-positioned below the last item)
 *   uploadSnip(pageId, itemId, blob) store a snip image, returns its storage path
 *   snipUrl(path)                    a short-lived signed URL to show a snip
 *   renderPagePng(page, opts)        the page (paper + ink + items) as a PNG blob, for the AI and for export
 *   openNotebookPanel(target?)       open the side panel (on any course page), optionally at a page
 *
 * Additions (compatible): InkError (every function throws it with a `code` and a sentence a learner can read),
 * registerOpenPage (the editor that has a page open; appendItem and inboxPage go through it so nothing it holds
 * unsaved is overwritten), lessonPage, restorePage, inkDevStore and the INK_EVENTS.item event appendItem fires.
 * recentPages (the newest pages without their ink, for the page switcher and the notebook's "Your pages") and
 * pagesInk (a few pages' ink in one query, for their thumbnails).
 *
 * Errors: InkError.code is "auth" (signed out), "unavailable" (the tables aren't there yet), "full" (the page is
 * at LIMITS.pageBytes), "limit" (50 notebooks / 200 pages / 500 snips), "too_big" / "type" (a snip), "not_found",
 * "network".
 *
 * Dev stand-in: under `next dev` with localStorage hk.ink.dev = "1", everything reads and writes localStorage and
 * snips become data URLs (./dev.ts). DEV is a build-time constant, so a production bundle never takes that path
 * (and ./dev.ts throws if it is ever evaluated outside development).
 */
import { supabaseClient } from "@/lib/supabase-client";
import { INK_EVENTS, LIMITS, PAGE_H, PAGE_W, INBOX_TITLE, type Notebook, type NotebookPage, type PageItem, type Paper } from "./types";
import { CLIP, PAGE_BOTTOM, TEXT, estimateLines, itemBox, lowestY, newInkId, pageBytes, paperArea } from "./geometry";
import { drawPage, type InkTheme } from "./render";

export type NewItem = PageItem extends infer T ? (T extends PageItem ? Omit<T, "id" | "x" | "y"> & { id?: string; x?: number; y?: number } : never) : never;

export type InkErrorCode = "auth" | "unavailable" | "full" | "limit" | "too_big" | "type" | "not_found" | "network";
export class InkError extends Error {
  code: InkErrorCode;
  constructor(code: InkErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "InkError";
  }
}

// ------------------------------------------------------------------ backend (Supabase, or the dev stand-in)

export type PageRow = {
  id: string;
  notebook_id: string;
  user_id: string;
  title: string;
  paper: Paper;
  position: number;
  lesson_key: string | null;
  strokes: NotebookPage["strokes"];
  items: NotebookPage["items"];
  converted_md: string | null;
  converted_at: string | null;
  created_at: string;
  updated_at: string;
};
export type NotebookRow = { id: string; user_id: string; title: string; created_at: string; updated_at: string; notebook_pages?: { count: number }[] };

/** What client.ts needs from storage. Supabase (below) or ./dev.ts. */
export type InkBackend = {
  userId(): Promise<string>;
  listNotebooks(): Promise<NotebookRow[]>;
  findNotebook(title: string): Promise<NotebookRow | null>;
  insertNotebook(title: string): Promise<NotebookRow>;
  updateNotebook(id: string, title: string): Promise<void>;
  deleteNotebook(id: string): Promise<void>;
  listPages(notebookId: string): Promise<PageRow[]>;
  pagePositions(notebookId: string): Promise<{ id: string; position: number; title: string }[]>;
  getPage(id: string): Promise<PageRow | null>;
  lessonPage(lessonKey: string): Promise<PageRow | null>;
  insertPage(row: Omit<PageRow, "id" | "user_id" | "created_at" | "updated_at"> & { id?: string }): Promise<PageRow>;
  /** returns the new updated_at; null when the row is gone */
  updatePage(id: string, patch: Partial<PageRow>): Promise<string | null>;
  deletePage(id: string): Promise<void>;
  snipCount(): Promise<number>;
  listSnips(prefix: string): Promise<string[]>;
  uploadSnip(path: string, blob: Blob): Promise<void>;
  removeSnips(paths: string[]): Promise<void>;
  signedUrls(paths: string[]): Promise<Record<string, string>>;
};

const DEV = process.env.NODE_ENV === "development";
const DEV_KEY = "hk.ink.dev";

/** Dev only: is the localStorage stand-in on? (always false in a production build) */
export function inkDevStore(): boolean {
  if (!DEV || typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(DEV_KEY) === "1";
  } catch {
    return false;
  }
}

const unavailable = () => new InkError("unavailable", "Notebook pages aren't switched on yet. Your other notes are all here.");

function mapError(e: { code?: string; message?: string } | null | undefined): InkError {
  const msg = e?.message || "";
  if (e?.code === "PGRST205" || e?.code === "42P01" || /relation .* does not exist|schema cache/i.test(msg)) return unavailable();
  if (/notebook_limit/.test(msg)) return new InkError("limit", `You can keep up to ${LIMITS.notebooks} notebooks. Delete one to make another.`);
  if (/page_limit/.test(msg)) return new InkError("limit", `A notebook holds up to ${LIMITS.pagesPerNotebook} pages. Start a new notebook.`);
  if (/notebook_pages_size/.test(msg)) return new InkError("full", "This page is full. Start a new page.");
  if (/JWT|not authenticated|row-level security/i.test(msg)) return new InkError("auth", "Sign in to keep notebook pages.");
  if (/fetch|network|Failed to/i.test(msg)) return new InkError("network", "You seem to be offline. Your page is kept on this device and saves when you're back.");
  return new InkError("network", msg || "Something went wrong. Try again.");
}

const supabaseBackend: InkBackend = {
  async userId() {
    const { data } = await supabaseClient.auth.getSession();
    const id = data.session?.user?.id;
    if (!id) throw new InkError("auth", "Sign in to keep notebook pages.");
    return id;
  },
  async listNotebooks() {
    const { data, error } = await supabaseClient.from("notebooks").select("id,user_id,title,created_at,updated_at,notebook_pages(count)").order("updated_at", { ascending: false });
    if (error) throw mapError(error);
    return (data || []) as NotebookRow[];
  },
  async findNotebook(title) {
    const { data, error } = await supabaseClient.from("notebooks").select("id,user_id,title,created_at,updated_at").eq("title", title).order("created_at", { ascending: true }).limit(1);
    if (error) throw mapError(error);
    return ((data || [])[0] as NotebookRow) || null;
  },
  async insertNotebook(title) {
    const user_id = await this.userId();
    const { data, error } = await supabaseClient.from("notebooks").insert({ user_id, title }).select("id,user_id,title,created_at,updated_at").single();
    if (error) throw mapError(error);
    return data as NotebookRow;
  },
  async updateNotebook(id, title) {
    const { error } = await supabaseClient.from("notebooks").update({ title }).eq("id", id);
    if (error) throw mapError(error);
  },
  async deleteNotebook(id) {
    const { error } = await supabaseClient.from("notebooks").delete().eq("id", id);
    if (error) throw mapError(error);
  },
  async listPages(notebookId) {
    const { data, error } = await supabaseClient.from("notebook_pages").select("*").eq("notebook_id", notebookId).order("position", { ascending: true });
    if (error) throw mapError(error);
    return (data || []) as PageRow[];
  },
  async pagePositions(notebookId) {
    const { data, error } = await supabaseClient.from("notebook_pages").select("id,position,title").eq("notebook_id", notebookId).order("position", { ascending: true });
    if (error) throw mapError(error);
    return (data || []) as { id: string; position: number; title: string }[];
  },
  async getPage(id) {
    const { data, error } = await supabaseClient.from("notebook_pages").select("*").eq("id", id).maybeSingle();
    if (error) throw mapError(error);
    return (data as PageRow) || null;
  },
  async lessonPage(lessonKey) {
    const { data, error } = await supabaseClient.from("notebook_pages").select("*").eq("lesson_key", lessonKey).order("updated_at", { ascending: false }).limit(1);
    if (error) throw mapError(error);
    return ((data || [])[0] as PageRow) || null;
  },
  async insertPage(row) {
    const user_id = await this.userId();
    const { data, error } = await supabaseClient
      .from("notebook_pages")
      .insert({ ...row, user_id })
      .select("*")
      .single();
    if (error) throw mapError(error);
    return data as PageRow;
  },
  async updatePage(id, patch) {
    const { data, error } = await supabaseClient.from("notebook_pages").update(patch).eq("id", id).select("updated_at");
    if (error) throw mapError(error);
    return (data || [])[0]?.updated_at ?? null;
  },
  async deletePage(id) {
    const { error } = await supabaseClient.from("notebook_pages").delete().eq("id", id);
    if (error) throw mapError(error);
  },
  async snipCount() {
    const { data, error } = await supabaseClient.rpc("notebook_snip_count");
    if (!error && typeof data === "number") return data;
    // the function isn't there: count the folders by hand
    const uid = await this.userId();
    const pages = await this.listSnips(uid);
    let n = 0;
    for (const p of pages) n += (await this.listSnips(p)).length;
    return n;
  },
  async listSnips(prefix) {
    const { data, error } = await supabaseClient.storage.from("notebook-snips").list(prefix, { limit: 1000 });
    if (error) throw mapError(error);
    return (data || []).map((o) => `${prefix}/${o.name}`);
  },
  async uploadSnip(path, blob) {
    const { error } = await supabaseClient.storage.from("notebook-snips").upload(path, blob, { contentType: blob.type, upsert: false, cacheControl: "31536000" });
    if (error) {
      if (/row-level security/i.test(error.message)) throw new InkError("limit", `You can keep up to ${LIMITS.snipsPerUser} snips. Delete a few from your pages to add more.`);
      if (/Bucket not found/i.test(error.message)) throw unavailable();
      throw mapError(error);
    }
  },
  async removeSnips(paths) {
    if (!paths.length) return;
    const { error } = await supabaseClient.storage.from("notebook-snips").remove(paths);
    if (error) throw mapError(error);
  },
  async signedUrls(paths) {
    const { data, error } = await supabaseClient.storage.from("notebook-snips").createSignedUrls(paths, 3600);
    if (error) throw mapError(error);
    const out: Record<string, string> = {};
    (data || []).forEach((d) => {
      if (d.path && d.signedUrl) out[d.path] = d.signedUrl;
    });
    return out;
  },
};

let devBackend: Promise<InkBackend> | null = null;
async function db(): Promise<InkBackend> {
  if (DEV && inkDevStore()) {
    devBackend ||= import("./dev").then((m) => m.devBackend);
    return devBackend;
  }
  return supabaseBackend;
}

// ------------------------------------------------------------------ rows <-> types

const toNotebook = (r: NotebookRow): Notebook => ({ id: r.id, title: r.title, createdAt: r.created_at, updatedAt: r.updated_at, pageCount: r.notebook_pages?.[0]?.count });
const toPage = (r: PageRow): NotebookPage => ({
  id: r.id,
  notebookId: r.notebook_id,
  title: r.title,
  paper: r.paper,
  position: r.position,
  lessonKey: r.lesson_key,
  strokes: Array.isArray(r.strokes) ? r.strokes : [],
  items: Array.isArray(r.items) ? r.items : [],
  convertedMd: r.converted_md,
  convertedAt: r.converted_at,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});
const cleanTitle = (t: string) => t.replace(/\s+/g, " ").trim().slice(0, LIMITS.titleChars);

// ------------------------------------------------------------------ the open page (editor / panel)

type OpenPage = { pageId: string; get: () => NotebookPage; append: (item: PageItem) => void };
let openPages: OpenPage[] = [];
/**
 * The editor that has a page open registers it here (the panel beside a lesson, or the full-screen editor).
 * inboxPage() returns the most recent one; appendItem() on it goes through the editor's state, so the editor's
 * autosave writes it and nothing unsaved is overwritten. Returns the unregister function.
 */
export function registerOpenPage(p: OpenPage): () => void {
  openPages = [...openPages.filter((x) => x !== p), p];
  return () => {
    openPages = openPages.filter((x) => x !== p);
  };
}
const openPage = (pageId?: string) => (pageId ? openPages.filter((p) => p.pageId === pageId).pop() : openPages[openPages.length - 1]);

// ------------------------------------------------------------------ notebooks

export async function listNotebooks(): Promise<Notebook[]> {
  return (await (await db()).listNotebooks()).map(toNotebook);
}

export async function createNotebook(title: string): Promise<Notebook> {
  const b = await db();
  const all = await b.listNotebooks();
  if (all.length >= LIMITS.notebooks) throw new InkError("limit", `You can keep up to ${LIMITS.notebooks} notebooks. Delete one to make another.`);
  return { ...toNotebook(await b.insertNotebook(cleanTitle(title) || "Notebook")), pageCount: 0 };
}

export async function renameNotebook(id: string, title: string): Promise<void> {
  await (await db()).updateNotebook(id, cleanTitle(title) || "Notebook");
}

/** Deletes the notebook, its pages (cascade) and their snip images. */
export async function deleteNotebook(id: string): Promise<void> {
  const b = await db();
  const pages = await b.pagePositions(id).catch(() => []);
  await b.deleteNotebook(id);
  pages.forEach((p) => void removePageSnips(p.id));
}

// ------------------------------------------------------------------ pages

export async function listPages(notebookId: string): Promise<NotebookPage[]> {
  return (await (await db()).listPages(notebookId)).map(toPage);
}

export async function getPage(id: string): Promise<NotebookPage | null> {
  const r = await (await db()).getPage(id);
  return r ? toPage(r) : null;
}

export async function createPage(notebookId: string, opts?: { paper?: Paper; title?: string; lessonKey?: string | null }): Promise<NotebookPage> {
  const b = await db();
  const pos = await b.pagePositions(notebookId);
  if (pos.length >= LIMITS.pagesPerNotebook) throw new InkError("limit", `A notebook holds up to ${LIMITS.pagesPerNotebook} pages. Start a new notebook.`);
  const position = pos.length ? pos[pos.length - 1].position + 1000 : 1000;
  const row = await b.insertPage({
    notebook_id: notebookId,
    title: cleanTitle(opts?.title || "") || `Page ${pos.length + 1}`,
    paper: opts?.paper || "ruled",
    position,
    lesson_key: opts?.lessonKey || null,
    strokes: [],
    items: [],
    converted_md: null,
    converted_at: null,
  });
  return toPage(row);
}

/**
 * Saves the whole page (title, paper, lesson, ink, items, converted text). Callers debounce it (usePageAutosave).
 * Throws InkError "full" past LIMITS.pageBytes, "not_found" if the page was deleted elsewhere.
 */
export async function savePage(page: NotebookPage): Promise<void> {
  if (pageBytes(page.strokes, page.items) > LIMITS.pageBytes) throw new InkError("full", "This page is full. Start a new page to keep writing.");
  const at = await (
    await db()
  ).updatePage(page.id, {
    title: cleanTitle(page.title),
    paper: page.paper,
    lesson_key: page.lessonKey,
    strokes: page.strokes,
    items: page.items,
    converted_md: page.convertedMd ? page.convertedMd.slice(0, 20000) : null,
    converted_at: page.convertedAt,
  });
  if (!at) throw new InkError("not_found", "This page was deleted on another device.");
}

export async function deletePage(id: string): Promise<void> {
  await (await db()).deletePage(id);
  void removePageSnips(id);
}

/** Put a deleted page back exactly as it was (undo). */
export async function restorePage(page: NotebookPage): Promise<NotebookPage> {
  const row = await (
    await db()
  ).insertPage({
    id: page.id,
    notebook_id: page.notebookId,
    title: page.title,
    paper: page.paper,
    position: page.position,
    lesson_key: page.lessonKey,
    strokes: page.strokes,
    items: page.items,
    converted_md: page.convertedMd,
    converted_at: page.convertedAt,
  });
  return toPage(row);
}

/** Moves a page to `position`: its new 0-based index within its notebook. Usually rewrites one row. */
export async function movePage(id: string, position: number): Promise<void> {
  const b = await db();
  const page = await b.getPage(id);
  if (!page) throw new InkError("not_found", "That page is gone.");
  const rest = (await b.pagePositions(page.notebook_id)).filter((p) => p.id !== id);
  const at = Math.max(0, Math.min(rest.length, Math.round(position)));
  const before = rest[at - 1]?.position;
  const after = rest[at]?.position;
  let next: number | null = null;
  if (before === undefined && after === undefined) next = 1000;
  else if (before === undefined) next = after! - 1000;
  else if (after === undefined) next = before + 1000;
  else if (after - before > 1) next = Math.floor((before + after) / 2);
  if (next !== null) {
    await b.updatePage(id, { position: next });
    return;
  }
  // no gap left: renumber the notebook 1000 apart
  const order = [...rest.slice(0, at).map((p) => p.id), id, ...rest.slice(at).map((p) => p.id)];
  await Promise.all(order.map((pid, i) => b.updatePage(pid, { position: (i + 1) * 1000 })));
}

/** A notebook's pages in order without their ink: id, title, position (page navigation). */
export async function pageOutline(notebookId: string): Promise<{ id: string; title: string; position: number }[]> {
  return (await db()).pagePositions(notebookId);
}

/** The last page written beside a lesson ("<week>/<slug>"), or null. */
export async function lessonPage(lessonKey: string): Promise<NotebookPage | null> {
  const r = await (await db()).lessonPage(lessonKey);
  return r ? toPage(r) : null;
}

/** A page without its ink: what a list of pages shows (the switcher, the "Your pages" cards). */
export type PageSummary = { id: string; title: string; notebookId: string; notebookTitle: string; lessonKey: string | null; paper: Paper; updatedAt: string };

/**
 * The learner's most recently edited pages across all notebooks, newest first, without strokes or items (one small
 * query on notebook_pages_user_updated_idx, plus the notebook titles).
 */
export async function recentPages(limit = 8): Promise<PageSummary[]> {
  const b = await db();
  const n = Math.max(1, Math.min(50, limit));
  if (b !== supabaseBackend) {
    // the dev stand-in: everything is in localStorage already
    const nbs = await b.listNotebooks();
    const titles = new Map(nbs.map((x) => [x.id, x.title]));
    const rows = (await Promise.all(nbs.map((x) => b.listPages(x.id)))).flat();
    return rows
      .sort((x, y) => y.updated_at.localeCompare(x.updated_at))
      .slice(0, n)
      .map((r) => ({ id: r.id, title: r.title, notebookId: r.notebook_id, notebookTitle: titles.get(r.notebook_id) || "", lessonKey: r.lesson_key, paper: r.paper, updatedAt: r.updated_at }));
  }
  const { data, error } = await supabaseClient.from("notebook_pages").select("id,title,notebook_id,lesson_key,paper,updated_at,notebooks(title)").order("updated_at", { ascending: false }).limit(n);
  if (error) throw mapError(error);
  type Row = { id: string; title: string; notebook_id: string; lesson_key: string | null; paper: Paper; updated_at: string; notebooks: { title: string } | { title: string }[] | null };
  return ((data || []) as unknown as Row[]).map((r) => ({
    id: r.id,
    title: r.title,
    notebookId: r.notebook_id,
    notebookTitle: (Array.isArray(r.notebooks) ? r.notebooks[0]?.title : r.notebooks?.title) || "",
    lessonKey: r.lesson_key,
    paper: r.paper,
    updatedAt: r.updated_at,
  }));
}

/** The ink of a few pages (paper, strokes, items), for thumbnails: one query for all of them. */
export async function pagesInk(ids: string[]): Promise<Map<string, Pick<NotebookPage, "paper" | "strokes" | "items">>> {
  const out = new Map<string, Pick<NotebookPage, "paper" | "strokes" | "items">>();
  if (!ids.length) return out;
  const b = await db();
  if (b !== supabaseBackend) {
    for (const id of ids) {
      const r = await b.getPage(id);
      if (r) out.set(id, { paper: r.paper, strokes: Array.isArray(r.strokes) ? r.strokes : [], items: Array.isArray(r.items) ? r.items : [] });
    }
    return out;
  }
  const { data, error } = await supabaseClient.from("notebook_pages").select("id,paper,strokes,items").in("id", ids.slice(0, 50));
  if (error) throw mapError(error);
  for (const r of (data || []) as Pick<PageRow, "id" | "paper" | "strokes" | "items">[]) out.set(r.id, { paper: r.paper, strokes: Array.isArray(r.strokes) ? r.strokes : [], items: Array.isArray(r.items) ? r.items : [] });
  return out;
}

/** A notebook by title (the first made), created when missing. */
export async function notebookNamed(title: string): Promise<Notebook> {
  const b = await db();
  const hit = await b.findNotebook(cleanTitle(title));
  return hit ? toNotebook(hit) : createNotebook(title);
}

/**
 * Where a clip or snip goes: the page open in the panel (or editor) if there is one, else the last page of the
 * "Clips" notebook (made on first use), or a new page there when that one is full.
 */
export async function inboxPage(lessonKey?: string | null): Promise<NotebookPage> {
  const open = openPage();
  if (open) return open.get();
  const nb = await notebookNamed(INBOX_TITLE);
  const pages = await listPages(nb.id);
  const last = pages[pages.length - 1];
  if (last && lowestOrTop(last) < PAGE_BOTTOM - 200 && pageBytes(last.strokes, last.items) < LIMITS.pageBytes * 0.9) return last;
  return createPage(nb.id, { paper: "ruled", title: `Clips ${pages.length + 1}`, lessonKey: lessonKey ?? null });
}

const lowestOrTop = (p: NotebookPage) => lowestY(p.strokes, p.items) ?? paperArea(p.paper).y;

/** Height an item will take, for placement. */
function newItemHeight(it: NewItem, w: number): number {
  if (it.kind === "snip") return (it.h / it.w) * w;
  if (it.kind === "clip") return CLIP.pad * 2 + CLIP.head + estimateLines(it.text, w - CLIP.pad * 2, CLIP.font) * CLIP.line;
  return TEXT.pad * 2 + estimateLines(it.text || " ", w - TEXT.pad * 2, TEXT.font) * TEXT.line;
}

/** Fit and place an item on a page; null when it doesn't fit below what is there. */
function placeOn(page: NotebookPage, item: NewItem, fresh: boolean): PageItem | null {
  const area = paperArea(page.paper);
  const id = item.id || newInkId();
  let w = Math.min(item.w || (item.kind === "snip" ? 560 : item.kind === "clip" ? 600 : 520), area.w);
  let h = newItemHeight(item, w);
  const maxH = PAGE_BOTTOM - area.y - 20;
  if (item.kind === "snip" && h > maxH) {
    w = Math.max(80, Math.floor(w * (maxH / h)));
    h = newItemHeight(item, w);
  }
  let x = item.x ?? area.x;
  let y = item.y;
  if (y === undefined) {
    const low = fresh ? null : lowestY(page.strokes, page.items);
    y = low === null ? area.y : Math.max(area.y, Math.ceil(low + 24));
    // a fresh page always takes the item, even one taller than a page (it runs past the bottom rather than failing)
    if (y + h > PAGE_BOTTOM && !fresh) return null;
  }
  x = Math.max(0, Math.min(PAGE_W - w, x));
  y = Math.max(0, Math.min(PAGE_H - Math.min(h, PAGE_H), y));
  const base = { ...item, id, x, y, w };
  if (base.kind === "snip") return { ...base, h: Math.round(h) } as PageItem;
  if (base.kind === "clip") return { ...base, text: base.text.slice(0, LIMITS.clipChars) } as PageItem;
  return { ...base, text: base.text.slice(0, LIMITS.textChars) } as PageItem;
}

const fits = (page: NotebookPage, it: PageItem) => pageBytes(page.strokes, [...page.items, it]) <= LIMITS.pageBytes && itemBox(it).y1 < PAGE_BOTTOM;

/**
 * Places a clip / snip / text box on a page, below the lowest item or stroke. When the page is full it starts a
 * new page in the same notebook and puts it at the top there. Fires INK_EVENTS.item with the page it landed on.
 */
export async function appendItem(pageId: string, item: NewItem): Promise<PageItem> {
  const open = openPage(pageId);
  const page = open ? open.get() : await getPage(pageId);
  if (!page) throw new InkError("not_found", "That page is gone.");
  let placed = placeOn(page, item, false);
  if (placed && fits(page, placed)) {
    if (open) open.append(placed);
    else await savePage({ ...page, items: [...page.items, placed] });
    announce(page.id, placed, false);
    return placed;
  }
  // full: a new page in the same notebook
  const next = await createPage(page.notebookId, { paper: page.paper, lessonKey: page.lessonKey });
  placed = placeOn(next, item, true)!;
  await savePage({ ...next, items: [placed] });
  announce(next.id, placed, true);
  return placed;
}

function announce(pageId: string, item: PageItem, newPage: boolean) {
  window.dispatchEvent(new CustomEvent(INK_EVENTS.item, { detail: { pageId, item, newPage } }));
}

// ------------------------------------------------------------------ snips

let snipCountCache: { n: number; at: number } | null = null;

/** Every snip path any of the learner's pages still uses. */
async function usedSnipPaths(b: InkBackend): Promise<Set<string>> {
  const used = new Set<string>();
  for (const nb of await b.listNotebooks()) for (const p of await b.listPages(nb.id)) p.items.forEach((it) => it.kind === "snip" && used.add(it.path));
  return used;
}

/** Remove snip images no page uses any more (deleted items, deleted pages). Run when the learner hits the cap. */
async function sweepSnips(b: InkBackend, uid: string): Promise<number> {
  const used = await usedSnipPaths(b);
  let removed = 0;
  for (const folder of await b.listSnips(uid)) {
    const files = await b.listSnips(folder);
    const gone = files.filter((f) => !used.has(f));
    if (gone.length) {
      await b.removeSnips(gone);
      removed += gone.length;
    }
  }
  return removed;
}

async function removePageSnips(pageId: string) {
  try {
    const b = await db();
    const uid = await b.userId();
    const files = await b.listSnips(`${uid}/${pageId}`);
    if (files.length) await b.removeSnips(files);
    if (snipCountCache) snipCountCache.n = Math.max(0, snipCountCache.n - files.length);
  } catch {
    // best effort: the sweep in uploadSnip catches anything left
  }
}

/** Stores a snip image (webp, or png) at <uid>/<pageId>/<itemId>.webp and returns that path. */
export async function uploadSnip(pageId: string, itemId: string, blob: Blob): Promise<string> {
  if (blob.type !== "image/webp" && blob.type !== "image/png") throw new InkError("type", "Snips are saved as WebP or PNG images.");
  if (blob.size > LIMITS.snipBytes) throw new InkError("too_big", "That snip is over 2 MB. Snip a smaller area.");
  const b = await db();
  const uid = await b.userId();
  if (!snipCountCache || Date.now() - snipCountCache.at > 10 * 60_000) snipCountCache = { n: await b.snipCount(), at: Date.now() };
  if (snipCountCache.n >= LIMITS.snipsPerUser) {
    snipCountCache.n -= await sweepSnips(b, uid).catch(() => 0);
    if (snipCountCache.n >= LIMITS.snipsPerUser) throw new InkError("limit", `You can keep up to ${LIMITS.snipsPerUser} snips. Delete a few from your pages to add more.`);
  }
  const safe = (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64) || newInkId();
  const path = `${uid}/${safe(pageId)}/${safe(itemId)}.${blob.type === "image/png" ? "png" : "webp"}`;
  await b.uploadSnip(path, blob);
  snipCountCache.n += 1;
  return path;
}

const urlCache = new Map<string, { url: string; exp: number }>();
let pendingUrls: Map<string, { resolve: (u: string) => void; reject: (e: unknown) => void }[]> | null = null;

/** A signed URL (1 hour) for a snip, cached in memory; requests in the same tick are fetched in one call. */
export function snipUrl(path: string): Promise<string> {
  const hit = urlCache.get(path);
  if (hit && hit.exp - Date.now() > 5 * 60_000) return Promise.resolve(hit.url);
  return new Promise((resolve, reject) => {
    if (!pendingUrls) {
      pendingUrls = new Map();
      queueMicrotask(flushUrls);
    }
    const list = pendingUrls.get(path) || [];
    list.push({ resolve, reject });
    pendingUrls.set(path, list);
  });
}

async function flushUrls() {
  const batch = pendingUrls!;
  pendingUrls = null;
  const paths = [...batch.keys()];
  try {
    const urls = await (await db()).signedUrls(paths);
    const exp = Date.now() + 3600_000;
    for (const p of paths) {
      const u = urls[p];
      if (u) {
        urlCache.set(p, { url: u, exp });
        batch.get(p)!.forEach((w) => w.resolve(u));
      } else batch.get(p)!.forEach((w) => w.reject(new InkError("not_found", "That snip image is gone.")));
    }
  } catch (e) {
    batch.forEach((ws) => ws.forEach((w) => w.reject(e)));
  }
}

// ------------------------------------------------------------------ render

async function loadImage(url: string): Promise<CanvasImageSource | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    if (typeof createImageBitmap === "function") return await createImageBitmap(blob);
    const img = new Image();
    img.src = URL.createObjectURL(blob);
    await img.decode();
    return img;
  } catch {
    return null;
  }
}

/** Snip images of a page, keyed by storage path (missing ones are left out and drawn as placeholders). */
export async function loadSnipImages(items: PageItem[]): Promise<Map<string, CanvasImageSource>> {
  const out = new Map<string, CanvasImageSource>();
  await Promise.all(
    items.map(async (it) => {
      if (it.kind !== "snip") return;
      const url = await snipUrl(it.path).catch(() => null);
      const img = url ? await loadImage(url) : null;
      if (img) out.set(it.path, img);
    })
  );
  return out;
}

/**
 * The page (paper + items + ink) as a PNG: PAGE_W × PAGE_H at scale 1 (1000 × 1414). Deterministic for a page on a
 * device: no time, no randomness; light theme by default (what the AI reads best).
 */
export async function renderPagePng(page: NotebookPage, opts?: { scale?: number; theme?: "light" | "dark" }): Promise<Blob> {
  const scale = Math.max(0.1, Math.min(4, opts?.scale ?? 1));
  const theme: InkTheme = opts?.theme ?? "light";
  const w = Math.round(PAGE_W * scale);
  const h = Math.round(PAGE_H * scale);
  const images = await loadSnipImages(page.items);
  if (typeof OffscreenCanvas !== "undefined") {
    const c = new OffscreenCanvas(w, h);
    const ctx = c.getContext("2d");
    if (ctx) {
      ctx.scale(w / PAGE_W, h / PAGE_H);
      drawPage(ctx, page, theme, images);
      return c.convertToBlob({ type: "image/png" });
    }
  }
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.scale(w / PAGE_W, h / PAGE_H);
  drawPage(ctx, page, theme, images);
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error("render failed"))), "image/png"));
}

export function openNotebookPanel(target?: { pageId?: string }): void {
  window.dispatchEvent(new CustomEvent("hk:notebook-open", { detail: target ?? {} }));
}

// dev only: the API on window for the browser console and QA scripts (window.__hkInk.renderPagePng(page)…)
if (DEV && typeof window !== "undefined") {
  (window as unknown as { __hkInk: unknown }).__hkInk = { listNotebooks, createNotebook, createPage, listPages, getPage, savePage, inboxPage, appendItem, uploadSnip, snipUrl, renderPagePng, openNotebookPanel };
}
