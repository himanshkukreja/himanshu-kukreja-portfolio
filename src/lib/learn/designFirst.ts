/**
 * "Design it first" on the capstones (boss lessons): before the solution phases, the learner sketches
 * their own design on the design canvas (/learn/canvas/capstone:<week>), then compares it with the
 * capstone's and can ask for the canvas AI review.
 *
 * Pure (no server or browser imports): the capstone page reads the brief out of the markdown at
 * render time, the canvas route builds the starter board's sticky note from it, and the reader's
 * client components use the keys.
 *
 * Per-learner state: a game flag (GameProvider, synced to the account like every other flag)
 *   designFirst:<week> = { s: "skipped" | "designed", at: epoch ms }
 * The drawing itself is the canvas_designs row with prompt_key "capstone:<week>".
 */

export type ReqGroup = { head: string; items: string[] };

export type DesignFirstBrief = {
  /** "Design a URL Shortener Service ("TinyLink")" */
  title: string;
  /** the whiteboard's prose lines */
  problem: string[];
  /** the whiteboard's bullet points */
  bullets: string[];
  functional: ReqGroup[];
  nonFunctional: ReqGroup[];
  /** the capstone's own high-level design, for "Compare with my design" */
  architecture: { stageId: string | null; title: string; mermaid: string | null; components: string[] } | null;
};

/** What the reader needs: the brief plus the stage sections the gate folds away (the solution). */
export type DesignFirstMeta = DesignFirstBrief & {
  /** canvas_designs.prompt_key */
  key: string;
  /** stage ids from the first solution phase on (all of them stay in the DOM) */
  gated: string[];
};

export const capstoneKey = (week: string) => `capstone:${week}`;
export const designFirstFlag = (week: string) => `designFirst:${week}`;
export type DesignFirstState = { s: "skipped" | "designed"; at: number };
export function readDesignFirst(v: unknown): DesignFirstState | null {
  const r = v as Partial<DesignFirstState> | null;
  return r && (r.s === "skipped" || r.s === "designed") ? { s: r.s, at: Number(r.at) || 0 } : null;
}

/** customData on the starter board's title and sticky note: the AI review and "designed" ignore them. */
export const SEED_MARK = "design-first";

/** Inline markdown → plain text. */
function inline(s: string): string {
  return s
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/(^|[\s(])\*([^*\n]+)\*/g, "$1$2")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** The body of the first `:::panel[...]` / `:::tree[...]` block whose title matches. */
function block(md: string, title: RegExp): { title: string; body: string } | null {
  const re = /^(:{3,})(?:panel|tree)\[([^\]\n]+)\][^\n]*\n([\s\S]*?)^:{3,}[ \t]*$/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(md))) if (title.test(m[2].trim())) return { title: m[2].trim(), body: m[3] };
  return null;
}

/**
 * Requirement groups from a panel/tree body. Three shapes are in the capstones:
 *   #### 1. URL shortening  + "- item" lines
 *   1. **ORDER PLACEMENT**  + indented "- item" lines
 *   - **1. BID REQUEST HANDLING** + indented "- item" lines (a :::tree)
 */
function groups(body: string): ReqGroup[] {
  const out: ReqGroup[] = [];
  const cur = () => {
    if (!out.length) out.push({ head: "", items: [] });
    return out[out.length - 1];
  };
  const head = (h: string) => out.push({ head: tidyHead(h), items: [] });
  for (const line of body.split("\n")) {
    if (!line.trim()) continue;
    let m: RegExpMatchArray | null;
    if ((m = line.match(/^#{3,6}\s+(.+)$/))) head(m[1]);
    else if ((m = line.match(/^(?:\d+\.|[-*])\s+\*\*(.+?)\*\*:?\s*$/))) head(m[1]);
    else if ((m = line.match(/^\s*(?:[-*]|\d+\.)\s+(.+)$/))) cur().items.push(inline(m[1]));
    else if (!/^:{2,}/.test(line)) cur().items.push(inline(line));
  }
  return out.filter((g) => g.head || g.items.length);
}

/** "1. URL SHORTENING" → "URL shortening" */
function tidyHead(h: string): string {
  const t = inline(h).replace(/^\d+\.\s*/, "").replace(/:$/, "");
  return t === t.toUpperCase() && /[A-Z]{3}/.test(t) ? t.charAt(0) + t.slice(1).toLowerCase() : t;
}

export function parseCapstoneBrief(md: string): DesignFirstBrief | null {
  // everything the brief reads is before the second phase (estimation onwards is the answer)
  const p2 = md.search(/^#\s+Phase\s+2\b/im);
  const head = p2 > 0 ? md.slice(0, p2) : md;

  const board = block(head, /^Design\b/i);
  let title = "";
  const problem: string[] = [];
  const bullets: string[] = [];
  if (board) {
    title = inline(board.title).replace(/^Design:\s*/i, "Design ");
    for (const line of board.body.split("\n")) {
      const t = line.trim();
      if (!t || /^#{3,6}\s/.test(t) || /^:{2,}/.test(t)) continue;
      const b = t.match(/^(?:[-*]|\d+\.)\s+(.+)$/);
      if (b) bullets.push(inline(b[1]));
      else problem.push(inline(t));
    }
  }
  if (!title) {
    const h1 = md.match(/^#\s+(.+)$/m)?.[1] || "";
    title = inline(h1).replace(/^.*?Capstone:\s*/i, "") || "This capstone";
  }

  const fr = block(head, /^Functional requirements/i);
  const nfr = block(head, /^Non-functional requirements/i);
  return {
    title,
    problem: problem.slice(0, 6),
    bullets: bullets.slice(0, 10),
    functional: fr ? groups(fr.body) : [],
    nonFunctional: nfr ? groups(nfr.body) : [],
    architecture: architecture(md),
  };
}

/** The High-Level Design phase's first diagram and its component list. */
function architecture(md: string): DesignFirstBrief["architecture"] {
  const re = /^#\s+Phase\s+(\d+)\s*[:.–—-]\s*([^\n]*)$/gim;
  let m: RegExpExecArray | null;
  let start = -1;
  let stageId: string | null = null;
  while ((m = re.exec(md))) {
    if (/high[- ]level|architecture/i.test(m[2])) {
      start = m.index;
      stageId = `phase-${m[1]}`;
      break;
    }
  }
  if (start < 0) return null;
  const rest = md.slice(start + 1);
  const end = rest.search(/^#\s+Phase\s+\d+/im);
  const sec = end > 0 ? rest.slice(0, end) : rest.slice(0, 20000);
  const fence = sec.match(/^```mermaid[^\n]*\n([\s\S]*?)^```/m);
  const mermaid = fence ? fence[1] : null;
  const diagramTitle = mermaid?.match(/^%%\s*title:\s*(.+)$/m)?.[1]?.trim() || "High-level architecture";
  const comps: string[] = [];
  const cb = sec.search(/^##\s+Component (Breakdown|Overview)/im);
  if (cb >= 0) {
    const after = sec.slice(cb).split("\n").slice(1);
    for (const line of after) {
      if (/^##\s/.test(line)) break;
      const h = line.match(/^###\s+(.+)$/);
      if (h) comps.push(inline(h[1]).replace(/^\d+\.\s*/, ""));
    }
  }
  return { stageId, title: diagramTitle, mermaid, components: comps.slice(0, 14) };
}

/** The stage sections the gate folds away: from the first phase after the requirements on. */
export function gatedStages(stages: { id: string; title: string }[]): string[] {
  const first = stages.findIndex((s) => s.id.startsWith("phase-"));
  if (first < 0) return [];
  const start = /requirement|clarif/i.test(stages[first].title) ? first + 1 : first;
  return stages.slice(start).map((s) => s.id);
}

/** The starter board's sticky note: the requirements, short. */
export function stickyText(b: DesignFirstBrief, max = 900): string {
  const lines: string[] = ["REQUIREMENTS"];
  const add = (label: string, gs: ReqGroup[]) => {
    if (!gs.length) return;
    lines.push("", label);
    for (const g of gs.slice(0, 7)) {
      const items = g.items.slice(0, 2).join("; ");
      lines.push(`• ${g.head ? `${g.head}${items ? `: ${items}` : ""}` : items}`);
    }
  };
  add("Functional", b.functional);
  add("Non-functional", b.nonFunctional);
  if (lines.length === 1) b.bullets.slice(0, 8).forEach((x) => lines.push(`• ${x}`));
  let out = lines.join("\n");
  if (out.length > max) out = `${out.slice(0, max - 1).replace(/\s+\S*$/, "")}…`;
  return out;
}
