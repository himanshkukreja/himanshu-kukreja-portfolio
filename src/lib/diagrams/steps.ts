/**
 * Step-through annotations for Mermaid diagrams (renderer: src/lib/course/detect/code.ts, player:
 * src/components/diagrams/mermaidSteps.ts, validator: scripts/validate-blocks.mjs).
 *
 * Mermaid ignores `%%` comment lines, so the annotation never changes how a diagram draws:
 *
 *   ```mermaid
 *   %% title: Checkout
 *   %% steps:
 *   %% C --> G: The client sends the order to the gateway
 *   %% G --> O, G --> P: The gateway fans out to orders and payments
 *   %% O: Orders writes the row
 *   flowchart LR
 *     ...
 *   ```
 *
 * Each `%%` line after `%% steps:` is one step: comma-separated targets, a colon, a short caption.
 *   flowcharts   an edge `A --> B` (any arrow: ->, -->, -.->, ==>) or a node / subgraph id `A`
 *   sequence     message numbers in source order, 1-based: `3`, or a range `2-4`
 * Sequence diagrams play every message in order without an annotation (`%% steps: off` opts out).
 * The block ends at the first line that is not a `%%` comment.
 */

export type StepTarget = { kind: "edge"; from: string; to: string } | { kind: "node"; id: string } | { kind: "msg"; from: number; to: number };
export type DiagramStep = { targets: StepTarget[]; caption: string };
export type StepsSpec = { mode: "manual"; steps: DiagramStep[] } | { mode: "auto" } | { mode: "off" };

const ARROW = /\s*(?:<?[-=.]*[-=]>|--[-.]*|==+|-\.+-?)\s*/;
const HEAD = /^\s*%%\s*steps\s*:\s*(.*)$/i;

/** The diagram kind: the first word of the first line that is not blank, front matter or a comment. */
export function diagramKind(src: string): string {
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  let i = 0;
  if (lines[0]?.trim() === "---") i = lines.findIndex((l, k) => k > 0 && l.trim() === "---") + 1;
  for (; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t && !t.startsWith("%%")) return t.split(/\s/)[0];
  }
  return "";
}

export function isFlowchart(kind: string): boolean {
  return kind === "flowchart" || kind === "graph";
}

function parseTarget(raw: string, seq: boolean): StepTarget | null {
  const t = raw.trim();
  if (!t) return null;
  if (seq) {
    const m = t.match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!m) return null;
    const a = parseInt(m[1], 10);
    const b = m[2] ? parseInt(m[2], 10) : a;
    return a >= 1 && b >= a ? { kind: "msg", from: a, to: b } : null;
  }
  const parts = t.split(ARROW).filter(Boolean);
  const id = /^[A-Za-z0-9_][\w.-]*$/;
  if (parts.length === 2 && id.test(parts[0]) && id.test(parts[1])) return { kind: "edge", from: parts[0], to: parts[1] };
  if (parts.length === 1 && id.test(parts[0]) && !ARROW.test(t)) return { kind: "node", id: parts[0] };
  return null;
}

/**
 * Read the steps annotation. `errors` (when given) collects lines that don't parse, for the
 * validator; the renderer just skips them.
 */
export function parseSteps(src: string, errors?: string[]): StepsSpec | null {
  const kind = diagramKind(src);
  const seq = kind === "sequenceDiagram";
  const flow = isFlowchart(kind);
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  const at = lines.findIndex((l) => HEAD.test(l));
  if (at < 0) return seq ? { mode: "auto" } : null;
  const rest = (lines[at].match(HEAD)?.[1] || "").trim().toLowerCase();
  if (rest === "off" || rest === "none") return { mode: "off" };
  if (rest === "auto") {
    if (!seq) errors?.push(`"%% steps: auto" only works on sequence diagrams`);
    return seq ? { mode: "auto" } : null;
  }
  if (!seq && !flow) {
    errors?.push(`step-through works on flowcharts and sequence diagrams, not ${kind || "this diagram"}`);
    return null;
  }
  const steps: DiagramStep[] = [];
  for (let i = at + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line.startsWith("%%")) break;
    const body = line.replace(/^%%\s?/, "");
    if (!body.trim()) continue;
    if (/^\s*title\s*:/i.test(body)) continue;
    // targets end at the first ": " that isn't part of an arrow (ids never hold a colon)
    const colon = body.indexOf(":");
    if (colon < 0) {
      errors?.push(`step "${body.trim()}" needs "targets: caption"`);
      continue;
    }
    const targetsRaw = body.slice(0, colon);
    const caption = body.slice(colon + 1).trim();
    const targets = targetsRaw.split(",").map((t) => parseTarget(t, seq));
    if (!caption || targets.some((t) => !t)) {
      errors?.push(`step "${body.trim()}" does not parse (${seq ? "message numbers like 2 or 2-4" : "edges like A --> B or node ids"}, then ": caption")`);
      continue;
    }
    steps.push({ targets: targets as StepTarget[], caption });
  }
  if (!steps.length) {
    errors?.push(`"%% steps:" has no step lines under it`);
    return seq ? { mode: "auto" } : null;
  }
  return { mode: "manual", steps };
}

/** Messages in a sequence diagram's source, in order (what the player highlights one by one). */
export function countSequenceMessages(src: string): number {
  let n = 0;
  for (const raw of src.split("\n")) {
    const l = raw.trim();
    if (!l || l.startsWith("%%")) continue;
    // Actor ->> Actor: text, with every Mermaid arrow (->, -->, ->>, -->>, -x, --x, -), --), <<->>)
    if (/^[^:]+?(?:<<)?-{1,2}(?:>>|>|x|\))[+-]?[^:]*:/.test(l) && !/^(note|participant|actor|title|autonumber)\b/i.test(l)) n++;
  }
  return n;
}
