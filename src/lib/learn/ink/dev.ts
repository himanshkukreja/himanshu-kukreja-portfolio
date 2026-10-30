/**
 * DEV-ONLY stand-in for the notebook pages backend: localStorage instead of Supabase, data URLs instead of the
 * snips bucket. Used when `next dev` runs and localStorage hk.ink.dev = "1" (client.ts), so the pages, capture and
 * AI parts can be built and tested before the migration is applied. Loaded through a dynamic import behind a
 * `process.env.NODE_ENV === "development"` constant, so production never reaches it; and it refuses to run there.
 *
 *   localStorage.setItem("hk.ink.dev", "1")   // on
 *   localStorage.removeItem("hk.ink.dev")     // off (the stand-in data stays under hk.ink.dev.*)
 */
import type { InkBackend, NotebookRow, PageRow } from "./client";
import { InkError } from "./client";

if (process.env.NODE_ENV !== "development") {
  throw new Error("notebook dev store is dev-only");
}

const DB_KEY = "hk.ink.dev.db";
const SNIP_KEY = (path: string) => `hk.ink.dev.snip:${path}`;
/** a fixed fake user id no real account can have */
export const DEV_USER = "00000000-0000-4000-8000-0000000000aa";

type Db = { notebooks: NotebookRow[]; pages: PageRow[] };

function load(): Db {
  try {
    const raw = window.localStorage.getItem(DB_KEY);
    if (raw) return JSON.parse(raw) as Db;
  } catch {
    // fall through
  }
  return { notebooks: [], pages: [] };
}
function store(d: Db) {
  try {
    window.localStorage.setItem(DB_KEY, JSON.stringify(d));
  } catch {
    throw new InkError("full", "The dev store is out of localStorage space.");
  }
}
const now = () => new Date().toISOString();
const uuid = () => crypto.randomUUID();
const delay = () => new Promise((r) => setTimeout(r, 40));
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

export const devBackend: InkBackend = {
  async userId() {
    return DEV_USER;
  },
  async listNotebooks() {
    await delay();
    const d = load();
    return d.notebooks
      .map((n) => ({ ...n, notebook_pages: [{ count: d.pages.filter((p) => p.notebook_id === n.id).length }] }))
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  },
  async findNotebook(title) {
    const d = load();
    return d.notebooks.filter((n) => n.title === title).sort((a, b) => a.created_at.localeCompare(b.created_at))[0] || null;
  },
  async insertNotebook(title) {
    await delay();
    const d = load();
    if (d.notebooks.length >= 50) throw new InkError("limit", "You can keep up to 50 notebooks. Delete one to make another.");
    const row: NotebookRow = { id: uuid(), user_id: DEV_USER, title, created_at: now(), updated_at: now() };
    d.notebooks.push(row);
    store(d);
    return row;
  },
  async updateNotebook(id, title) {
    const d = load();
    d.notebooks = d.notebooks.map((n) => (n.id === id ? { ...n, title, updated_at: now() } : n));
    store(d);
  },
  async deleteNotebook(id) {
    const d = load();
    d.notebooks = d.notebooks.filter((n) => n.id !== id);
    d.pages = d.pages.filter((p) => p.notebook_id !== id);
    store(d);
  },
  async listPages(notebookId) {
    await delay();
    return clone(load().pages.filter((p) => p.notebook_id === notebookId).sort((a, b) => a.position - b.position));
  },
  async pagePositions(notebookId) {
    return load()
      .pages.filter((p) => p.notebook_id === notebookId)
      .sort((a, b) => a.position - b.position)
      .map((p) => ({ id: p.id, position: p.position, title: p.title }));
  },
  async getPage(id) {
    await delay();
    const p = load().pages.find((x) => x.id === id);
    return p ? clone(p) : null;
  },
  async lessonPage(lessonKey) {
    const p = load()
      .pages.filter((x) => x.lesson_key === lessonKey)
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0];
    return p ? clone(p) : null;
  },
  async insertPage(row) {
    await delay();
    const d = load();
    if (!d.notebooks.some((n) => n.id === row.notebook_id)) throw new InkError("not_found", "That notebook is gone.");
    if (d.pages.filter((p) => p.notebook_id === row.notebook_id).length >= 200) throw new InkError("limit", "A notebook holds up to 200 pages. Start a new notebook.");
    const full: PageRow = { ...row, id: row.id || uuid(), user_id: DEV_USER, created_at: now(), updated_at: now() };
    d.pages.push(full);
    d.notebooks = d.notebooks.map((n) => (n.id === row.notebook_id ? { ...n, updated_at: now() } : n));
    store(d);
    return clone(full);
  },
  async updatePage(id, patch) {
    await delay();
    const d = load();
    const at = now();
    let hit: PageRow | undefined;
    d.pages = d.pages.map((p) => (p.id === id ? (hit = { ...p, ...patch, id, updated_at: at }) : p));
    if (!hit) return null;
    d.notebooks = d.notebooks.map((n) => (n.id === hit!.notebook_id ? { ...n, updated_at: at } : n));
    store(d);
    return at;
  },
  async deletePage(id) {
    const d = load();
    d.pages = d.pages.filter((p) => p.id !== id);
    store(d);
  },
  async snipCount() {
    let n = 0;
    for (let i = 0; i < window.localStorage.length; i++) if (window.localStorage.key(i)?.startsWith("hk.ink.dev.snip:")) n++;
    return n;
  },
  async listSnips(prefix) {
    const out = new Set<string>();
    const pre = `hk.ink.dev.snip:${prefix}/`;
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (!k?.startsWith(pre)) continue;
      const rest = k.slice(pre.length);
      const slash = rest.indexOf("/");
      out.add(`${prefix}/${slash === -1 ? rest : rest.slice(0, slash)}`);
    }
    return [...out];
  },
  async uploadSnip(path, blob) {
    const url = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(r.error);
      r.readAsDataURL(blob);
    });
    try {
      window.localStorage.setItem(SNIP_KEY(path), url);
    } catch {
      throw new InkError("too_big", "The dev store is out of localStorage space for snips.");
    }
  },
  async removeSnips(paths) {
    paths.forEach((p) => window.localStorage.removeItem(SNIP_KEY(p)));
  },
  async signedUrls(paths) {
    const out: Record<string, string> = {};
    paths.forEach((p) => {
      const u = window.localStorage.getItem(SNIP_KEY(p));
      if (u) out[p] = u;
    });
    return out;
  },
};
