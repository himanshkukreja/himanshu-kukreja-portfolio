import { ImageResponse } from "next/og";
import { NextResponse } from "next/server";
import { C, Label, OG_SIZE, display, mono, ogFonts } from "@/lib/og/brand";
import { DSA_MARK_COLORS as K } from "@/lib/site/dsaMark";
import { Mark } from "@/lib/og/dsa-card";
import { DSA_FULL } from "@/lib/dsa/flags";

/**
 * GET /api/dsa/id-card?n=<name>&s=<starting point>&k=<topics known>&g=<goal>&m=<minutes a day>&no=<card number>
 * The shareable DSA Mastery learner card (1200 x 630 PNG), in DSA's card look (true black, dot grid, teal). Everything
 * on it comes from the query, trimmed and length-capped; no account is read, so it caches like any share image.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TEAL = K.accent;
const ON_TEAL = "#021A16";
const clean = (v: string | null, max: number) => (v || "").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, max);
const initials = (n: string) =>
  n
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("") || "D";

export async function GET(req: Request) {
  if (!DSA_FULL) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const q = new URL(req.url).searchParams;
  const name = clean(q.get("n"), 32) || "New learner";
  const start = clean(q.get("s"), 40) || "Toolkit";
  const known = Math.max(0, Math.min(12, Number(q.get("k")) || 0));
  const goal = clean(q.get("g"), 30);
  const mins = clean(q.get("m"), 8);
  const no = clean(q.get("no"), 8).toUpperCase() || "000000";
  const font = name.length > 18 ? 76 : 96;
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
            <div style={{ display: "flex", padding: "6px 12px", background: TEAL, ...mono, fontSize: 20, fontWeight: 600, letterSpacing: "0.08em", color: ON_TEAL }}>LEARNER CARD</div>
            <Label color={C.fg2}>{`no. ${no}`}</Label>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 36, marginTop: 30 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 150, height: 150, background: TEAL, color: ON_TEAL, ...display, fontWeight: 800, fontSize: 64 }}>{initials(name)}</div>
            <div style={{ display: "flex", ...display, fontWeight: 800, fontSize: font, lineHeight: 1, letterSpacing: "-0.045em", color: C.fg, maxWidth: 820 }}>{name}</div>
          </div>
          <div style={{ display: "flex", marginTop: 30, fontSize: 34, color: C.fg2, lineHeight: 1.3 }}>{`Starting at ${start}`}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 18, marginTop: "auto", marginBottom: 40 }}>
            <Label>{`knows ${known} of 12 topics`}</Label>
            {goal ? <Label color={C.fg3}>{`goal: ${goal.toLowerCase()}`}</Label> : null}
            {mins ? <Label color={C.fg3}>{`${mins} a day`}</Label> : null}
          </div>
        </div>
        <div style={{ display: "flex", height: 10, background: TEAL }} />
      </div>
    ),
    { ...OG_SIZE, fonts: await ogFonts(), headers: { "Cache-Control": "public, max-age=3600", "x-robots-tag": "noindex" } },
  );
}
