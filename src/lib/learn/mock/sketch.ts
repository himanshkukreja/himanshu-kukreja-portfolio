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
};

export type Sketch = { elements: El[] };

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

/** "Boxes: …" and "Arrows: A → B" lines; empty when nothing meaningful is drawn. */
export function sketchSummary(raw: string | undefined | null): string {
  const s = parseSketch(raw);
  if (!s) return "";
  const live = s.elements.filter((e) => !e.isDeleted);
  const byId = new Map(live.map((e) => [e.id, e]));
  // a shape's label is the text element bound to it
  const label = (id: string | undefined | null): string => {
    if (!id) return "";
    const e = byId.get(id);
    if (!e) return "";
    if (e.type === "text") return clean(e.text || "");
    const t = (e.boundElements || []).map((b) => byId.get(b.id)).find((x) => x?.type === "text");
    return t ? clean(t.text || "") : `(${e.type})`;
  };
  const shapes = live.filter((e) => ["rectangle", "ellipse", "diamond"].includes(e.type));
  const boxes = shapes.map((e) => label(e.id)).filter((t) => t && !t.startsWith("("));
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
