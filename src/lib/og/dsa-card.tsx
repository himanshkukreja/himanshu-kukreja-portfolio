import { ImageResponse } from "next/og";
import { C, Label, OG_SIZE, display, mono, ogFonts } from "./brand";
import { DSA_MARK as M, DSA_MARK_COLORS as K } from "@/lib/site/dsaMark";

/**
 * DSA Mastery's share card (/dsa): the course card's frame (true black, dot grid, top bar, accent baseline,
 * square corners) with DSA Mastery's mark and teal in place of the orange.
 */
export const DSA_ALT = "DSA Mastery, coming soon on System Design Mastery: data structures and algorithms through real product engineering";

const TEAL = K.accent;
const ON_TEAL = "#021A16";

const WORLDS = ["Academy", "Product Districts", "Career Studio", "Challenge League", "Release Train", "Infrastructure"];

function Mark({ size = 45 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" shapeRendering="crispEdges">
      <rect width="100" height="100" fill={K.tile} />
      {[...M.wire, ...M.nodes].map((r, i) => (
        <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} fill={K.ink} />
      ))}
      <rect x={M.accent.x} y={M.accent.y} width={M.accent.w} height={M.accent.h} fill={TEAL} />
    </svg>
  );
}

export async function dsaCard() {
  return new ImageResponse(
    (
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
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 92, padding: "0 64px", borderBottom: `1px solid ${C.line}`, background: C.bg }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, ...display, fontWeight: 800, fontSize: 32, letterSpacing: "-0.03em", color: C.fg }}>
            <Mark />
            <div style={{ display: "flex" }}>
              <span>DSA Mastery</span>
              <span style={{ color: TEAL }}>.</span>
            </div>
          </div>
          <div style={{ display: "flex", ...mono, fontSize: 24, color: C.fg3 }}>systemdesignmastery.dev/dsa</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", flex: 1, padding: "0 64px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 44 }}>
            <div style={{ display: "flex", padding: "6px 12px", background: TEAL, ...mono, fontSize: 20, fontWeight: 600, letterSpacing: "0.08em", color: ON_TEAL }}>COMING SOON</div>
            <Label color={C.fg2}>founding members: both courses free for life</Label>
          </div>
          <div style={{ display: "flex", marginTop: 20, ...display, fontWeight: 800, fontSize: 84, lineHeight: 1, letterSpacing: "-0.045em", color: C.fg, maxWidth: 1072 }}>
            Data structures and algorithms, through real product engineering
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: "auto", marginBottom: 40 }}>
            <Label>{"six worlds · python · java · c++ · javascript"}</Label>
            <div style={{ display: "flex", alignItems: "center" }}>
              {WORLDS.map((w, i) => (
                <div key={w} style={{ display: "flex", alignItems: "center" }}>
                  {i > 0 && <div style={{ width: 18, height: 2, background: i === 1 ? TEAL : C.lineStrong }} />}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      height: 46,
                      padding: "0 12px",
                      ...mono,
                      fontSize: 15,
                      fontWeight: 600,
                      background: i === 0 ? TEAL : C.bg,
                      color: i === 0 ? ON_TEAL : C.fg3,
                      border: `2px solid ${i === 0 ? TEAL : C.lineStrong}`,
                    }}
                  >
                    {w}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", height: 10, background: TEAL }} />
      </div>
    ),
    { ...OG_SIZE, fonts: await ogFonts() }
  );
}
