/**
 * Shared pieces for the Open Graph / Twitter cards (next/og ImageResponse, Node runtime).
 * Brand: true black, signal orange, Bricolage display, Geist body, Geist Mono labels, square corners.
 * Fonts are static TTF instances checked in next to this file (satori can't read woff2 or variable fonts).
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ReactNode } from "react";

export const OG_SIZE = { width: 1200, height: 630 };

export const C = {
  bg: "#000000",
  surface: "#0A0A0B",
  surface2: "#141416",
  line: "#26262A",
  lineStrong: "#3A3A40",
  dot: "#26262B",
  fg: "#F3F2EE",
  fg2: "#C9C8C4",
  fg3: "#A3A3A8",
  fg4: "#7E7E85",
  signal: "#FF6B2B",
  onSignal: "#120700",
  ok: "#3DD68C",
};

type Weight = 400 | 500 | 600 | 700 | 800;

/**
 * One literal `join(process.cwd(), "src/lib/og/fonts/…")` per file so Next's file tracer (nft) can see
 * every path and ship the TTFs with the dynamic lesson route on Vercel (a computed path is not traced).
 */
const fontFiles = (): { name: string; path: string; weight: Weight }[] => [
  { name: "Bricolage", path: join(process.cwd(), "src/lib/og/fonts/Bricolage-800.ttf"), weight: 800 },
  { name: "Bricolage", path: join(process.cwd(), "src/lib/og/fonts/Bricolage-700.ttf"), weight: 700 },
  { name: "Geist", path: join(process.cwd(), "src/lib/og/fonts/Geist-400.ttf"), weight: 400 },
  { name: "Geist", path: join(process.cwd(), "src/lib/og/fonts/Geist-500.ttf"), weight: 500 },
  { name: "Geist Mono", path: join(process.cwd(), "src/lib/og/fonts/GeistMono-400.ttf"), weight: 400 },
  { name: "Geist Mono", path: join(process.cwd(), "src/lib/og/fonts/GeistMono-600.ttf"), weight: 600 },
];

let fontCache: Promise<{ name: string; data: Buffer; weight: Weight; style: "normal" }[]> | null = null;

export function ogFonts() {
  if (!fontCache) {
    fontCache = Promise.all(
      fontFiles().map(async (f) => ({ name: f.name, data: await readFile(f.path), weight: f.weight, style: "normal" as const }))
    ).catch((e) => {
      fontCache = null;
      throw e;
    });
  }
  return fontCache;
}

export const mono = { fontFamily: "Geist Mono" } as const;
export const display = { fontFamily: "Bricolage" } as const;

/** `~/himanshu▌` — the site mark, cursor drawn as a block (no glyph dependency). */
export function Mark({ size = 30 }: { size?: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", ...mono, fontWeight: 600, fontSize: size, color: C.fg }}>
      <span style={{ color: C.signal }}>~</span>
      <span>/himanshu</span>
      <div style={{ marginLeft: size * 0.22, width: size * 0.5, height: size * 0.95, background: C.signal }} />
    </div>
  );
}

/** Mono uppercase label. */
export function Label({ children, color = C.fg3, size = 20 }: { children: ReactNode; color?: string; size?: number }) {
  return (
    <div style={{ display: "flex", ...mono, fontSize: size, letterSpacing: "0.08em", textTransform: "uppercase", color }}>{children}</div>
  );
}

/** Full-bleed black card with the site's dot grid, a top bar and an orange baseline. */
export function Frame({ right, children }: { right?: ReactNode; children: ReactNode }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        backgroundColor: C.bg,
        backgroundImage: `radial-gradient(circle at 14px 14px, ${C.dot} 7%, transparent 0%)`,
        backgroundSize: "28px 28px",
        color: C.fg,
        fontFamily: "Geist",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          height: 92,
          padding: "0 64px",
          borderBottom: `1px solid ${C.line}`,
          background: C.bg,
        }}
      >
        <Mark />
        {right}
      </div>
      <div style={{ display: "flex", flexDirection: "column", flex: 1, padding: "0 64px", position: "relative" }}>{children}</div>
      <div style={{ display: "flex", height: 10, background: C.signal }} />
    </div>
  );
}
