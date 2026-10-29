/**
 * A lesson cut into its sections for smart search, each with the heading id the lesson page renders, so a
 * result opens at that heading. Line-based (no markdown parse: the whole course takes well under a second),
 * but with the renderer's own rules, applied in the same order: the hero (title h1, deck h2, emoji lede),
 * the stage split (render.ts splitStages / majorStage) and the heading ids (detect/blocks.ts headingEl, via
 * concepts/structure.ts headingBase, scoped by stage and parent headings on a clash).
 * scripts/smart-search-check.ts compares these ids with the rendered pages.
 */
import type { LessonKind } from "@/lib/course/types";
import { majorStage } from "@/lib/course/render";
import { startsWithEmoji, stripEmoji } from "@/lib/course/md";
import { IdRegistry, slugify } from "@/lib/course/slug";
import { headingBase } from "@/lib/concepts/structure";
import { BLOCK_NAMES } from "@/lib/course/detect/directives";
import { mdPlain } from "./text";

export type LessonSection = { id: string; title: string; depth: number; stage: string; text: string };
export type LessonParts = { title: string; subtitle: string; lede: string; sections: LessonSection[] };

const SERIES_RE = /^System Design Mastery Series$/i;
const FENCE = /^\s{0,3}(`{3,}|~{3,})/;
const ATX = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const HR = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/;

/** A heading's text as mdast's toString gives it: inline markup gone, the words (and underscores) kept. */
const inlineText = (s: string) =>
  s
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/(\*\*|__)(.+?)\1/g, "$2")
    .replace(/(^|[^\w*])\*(?!\s)([^*]+?)\*(?!\w)/g, "$1$2")
    .replace(/(^|\W)_(?!\s)([^_]+?)_(?!\w)/g, "$1$2")
    .replace(/\\([\\`*_{}[\]()#+\-.!])/g, "$1")
    .trim();

type Block = { kind: "h"; depth: number; raw: string } | { kind: "hr" } | { kind: "text"; lines: string[] } | { kind: "mission"; lines: string[] };


/** Top-level blocks: headings, thematic breaks and runs of other lines (code fences kept out of headings). */
function blocks(md: string): Block[] {
  const out: Block[] = [];
  const lines = md.replace(/^﻿/, "").replace(/\r\n?/g, "\n").split("\n");
  let fence: string | null = null;
  let mission: string[] | null = null;
  let missionDepth = 0;
  const text = (l: string) => {
    const last = out[out.length - 1];
    if (last && last.kind === "text") last.lines.push(l);
    else out.push({ kind: "text", lines: [l] });
  };
  let prevBlank = true;
  const blocksOpen: { len: number; drawn: boolean }[] = [];
  for (const l of lines) {
    if (fence) {
      // closed only by a bare run of the same character, at least as long as the opening one
      const c = l.match(/^\s{0,3}(`{3,}|~{3,})\s*$/);
      if (c && c[1][0] === fence[0] && c[1].length >= fence.length) fence = null;
      if (mission) mission.push(l);
      else text("");
      continue;
    }
    const f = l.match(FENCE);
    if (f) {
      fence = f[1];
      if (mission) mission.push(l);
      else text("");
      prevBlank = false;
      continue;
    }
    // a :::mission block (side quests) is lifted out of the body, as the renderer does
    const open = l.match(/^\s*(:{3,})\s*mission\b/);
    if (!mission && open && !out.some((b) => b.kind === "mission")) {
      mission = [];
      missionDepth = open[1].length;
      continue;
    }
    if (mission) {
      const close = l.match(/^\s*(:{3,})\s*$/);
      if (close && close[1].length >= missionDepth) {
        out.push({ kind: "mission", lines: mission });
        mission = null;
      } else mission.push(l);
      continue;
    }
    // setext heading: a paragraph line underlined with === (h1) or --- (h2)
    const last = out[out.length - 1];
    const setext = !prevBlank && /^\s{0,3}(=+|-+)\s*$/.test(l) && last?.kind === "text" ? last.lines[last.lines.length - 1] : null;
    if (setext && setext.trim() && !/^\s*([-*+]|\d+\.)\s/.test(setext) && !/^\s*[>|]/.test(setext)) {
      (last as { lines: string[] }).lines.pop();
      out.push({ kind: "h", depth: l.trim().startsWith("=") ? 1 : 2, raw: setext.trim() });
      prevBlank = false;
      continue;
    }
    // ::: containers (a bare run of colons closes the innermost one at least as long); a heading inside a
    // block the renderer draws itself (detect/directives.ts BLOCK_NAMES) gets no id, so it claims none here
    const open2 = l.match(/^\s*(:{3,})\s*([A-Za-z][\w-]*)/);
    const close2 = !open2 && l.match(/^\s*(:{3,})\s*$/);
    if (open2) blocksOpen.push({ len: open2[1].length, drawn: BLOCK_NAMES.has(open2[2].toLowerCase()) });
    else if (close2 && blocksOpen.length && close2[1].length >= blocksOpen[blocksOpen.length - 1].len) blocksOpen.pop();
    const h = l.match(ATX);
    if (h && blocksOpen.some((b) => b.drawn)) {
      text(h[2]);
      prevBlank = false;
      continue;
    }
    if (h) {
      out.push({ kind: "h", depth: h[1].length, raw: h[2] });
      prevBlank = false;
      continue;
    }
    // (a "---" under paragraph text was taken as a setext heading above)
    if (HR.test(l)) {
      out.push({ kind: "hr" });
      continue;
    }
    text(l);
    prevBlank = !l.trim();
  }
  if (mission) out.push({ kind: "mission", lines: mission });
  return out;
}

export function lessonSections(markdown: string, kind: LessonKind): LessonParts {
  const all = blocks(markdown);
  const missionBlock = all.find((b) => b.kind === "mission") as { lines: string[] } | undefined;
  let lede = missionBlock ? mdPlain(missionBlock.lines.join("\n")) : "";
  const nodes = all.filter((b) => b.kind !== "mission" && !(b.kind === "text" && !b.lines.join("").trim()));
  const htext = (b: Block) => (b.kind === "h" ? inlineText(b.raw) : "");

  // hero, as renderLessonDetailed reads it
  let k = 0;
  let title = "";
  let subtitle = "";
  while (k < nodes.length && nodes[k].kind === "hr") k++;
  let leadingTitle = false;
  const first = nodes[k];
  if (first?.kind === "h" && first.depth === 1) {
    title = stripEmoji(htext(first)).trim();
    leadingTitle = true;
    k++;
  }
  const deck = nodes[k];
  if (leadingTitle && deck?.kind === "h" && deck.depth === 2) {
    const t = stripEmoji(htext(deck)).trim();
    if (!SERIES_RE.test(t)) subtitle = t;
    k++;
  }
  while (k < nodes.length && nodes[k].kind === "hr") k++;
  let body = nodes.slice(k).filter((n) => !(n.kind === "h" && n.depth === 2 && SERIES_RE.test(stripEmoji(htext(n)))));
  const b0 = body[0];
  const ledeText = b0?.kind === "h" && b0.depth === 1 ? htext(b0) : "";
  if (ledeText && (startsWithEmoji(ledeText) || (kind === "bonus" && /\?\s*$/.test(ledeText))) && !majorStage(ledeText, kind)) {
    lede = lede || stripEmoji(ledeText).trim();
    body = body.slice(1);
  }

  // stages: render.ts splitStages on the same block sequence
  type Stage = { id: string; title: string; heading: boolean; nodes: Block[] };
  const h1s = body.map((n, i) => (n.kind === "h" && n.depth === 1 ? i : -1)).filter((i) => i >= 0);
  let pm: Set<number> | null = null;
  if (kind === "week-preview") {
    pm = new Set();
    let cur = -1;
    body.forEach((n, i) => {
      if (n.kind === "h" && n.depth === 1) cur = i;
      else if (cur >= 0 && n.kind === "h" && n.depth === 2 && /^(Concept|Day)\s+\d+/i.test(stripEmoji(htext(n)))) pm!.add(cur);
    });
  }
  const isMajor = (i: number) => {
    const t = htext(body[i]);
    if (pm) return pm.has(i) ? { id: slugify(t, 40), title: stripEmoji(t) } : null;
    const m = majorStage(t, kind);
    return m ? { id: m.id, title: m.title } : null;
  };
  const anyMajor = h1s.some((i) => isMajor(i));
  const fallback = !anyMajor && h1s.length >= 2;
  const stages: Stage[] = [];
  const leading: Block[] = [];
  let lastPhaseSeen = false;
  let wrapOpened = false;
  for (let i = 0; i < body.length; i++) {
    const n = body[i];
    if (n.kind === "h" && n.depth === 1) {
      const t = htext(n);
      let head = fallback ? { id: slugify(t, 40) || "section", title: stripEmoji(t) } : isMajor(i);
      if (!head && (kind === "capstone" || kind === "bonus" || kind === "problem") && lastPhaseSeen && !wrapOpened) {
        head = { id: "wrap-up", title: stripEmoji(t) };
        wrapOpened = true;
      }
      if (head) {
        if (head.id.startsWith("phase-") || head.id === "final-challenge") lastPhaseSeen = true;
        stages.push({ id: head.id, title: stripEmoji(t).trim(), heading: true, nodes: [] });
        continue;
      }
    }
    if (stages.length) stages[stages.length - 1].nodes.push(n);
    else leading.push(n);
  }
  if (!stages.length) stages.push({ id: "lesson", title: title || "Lesson", heading: false, nodes: leading });
  else if (leading.some((n) => n.kind !== "hr")) stages.unshift({ id: "intro", title: "Intro", heading: false, nodes: leading });

  const ids = new IdRegistry();
  stages.forEach((s) => (s.id = ids.claim(s.id)));

  const sections: LessonSection[] = [];
  for (const s of stages) {
    const hstack: string[] = [];
    let cur = { id: s.id, title: s.title, depth: 1, buf: [] as string[] };
    const close = () => {
      const text = mdPlain(cur.buf.join("\n"));
      if (text || cur.depth === 1) sections.push({ id: cur.id, title: cur.title, depth: cur.depth, stage: s.id, text });
    };
    for (const n of s.nodes) {
      if (n.kind === "h") {
        const clean = stripEmoji(htext(n)).trim();
        const scopes = [s.id, ...hstack.slice(1, n.depth).reverse()].filter(Boolean);
        const id = ids.claim(headingBase(clean), scopes);
        hstack[n.depth] = id;
        hstack.length = n.depth + 1;
        if (n.depth <= 3) {
          close();
          cur = { id, title: clean, depth: n.depth, buf: [] };
        } else cur.buf.push(`${clean}.`);
      } else if (n.kind === "text") cur.buf.push(n.lines.join("\n"));
    }
    close();
  }
  return { title, subtitle, lede, sections };
}
