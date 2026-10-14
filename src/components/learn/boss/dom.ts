/**
 * Reads what boss mode needs from the rendered capstone article (never changes its text):
 * the problem statement, the interviewer's lines, phase sections and the Self-Assessment Checklist.
 * Works with the course renderer's markup (section[data-sd="stage"], data-sd components) and with
 * plain markdown HTML ("**Interviewer**: …" paragraphs, a "- [ ]" list under the checklist heading).
 */

export type Problem = { title: string; lines: string[]; bullets: string[]; raw: string };

const STAGE_SEL = 'section[data-sd="stage"]';

export function stageSections(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(STAGE_SEL));
}

export function articleRoot(): HTMLElement | null {
  const first = document.querySelector<HTMLElement>(STAGE_SEL);
  if (!first) return null;
  return (first.closest("article") as HTMLElement | null) || first.parentElement;
}

export function sectionFor(stageId: string): HTMLElement | null {
  const esc = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(stageId) : stageId;
  return document.querySelector<HTMLElement>(`${STAGE_SEL}[data-stage-id="${esc}"]`) || document.querySelector<HTMLElement>(`${STAGE_SEL}#${esc}`);
}

const before = (a: Node, b: Node | null) => !b || !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

/** "Design a Global Flash Sale…" box art → title, prose lines and bullets. */
export function parseWhiteboard(raw: string): Problem {
  const lines = raw
    .split("\n")
    .map((l) => l.replace(/[╔╗╚╝║═╠╣╦╩╬┌┐└┘│─├┤┬┴┼]/g, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const bullets: string[] = [];
  const prose: string[] = [];
  let title = "";
  lines.forEach((l) => {
    if (/^[-*•]\s+/.test(l)) bullets.push(l.replace(/^[-*•]\s+/, ""));
    else if (!title) title = l;
    else if (bullets.length === 0) {
      // join wrapped prose lines into one paragraph
      if (prose.length && !/[.!?:]$/.test(prose[prose.length - 1])) prose[prose.length - 1] += ` ${l}`;
      else prose.push(l);
    } else bullets[bullets.length - 1] += ` ${l}`;
  });
  return { title, lines: prose, bullets, raw };
}

const clean = (el: Element) => (el.textContent || "").replace(/\s+/g, " ").trim();

/** First whiteboard / problem / blueprint block before the first phase. */
export function findProblem(root: HTMLElement, firstPhase: HTMLElement | null): Problem | null {
  const candidates = Array.from(root.querySelectorAll<HTMLElement>('[data-sd="whiteboard"], [data-sd="problem"], [data-sd="blueprint"], pre'));
  const el = candidates.find((c) => before(c, firstPhase) && (c.textContent || "").trim().length > 40);
  if (!el) return null;
  const pre = el.tagName === "PRE" ? el : el.querySelector("pre");
  if (pre) {
    const parsed = parseWhiteboard((pre.textContent || "").trim());
    return parsed.title ? parsed : null;
  }
  // Structured whiteboard: a title line, prose paragraphs and a list (chrome labels skipped)
  const blocks = Array.from(el.querySelectorAll<HTMLElement>("h1, h2, h3, h4, p")).filter((b) => !b.closest("[data-sd-chrome]") && !b.hasAttribute("data-sd-chrome"));
  const titleEl = el.querySelector<HTMLElement>('[class*="title"]') || blocks[0];
  if (!titleEl) return null;
  const title = clean(titleEl);
  const lines = blocks.filter((b) => b !== titleEl).map(clean).filter(Boolean);
  const bullets = Array.from(el.querySelectorAll("li")).map(clean).filter(Boolean);
  return { title, lines, bullets, raw: clean(el) };
}

export type Turn = { who: "interviewer" | "you"; text: string; el: HTMLElement; stageId: string | null };

function whoOf(el: HTMLElement): { who: Turn["who"]; text: string } | null {
  const attr = (el.getAttribute("data-who") || el.getAttribute("data-speaker") || "").toLowerCase();
  const text = (el.textContent || "").replace(/\s+/g, " ").trim();
  if (attr) {
    if (attr.includes("interviewer")) return { who: "interviewer", text: text.replace(/^interviewer\s*[:：]?\s*/i, "") };
    if (attr === "you" || attr.includes("candidate")) return { who: "you", text: text.replace(/^you\s*[:：]?\s*/i, "") };
  }
  const m = text.match(/^(interviewer|you)\s*[:：]\s*(.+)$/i);
  if (!m) return null;
  return { who: m[1].toLowerCase() === "you" ? "you" : "interviewer", text: m[2] };
}

const unquote = (s: string) => s.replace(/^["“”']+|["“”']+$/g, "").trim();

/** Every speaker turn in document order (innermost element per turn). */
export function findTurns(root: HTMLElement): Turn[] {
  const els = Array.from(root.querySelectorAll<HTMLElement>("[data-who], [data-speaker], p, li, dd"));
  const turns: Turn[] = [];
  const seen = new Set<HTMLElement>();
  els.forEach((el) => {
    // skip an element that is inside an already-matched turn
    for (let p = el.parentElement; p && p !== root; p = p.parentElement) if (seen.has(p)) return;
    const w = whoOf(el);
    if (!w || !w.text) return;
    seen.add(el);
    const stage = el.closest<HTMLElement>(STAGE_SEL);
    turns.push({ who: w.who, text: unquote(w.text), el, stageId: stage?.getAttribute("data-stage-id") || stage?.id || null });
  });
  return turns;
}

/**
 * The interviewer's line that opens a phase: an interviewer line at the very top of the phase,
 * else the interviewer's closing question in the stage before it, else the first interviewer line
 * inside the phase.
 */
export function phasePrompt(turns: Turn[], stageId: string, prevStageId: string | null): string | null {
  const inPhase = turns.filter((t) => t.stageId === stageId);
  if (inPhase[0]?.who === "interviewer") return inPhase[0].text;
  if (prevStageId) {
    const prev = turns.filter((t) => t.stageId === prevStageId);
    const last = prev[prev.length - 1];
    if (last?.who === "interviewer") return last.text;
  }
  const firstInt = inPhase.find((t) => t.who === "interviewer");
  return firstInt ? firstInt.text : null;
}

/** Items under the "Self-Assessment Checklist" heading. */
export function findChecklist(root: HTMLElement): string[] {
  const nodes = Array.from(root.querySelectorAll<HTMLElement>("h1, h2, h3, h4, li"));
  const hIdx = nodes.findIndex((n) => /^H[1-4]$/.test(n.tagName) && /self[-\s]?assessment\s+checklist/i.test(n.textContent || ""));
  if (hIdx < 0) return [];
  const level = Number(nodes[hIdx].tagName[1]);
  const items: string[] = [];
  for (let k = hIdx + 1; k < nodes.length; k++) {
    const n = nodes[k];
    if (/^H[1-4]$/.test(n.tagName)) {
      if (Number(n.tagName[1]) <= level) break;
      continue;
    }
    const text = (n.textContent || "").replace(/^\s*\[[ xX]?\]\s*/, "").replace(/\s+/g, " ").trim();
    if (text) items.push(text);
  }
  return items;
}
