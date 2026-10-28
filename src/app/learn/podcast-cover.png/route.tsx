import { ImageResponse } from "next/og";
import { C, display, mono, Mark, ogFonts } from "@/lib/og/brand";

export const runtime = "nodejs";
export const revalidate = 604800;

/** Podcast artwork: 1600 × 1600 PNG (Apple asks for a square between 1400 and 3000 px). */
export async function GET() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 120, backgroundColor: C.bg, backgroundImage: `radial-gradient(circle at 20px 20px, ${C.lineStrong} 7%, transparent 0%)`, backgroundSize: "40px 40px", color: C.fg }}>
        <Mark size={64} />
        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          <div style={{ display: "flex", ...mono, fontSize: 52, letterSpacing: "0.14em", textTransform: "uppercase", color: C.signal }}>the podcast</div>
          <div style={{ display: "flex", flexDirection: "column", ...display, fontWeight: 800, fontSize: 250, lineHeight: 0.88, letterSpacing: "-0.05em" }}>
            <span>System</span>
            <span>Design</span>
            <span style={{ display: "flex" }}>
              Mastery<span style={{ color: C.signal }}>.</span>
            </span>
          </div>
        </div>
        <div style={{ display: "flex", ...mono, fontSize: 46, color: C.fg3 }}>real systems · interviews · outages</div>
      </div>
    ),
    { width: 1600, height: 1600, fonts: await ogFonts() }
  );
}
