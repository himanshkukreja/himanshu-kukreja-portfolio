import { ImageResponse } from "next/og";
import { PERSON, durationLabel, shippingMonths } from "@/components/home/showcase/data";
import { LEVELS } from "@/game/catalog";
import { C, Frame, Label, OG_SIZE, display, mono, ogFonts } from "./brand";

/** He sits at L4 · Senior on the site's ladder (same as the home hero). */
const HIS_LEVEL = 3;

export const PORTFOLIO_ALT = "Himanshu Kukreja — Senior SWE, engineering lead at Senseloaf AI";

export async function portfolioCard() {
  const xp = durationLabel(shippingMonths());
  return new ImageResponse(
    (
      <Frame right={<div style={{ display: "flex", ...mono, fontSize: 24, color: C.fg3 }}>himanshukukreja.in</div>}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 52 }}>
          <div style={{ width: 14, height: 14, background: C.ok }} />
          <Label color={C.fg2}>player 1 · online · {PERSON.city}</Label>
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 18,
            ...display,
            fontWeight: 800,
            fontSize: 118,
            lineHeight: 1,
            letterSpacing: "-0.045em",
            color: C.fg,
          }}
        >
          Himanshu Kukreja
        </div>
        <div style={{ display: "flex", marginTop: 22, fontSize: 38, fontWeight: 500, color: C.fg2, letterSpacing: "-0.01em" }}>
          Senior SWE
          <span style={{ color: C.signal, margin: "0 16px" }}>·</span>
          Engineering lead @ Senseloaf AI
        </div>

        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginTop: "auto", marginBottom: 46 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Label>rank · this site&apos;s ladder</Label>
            <div style={{ display: "flex", gap: 8 }}>
              {LEVELS.map((l, i) => (
                <div
                  key={l.code}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 74,
                    height: 52,
                    ...mono,
                    fontSize: 22,
                    fontWeight: 600,
                    background: i <= HIS_LEVEL ? C.signal : "transparent",
                    color: i <= HIS_LEVEL ? C.onSignal : C.fg4,
                    border: i <= HIS_LEVEL ? `2px solid ${C.signal}` : `2px dashed ${C.lineStrong}`,
                  }}
                >
                  {l.code}
                </div>
              ))}
            </div>
            <div style={{ display: "flex", fontSize: 24, color: C.fg3 }}>
              <span style={{ color: C.fg, fontWeight: 500 }}>
                {LEVELS[HIS_LEVEL].code} · {LEVELS[HIS_LEVEL].name}
              </span>
              <span style={{ marginLeft: 10 }}>with the eng-lead perk</span>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
            <Label>xp · shipping since 2023</Label>
            <div style={{ display: "flex", ...display, fontWeight: 800, fontSize: 64, lineHeight: 1, letterSpacing: "-0.03em", color: C.signal }}>
              {xp}
            </div>
            <div style={{ display: "flex", ...mono, fontSize: 20, color: C.fg3 }}>
              founding eng ×2 · open source · teaches
            </div>
          </div>
        </div>
      </Frame>
    ),
    { ...OG_SIZE, fonts: await ogFonts() }
  );
}
