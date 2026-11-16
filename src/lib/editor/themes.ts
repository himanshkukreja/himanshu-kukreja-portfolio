/**
 * Code-editor palettes (the editable CodeMirror editor: DSA problem room and labs, code labs, mock interviews).
 *
 * - "site" (the default, "Match site theme"): the editor takes the palette of the site theme in force
 *   (Light, Paper, Sepia, Mint = light palettes tuned to each page colour; Dusk and Calm = warm dark;
 *   Quiet = graphite; Night = true black).
 * - A manual pick (EditorPick) wins over the site theme. It is stored with the reading settings
 *   (src/lib/learn/readingModes.ts, `editor`: localStorage hk.reader.look + the account sync), so it follows the learner.
 * - Every palette: text and each syntax colour at 4.5:1 or more on the background, selected text too
 *   (scripts/tests/editor-themes.test.mjs checks it). No purple.
 * Static code blocks (Shiki, course-content.css) use the site tokens and are unaffected.
 */
import type { ThemeId } from "@/lib/learn/readingModes";

export type EditorPick = "site" | "light" | "solarized" | "night" | "warm" | "nord" | "gruvbox" | "contrast";

export type EditorPalette = {
  dark: boolean;
  bg: string;
  fg: string;
  gutterBg: string;
  gutterFg: string;
  gutterFgActive: string;
  gutterLine: string;
  activeLine: string;
  /** opaque: text on a selection must stay readable */
  selection: string;
  caret: string;
  /** the accent: matched text in suggestions, focus */
  accent: string;
  kw: string;
  str: string;
  num: string;
  fn: string;
  type: string;
  self: string;
  prop: string;
  op: string;
  com: string;
  err: string;
  warn: string;
  bracket: string;
  bracketLine: string;
  search: string;
  searchActive: string;
  popupBg: string;
  popupLine: string;
  popupSel: string;
};

export const EDITOR_PICKS: { id: EditorPick; name: string; hint: string }[] = [
  { id: "site", name: "Match site theme", hint: "Follows the page" },
  { id: "light", name: "Light", hint: "Clean white" },
  { id: "solarized", name: "Solarized light", hint: "Cream, easy contrast" },
  { id: "night", name: "Night", hint: "True black" },
  { id: "warm", name: "Warm dark", hint: "Soft brown-black" },
  { id: "nord", name: "Nord", hint: "Cool slate blue" },
  { id: "gruvbox", name: "Gruvbox", hint: "Retro, warm dark" },
  { id: "contrast", name: "High contrast", hint: "Black, bold colours" },
];

const PICKS = new Set<string>(EDITOR_PICKS.map((p) => p.id));
export const cleanEditorPick = (v: unknown): EditorPick => (typeof v === "string" && PICKS.has(v) ? (v as EditorPick) : "site");

/** a palette from its core colours; the rest (selection, bracket, search ...) derives from the accent so every palette stays consistent */
const mix = (a: string, b: string, t: number) => "#" + [1, 3, 5].map((i) => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - t) + parseInt(b.slice(i, i + 2), 16) * t).toString(16).padStart(2, "0")).join("").toUpperCase();

function make(c: Omit<EditorPalette, "activeLine" | "selection" | "gutterFgActive" | "gutterLine" | "popupLine" | "bracket" | "bracketLine" | "search" | "searchActive" | "popupSel" | "popupBg"> & Partial<EditorPalette>): EditorPalette {
  const d = c.dark;
  return {
    gutterFgActive: c.fg,
    gutterLine: d ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)",
    popupLine: d ? "rgba(255,255,255,0.22)" : "rgba(0,0,0,0.22)",
    bracket: d ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.10)",
    bracketLine: c.accent,
    search: d ? "#5B4A12" : "#FFE9A0",
    searchActive: d ? "#7A5F10" : "#FFC94D",
    activeLine: mix(c.bg, c.fg, d ? 0.05 : 0.04),
    selection: mix(c.bg, c.accent, d ? 0.17 : 0.12),
    popupBg: c.bg,
    popupSel: mix(c.bg, c.accent, d ? 0.18 : 0.11),
    ...c,
  };
}

export const PALETTES: Record<Exclude<EditorPick, "site">, EditorPalette> & Record<ThemeId, EditorPalette> = {
  // ---- site themes (tuned to each page colour; syntax colours are the site's own AA code tokens) ----
  light: make({
    dark: false, bg: "#FBFAF7", fg: "#24292E", gutterBg: "#F1EFE9", gutterFg: "#6B6860", caret: "#B93D0B", accent: "#B93D0B",
    kw: "#CF222E", str: "#1A7F37", num: "#A94B09", fn: "#0550AE", type: "#0F766E", self: "#B93D0B", prop: "#24292E", op: "#55524B", com: "#5A636D", err: "#CF222E", warn: "#9A6700",
  }),
  paper: make({
    dark: false, bg: "#FBF8F1", fg: "#222018", gutterBg: "#F0EBDF", gutterFg: "#6A665C", caret: "#A8460F", accent: "#A8460F",
    kw: "#B5301F", str: "#2E6B1F", num: "#A9480E", fn: "#1E568C", type: "#1C6B60", self: "#A8460F", prop: "#222018", op: "#55524A", com: "#6A665C", err: "#B5301F", warn: "#8A5A00",
  }),
  sepia: make({
    dark: false, bg: "#F8F1DF", fg: "#3B2F20", gutterBg: "#EDE3C8", gutterFg: "#6E6250", caret: "#9A4A12", accent: "#9A4A12",
    kw: "#A8321F", str: "#3E6B1F", num: "#9A4A12", fn: "#28547C", type: "#285B50", self: "#9A4A12", prop: "#3B2F20", op: "#5C5040", com: "#6E6250", err: "#A8321F", warn: "#80540A",
  }),
  mint: make({
    dark: false, bg: "#EDF3E8", fg: "#23301F", gutterBg: "#DEE8D6", gutterFg: "#556050", caret: "#94420E", accent: "#94420E",
    kw: "#A62F22", str: "#2D641E", num: "#94420E", fn: "#1E5279", type: "#1B6458", self: "#94420E", prop: "#23301F", op: "#43503E", com: "#5A6654", err: "#A62F22", warn: "#7A5200",
  }),
  dusk: make({
    dark: true, bg: "#1C1916", fg: "#D9CFBF", gutterBg: "#23201C", gutterFg: "#9C9282", gutterFgActive: "#D9CFBF", caret: "#E0965A", accent: "#E0965A",
    kw: "#E8907F", str: "#A3C98A", num: "#E0A26E", fn: "#9EC0D9", type: "#90C9B6", self: "#E0965A", prop: "#D9CFBF", op: "#B8AE9E", com: "#9C9282", err: "#F0988A", warn: "#E9B95C",
  }),
  calm: make({
    dark: true, bg: "#231E18", fg: "#EADCC5", gutterBg: "#29231C", gutterFg: "#AE9C84", gutterFgActive: "#EADCC5", caret: "#EEA46C", accent: "#EEA46C",
    kw: "#EE9A85", str: "#BDC99A", num: "#E9AE74", fn: "#B2C6D0", type: "#9EC6AE", self: "#EEA46C", prop: "#EADCC5", op: "#C5B49B", com: "#AE9C84", err: "#F4A092", warn: "#E9B95C",
  }),
  quiet: make({
    dark: true, bg: "#232325", fg: "#E2E2E5", gutterBg: "#2C2C2E", gutterFg: "#A3A3A9", gutterFgActive: "#E2E2E5", caret: "#FF9259", accent: "#FF9259",
    kw: "#F49A8E", str: "#A3D79D", num: "#F3AE7A", fn: "#9EC6EE", type: "#7FD0C2", self: "#FF9259", prop: "#E2E2E5", op: "#B5B5BA", com: "#A3A3A9", err: "#FF9E92", warn: "#E9B95C",
  }),
  night: make({
    dark: true, bg: "#000000", fg: "#F3F2EE", gutterBg: "#0B0B0C", gutterFg: "#9A9AA0", gutterFgActive: "#F3F2EE", caret: "#FF6B2B", accent: "#FF6B2B",
    kw: "#F97583", str: "#85E89D", num: "#FFAB70", fn: "#79B8FF", type: "#5EC9BD", self: "#FF8A4C", prop: "#F3F2EE", op: "#B5B5BA", com: "#8B949E", err: "#FF8A8D", warn: "#F5B83D",
  }),
  // ---- manual picks ----
  // "light" and "night" above double as the manual Light and Night
  solarized: make({
    dark: false, bg: "#FDF6E3", fg: "#3E5259", gutterBg: "#EEE8D5", gutterFg: "#516569", caret: "#B8400F", accent: "#B8400F",
    kw: "#5E6B00", str: "#1B6F68", num: "#B03E0C", fn: "#1B63A0", type: "#8A5A00", self: "#B03E0C", prop: "#3E5259", op: "#4A5F65", com: "#566C72", err: "#C0261F", warn: "#8A5A00",
  }),
  warm: make({
    dark: true, bg: "#1F1B17", fg: "#E4D8C6", gutterBg: "#26211C", gutterFg: "#A09580", gutterFgActive: "#E4D8C6", caret: "#F0A060", accent: "#F0A060",
    kw: "#EE9582", str: "#B0CC92", num: "#E8AA72", fn: "#A3C3DB", type: "#93CDB8", self: "#F0A060", prop: "#E4D8C6", op: "#BDB19E", com: "#A09580", err: "#F4A092", warn: "#E9B95C",
  }),
  nord: make({
    dark: true, bg: "#2E3440", fg: "#D8DEE9", gutterBg: "#323946", gutterFg: "#A3AEC4", gutterFgActive: "#E5E9F0", caret: "#88C0D0", accent: "#88C0D0", selection: "#3E4859",
    kw: "#94B4D2", str: "#A3BE8C", num: "#DA9A82", fn: "#88C0D0", type: "#8FBCBB", self: "#EBCB8B", prop: "#D8DEE9", op: "#B2BCCF", com: "#A8B3C8", err: "#EE9AA1", warn: "#EBCB8B",
  }),
  gruvbox: make({
    dark: true, bg: "#282828", fg: "#EBDBB2", gutterBg: "#32302F", gutterFg: "#A89984", gutterFgActive: "#EBDBB2", caret: "#FABD2F", accent: "#FABD2F", selection: "#45403A",
    kw: "#FF7A66", str: "#B8BB26", num: "#FE8A2E", fn: "#94B6A9", type: "#8EC07C", self: "#FABD2F", prop: "#EBDBB2", op: "#BDAE93", com: "#B3A38E", err: "#FF8470", warn: "#FABD2F",
  }),
  contrast: make({
    dark: true, bg: "#000000", fg: "#FFFFFF", gutterBg: "#0A0A0A", gutterFg: "#C9D1D9", gutterFgActive: "#FFFFFF", caret: "#FFD866", accent: "#FFD866",
    kw: "#FF9580", str: "#7EE787", num: "#FFD866", fn: "#79C0FF", type: "#56D4DD", self: "#FFA657", prop: "#FFFFFF", op: "#E6EDF3", com: "#B8C0CC", err: "#FF7B72", warn: "#FFD866",
    search: "#6B5600", searchActive: "#8F7300", popupLine: "#FFFFFF", bracketLine: "#FFFFFF",
  }),
};

/**
 * The palette in force: a manual pick wins; "site" takes the palette of the site theme (a null theme, a page off the
 * course host, stands for Light or Night from the site's light / dark switch).
 */
export function resolveEditorPalette(pick: EditorPick, theme: ThemeId | null, siteDark = false): EditorPalette {
  if (pick !== "site") return PALETTES[pick];
  return PALETTES[theme ?? (siteDark ? "night" : "light")];
}

/** the palette as CSS custom properties (set on the editor's host element) */
export function paletteVars(p: EditorPalette): Record<string, string> {
  const v: Record<string, string> = { colorScheme: p.dark ? "dark" : "light" };
  for (const [k, val] of Object.entries(p)) if (typeof val === "string") v[`--ed-${k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}`] = val;
  return v;
}
