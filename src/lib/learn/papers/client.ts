"use client";

/**
 * Written papers in the browser: the learner's "Written papers" notebook, the answer image the grader reads, the
 * grading request, and the grader's words kept on this device. Answers go through the notebook client
 * (lib/learn/ink/client.ts) exactly as it is; nothing here touches a table directly.
 */
import { aiFetch } from "@/components/learn/ai/aiFetch";
import { createNotebook, getPage, InkError, listNotebooks, renderPagePng } from "@/lib/learn/ink/client";
import { lowestY } from "@/lib/learn/ink/geometry";
import { LIMITS, PAGE_H, PAGE_W, type Notebook, type NotebookPage } from "@/lib/learn/ink/types";
import type { QuestionGrade } from "./grade";
import { MAX_SHEETS } from "./types";

// ------------------------------------------------------------------ the notebook

export const PAPERS_NOTEBOOK = "Written papers";
const NB_RE = /^Written papers(?: (\d+))?$/;

/**
 * The notebook new answer sheets go in: the first "Written papers" notebook with room for a whole paper's sheets,
 * else a new one ("Written papers 2", …). Made on first use.
 */
export async function paperNotebook(room = 12): Promise<Notebook> {
  const all = (await listNotebooks()).filter((n) => NB_RE.test(n.title));
  all.sort((a, b) => Number(a.title.match(NB_RE)?.[1] || 1) - Number(b.title.match(NB_RE)?.[1] || 1));
  const free = all.find((n) => (n.pageCount ?? 0) + room <= LIMITS.pagesPerNotebook);
  if (free) return free;
  const next = all.length ? Math.max(...all.map((n) => Number(n.title.match(NB_RE)?.[1] || 1))) + 1 : 1;
  return createNotebook(next === 1 ? PAPERS_NOTEBOOK : `${PAPERS_NOTEBOOK} ${next}`);
}

export const newAttemptId = () => {
  const a = new Uint8Array(4);
  crypto.getRandomValues(a);
  return [...a].map((b) => b.toString(36).padStart(2, "0")).join("").slice(0, 6);
};

/** "Q3 · Week 4 written paper: Caching · #a1b2c3" (" · sheet 2"), within the page title limit. */
export function sheetTitle(paperTitle: string, n: number, attempt: string, sheet: number): string {
  const tail = ` · #${attempt}${sheet > 1 ? ` · sheet ${sheet}` : ""}`;
  const head = `Q${n} · `;
  const room = LIMITS.titleChars - head.length - tail.length;
  const t = paperTitle.length > room ? `${paperTitle.slice(0, room - 1).trim()}…` : paperTitle;
  return `${head}${t}${tail}`;
}

// ------------------------------------------------------------------ the answer image

/** Is there anything on this sheet the grader could read (ink, or a typed text box with text)? */
export const sheetHasWork = (p: Pick<NotebookPage, "strokes" | "items">) => p.strokes.length > 0 || p.items.some((it) => it.kind === "text" && it.text.trim());

/** The sheet as the grader sees it: ink and typed text boxes only (a clip or snip of course text earns nothing). */
const gradedPart = (p: NotebookPage): NotebookPage => ({ ...p, items: p.items.filter((it) => it.kind === "text" && it.text.trim()) });

async function bitmap(blob: Blob): Promise<CanvasImageSource & { width: number; height: number }> {
  if (typeof createImageBitmap === "function") return createImageBitmap(blob);
  const img = new Image();
  img.src = URL.createObjectURL(blob);
  await img.decode();
  return img;
}

const toBase64 = async (blob: Blob) => {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let s = "";
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
};

export type AnswerImage = { data: string; mediaType: "image/png"; width: number; height: number; bytes: number; sheets: number; typed: string };

const MAX_SIDE = 2000;
const MAX_BYTES = 1_400_000;
const GAP = 16;

/**
 * One PNG of an answer's sheets for the grader: each sheet rendered in the light theme at full size (1000 px wide),
 * cut just below the lowest ink, stacked top to bottom; when the stack is taller than 2000 px the sheets go in two
 * columns (left column first), and the whole is scaled to fit 2000 px a side (the API's own limit is about 1568, so
 * it may scale it again). Returns null when the sheets are blank.
 */
export async function answerImage(sheets: NotebookPage[]): Promise<AnswerImage | null> {
  const used = sheets.filter(sheetHasWork).map(gradedPart);
  if (!used.length) return null;
  const parts = await Promise.all(
    used.map(async (p) => {
      const low = lowestY(p.strokes, p.items) ?? 200;
      const h = Math.min(PAGE_H, Math.max(320, Math.ceil(low + 48)));
      return { img: await bitmap(await renderPagePng(p, { scale: 1, theme: "light" })), h };
    })
  );
  // one column, or two when one is too tall: fill the left column to about half the total height first
  const total = parts.reduce((a, p) => a + p.h, 0) + GAP * (parts.length - 1);
  let cols: (typeof parts)[] = [parts];
  if (total > MAX_SIDE && parts.length > 1) {
    let acc = 0;
    let k = 0;
    for (; k < parts.length - 1; k++) {
      if (acc > 0 && acc + parts[k].h > total / 2) break;
      acc += parts[k].h + GAP;
    }
    cols = [parts.slice(0, k), parts.slice(k)];
  }
  const colH = cols.map((c) => c.reduce((a, p) => a + p.h, 0) + GAP * Math.max(0, c.length - 1));
  const W0 = cols.length * PAGE_W + (cols.length - 1) * GAP;
  const H0 = Math.max(...colH);
  let scale = Math.min(1, MAX_SIDE / Math.max(W0, H0));
  for (let tries = 0; tries < 4; tries++) {
    const w = Math.round(W0 * scale);
    const h = Math.round(H0 * scale);
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.scale(scale, scale);
    cols.forEach((col, k) => {
      let y = 0;
      const x = k * (PAGE_W + GAP);
      for (const p of col) {
        ctx.drawImage(p.img, 0, 0, PAGE_W, p.h, x, y, PAGE_W, p.h);
        y += p.h + GAP;
      }
    });
    const blob = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("render failed"))), "image/png"));
    if (blob.size <= MAX_BYTES || tries === 3) {
      const typed = used
        .flatMap((p) => [...p.items].sort((a, b) => a.y - b.y || a.x - b.x))
        .map((it) => (it.kind === "text" ? it.text.trim() : ""))
        .filter(Boolean)
        .join("\n")
        .slice(0, 4000);
      return { data: await toBase64(blob), mediaType: "image/png", width: w, height: h, bytes: blob.size, sheets: used.length, typed };
    }
    scale *= 0.8;
  }
  return null;
}

/** An answer's sheets, loaded (missing ones skipped). */
export async function loadSheets(ids: string[]): Promise<NotebookPage[]> {
  const pages = await Promise.all(ids.slice(0, MAX_SHEETS).map((id) => getPage(id).catch(() => null)));
  return pages.filter((p): p is NotebookPage => !!p);
}

// ------------------------------------------------------------------ grading

export type GradeFailure = { error: string; status: string | null; retryable: boolean; creditsLeft?: number | null };

/** POST /api/learn/ai/paper/grade. A blank answer is graded 0 here, without a call. */
export async function gradeAnswer(key: string, n: number, max: number, scheme: number[], sheets: NotebookPage[]): Promise<{ ok: true; grade: QuestionGrade; creditsLeft: number | null } | ({ ok: false } & GradeFailure)> {
  let img: AnswerImage | null;
  try {
    img = await answerImage(sheets);
  } catch {
    return { ok: false, error: "Couldn't draw your answer sheet. Try again.", status: null, retryable: true };
  }
  if (!img) {
    return {
      ok: true,
      creditsLeft: null,
      grade: { n, score: 0, max, points: scheme.map((m) => ({ awarded: 0, max: m, evidence: "not found", confidence: 1 })), read: "", missing: [], feedback: "Nothing was written for this question.", model: "haiku", firstScore: null, escalated: [], credits: 0, blank: true, at: Date.now() },
    };
  }
  try {
    const res = await aiFetch("/api/learn/ai/paper/grade", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key, n, image: { mediaType: img.mediaType, data: img.data }, typed: img.typed, sheets: img.sheets }),
    });
    const j = (await res.json().catch(() => ({}))) as { grade?: QuestionGrade; creditsLeft?: number | null; error?: string; status?: string };
    if (res.ok && j.grade) return { ok: true, grade: { ...j.grade, at: Date.now() }, creditsLeft: j.creditsLeft ?? null };
    if (res.status === 401) return { ok: false, error: "Sign in to have your answers graded.", status: "auth", retryable: false };
    return { ok: false, error: j.error || "The grader didn't answer. Try again in a moment.", status: j.status || null, retryable: j.status === "rate_limited" || j.status === "error" || res.status >= 500, creditsLeft: j.creditsLeft };
  } catch {
    return { ok: false, error: "You seem to be offline. Your answers are saved; grade them when you're back.", status: "network", retryable: true };
  }
}

// ------------------------------------------------------------------ the grader's words, on this device

const DETAIL = (attempt: string) => `hk.paper.grades.v1:${attempt}`;
const DETAIL_INDEX = "hk.paper.grades.v1";
const KEEP = 12;

export function readDetails(attempt: string): Record<number, QuestionGrade> {
  try {
    return JSON.parse(window.localStorage.getItem(DETAIL(attempt)) || "{}") as Record<number, QuestionGrade>;
  } catch {
    return {};
  }
}

/** Keep one question's full grade for an attempt (the last KEEP attempts are kept). */
export function writeDetail(attempt: string, g: QuestionGrade) {
  try {
    const cur = readDetails(attempt);
    cur[g.n] = g;
    window.localStorage.setItem(DETAIL(attempt), JSON.stringify(cur));
    const idx = (JSON.parse(window.localStorage.getItem(DETAIL_INDEX) || "[]") as string[]).filter((a) => a !== attempt);
    idx.push(attempt);
    while (idx.length > KEEP) window.localStorage.removeItem(DETAIL(idx.shift()!));
    window.localStorage.setItem(DETAIL_INDEX, JSON.stringify(idx));
  } catch {
    // storage full or blocked: the marks are still in the flag
  }
}

export const inkErrorText = (e: unknown, fallback: string) => (e instanceof InkError ? e.message : fallback);
