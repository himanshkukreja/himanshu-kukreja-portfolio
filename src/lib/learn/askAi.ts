/**
 * "Ask Claude / Ask ChatGPT" from a text selection: builds a self-contained prompt (the selection,
 * where it sits — lesson or case file, stage / section heading, the surrounding paragraphs — and
 * an instruction) and opens the AI client in a new tab with it prefilled:
 *   Claude  → https://claude.ai/new?q=<prompt>
 *   ChatGPT → https://chatgpt.com/?q=<prompt>
 * URLs stay under MAX_URL characters: the context is trimmed first, and if the prompt is still
 * too long the full prompt goes to the clipboard and the client opens with a short note saying so.
 */
import { track } from "@/lib/track";

export type AskClient = "claude" | "chatgpt";

export type AskContext = {
  kind: "lesson" | "story";
  /** lesson or case-file title */
  title: string;
  /** "System Design Mastery" (lessons) */
  course?: string;
  /** stage / checkpoint heading the selection sits in */
  section?: string;
  /** nearest sub-heading inside that section, when different */
  heading?: string;
  /** the paragraph(s) around the selection */
  surrounding?: string;
  url: string;
};

export const CLIENT_LABEL: Record<AskClient, string> = { claude: "Claude", chatgpt: "ChatGPT" };

const BASE: Record<AskClient, string> = {
  claude: "https://claude.ai/new?q=",
  chatgpt: "https://chatgpt.com/?q=",
};

/** Keep the whole URL below this (browsers and the clients accept ~8K; leave headroom). */
export const MAX_URL = 7000;
const MAX_SELECTION = 3000;
const MAX_SURROUNDING = 1800;

const squash = (s: string) =>
  s
    .replace(/ /g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

/** Keep the start and the end of a long text. */
export function clip(text: string, max: number): string {
  const t = squash(text);
  if (t.length <= max) return t;
  const head = Math.floor(max * 0.65);
  const tail = max - head - 3;
  return `${t.slice(0, head).trimEnd()} … ${t.slice(t.length - tail).trimStart()}`;
}

/** "system-design-mastery" → "System Design Mastery" */
export function courseName(id: string): string {
  return id
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

export function buildAskPrompt(selected: string, ctx: AskContext, opts: { surroundingMax?: number; selectionMax?: number } = {}): string {
  const sel = clip(selected, opts.selectionMax ?? MAX_SELECTION);
  const around = ctx.surrounding ? clip(ctx.surrounding, opts.surroundingMax ?? MAX_SURROUNDING) : "";
  const where =
    ctx.kind === "lesson"
      ? `the lesson "${ctx.title}"${ctx.course ? ` from the course "${ctx.course}"` : ""} by Himanshu Kukreja`
      : `the system-design case study "${ctx.title}" by Himanshu Kukreja`;
  const place = [ctx.section, ctx.heading && ctx.heading !== ctx.section ? ctx.heading : ""].filter(Boolean).join(" › ");
  const lines = [
    `I'm learning system design and I'm reading ${where}.`,
    place ? `Section: ${place}` : "",
    "",
    "This is the part I want to understand:",
    '"""',
    sel,
    '"""',
  ];
  if (around && around !== sel) lines.push("", "Surrounding text, for context:", '"""', around, '"""');
  lines.push(
    "",
    `Explain the selected part in the context of this ${ctx.kind === "lesson" ? "lesson" : "case study"}: what it means, why it matters when designing real systems, and a short concrete example. Define any jargon. Keep it clear and concise, and finish with one question I could use to check my understanding.`,
    "",
    `Source: ${ctx.url}`
  );
  return lines.filter((l, i, a) => !(l === "" && a[i - 1] === "")).join("\n");
}

export function askUrl(client: AskClient, prompt: string): string {
  return BASE[client] + encodeURIComponent(prompt);
}

/** The prompt that fits in a URL: full context, then less surrounding text. Never cuts the selection further. */
export function fittingPrompt(client: AskClient, selected: string, ctx: AskContext): string | null {
  for (const surroundingMax of [MAX_SURROUNDING, 700, 0]) {
    const p = buildAskPrompt(selected, surroundingMax ? ctx : { ...ctx, surrounding: "" }, { surroundingMax });
    if (askUrl(client, p).length <= MAX_URL) return p;
  }
  return null;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // older browsers / no permission: the textarea fallback
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

/**
 * Open the AI client with the prompt. Call straight from the click / key handler (the new tab
 * needs the user gesture). Returns "opened" or "clipboard" (prompt too long for a URL: the full
 * prompt was copied and the client opened with a short note).
 */
export function askAi(client: AskClient, selected: string, ctx: AskContext): "opened" | "clipboard" {
  // a selection longer than MAX_SELECTION would be cut: send it whole through the clipboard instead
  let prompt = squash(selected).length <= MAX_SELECTION ? fittingPrompt(client, selected, ctx) : null;
  let mode: "opened" | "clipboard" = "opened";
  if (!prompt) {
    // too long for a URL: hand the full prompt over through the clipboard
    void copyText(buildAskPrompt(selected, ctx, { selectionMax: 12_000 }));
    prompt = `I'm learning system design and reading "${ctx.title}" by Himanshu Kukreja. The passage I want explained, with its context and my question, is on my clipboard: I'll paste it in my next message. Please wait for it, then explain it.`;
    mode = "clipboard";
  }
  window.open(askUrl(client, prompt), "_blank", "noopener,noreferrer");
  track("ask_ai", { client, kind: ctx.kind, chars: selected.length });
  return mode;
}

export async function copyAskPrompt(selected: string, ctx: AskContext): Promise<boolean> {
  track("ask_ai", { client: "copy", kind: ctx.kind, chars: selected.length });
  return copyText(buildAskPrompt(selected, ctx));
}

// ---------------------------------------------------------------------------------------------
// Context from the DOM around a selection

const BLOCK = "p, li, blockquote, pre, td, th, dd, dt, figcaption, h1, h2, h3, h4, h5, h6";
const SKIP = "[data-sd-chrome], script, style, button";

/** Text of an element without the renderer's chrome (captions, toolbars, buttons). */
export function cleanText(el: Element): string {
  const clone = el.cloneNode(true) as Element;
  clone.querySelectorAll(SKIP).forEach((n) => n.remove());
  // keep the line structure textContent would glue together ("blockingOne connection")
  clone.querySelectorAll("td, th").forEach((n) => n.append(" · "));
  clone.querySelectorAll("p, li, div, tr, pre, blockquote, figcaption, dt, dd, h1, h2, h3, h4, h5, h6, br").forEach((n) => n.append("\n"));
  return squash((clone.textContent || "").replace(/ · \n/g, "\n"));
}

function blockOf(node: Node, root: Element): Element | null {
  const el = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
  const b = el?.closest(BLOCK);
  return b && root.contains(b) ? b : null;
}

/** Block siblings around `el`, walking up out of wrappers (e.g. a list item → its list). */
function neighbour(el: Element, dir: "prev" | "next", root: Element): Element | null {
  let cur: Element | null = el;
  while (cur && cur !== root) {
    let sib = dir === "prev" ? cur.previousElementSibling : cur.nextElementSibling;
    while (sib && (sib.matches(SKIP) || !cleanText(sib))) sib = dir === "prev" ? sib.previousElementSibling : sib.nextElementSibling;
    if (sib) return sib;
    cur = cur.parentElement;
  }
  return null;
}

/**
 * The paragraph(s) around a selection: its block (widened to the enclosing list / callout when
 * that block is a single short line), plus up to two blocks before and after it, within `budget`.
 */
export function surroundingText(range: Range, root: Element, budget = MAX_SURROUNDING): string {
  const a = blockOf(range.startContainer, root);
  const b = blockOf(range.endContainer, root);
  let core: Element | null = a;
  if (a && b && a !== b) {
    // spans several blocks: the closest common ancestor
    let c: Element | null = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE ? (range.commonAncestorContainer as Element) : range.commonAncestorContainer.parentElement;
    if (c && !root.contains(c)) c = null;
    core = c;
  }
  if (!core) return "";
  while (core.parentElement && core.parentElement !== root && root.contains(core.parentElement) && cleanText(core).length < 240) {
    const up = cleanText(core.parentElement).length;
    if (up > budget * 0.8) break;
    core = core.parentElement;
  }
  const mid = cleanText(core);
  let left = Math.max(0, budget - mid.length);
  const before: string[] = [];
  const after: string[] = [];
  const take = (dir: "prev" | "next", out: string[]) => {
    let el: Element | null = core;
    for (let n = 0; n < 4 && out.length < 2 && left > 80; n++) {
      el = el ? neighbour(el, dir, root) : null;
      if (!el) break;
      // stay inside the current sub-section
      if (/^H[1-6]$/.test(el.tagName) || el.matches("section, header")) break;
      const t = clip(cleanText(el), Math.max(120, Math.floor(left / 2)));
      if (!t) continue;
      left -= t.length;
      if (dir === "prev") out.unshift(t);
      else out.push(t);
    }
  };
  take("prev", before);
  take("next", after);
  return [...before, mid, ...after].filter(Boolean).join("\n\n");
}

/** Nearest heading (h2–h4) before the selection inside `root`. */
export function headingBefore(range: Range, root: Element, selector = "h2, h3, h4"): string {
  const heads = Array.from(root.querySelectorAll<HTMLElement>(selector));
  let found = "";
  for (const h of heads) {
    if (h.closest("[data-sd-chrome]")) continue;
    // heading starts before the selection start?
    const pos = range.comparePoint(h, 0);
    if (pos < 0 || h.contains(range.startContainer)) found = cleanText(h);
    else break;
  }
  return found;
}

/** Page URL without the hash noise (#scroll-…, #note-…). */
export function pageUrl(): string {
  return `${window.location.origin}${window.location.pathname}`;
}
