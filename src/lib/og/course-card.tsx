import { ImageResponse } from "next/og";
import { C, Frame, Label, OG_SIZE, display, mono, ogFonts } from "./brand";

export const COURSE_ALT = "System Design Mastery — a free system design course by Himanshu Kukreja";

/** Worlds 00–10; World 00 (Foundations) has no boss. */
const WORLDS = Array.from({ length: 11 }, (_, i) => String(i).padStart(2, "0"));

/** `active` undefined = course card (World 00 lit as the start); -1 = side quest (nothing lit). */
function WorldTrack({ active }: { active?: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center" }}>
      {WORLDS.map((w, i) => {
        const on = active === undefined ? i === 0 : i === active;
        const done = active !== undefined && active >= 0 && i < active;
        return (
          <div key={w} style={{ display: "flex", alignItems: "center" }}>
            {i > 0 && <div style={{ width: 22, height: 2, background: done || on ? C.signal : C.lineStrong }} />}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 58,
                height: 50,
                ...mono,
                fontSize: 20,
                fontWeight: 600,
                background: on ? C.signal : done ? "#2A1206" : C.bg,
                color: on ? C.onSignal : done ? C.signal : C.fg3,
                border: `2px solid ${on || done ? C.signal : C.lineStrong}`,
              }}
            >
              {w}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export async function courseCard() {
  return new ImageResponse(
    (
      <Frame right={<div style={{ display: "flex", ...mono, fontSize: 24, color: C.fg3 }}>himanshukukreja.in/learn</div>}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 44 }}>
          <div style={{ display: "flex", padding: "6px 12px", background: C.signal, ...mono, fontSize: 20, fontWeight: 600, letterSpacing: "0.08em", color: C.onSignal }}>
            FREE COURSE
          </div>
          <Label color={C.fg2}>by himanshu kukreja · no sign-up to read</Label>
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 18,
            ...display,
            fontWeight: 800,
            fontSize: 100,
            lineHeight: 0.98,
            letterSpacing: "-0.045em",
            color: C.fg,
          }}
        >
          System Design Mastery
        </div>
        <div style={{ display: "flex", marginTop: 20, fontSize: 32, fontWeight: 500, color: C.fg2, letterSpacing: "-0.01em" }}>
          11 worlds<span style={{ color: C.signal, margin: "0 14px" }}>·</span>10 interview bosses
          <span style={{ color: C.signal, margin: "0 14px" }}>·</span>1,000+ quick checks
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: "auto", marginBottom: 40 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", width: 858 }}>
            <Label>world map · 00 → 10</Label>
            <Label color={C.signal}>▶ press start</Label>
          </div>
          <WorldTrack />
        </div>
      </Frame>
    ),
    { ...OG_SIZE, fonts: await ogFonts() }
  );
}

type LessonCardInput = {
  title: string;
  /** "W02 · DAY 03", "W00 · PART 1", "W02 · BOSS", "SQ-01" */
  tag: string;
  /** "Failure-First Design" */
  world: string;
  /** 0–10, or -1 for side quests / unknown */
  worldNum: number;
  minutes: number;
  boss: boolean;
};

export async function lessonCard(l: LessonCardInput) {
  const len = l.title.length;
  const size = len > 60 ? 64 : len > 44 ? 76 : len > 28 ? 90 : 104;
  return new ImageResponse(
    (
      <Frame right={<div style={{ display: "flex", ...mono, fontSize: 24, color: C.fg3 }}>System Design Mastery</div>}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 50 }}>
          <div
            style={{
              display: "flex",
              padding: "6px 12px",
              background: l.boss ? C.signal : "transparent",
              border: `2px solid ${C.signal}`,
              ...mono,
              fontSize: 20,
              fontWeight: 600,
              letterSpacing: "0.08em",
              color: l.boss ? C.onSignal : C.signal,
            }}
          >
            {l.tag}
          </div>
          <Label color={C.fg2}>{l.world}</Label>
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 26,
            maxWidth: 1072,
            ...display,
            fontWeight: 800,
            fontSize: size,
            lineHeight: 1.02,
            letterSpacing: "-0.04em",
            color: C.fg,
          }}
        >
          {l.title}
        </div>
        <div style={{ display: "flex", marginTop: 22, fontSize: 30, fontWeight: 500, color: C.fg3, letterSpacing: "-0.01em" }}>
          A free System Design Mastery {l.boss ? "boss fight" : "lesson"} by Himanshu Kukreja
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: "auto", marginBottom: 44 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
            <Label>{l.worldNum >= 0 ? `world ${String(l.worldNum).padStart(2, "0")} of 10` : "side quest"}</Label>
            <div style={{ display: "flex", ...mono, fontSize: 22, color: C.fg3 }}>
              {l.minutes > 0 ? `${l.minutes} min read · ` : ""}himanshukukreja.in/learn
            </div>
          </div>
          <WorldTrack active={l.worldNum} />
        </div>
      </Frame>
    ),
    { ...OG_SIZE, fonts: await ogFonts() }
  );
}
