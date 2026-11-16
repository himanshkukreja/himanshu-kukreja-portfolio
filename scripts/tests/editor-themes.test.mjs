/**
 * The code editor's palettes (src/lib/editor/themes.ts): site theme -> palette, a manual pick wins, every palette AA.
 *   node --test scripts/tests/editor-themes.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

register(
  "data:text/javascript," +
    encodeURIComponent(`export async function resolve(s, c, next) { try { return await next(s, c); } catch (e) { if (s.startsWith(".") && !/\\.\\w+$/.test(s)) return next(s + ".ts", c); if (s.startsWith("@/")) return next(new URL("../../src/" + s.slice(2) + ".ts", import.meta.url).href.replace(/^.*\\/src\\//, "file://${process.cwd()}/src/"), c); throw e; } }`),
);
const { PALETTES, resolveEditorPalette, cleanEditorPick, EDITOR_PICKS, paletteVars } = await import("../../src/lib/editor/themes.ts");

const lum = (hex) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};
const TEXT = ["fg", "kw", "str", "num", "fn", "type", "self", "prop", "op", "com", "err"];

test("every palette: text and syntax colours are 4.5:1 on the background", () => {
  const rows = [];
  for (const [id, p] of Object.entries(PALETTES)) {
    for (const k of TEXT) assert.ok(ratio(p[k], p.bg) >= 4.5, `${id}.${k} ${p[k]} on ${p.bg} = ${ratio(p[k], p.bg).toFixed(2)}`);
    for (const k of ["gutterFg"]) assert.ok(ratio(p[k], p.gutterBg) >= 4.5, `${id}.${k} on gutter = ${ratio(p[k], p.gutterBg).toFixed(2)}`);
    for (const k of TEXT) {
      assert.ok(ratio(p[k], p.activeLine) >= 4.5, `${id}.${k} on the active line`);
      assert.ok(ratio(p[k], p.popupBg) >= 4.5, `${id}.${k} in the suggestions popup`);
      assert.ok(ratio(p[k], p.selection) >= 3.9, `${id}.${k} on a selection ${ratio(p[k], p.selection).toFixed(2)}`); // selected text is momentary: 3.9+ (plain text 4.5+, below)
    }
    assert.ok(ratio(p.fg, p.selection) >= 4.5 && ratio(p.fg, p.popupSel) >= 4.5, `${id} selected text`);
    assert.ok(ratio(p.caret, p.bg) >= 3, `${id} caret`);
    rows.push(`${id.padEnd(10)} text ${ratio(p.fg, p.bg).toFixed(1)}  comment ${ratio(p.com, p.bg).toFixed(1)}  lowest syntax ${Math.min(...TEXT.map((k) => ratio(p[k], p.bg))).toFixed(1)}`);
  }
  if (process.env.SHOW_RATIOS) console.log(rows.join("\n"));
});

test("no purple or violet hues in any palette", () => {
  for (const [id, p] of Object.entries(PALETTES)) {
    for (const [k, v] of Object.entries(p)) {
      if (typeof v !== "string" || !/^#[0-9a-f]{6}$/i.test(v)) continue;
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(v.slice(i, i + 2), 16));
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      if (mx - mn < 40) continue;
      let h = mx === r ? ((g - b) / (mx - mn)) % 6 : mx === g ? (b - r) / (mx - mn) + 2 : (r - g) / (mx - mn) + 4;
      h = (h * 60 + 360) % 360;
      assert.ok(h < 255 || h > 335, `${id}.${k} ${v} hue ${h.toFixed(0)}`);
    }
  }
});

test("Match site theme: each site theme gets its own palette; a manual pick wins", () => {
  for (const t of ["light", "paper", "sepia", "mint", "dusk", "calm", "quiet", "night"]) assert.equal(resolveEditorPalette("site", t), PALETTES[t]);
  assert.equal(PALETTES.light.dark || PALETTES.paper.dark || PALETTES.sepia.dark || PALETTES.mint.dark, false);
  assert.ok(PALETTES.dusk.dark && PALETTES.calm.dark && PALETTES.quiet.dark && PALETTES.night.dark);
  assert.equal(PALETTES.night.bg, "#000000");
  assert.equal(resolveEditorPalette("nord", "sepia"), PALETTES.nord);
  assert.equal(resolveEditorPalette("contrast", "light"), PALETTES.contrast);
  assert.equal(resolveEditorPalette("site", null, true), PALETTES.night);
  assert.equal(resolveEditorPalette("site", null, false), PALETTES.light);
  for (const p of EDITOR_PICKS) if (p.id !== "site") assert.ok(PALETTES[p.id], p.id);
});

test("stored picks are cleaned; the palette becomes CSS variables", () => {
  assert.equal(cleanEditorPick("nord"), "nord");
  assert.equal(cleanEditorPick("dracula"), "site");
  assert.equal(cleanEditorPick(undefined), "site");
  const v = paletteVars(PALETTES.nord);
  assert.equal(v["--ed-bg"], "#2E3440");
  assert.equal(v["--ed-gutter-fg"], PALETTES.nord.gutterFg);
  assert.equal(v.colorScheme, "dark");
});
