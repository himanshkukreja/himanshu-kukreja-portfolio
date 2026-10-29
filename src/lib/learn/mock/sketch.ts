/**
 * The mock interview whiteboard is an Excalidraw drawing, saved with the run as JSON (`run.sketch`).
 * Feedback prompts and the AI scorecard can't see a drawing, so this turns it into text: the boxes
 * by their labels, and every arrow as "from → to" (with its own label), using the arrow bindings
 * Excalidraw keeps when an arrow is drawn from one shape to another. No Excalidraw import: plain data.
 */
type El = {
  id: string;
  type: string;
  isDeleted?: boolean;
  text?: string;
  containerId?: string | null;
  boundElements?: { id: string; type: string }[] | null;
  startBinding?: { elementId: string } | null;
  endBinding?: { elementId: string } | null;
  groupIds?: string[];
  /** a library block's container: `{ kind: "sql-db" }` (src/lib/learn/board/library.ts) */
  customData?: { kind?: string; seed?: string } | null;
};

/** elements, plus the icon images the blocks use (file id → Excalidraw file data) */
export type Sketch = { elements: El[]; files?: Record<string, unknown> };

export function parseSketch(raw: string | undefined | null): Sketch | null {
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as Sketch;
    return Array.isArray(s?.elements) ? s : null;
  } catch {
    return null;
  }
}

const clean = (t: string) => t.replace(/\s+/g, " ").trim();

/** What each library kind is called, for "Orders DB (SQL database)". Kept here so this file stays plain data. */
const KINDS: Record<string, string> = {
  "web-client": "web client",
  "mobile-client": "mobile client",
  "desktop-client": "desktop client",
  device: "IoT device",
  users: "users",
  "third-party": "third-party client",
  dns: "DNS",
  cdn: "CDN",
  "load-balancer": "load balancer",
  "api-gateway": "API gateway",
  waf: "WAF / rate limiter",
  service: "service",
  worker: "worker",
  function: "serverless function",
  scheduler: "scheduler",
  "sql-db": "SQL database",
  "nosql-db": "NoSQL / KV store",
  cache: "cache",
  "search-index": "search index",
  "object-storage": "object storage",
  warehouse: "data warehouse",
  "vector-db": "vector DB",
  queue: "queue",
  stream: "stream / log",
  pubsub: "pub/sub topic",
  dlq: "dead-letter queue",
  auth: "auth / IdP",
  secrets: "config / secrets",
  monitoring: "monitoring",
  "external-api": "external API",
  "payment-gateway": "payment gateway",
};

const SHAPES = ["rectangle", "ellipse", "diamond"];

/** "Boxes: …" and "Arrows: A → B" lines; empty when nothing meaningful is drawn. */
export function sketchSummary(raw: string | undefined | null): string {
  const s = parseSketch(raw);
  if (!s) return "";
  // the capstone starter board's title and requirements sticky (customData.seed) are the brief, not the design
  const seeded = new Set(s.elements.filter((e) => e.customData?.seed).map((e) => e.id));
  const live = s.elements.filter((e) => !e.isDeleted && !seeded.has(e.id) && !(e.containerId && seeded.has(e.containerId)));
  const byId = new Map(live.map((e) => [e.id, e]));
  const ownText = (e: El) => {
    const t = (e.boundElements || []).map((b) => byId.get(b.id)).find((x) => x?.type === "text");
    return t ? clean(t.text || "") : "";
  };
  // a shape's label is the text element bound to it
  const label = (id: string | undefined | null): string => {
    if (!id) return "";
    const e = byId.get(id);
    if (!e) return "";
    if (e.type === "text") return clean(e.text || "");
    const own = ownText(e);
    if (own) return own;
    // part of a block (its icon, a cylinder's lid, a stacked plate…): name it by the labelled shape in its group
    if (e.groupIds?.length && e.type !== "arrow") {
      const g = e.groupIds[e.groupIds.length - 1];
      const owner = live.find((x) => x.id !== e.id && x.groupIds?.includes(g) && SHAPES.includes(x.type) && ownText(x));
      if (owner) return ownText(owner);
    }
    return `(${e.type})`;
  };
  // a labelled shape, with its library kind when the label doesn't already say it
  const box = (e: El) => {
    const l = ownText(e);
    const k = e.customData?.kind ? KINDS[e.customData.kind] : "";
    return k && !l.toLowerCase().includes(k.toLowerCase()) ? `${l} (${k})` : l;
  };
  const boxes = live.filter((e) => SHAPES.includes(e.type) && ownText(e)).map(box);
  const arrows = live
    .filter((e) => e.type === "arrow" || e.type === "line")
    .map((a) => {
      const from = label(a.startBinding?.elementId) || "?";
      const to = label(a.endBinding?.elementId) || "?";
      const own = label(a.id) === "(arrow)" || label(a.id) === "(line)" ? "" : label(a.id);
      return from === "?" && to === "?" ? "" : `${from} → ${to}${own ? ` (${own})` : ""}`;
    })
    .filter(Boolean);
  // free text on the board (not inside a shape or on an arrow)
  const notes = live.filter((e) => e.type === "text" && !e.containerId).map((e) => clean(e.text || "")).filter(Boolean);
  const out: string[] = [];
  if (boxes.length) out.push(`Boxes: ${boxes.join(", ")}`);
  if (arrows.length) out.push(`Arrows: ${arrows.join("; ")}`);
  if (notes.length) out.push(`Notes on the board: ${notes.join(" | ")}`);
  return out.join("\n");
}

/** How many elements the learner drew themselves (the starter board's seeded title and sticky not counted). */
export function ownElementCount(raw: string | undefined | null): number {
  const s = parseSketch(raw);
  if (!s) return 0;
  const seeded = new Set(s.elements.filter((e) => e.customData?.seed).map((e) => e.id));
  return s.elements.filter((e) => !e.isDeleted && !seeded.has(e.id) && !(e.containerId && seeded.has(e.containerId))).length;
}
