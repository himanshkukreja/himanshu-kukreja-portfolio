import { ImageResponse } from "next/og";
import { C, Frame, Label, OG_SIZE, display, mono, ogFonts } from "./brand";
import { plain } from "@/lib/learn/revision/parse";
import type { DeckWeek } from "@/lib/learn/revision/load";

/** A few of the world's numbers to remember, shortest first (they have to fit a chip). */
function chips(w: DeckWeek | null): { v: string; l: string }[] {
  if (!w) return [];
  const out: { v: string; l: string }[] = [];
  for (const l of w.lessons) {
    const n = l.cards.find((c) => c.kind === "numbers");
    if (n && n.kind === "numbers") {
      const it = [...n.items].sort((a, b) => plain(a.value).length - plain(b.value).length)[0];
      if (it && plain(it.value).length <= 14) out.push({ v: plain(it.value), l: plain(it.label) });
    }
    if (out.length === 3) break;
  }
  return out;
}

/** OG card for a world's cheat sheet or revision deck: paper sheet look on the black brand frame. */
export async function revisionCard(w: DeckWeek | null, mode: "cheatsheet" | "deck") {
  const title = w?.title || "System Design Mastery";
  const len = title.length;
  const size = len > 40 ? 70 : len > 26 ? 84 : 98;
  const nums = chips(w);
  const tag = mode === "cheatsheet" ? `CHEAT SHEET · WORLD ${w?.code ?? ""}` : `REVISE IN ${Math.max(5, (w?.lessons.length || 1) * 5)} MIN · WORLD ${w?.code ?? ""}`;
  return new ImageResponse(
    (
      <Frame right={<div style={{ display: "flex", ...mono, fontSize: 24, color: C.fg3 }}>himanshukukreja.in/learn</div>}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 44 }}>
          <div style={{ display: "flex", padding: "6px 12px", background: C.signal, ...mono, fontSize: 20, fontWeight: 600, letterSpacing: "0.08em", color: C.onSignal }}>{tag}</div>
          <Label color={C.fg2}>{mode === "cheatsheet" ? "one printable page · free" : "swipeable cards · works offline"}</Label>
        </div>
        <div style={{ display: "flex", marginTop: 22, maxWidth: 1072, ...display, fontWeight: 800, fontSize: size, lineHeight: 1.0, letterSpacing: "-0.04em", color: C.fg }}>{title}</div>
        <div style={{ display: "flex", marginTop: 18, fontSize: 30, fontWeight: 500, color: C.fg3, letterSpacing: "-0.01em" }}>
          {w ? `${w.lessons.length} lessons · key ideas · numbers · trade-offs · classic mistakes` : "Key ideas, numbers to remember, trade-offs and classic mistakes"}
        </div>
        <div style={{ display: "flex", gap: 16, marginTop: "auto", marginBottom: 44 }}>
          {nums.map((n, i) => (
            <div key={i} style={{ display: "flex", flexDirection: "column", gap: 6, width: 344, padding: "16px 18px", background: "#FFFFFF", borderLeft: `8px solid ${C.signal}` }}>
              <div style={{ display: "flex", ...mono, fontSize: 34, fontWeight: 600, color: "#C2410C" }}>{n.v}</div>
              <div style={{ display: "flex", fontSize: 20, lineHeight: 1.25, color: "#2E2E33", maxHeight: 52, overflow: "hidden" }}>{n.l.length > 60 ? `${n.l.slice(0, 58)}…` : n.l}</div>
            </div>
          ))}
          {!nums.length && <Label color={C.signal}>▶ free system design course</Label>}
        </div>
      </Frame>
    ),
    { ...OG_SIZE, fonts: await ogFonts() }
  );
}
