/**
 * Notebook pages ("ink"): the shared contract for the handwritten notebook, capture (clip / snip) and the AI
 * actions on a page. Three parts are built against this file, so change it only together:
 *   - pages + ink engine + storage + side panel  (src/lib/learn/ink/client.ts, src/components/learn/ink/*)
 *   - capture: text clip and region snip          (src/components/learn/ink/capture/*)
 *   - AI on a page: convert, check, review cards  (src/app/api/learn/ai/notes/*, PageAiActions.tsx)
 *
 * Coordinates: a page is a fixed PAGE_W x PAGE_H sheet (A4 ratio); everything on it is in page units, so a page
 * looks the same on a phone, an iPad and a laptop (the view scales it). Points are quantised to 0.1 page unit.
 */

export const PAGE_W = 1000;
export const PAGE_H = 1414;

export type Paper = "blank" | "ruled" | "grid" | "dot" | "cornell" | "interview";
export const PAPERS: { id: Paper; label: string }[] = [
  { id: "ruled", label: "Ruled" },
  { id: "grid", label: "Grid" },
  { id: "dot", label: "Dot" },
  { id: "blank", label: "Blank" },
  { id: "cornell", label: "Cornell notes" },
  { id: "interview", label: "Design interview" },
];

export type InkTool = "pen" | "highlighter";

/**
 * One stroke. `pts` is flat [x, y, pressure, x, y, pressure, …]: x/y in page units ×10 (ints), pressure 0–100.
 * A pen stroke stores the pen's pressure (1–100); a finger or mouse stroke stores 0 on every point, meaning
 * "no real pressure: simulate it from speed" when drawn.
 */
export type Stroke = {
  id: string;
  tool: InkTool;
  /** a palette key (INK_COLOURS), never a raw colour, so strokes follow the theme */
  color: InkColor;
  /** base width in page units */
  size: number;
  pts: number[];
};

/** Ink palette keys. Rendered per theme by the ink engine; no purple. */
export type InkColor = "ink" | "signal" | "teal" | "grey" | "red";

/** Things placed on a page besides ink. All boxes are in page units. */
export type PageItem =
  | {
      id: string;
      kind: "clip";
      /** the clipped text (≤ 2,000 chars) */
      text: string;
      source: ItemSource;
      x: number;
      y: number;
      w: number;
    }
  | {
      id: string;
      kind: "snip";
      /** storage path in the private "notebook-snips" bucket: <user_id>/<page_id>/<id>.webp */
      path: string;
      /** pixel size of the stored image */
      pw: number;
      ph: number;
      source: ItemSource;
      x: number;
      y: number;
      w: number;
      h: number;
    }
  | {
      id: string;
      kind: "text";
      /** a typed note box (plain text, ≤ 2,000 chars) */
      text: string;
      x: number;
      y: number;
      w: number;
    };

/** Where a clip or snip came from: a link back to the exact place. */
export type ItemSource = { href: string; title: string; lessonKey?: string | null };

export type Notebook = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  pageCount?: number;
};

export type NotebookPage = {
  id: string;
  notebookId: string;
  title: string;
  paper: Paper;
  /** order within the notebook */
  position: number;
  /** the lesson this page was written beside, "<week>/<slug>" (optional) */
  lessonKey: string | null;
  strokes: Stroke[];
  items: PageItem[];
  /** the AI's typed version of the page (Markdown), once converted */
  convertedMd: string | null;
  convertedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

/** Limits (enforced by the database checks and the client). */
export const LIMITS = {
  /** serialised strokes + items per page */
  pageBytes: 1_500_000,
  notebooks: 50,
  pagesPerNotebook: 200,
  snipBytes: 2_000_000,
  /** snips per learner (all pages) */
  snipsPerUser: 500,
  clipChars: 2000,
  textChars: 2000,
  titleChars: 120,
};

/** The notebook clips and snips land in when no page is open ("Clips" inbox, created on first use). */
export const INBOX_TITLE = "Clips";

/** Window events of the notebook (see client.ts). */
export const INK_EVENTS = {
  /** open the Notebook panel beside a lesson; detail: { pageId?: string } */
  open: "hk:notebook-open",
  /** a clip / snip / text box was placed by appendItem; detail: { pageId: string; item: PageItem; newPage: boolean } */
  item: "hk:notebook-item",
} as const;
