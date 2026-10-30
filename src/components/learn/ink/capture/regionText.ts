"use client";

/**
 * What a snip needs besides its picture, for "Explain this": the exact text of the page inside the box (so the AI reads
 * words and numbers instead of guessing them from pixels) and where it was taken (the page's kind and key, its title,
 * the heading it sits under, and for a lecture the moment on screen).
 *
 * The text walk is cheap: it starts at the element the snip renders (regionRoot), skips every subtree whose box misses
 * the snip, and only measures word by word in a text node the box cuts through. Hidden things (display: none,
 * visibility: hidden, opacity 0: an animation's steps not shown yet) and page chrome are left out; open shadow roots
 * (the explainer animations) and SVG labels (Mermaid) are read.
 */
import { regionRoot, SNIP_HIDE } from "./region";
import type { Box } from "./events";

const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "BUTTON", "INPUT", "TEXTAREA", "SELECT", "VIDEO", "AUDIO", "IFRAME"]);
/** our own UI (data-sd-chrome is not: the explainer animations carry it, and their labels are what a snip is of) */
const CHROME = "[data-hk-snip-ui], [data-hk-capture-toast], [data-hk-explain]";
const MAX = 4000;

const hit = (r: DOMRect, b: Box) => r.width + r.height > 0 && r.right > b.x && r.left < b.x + b.w && r.bottom > b.y && r.top < b.y + b.h;
const inside = (r: DOMRect, b: Box, slack = 2) => r.left >= b.x - slack && r.right <= b.x + b.w + slack && r.top >= b.y - slack && r.bottom <= b.y + b.h + slack;
const centreIn = (r: DOMRect, b: Box) => {
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  return cx >= b.x && cx <= b.x + b.w && cy >= b.y && cy <= b.y + b.h;
};

/** code keeps its indentation through the whitespace clean-up (figure spaces stand in until the end) */
const keepIndent = (v: string) => v.replace(/^[ \t]+/gm, (m) => "\u2007".repeat(m.replace(/\t/g, "  ").length));

/** The page text inside `box` (viewport CSS px), in reading order, ≤ 4,000 characters. */
export function regionText(box: Box): string {
  const root = regionRoot(box);
  // a snip of a dialog or a player over the page: its own fixed layer is the content
  let inFixed = false;
  for (let n: Element | null = root; n && !inFixed; n = n.parentElement) inFixed = getComputedStyle(n).position === "fixed";
  const parts: string[] = [];
  let len = 0;
  const range = document.createRange();
  const near: Box = { x: box.x - 24, y: box.y - 24, w: box.w + 48, h: box.h + 48 };
  // the part of the box the current subtree can show: an ancestor that clips its overflow (a collapsed answer, a
  // scrolled code block) hides what lies outside it, even though its text still has a place in the layout
  let area: Box = box;
  const clipTo = (a: Box, r: DOMRect): Box => {
    const x = Math.max(a.x, r.left);
    const y = Math.max(a.y, r.top);
    return { x, y, w: Math.min(a.x + a.w, r.right) - x, h: Math.min(a.y + a.h, r.bottom) - y };
  };
  const push = (s: string) => {
    if (len >= MAX) return;
    parts.push(s);
    len += s.length;
  };
  const br = () => {
    if (parts.length && parts[parts.length - 1] !== "\n") parts.push("\n");
  };

  const text = (t: Text) => {
    const v = t.nodeValue || "";
    const pre = /^pre/.test(getComputedStyle(t.parentElement ?? root).whiteSpace);
    if (!v.trim()) {
      // a newline between code lines is a line break; elsewhere whitespace is one space
      if (pre) {
        // kept as is in code: line breaks, and the indentation at the start of a line
        const lines = v.split("\n");
        const tail = lines[lines.length - 1].replace(/\t/g, "  ");
        const atStart = lines.length > 1 || /\n$/.test(parts[parts.length - 1] ?? "\n");
        parts.push("\n".repeat(lines.length - 1) + (atStart ? "\u2007".repeat(tail.length) : tail ? " " : ""));
      } else if (parts.length && !/\s$/.test(parts[parts.length - 1])) parts.push(" ");
      return;
    }
    range.selectNodeContents(t);
    let rects = Array.from(range.getClientRects());
    // SVG text has no line boxes in some engines: its element's box stands in
    if (!rects.length && t.parentElement) rects = [t.parentElement.getBoundingClientRect()];
    if (!rects.some((r) => hit(r, area))) return;
    if (rects.every((r) => inside(r, area))) {
      push(pre ? keepIndent(v) : v.replace(/\s+/g, " "));
      return;
    }
    // the box cuts through this text: keep the lines (code) or words whose middle is inside it
    const re = pre ? /[^\n]+/g : /\S+/g;
    const kept: string[] = [];
    let n = 0;
    for (let m = re.exec(v); m && n < 3000; m = re.exec(v), n++) {
      range.setStart(t, m.index);
      range.setEnd(t, m.index + m[0].length);
      const r = pre ? Array.from(range.getClientRects()).find((x) => hit(x, area)) : range.getBoundingClientRect();
      if (r && (pre ? hit(r, area) : centreIn(r, area))) kept.push(m[0]);
    }
    if (kept.length) push(pre ? keepIndent(kept.join("\n")) : ` ${kept.join(" ")} `);
  };

  const walk = (parent: Node) => {
    const kids = parent instanceof HTMLSlotElement ? parent.assignedNodes({ flatten: true }) : Array.from(parent.childNodes);
    for (const n of kids) {
      if (len >= MAX) return;
      if (n.nodeType === Node.TEXT_NODE) {
        text(n as Text);
        continue;
      }
      if (!(n instanceof Element) || SKIP_TAGS.has(n.tagName) || n.matches(CHROME) || n.matches(SNIP_HIDE)) continue;
      const cs = getComputedStyle(n);
      if (cs.display === "none" || cs.visibility === "hidden" || cs.visibility === "collapse" || Number(cs.opacity) < 0.05) continue;
      // floating chrome (the header, the reading dock, toasts) isn't part of what's under the snip, as in the image
      if (cs.position === "fixed" && !inFixed) continue;
      const r = n.getBoundingClientRect();
      const empty = cs.display === "contents" || (r.width === 0 && r.height === 0);
      // a subtree whose box misses the snip (with a little slack for overflowing labels) is never read
      if (!empty && !hit(r, near)) continue;
      const clips = !empty && (cs.overflowX !== "visible" || cs.overflowY !== "visible") && !(n instanceof SVGElement && n.tagName.toLowerCase() !== "svg");
      const outer = area;
      if (clips) {
        area = clipTo(area, r);
        if (area.w <= 1 || area.h <= 1) {
          area = outer;
          continue;
        }
      }
      const block = !/^inline|contents/.test(cs.display) && !(n instanceof SVGElement && n.tagName.toLowerCase() !== "svg");
      const cell = cs.display === "table-cell";
      if (block && !cell) br();
      // a closed <details> shows its summary only
      if (n instanceof HTMLDetailsElement && !n.open) {
        const sum = n.querySelector(":scope > summary");
        if (sum) walk(sum);
      } else if (n.shadowRoot) walk(n.shadowRoot);
      else walk(n);
      area = outer;
      if (cell) push(" | ");
      else if (block) br();
      else if (n instanceof SVGElement && /^(text|foreignobject)$/i.test(n.tagName)) push(" · ");
    }
  };

  try {
    walk(root.shadowRoot ?? root);
  } finally {
    range.detach?.();
  }
  return parts
    .join("")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\u2007/g, " ")
    .replace(/( ?· ?)+/g, " · ")
    .replace(/(\| )+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^[\s·|]+|[\s·|]+$/g, "")
    .slice(0, MAX);
}

/* ------------------------------------------------------------------ where the snip was taken */

export type SnipKind = "lesson" | "side quest" | "interview problem" | "LLD article" | "case file" | "war story" | "lecture" | "lab" | "short" | "page";

export type LectureMoment = { id: string; scene: string; step: number; at: number; sceneTitle: string };

export type SnipPlace = {
  kind: SnipKind;
  /** "<week>/<slug>" for the course's pages, else the page's slug / id */
  key: string;
  title: string;
  /** the heading (or lecture chapter) the snip sits under */
  heading: string;
  lecture: LectureMoment | null;
};

/** The page's kind and key, from its address. */
export function pageKind(path = window.location.pathname): { kind: SnipKind; key: string } {
  const seg = path.split("/").filter(Boolean);
  if (seg[0] === "stories" && seg[1]) return { kind: "case file", key: seg[1] };
  if (seg[0] !== "learn") return { kind: "page", key: "" };
  if (seg[1] === "lectures" && seg[2]) return { kind: "lecture", key: seg[2] };
  if (seg[1] === "war-stories" && seg[2] && !["shorts", "war-room"].includes(seg[2])) return { kind: "war story", key: seg[2] };
  if (seg[1] === "labs" && seg[2]) return { kind: "lab", key: seg[2] };
  if (seg[1] === "shorts" && seg[2]) return { kind: "short", key: seg[2] };
  if (seg.length >= 4 && /^[a-z0-9-]+$/.test(seg[2]) && /^[A-Za-z0-9-]+$/.test(seg[3])) {
    const [week, slug] = [seg[2], seg[3]];
    const key = `${week}/${slug}`;
    if (week === "bonus-problems" || slug.startsWith("bonus-")) return { kind: "side quest", key };
    if (week === "problem-bank") return { kind: "interview problem", key };
    if (week === "low-level-design") return { kind: "LLD article", key };
    return { kind: "lesson", key };
  }
  return { kind: "page", key: "" };
}

const clean = (s: string | null | undefined) => (s || "").replace(/[#¶]\s*$/, "").replace(/\s+/g, " ").trim();

/** The lecture stage under the box (LecturePlayer marks it with the moment on screen), or null. */
function lectureAt(box: Box): LectureMoment | null {
  const stages = Array.from(document.querySelectorAll<HTMLElement>("[data-hk-lecture]"));
  const el = stages.find((s) => hit(s.getBoundingClientRect(), box)) ?? (stages.length === 1 ? stages[0] : null);
  if (!el) return null;
  const d = el.dataset;
  if (!d.hkLecture || !d.hkScene) return null;
  return { id: d.hkLecture, scene: d.hkScene, step: Number(d.hkStep) || 0, at: Number(d.hkAt) || 0, sceneTitle: d.hkSceneTitle || "" };
}

/** Where the snip was taken: the page, its kind, and the heading (or the lecture's chapter and moment) it sits under. */
export function snipPlace(root: Element | null, box: Box, title: string): SnipPlace {
  const { kind, key } = pageKind();
  const lecture = lectureAt(box);
  if (lecture) return { kind: "lecture", key: lecture.id, title, heading: lecture.sceneTitle, lecture };
  let heading = "";
  const scope = root ?? document.querySelector("main") ?? document.body;
  const mid = box.y + Math.min(box.h / 2, 120);
  for (const h of Array.from(scope.querySelectorAll<HTMLElement>("h1, h2, h3, h4"))) {
    if (h.closest(CHROME)) continue;
    const r = h.getBoundingClientRect();
    if (r.width + r.height === 0) continue;
    if (r.top <= mid) heading = clean(h.textContent);
  }
  return { kind, key, title, heading: heading === title ? "" : heading.slice(0, 200), lecture: null };
}
