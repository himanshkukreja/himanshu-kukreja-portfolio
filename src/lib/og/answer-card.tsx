import { ImageResponse } from "next/og";
import { C, Frame, Label, OG_SIZE, display, mono, ogFonts } from "./brand";
import type { SharedAnswer } from "@/lib/share/answer-model";

export const ANSWER_ALT = "A question answered from System Design Mastery, a free system design course";

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).replace(/\s+\S*$/, "")}…` : s);

/** The card for /learn/answer/<id>: the question big, the number of course sources under it. */
export async function answerCard(a: Pick<SharedAnswer, "question" | "cites">) {
  const q = clip(a.question, 150);
  const size = q.length > 110 ? 50 : q.length > 70 ? 58 : 68;
  const kinds = [...new Set(a.cites.map((c) => c.kind))].length;
  return new ImageResponse(
    (
      <Frame right={<div style={{ display: "flex", ...mono, fontSize: 24, color: C.fg3 }}>himanshukukreja.in/learn</div>}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 48 }}>
          <div style={{ display: "flex", padding: "6px 12px", background: C.signal, ...mono, fontSize: 20, fontWeight: 600, letterSpacing: "0.08em", color: C.onSignal }}>ASKED &amp; ANSWERED</div>
          <Label color={C.fg2}>from the course, with sources</Label>
        </div>
        <div style={{ display: "flex", marginTop: 26, ...display, fontWeight: 800, fontSize: size, lineHeight: 1.04, letterSpacing: "-0.035em", color: C.fg }}>{q}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 18, marginTop: "auto", marginBottom: 44 }}>
          {a.cites.slice(0, 6).map((_, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 46, height: 40, border: `2px solid ${C.signal}`, color: C.signal, ...mono, fontSize: 20, fontWeight: 600 }}>
              {i + 1}
            </div>
          ))}
          <Label>{`${a.cites.length} source${a.cites.length === 1 ? "" : "s"}${kinds > 1 ? ` · ${kinds} kinds` : ""} · system design mastery`}</Label>
        </div>
      </Frame>
    ),
    { ...OG_SIZE, fonts: await ogFonts() },
  );
}
