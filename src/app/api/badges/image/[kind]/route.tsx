import { ImageResponse } from "next/og";
import { C, display, mono, CourseMark, ogFonts } from "@/lib/og/brand";

export const runtime = "nodejs";
export const revalidate = 86400;
export const dynamicParams = true;
export function generateStaticParams() {
  return [];
}

type Ctx = { params: Promise<{ kind: string }> };

/** The Open Badge image (600 × 600 PNG): `course` → SDM, `lld` → LLD, `world-NN` → WNN. Same art for everyone. */
export async function GET(_req: Request, { params }: Ctx) {
  const { kind } = await params;
  const world = /^world-(\d{2})$/.exec(kind)?.[1];
  if (kind !== "course" && kind !== "lld" && !world) return new Response("Not found", { status: 404 });
  const big = world ? `W${world}` : kind === "lld" ? "LLD" : "SDM";
  const sub = world ? "world certificate" : kind === "lld" ? "low-level design" : "certificate of completion";
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 44, backgroundColor: C.bg, border: `14px solid ${C.signal}`, color: C.fg }}>
        <div style={{ display: "flex", ...mono, fontSize: 22, letterSpacing: "0.14em", textTransform: "uppercase", color: C.signal }}>System Design Mastery</div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 6 }}>
          <div style={{ display: "flex", ...display, fontWeight: 800, fontSize: 200, lineHeight: 0.9, letterSpacing: "-0.05em" }}>
            {big}
            <span style={{ color: C.signal }}>.</span>
          </div>
          <div style={{ display: "flex", ...mono, fontSize: 24, letterSpacing: "0.12em", textTransform: "uppercase", color: C.fg3 }}>{sub}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14, ...mono, fontSize: 24, color: C.fg3 }}>
          <CourseMark size={44} />
          systemdesignmastery.dev
        </div>
      </div>
    ),
    { width: 600, height: 600, fonts: await ogFonts(), headers: { "access-control-allow-origin": "*" } }
  );
}
