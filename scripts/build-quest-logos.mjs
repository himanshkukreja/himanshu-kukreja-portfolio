// Side-quest logos, vendored at build time so pages never load a whole icon set or hotlink a logo:
//
//   src/components/learn/sidequest/logos.json  full-colour logos from SVG Logos by Gil Barbara
//     (github.com/gilbarbara/logos, CC0), via its Iconify package @iconify-json/logos (pinned in
//     package-lock), keyed by the logo's file name ("google-gmail" = logos/google-gmail.svg)
//   src/components/learn/sidequest/marks.json  single-colour marks from Simple Icons
//     (@iconify-json/simple-icons, CC0), keyed by Simple Icons slug, drawn in currentColor
//
// The marks stay their owners' trademarks. brands.ts says which quest uses which logo and how its tile
// is coloured. Every body is sanitised to an allowlist of shape and paint elements and attributes (no
// scripts, event handlers, styles, external refs, images or metadata; the Iconify bodies are already
// SVGO-minified, so path data is kept as it is), and
// every id and #ref is rewritten to start with the token __Q__, which QuestEmblem replaces with an id
// unique to each tile it draws (the side-quest grid draws many tiles on one page).
// usage: node scripts/build-quest-logos.mjs
import fs from "fs";
import path from "path";

const root = process.cwd();
const read = (p) => JSON.parse(fs.readFileSync(path.join(root, p), "utf8"));
const GB = read("node_modules/@iconify-json/logos/icons.json");
const SI = read("node_modules/@iconify-json/simple-icons/icons.json");

/** Gil Barbara logos, with the edits a tile needs (a part dropped, a colour swapped, a crop). */
const LOGOS = {
  "whatsapp-icon": {},
  "google-icon": {},
  visa: {},
  // the interlocking circles without the wordmark under them
  mastercard: { drop: (a) => !a.fill, viewBox: [0, 0, 256, 158.06] },
  "netflix-icon": {},
  "spotify-icon": {},
  "aws-s3": {},
  "youtube-icon": {},
  "google-maps": {},
  // the white mark only: the tile is the icon's blue square
  "zoom-icon": { drop: (a, tag) => tag === "defs" || (a.fill ?? "").startsWith("url(") },
  "airbnb-icon": {},
  "google-gmail": {},
  // the note is white on the app icon's black (the file draws it black for light backgrounds)
  "tiktok-icon": { recolor: { "#000": "#fff" }, unfilled: "#fff" },
  "slack-icon": {},
};

/**
 * Official logos no open set carries, vendored as files in scripts/quest-logos/ with their source:
 *   blinkit.svg  Wikimedia Commons, File:Blinkit-yellow-rounded.svg (public domain, trademarked; the app
 *                icon): the yellow square is dropped (the tile is that yellow) and the box cropped to the wordmark
 *   dream11.svg  Wikimedia Commons, File:Dream11 Logo.svg (public domain, trademarked): cropped to the trophy
 *                (the app icon's mark, without the wordmark) and drawn white on the brand's red tile
 *   truecaller.svg  Wikimedia Commons, File:Truecaller Logo.svg (public domain as a text logo, trademarked):
 *                the wordmark, drawn white on the brand's blue tile
 *   upi.svg      Wikimedia Commons, File:UPI-Logo-vector.svg (public domain, trademarked): cropped above the
 *                "Unified Payments Interface" line
 *   kite.svg     Wikimedia Commons, File:Zerodha Kite logo.svg (public domain, trademarked): the Kite mark
 *   ondc.svg     ondc.org/public/assets/ondc-logo.svg (ONDC's own file): the wordmark; its subtitle is text,
 *                which the sanitiser drops
 *   nse.svg      nseindia.com/assets/images/NSE_Logo.svg (NSE's own file): the full lockup
 *   irctc.svg    English Wikipedia, File:IRCTC Logo.svg (IRCTC's logo, used there as fair use): the full lockup
 *   amazon.svg   Wikimedia Commons, File:Amazon 2024.svg (public domain as a text logo, trademarked): the
 *                wordmark and smile Amazon has used since 2024
 */
const LOCAL = {
  blinkit: { file: "scripts/quest-logos/blinkit.svg", drop: (a, tag) => tag === "rect", viewBox: [303, 1368, 2894, 764] },
  // the trophy is red in the file: white on the red tile
  dream11: { file: "scripts/quest-logos/dream11.svg", recolor: { "#e00000": "#fff" }, unfilled: "#fff", viewBox: [0, 0, 172, 156.6] },
  // the wordmark is blue in the file: white on the blue tile
  truecaller: { file: "scripts/quest-logos/truecaller.svg", recolor: { "#0a6cff": "#fff" }, unfilled: "#fff", viewBox: [43.53, 45.4, 312.94, 59.2] },
  upi: { file: "scripts/quest-logos/upi.svg", viewBox: [0, 0, 130.54, 38] },
  kite: { file: "scripts/quest-logos/kite.svg", viewBox: [0, 0, 90, 60] },
  ondc: { file: "scripts/quest-logos/ondc.svg", viewBox: [30, 10, 790, 262] },
  nse: { file: "scripts/quest-logos/nse.svg", viewBox: [0, 0, 127.039, 43.1] },
  irctc: { file: "scripts/quest-logos/irctc.svg", viewBox: [0, 0, 336, 419] },
  amazon: { file: "scripts/quest-logos/amazon.svg", viewBox: [0, 0, 398.61, 133.49] },
};

/** Simple Icons marks, drawn in one colour (the brand's own arrangement: white on its colour, etc.). */
const MARKS = ["uber", "x", "openai", "figma", "bookmyshow", "swiggy", "razorpay", "googledocs", "instagram", "flipkart", "github", "discord"];

const ELEMENTS = new Set(["g", "path", "rect", "circle", "ellipse", "polygon", "polyline", "line", "defs", "linearGradient", "radialGradient", "stop", "clipPath", "mask", "use"]);
const SHAPES = new Set(["path", "rect", "circle", "ellipse", "polygon"]);
const ATTRS = new Set([
  "d", "points", "x", "y", "width", "height", "cx", "cy", "r", "rx", "ry", "fx", "fy", "x1", "y1", "x2", "y2",
  "fill", "fill-rule", "clip-rule", "fill-opacity", "opacity", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "stroke-miterlimit", "stroke-opacity",
  "transform", "id", "offset", "stop-color", "stop-opacity", "gradientUnits", "gradientTransform", "spreadMethod", "clip-path", "mask", "maskUnits", "clipPathUnits", "href",
]);

const esc = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

/** Parse an SVG fragment into { tag, attrs, children } nodes (the sources are machine-written XML). */
function parse(src) {
  const top = { children: [] };
  const stack = [top];
  const re = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[[\s\S]*?\]\]>|<\/([\w:-]+)\s*>|<([\w:-]+)((?:\s+[\w:-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|[^<]+/g;
  for (const m of src.matchAll(re)) {
    if (m[1]) {
      if (stack.length > 1) stack.pop();
    } else if (m[2]) {
      const attrs = {};
      for (const a of m[3].matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[a[1]] = a[2] ?? a[3];
      const node = { tag: m[2], attrs, children: [] };
      stack[stack.length - 1].children.push(node);
      if (!m[4]) stack.push(node);
    }
  }
  return top.children;
}

function serialise(nodes, edit, inDefs = false) {
  let out = "";
  for (const n of nodes) {
    if (!ELEMENTS.has(n.tag)) continue; // title, desc, metadata, script, style, image, foreignObject, text…
    const a = {};
    for (const [k, v0] of Object.entries(n.attrs)) {
      if (!ATTRS.has(k)) continue; // on*, style, xlink:*, class…
      let v = v0.trim();
      if (k === "href") {
        if (!["use", "linearGradient", "radialGradient"].includes(n.tag) || !v.startsWith("#")) continue;
        v = `#__Q__${v.slice(1)}`;
      } else if (k === "id") v = `__Q__${v}`;
      else if (/url\(/i.test(v)) {
        const ref = v.match(/^url\(\s*#([\w-]+)\s*\)$/);
        if (!ref) continue; // only references inside the logo
        v = `url(#__Q__${ref[1]})`;
      }
      if (k === "fill" || k === "stroke" || k === "stop-color") {
        if (v.startsWith("#")) v = v.toLowerCase().replace(/^#([0-9a-f])\1([0-9a-f])\2([0-9a-f])\3$/, "#$1$2$3");
        v = edit.recolor?.[v] ?? v;
      }
      a[k] = v;
    }
    if (n.tag === "use" && !a.href) continue;
    // a shape with no fill paints black; some edits need that black to be another colour
    if (edit.unfilled && !a.fill && !inDefs && SHAPES.has(n.tag)) a.fill = edit.unfilled;
    if (edit.drop?.(a, n.tag)) continue;
    const attrs = Object.entries(a).map(([k, v]) => ` ${k}="${esc(v)}"`).join("");
    const inner = serialise(n.children, edit, inDefs || n.tag === "defs");
    out += inner ? `<${n.tag}${attrs}>${inner}</${n.tag}>` : `<${n.tag}${attrs}/>`;
  }
  return out;
}

const clean = (body, edit = {}) => serialise(parse(body), edit);

/**
 * Vendored logo files (design-tool exports) keep their colours in <style> class rules and style=""
 * attributes, which the sanitiser drops. Copy those paint properties onto each element as attributes
 * first (an attribute already on the element wins), and turn gradient xlink:href into href.
 */
const PAINT = ["fill", "fill-rule", "fill-opacity", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "stroke-miterlimit", "stroke-opacity", "opacity", "clip-rule", "stop-color", "stop-opacity"];
function inlinePaint(src) {
  const rules = {};
  for (const css of src.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g))
    for (const r of css[1].matchAll(/((?:\.[\w-]+\s*,?\s*)+)\{([^}]*)\}/g))
      for (const cls of r[1].split(",").map((c) => c.trim().replace(/^\./, "")).filter(Boolean)) rules[cls] = { ...rules[cls], ...decl(r[2]) };
  return src.replace(/xlink:href=/g, "href=").replace(/<([\w:-]+)(\s[^<>]*?)?(\/?)>/g, (tag, name, attrs = "", end) => {
    if (!attrs) return tag;
    const props = {};
    const cls = attrs.match(/\sclass\s*=\s*"([^"]*)"/);
    if (cls) for (const c of cls[1].split(/\s+/)) Object.assign(props, rules[c] || {});
    const st = attrs.match(/\sstyle\s*=\s*"([^"]*)"/);
    if (st) Object.assign(props, decl(st[1]));
    const add = PAINT.filter((k) => props[k] !== undefined && !new RegExp(`\\s${k}\\s*=`).test(attrs)).map((k) => ` ${k}="${props[k]}"`).join("");
    return `<${name}${attrs}${add}${end}>`;
  });
}
function decl(text) {
  const o = {};
  for (const d of text.split(";")) {
    const i = d.indexOf(":");
    if (i > 0) o[d.slice(0, i).trim()] = d.slice(i + 1).trim();
  }
  return o;
}

const logos = {};
for (const [name, edit] of Object.entries(LOGOS)) {
  const icon = GB.icons[name];
  if (!icon) throw new Error(`no Gil Barbara logo "${name}"`);
  const body = clean(icon.body, edit);
  logos[name] = { body, viewBox: edit.viewBox ?? [icon.left ?? 0, icon.top ?? 0, icon.width ?? GB.width, icon.height ?? GB.height] };
}

for (const [name, edit] of Object.entries(LOCAL)) {
  const src = fs.readFileSync(path.join(root, edit.file), "utf8");
  const inner = inlinePaint(src).replace(/^[\s\S]*?<svg\b[^>]*>/, "").replace(/<\/svg>\s*$/, "");
  logos[name] = { body: clean(inner, edit), viewBox: edit.viewBox };
}

const marks = {};
for (const name of MARKS) {
  const icon = SI.icons[name];
  if (!icon) throw new Error(`no Simple Icons mark "${name}"`);
  marks[name] = { body: clean(icon.body), viewBox: [0, 0, icon.width ?? SI.width ?? 24, icon.height ?? SI.height ?? 24] };
}

const dir = path.join(root, "src/components/learn/sidequest");
fs.writeFileSync(path.join(dir, "logos.json"), JSON.stringify(logos) + "\n");
fs.writeFileSync(path.join(dir, "marks.json"), JSON.stringify(marks) + "\n");
const size = (o) => Object.entries(o).map(([k, v]) => `${k} ${v.body.length}`).join(", ");
console.log(`logos ${Object.keys(logos).length}: ${size(logos)}\nmarks ${Object.keys(marks).length}: ${size(marks)}`);
