/**
 * Shared pieces for the Open Graph / Twitter cards (next/og ImageResponse, Node runtime).
 * Brand: true black, signal orange, Bricolage display, Geist body, Geist Mono labels, square corners.
 * Fonts are static TTF instances checked in next to this file (satori can't read woff2 or variable fonts),
 * bundled into src/generated/og-fonts.ts at build.
 */
import type { ReactNode } from "react";
import { COURSE_MARK as M } from "@/lib/site/courseMark";
import { OG_FONTS } from "@/generated/og-fonts";

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

const FONT_FILES: { name: string; file: string; weight: Weight }[] = [
  { name: "Bricolage", file: "Bricolage-800", weight: 800 },
  { name: "Bricolage", file: "Bricolage-700", weight: 700 },
  { name: "Geist", file: "Geist-400", weight: 400 },
  { name: "Geist", file: "Geist-500", weight: 500 },
  { name: "Geist Mono", file: "GeistMono-400", weight: 400 },
  { name: "Geist Mono", file: "GeistMono-600", weight: 600 },
];

let fontCache: { name: string; data: Buffer; weight: Weight; style: "normal" }[] | null = null;

/** The TTFs are bundled at build (scripts/build/gen-runtime-files.mjs → src/generated/og-fonts.ts): no filesystem at runtime. */
export async function ogFonts() {
  fontCache ??= FONT_FILES.map((f) => ({ name: f.name, data: Buffer.from(OG_FONTS[f.file], "base64"), weight: f.weight, style: "normal" as const }));
  return fontCache;
}

export const mono = { fontFamily: "Geist Mono" } as const;
export const display = { fontFamily: "Bricolage" } as const;

/** The course's mark (public/course-brand/icon.svg): white block wired to a signal-orange block, black tile. */
export function CourseMark({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" shapeRendering="crispEdges">
      <rect width="100" height="100" fill="#000" />
      {[...M.wire, M.from].map((r, i) => (
        <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} fill={C.fg} />
      ))}
      <rect x={M.to.x} y={M.to.y} width={M.to.w} height={M.to.h} fill={C.signal} />
    </svg>
  );
}

/**
 * The site mark at the top of a card. Course cards (the default): the diagram mark + "System Design
 * Mastery." Portfolio cards: `~/himanshu▌`, the cursor drawn as a block (no glyph dependency).
 */
export function Mark({ size = 30, brand = "course" }: { size?: number; brand?: "course" | "portfolio" }) {
  if (brand === "course") {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: size * 0.45, ...display, fontWeight: 800, fontSize: size * 1.05, letterSpacing: "-0.03em", color: C.fg }}>
        <CourseMark size={size * 1.5} />
        <div style={{ display: "flex" }}>
          <span>System Design Mastery</span>
          <span style={{ color: C.signal }}>.</span>
        </div>
      </div>
    );
  }
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
export function Frame({ right, children, brand = "course" }: { right?: ReactNode; children: ReactNode; brand?: "course" | "portfolio" }) {
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
        <Mark brand={brand} />
        {right}
      </div>
      <div style={{ display: "flex", flexDirection: "column", flex: 1, padding: "0 64px", position: "relative" }}>{children}</div>
      <div style={{ display: "flex", height: 10, background: C.signal }} />
    </div>
  );
}
