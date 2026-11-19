/**
 * DSA Mastery's favicon set from its mark (src/lib/site/dsaMark.ts: black tile, three array cells, index pointer, teal cell):
 *   node scripts/brand/build-dsa-icons.mjs
 * Writes public/course-brand/dsa/{icon.svg, icon.png, apple-icon.png, favicon.ico, icons/icon-192|512|maskable-512.png}.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import sharp from "sharp";

const M = {
  cells: [{ x: 8, y: 14, w: 26, h: 28 }, { x: 66, y: 14, w: 26, h: 28 }],
  accent: { x: 37, y: 14, w: 26, h: 28 },
  pointer: { head: "50,50 68,70 32,70", stem: { x: 44, y: 68, w: 12, h: 20 } },
};
const K = { tile: "#000000", ink: "#F3F2EE", accent: "#2DD4BF" };
const rect = (r, fill) => `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="${fill}"/>`;
const shapes = [...M.cells, M.pointer.stem].map((r) => rect(r, K.ink)).join("") + `<polygon points="${M.pointer.head}" fill="${K.ink}"/>` + rect(M.accent, K.accent);
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" shape-rendering="crispEdges"><rect width="100" height="100" fill="${K.tile}"/>${shapes}</svg>\n`;
// maskable: the mark inside the 80% safe zone
const maskable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="${K.tile}"/><g transform="translate(17 17) scale(0.66)">${shapes}</g></svg>`;

const out = resolve(import.meta.dirname, "../../public/course-brand/dsa");
mkdirSync(`${out}/icons`, { recursive: true });
const png = (s, n) => sharp(Buffer.from(s), { density: 384 }).resize(n, n).png().toBuffer();
writeFileSync(`${out}/icon.svg`, svg);
writeFileSync(`${out}/icon.png`, await png(svg, 512));
writeFileSync(`${out}/apple-icon.png`, await png(svg, 180));
writeFileSync(`${out}/icons/icon-192.png`, await png(svg, 192));
writeFileSync(`${out}/icons/icon-512.png`, await png(svg, 512));
writeFileSync(`${out}/icons/icon-maskable-512.png`, await png(maskable, 512));

// favicon.ico: 16, 32 and 48 px PNG frames
const sizes = [16, 32, 48];
const frames = await Promise.all(sizes.map((n) => png(svg, n)));
const head = Buffer.alloc(6);
head.writeUInt16LE(1, 2);
head.writeUInt16LE(sizes.length, 4);
let offset = 6 + 16 * sizes.length;
const dir = Buffer.concat(
  frames.map((f, i) => {
    const e = Buffer.alloc(16);
    e[0] = sizes[i];
    e[1] = sizes[i];
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(f.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += f.length;
    return e;
  }),
);
writeFileSync(`${out}/favicon.ico`, Buffer.concat([head, dir, ...frames]));
console.log("ok");
