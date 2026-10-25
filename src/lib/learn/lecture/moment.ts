/**
 * "Ask AI inside the lecture": what a paused moment of a lecture looks like in words, for the model
 * (the outline, the current scene in full, what is on screen at this step), and the control tags an
 * answer may end with to point at the stage. Pure (no I/O): the route, the prompt test and the player
 * all use it.
 *
 * Tags: `[[show: ID, ID]]` lights nodes of the current scene's flowchart/state diagram;
 * `[[jump: sceneId]]` offers a chip that seeks to another scene of this lecture.
 */
import type { Lecture, LectureScene } from "./types";

export type DiagramNode = { id: string; label: string };

const FLOW_SKIP = /^(%%|flowchart\b|graph\b|subgraph\b|end\b|class\b|classDef\b|style\b|linkStyle\b|click\b|direction\b)/;
const ARROW = /\s*(?:<?[-=.]{2,}[->ox]?|<?-\.+->|~~~|&)\s*/;

/** The nodes of a flowchart or state scene (ids as Mermaid draws them, with their labels). */
export function diagramNodes(s: LectureScene): DiagramNode[] {
  const src = s.diagram || "";
  const out = new Map<string, string>();
  const add = (id: string, label?: string) => {
    if (!/^[A-Za-z_][\w]*$/.test(id)) return;
    if (!out.has(id) || (label && out.get(id) === id)) out.set(id, label || out.get(id) || id);
  };
  if (s.kind === "flowchart") {
    for (const raw of src.split("\n")) {
      const line0 = raw.trim();
      if (!line0 || FLOW_SKIP.test(line0)) continue;
      // quoted text can hold arrows and brackets: park it first
      const quoted: string[] = [];
      const line = line0
        .replace(/"([^"]*)"/g, (_, q: string) => `\u0000${quoted.push(q) - 1}\u0000`)
        .replace(/\|[^|]*\|/g, " ")
        .replace(/--\s[^-]+?\s-->/g, "-->");
      const unpark = (x: string) => x.replace(/\u0000(\d+)\u0000/g, (_, k: string) => quoted[Number(k)] ?? "");
      for (const piece of line.split(ARROW)) {
        const m = piece.trim().match(/^([A-Za-z_][\w]*)(.*)$/);
        if (!m) continue;
        const rest = m[2].replace(/:::[\w-]+\s*$/, "").trim();
        let label: string | undefined;
        const at = rest.match(/^@\{([\s\S]*)\}$/);
        if (at) label = unpark(at[1]).match(/label:\s*([^,}]+)/)?.[1]?.trim();
        else if (rest) label = unpark(rest.replace(/^[[({>/\\]+|[\])}/\\]+$/g, "")).trim();
        add(m[1], label?.replace(/<br\s*\/?>/gi, " ").replace(/\s+/g, " "));
      }
    }
  } else if (s.kind === "state") {
    for (const raw of src.split("\n")) {
      const line = raw.trim();
      const named = line.match(/^state\s+"([^"]+)"\s+as\s+(\w+)/);
      if (named) {
        add(named[2], named[1]);
        continue;
      }
      const tr = line.match(/^(\[\*\]|\w+)\s*-->\s*(\[\*\]|\w+)/);
      if (tr) {
        for (const id of [tr[1], tr[2]]) if (id !== "[*]") add(id);
        continue;
      }
      const desc = line.match(/^(\w+)\s*:\s*(.+)$/);
      if (desc && !/^(state|note|direction)$/i.test(desc[1])) add(desc[1], desc[2]);
    }
  }
  return [...out].map(([id, label]) => ({ id, label }));
}

const SEQ_MSG = /^(\w+)\s*(-{1,2}>>|-{1,2}x|-{1,2}\)|-{1,2}>)\s*([+-]?\w+)\s*:\s*(.*)$/;

/** Sequence items (messages and notes) in order, written out with the participants' names. */
function sequenceItems(src: string): string[] {
  const names = new Map<string, string>();
  for (const l of src.split("\n")) {
    const m = l.trim().match(/^(?:participant|actor)\s+(\w+)(?:\s+as\s+(.+))?$/);
    if (m) names.set(m[1], (m[2] || m[1]).trim());
  }
  const n = (id: string) => names.get(id.replace(/^[+-]/, "")) || id;
  const out: string[] = [];
  for (const l of src.split("\n")) {
    const t = l.trim();
    const m = t.match(SEQ_MSG);
    if (m) {
      out.push(`${n(m[1])} ${m[2].includes("x") ? "--x (fails)" : m[2].startsWith("--") ? "--> (reply)" : "->"} ${n(m[3])}: ${m[4]}`);
      continue;
    }
    const note = t.match(/^Note\s+(?:over|left of|right of)\s+([^:]+):\s*(.*)$/i);
    if (note) out.push(`Note over ${note[1].split(",").map((x) => n(x.trim())).join(", ")}: ${note[2]}`);
  }
  return out;
}

const letter = (k: number) => String.fromCharCode(65 + k);
const isQuizLocked = (s: LectureScene, step: number, picked: number | null) => s.kind === "quiz" && picked == null && step === 0;

/** What the learner sees on the stage at step `step` of scene `s`. */
export function onScreen(l: Lecture, s: LectureScene, step: number, picked: number | null): string {
  const st = s.steps[step] || s.steps[0];
  const prev = step > 0 ? s.steps[step - 1] : null;
  const take = <T,>(xs: T[], n?: number) => xs.slice(0, n ?? xs.length);
  const lines: string[] = [];
  if (st?.caption) lines.push(`Caption on screen: "${st.caption}"`);
  switch (s.kind) {
    case "title":
      lines.push(`Title card: "${s.heading || l.title}"`);
      break;
    case "numbers":
      if (s.heading) lines.push(`Heading: ${s.heading}`);
      lines.push("Numbers shown so far:", ...take(s.numbers || [], step + 1).map((x) => `- ${x.value}: ${x.label}`));
      break;
    case "list":
      lines.push(`Heading: ${s.heading ?? ""}`, "Points shown so far:", ...take((s.points || []) as string[], st?.reveal).map((p) => `- ${p}`));
      break;
    case "compare": {
      const L = s.left || { title: "", points: [] };
      const R = s.right || { title: "", points: [] };
      const now = st?.reveal ?? L.points.length + R.points.length;
      lines.push(`Heading: ${s.heading ?? ""}`, `Left, "${L.title}" (${L.tone || "bad"}):`, ...take(L.points, Math.min(now, L.points.length)).map((p) => `- ${p}`));
      lines.push(`Right, "${R.title}" (${R.tone || "good"}):`, ...take(R.points, Math.max(0, now - L.points.length)).map((p) => `- ${p}`));
      break;
    }
    case "chart":
      lines.push(`Heading: ${s.heading ?? ""}`, `${s.type === "line" ? "Line" : "Bar"} chart, values shown so far:`, ...take((s.points || []) as { label: string; value: number }[], st?.reveal).map((p) => `- ${p.label}: ${p.value}${s.unit ? ` ${s.unit}` : ""}`));
      break;
    case "timeline":
      lines.push(`Heading: ${s.heading ?? ""}`, "Timeline events shown so far:", ...take(s.events || [], st?.reveal).map((e) => `- ${e.at}: ${e.text}`));
      break;
    case "phone": {
      const k = Math.max(0, Math.min((s.screens?.length ?? 1) - 1, st?.screen ?? 0));
      const sc = s.screens?.[k];
      const changed = !prev || (prev.screen ?? 0) !== k;
      if (sc) {
        lines.push(`A phone showing ${s.app || "an app"}, screen "${sc.title}":`, ...take(sc.rows, changed ? (st?.reveal ?? sc.rows.length) : st?.reveal).map((r) => `- ${r.text}${r.meta ? ` (${r.meta})` : ""}`));
        if (sc.toast) lines.push(`Notification: ${sc.toast}`);
      }
      if (s.heading) lines.push(`Beside it: ${s.heading}`);
      break;
    }
    case "flowchart":
    case "state": {
      const nodes = new Map(diagramNodes(s).map((x) => [x.id, x.label]));
      const lit = (st?.highlight || []).filter((id) => nodes.has(id));
      lines.push(lit.length ? `Lit up on the diagram: ${lit.map((id) => `${id} (${nodes.get(id)})`).join(", ")}; the rest is dimmed.` : "The whole diagram, nothing highlighted.");
      if (st?.flow && st.flow.length > 1) lines.push(`Packets moving along: ${st.flow.map((id) => nodes.get(id) || id).join(" → ")}`);
      break;
    }
    case "sequence": {
      const items = sequenceItems(s.diagram || "");
      const shown = take(items, st?.upto || undefined);
      lines.push(`Sequence diagram, the ${shown.length} of ${items.length} items drawn so far (newest last):`, ...shown.map((x, k) => `${k + 1}. ${x}`));
      break;
    }
    case "quiz":
      lines.push(`Checkpoint question: ${s.question}`, ...(s.options || []).map((o, k) => `${letter(k)}. ${o}`));
      if (isQuizLocked(s, step, picked)) lines.push("The learner has NOT answered yet.");
      else {
        if (picked != null) lines.push(`The learner picked ${letter(picked)}: ${picked === s.answer ? "right" : "wrong"}.`);
        lines.push(`Correct answer: ${letter(s.answer ?? 0)}. Why: ${s.explain ?? ""}`);
      }
      break;
  }
  return lines.join("\n");
}

/** The current scene in full: its content, its diagram source and every step's narration. */
export function sceneInFull(s: LectureScene, step: number, picked: number | null): string {
  const locked = isQuizLocked(s, step, picked);
  const parts: string[] = [`id: ${s.id} · kind: ${s.kind} · title: ${s.title}${s.heading ? ` · heading: ${s.heading}` : ""}`];
  if (s.numbers) parts.push(`Numbers:\n${s.numbers.map((x) => `- ${x.value}: ${x.label}`).join("\n")}`);
  if (s.points) parts.push(`Points:\n${(s.points as (string | { label: string; value: number })[]).map((p) => `- ${typeof p === "string" ? p : `${p.label}: ${p.value}${s.unit ? ` ${s.unit}` : ""}`}`).join("\n")}`);
  if (s.left && s.right) parts.push(`Left "${s.left.title}":\n${s.left.points.map((p) => `- ${p}`).join("\n")}\nRight "${s.right.title}":\n${s.right.points.map((p) => `- ${p}`).join("\n")}`);
  if (s.events) parts.push(`Events:\n${s.events.map((e) => `- ${e.at}: ${e.text}`).join("\n")}`);
  if (s.screens) parts.push(`Phone screens (${s.app ?? "app"}):\n${s.screens.map((sc, k) => `${k + 1}. ${sc.title}: ${sc.rows.map((r) => r.text).join(" | ")}${sc.toast ? ` · toast: ${sc.toast}` : ""}`).join("\n")}`);
  if (s.diagram) parts.push(`Diagram (Mermaid):\n${s.diagram.trim()}`);
  if (s.kind === "quiz") parts.push(`Question: ${s.question}\n${(s.options || []).map((o, k) => `${letter(k)}. ${o}`).join("\n")}${locked ? "" : `\nAnswer: ${letter(s.answer ?? 0)}. ${s.explain ?? ""}`}`);
  const steps = locked ? s.steps.slice(0, 1) : s.steps;
  parts.push(`Narration, step by step:\n${steps.map((x, k) => `${k + 1}.${k === step ? " [NOW]" : ""} ${x.say}`).join("\n")}`);
  return parts.join("\n\n");
}

/** Every scene of the lecture in order: id · kind · title, with the current one marked. */
export const lectureOutline = (l: Lecture, current: string) => l.scenes.map((s, k) => `${k + 1}. ${s.id} · ${s.kind} · ${s.title}${s.id === current ? "  ← the learner is here" : ""}`).join("\n");

/** Nodes an answer may light on this scene (flowchart and state diagrams only). */
export const showableNodes = (s: LectureScene): DiagramNode[] => (s.kind === "flowchart" || s.kind === "state" ? diagramNodes(s) : []);

export { isQuizLocked };

/** The one-tap questions: what the learner sees on the chip, and what is asked. */
export const LECTURE_PRESETS = {
  simple: { label: "Explain this simpler", ask: "Explain this simpler, like I'm new to this." },
  example: { label: "Give a real example", ask: "Give a real example of this." },
  naive: { label: "Why not the naive way?", ask: "Why not the naive way here? What would break?" },
  interview: { label: "What would an interviewer ask here?", ask: "What would an interviewer ask about this part, and what does a strong answer say?" },
  hinglish: { label: "In Hinglish", ask: "Explain this moment in Hinglish." },
} as const;
export type LecturePreset = keyof typeof LECTURE_PRESETS;
export const isLecturePreset = (x: unknown): x is LecturePreset => typeof x === "string" && x in LECTURE_PRESETS;


const TAG = /\[\[\s*(show|jump)\s*:\s*([^\]]*?)\s*\]\]/gi;

/** Strip the control tags out of an answer (and a tag cut off at the end). */
export const stripTags = (text: string) =>
  text
    .replace(TAG, "")
    .replace(/\[\[[^\]]*$/, "")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

/**
 * The answer without its tags, plus the tags that point at things that exist: `show` ids of the
 * current scene's diagram (a label is accepted for its id) and one `jump` to another scene.
 */
export function readTags(raw: string, l: Lecture, s: LectureScene): { text: string; show: string[]; jump: string | null } {
  const nodes = showableNodes(s);
  const byKey = new Map<string, string>();
  for (const n of nodes) {
    byKey.set(n.id.toLowerCase(), n.id);
    byKey.set(n.label.toLowerCase(), n.id);
  }
  const scenes = new Map(l.scenes.filter((x) => x.id !== s.id).map((x) => [x.id.toLowerCase(), x.id]));
  const show: string[] = [];
  let jump: string | null = null;
  for (const m of raw.matchAll(TAG)) {
    const kind = m[1].toLowerCase();
    const ids = m[2].split(",").map((x) => x.trim().replace(/^["'`]|["'`]$/g, "").toLowerCase()).filter(Boolean);
    if (kind === "show") for (const id of ids) {
      const hit = byKey.get(id);
      if (hit && !show.includes(hit)) show.push(hit);
    }
    else if (!jump) jump = ids.map((id) => scenes.get(id)).find(Boolean) ?? null;
  }
  return { text: stripTags(raw), show: show.slice(0, 8), jump };
}
