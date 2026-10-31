/**
 * The mock interview whiteboard is an Excalidraw drawing, saved with the run as JSON (`run.sketch`).
 * Feedback prompts and the AI scorecard can't see a drawing, so this turns it into text: the boxes
 * by their labels, and every arrow as "from → to" (with its own label), using the arrow bindings
 * Excalidraw keeps when an arrow is drawn from one shape to another. An arrow drawn up to a shape but not
 * attached to it (no binding, a common slip with a pen or a fast drag) counts as connected to the nearest
 * shape within ARROW_SNAP canvas units of its end (unboundEnd). No Excalidraw import: plain data.
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
  /** geometry, in canvas units: the box (before rotation), its rotation in radians, and a line's or an arrow's
   *  points relative to (x, y) */
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  angle?: number;
  points?: [number, number][];
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

/** How far (canvas units) an unattached arrow end may stop short of a shape and still count as pointing at it. */
export const ARROW_SNAP = 32;
/** what an unattached arrow end can point at: the shapes, a block's icon, and free text on the board */
const TARGETS = [...SHAPES, "image", "text"];

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/** A point turned by `angle` radians about (cx, cy). */
function rotate(px: number, py: number, cx: number, cy: number, angle: number): [number, number] {
  if (!angle) return [px, py];
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [cx + (px - cx) * c - (py - cy) * s, cy + (px - cx) * s + (py - cy) * c];
}

/** An arrow's first and last point on the canvas (its points are relative to x, y; a rotated arrow turns about its centre). */
function arrowEnds(a: El): [[number, number], [number, number]] | null {
  const pts = Array.isArray(a.points) ? a.points.filter((p) => Array.isArray(p) && p.length >= 2) : [];
  if (pts.length < 2) return null;
  const x = num(a.x);
  const y = num(a.y);
  const cx = x + num(a.width) / 2;
  const cy = y + num(a.height) / 2;
  const at = (p: [number, number]) => rotate(x + num(p[0]), y + num(p[1]), cx, cy, num(a.angle));
  return [at(pts[0]), at(pts[pts.length - 1])];
}

/** Distance from a point to a shape's box (0 inside it), in the shape's own frame when it is rotated. */
function distanceTo(e: El, px: number, py: number): number {
  const x = num(e.x);
  const y = num(e.y);
  const w = Math.abs(num(e.width));
  const h = Math.abs(num(e.height));
  const [qx, qy] = rotate(px, py, x + w / 2, y + h / 2, -num(e.angle));
  const dx = Math.max(x - qx, 0, qx - (x + w));
  const dy = Math.max(y - qy, 0, qy - (y + h));
  return Math.hypot(dx, dy);
}

/**
 * The shape an unattached arrow end points at: the nearest target whose box is within ARROW_SNAP of the point
 * (the smallest one when the point is inside several, so a box drawn inside a region wins over the region), or
 * undefined. `skip`: the element the arrow's other end already points at, so an arrow never joins a shape to itself.
 */
function unboundEnd(point: [number, number], targets: El[], skip?: (e: El) => boolean): El | undefined {
  let best: { e: El; d: number; area: number } | undefined;
  for (const e of targets) {
    if (skip?.(e)) continue;
    const d = distanceTo(e, point[0], point[1]);
    if (d > ARROW_SNAP) continue;
    const area = Math.abs(num(e.width) * num(e.height));
    if (!best || d < best.d - 0.5 || (Math.abs(d - best.d) <= 0.5 && area < best.area)) best = { e, d, area };
  }
  return best?.e;
}

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
  // what an unattached end can point at: shapes, a block's icon and free text (not the text inside a shape or on an
  // arrow: its container is the target)
  const targets = live.filter((e) => TARGETS.includes(e.type) && !(e.type === "text" && e.containerId));
  // a block's parts (its icon, a lid) are the same box as the block: an arrow never joins a box to itself
  const groupOf = (e: El) => (e.groupIds?.length ? e.groupIds[e.groupIds.length - 1] : "");
  const sameBox = (a: El | undefined, b: El) => {
    if (!a) return false;
    if (a.id === b.id || (groupOf(a) && groupOf(a) === groupOf(b))) return true;
    const l = label(a.id);
    return !/^\(.*\)$/.test(l) && l === label(b.id);
  };
  const arrows = live
    .filter((e) => e.type === "arrow" || e.type === "line")
    .map((a) => {
      let start = a.startBinding?.elementId ? byId.get(a.startBinding.elementId) : undefined;
      let end = a.endBinding?.elementId ? byId.get(a.endBinding.elementId) : undefined;
      // an end that isn't attached: the shape it was drawn up to, if one is close enough (bound ends stay as they are).
      // Not for a line inside a group: that is a library block's own drawing (a cylinder's side, a queue's slots).
      const ends = (!start || !end) && (a.type === "arrow" || !a.groupIds?.length) && arrowEnds(a);
      if (ends) {
        if (!start) start = unboundEnd(ends[0], targets, (e) => sameBox(end, e));
        if (!end) end = unboundEnd(ends[1], targets, (e) => sameBox(start, e));
      }
      const from = label(start?.id) || "?";
      const to = label(end?.id) || "?";
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
