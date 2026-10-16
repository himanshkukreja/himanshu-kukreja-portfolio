/**
 * OG / Twitter cards for shared learner pages: /u/<handle> (profile) and /u/<handle>/a/<id>
 * (one achievement). Only what the learner made visible reaches these (the PublicProfile is
 * already filtered). No remote images: the avatar is drawn as initials so a slow avatar host can
 * never break the card.
 */
import { ImageResponse } from "next/og";
import type { Achievement, PublicProfile } from "@/lib/share/model";
import { C, Frame, Label, OG_SIZE, display, mono, ogFonts } from "./brand";

function Initials({ p, size }: { p: PublicProfile; size: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: size, height: size, background: C.signal, color: C.onSignal, ...display, fontWeight: 800, fontSize: size * 0.42, letterSpacing: "-0.04em" }}>
      {p.initials}
    </div>
  );
}

function Chip({ children, solid = false }: { children: string; solid?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        padding: "7px 14px",
        background: solid ? C.signal : "transparent",
        border: `2px solid ${solid ? C.signal : C.lineStrong}`,
        ...mono,
        fontSize: 22,
        fontWeight: 600,
        letterSpacing: "0.04em",
        color: solid ? C.onSignal : C.fg2,
      }}
    >
      {children}
    </div>
  );
}

/** One box per world, filled by how much of it is done. */
function Worlds({ p, width, height }: { p: PublicProfile; width: number; height: number }) {
  const weeks = p.course?.weeks || [];
  const n = Math.max(1, weeks.length);
  const gap = 8;
  const w = Math.floor((width - gap * (n - 1)) / n);
  return (
    <div style={{ display: "flex", gap }}>
      {weeks.map((x) => (
        <div
          key={x.key}
          style={{
            display: "flex",
            position: "relative",
            width: w,
            height,
            background: x.cleared ? C.signal : C.bg,
            border: `2px solid ${x.cleared || x.started ? C.signal : C.lineStrong}`,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {!x.cleared && x.pct > 0 && <div style={{ display: "flex", position: "absolute", left: 0, bottom: 0, height: Math.max(4, Math.round((height - 4) * (x.pct / 100))), width: w - 4, background: "#5A2A12" }} />}
          <div style={{ display: "flex", ...mono, fontSize: Math.round(height * 0.36), fontWeight: 600, color: x.cleared ? C.onSignal : x.started ? C.signal : C.fg4 }}>{x.code}</div>
        </div>
      ))}
    </div>
  );
}

const chipsOf = (p: PublicProfile) =>
  [
    p.streak && p.streak.current > 0 ? `${p.streak.current}-DAY STREAK` : null,
    p.arena ? `${p.arena.leagueCode} ${p.arena.leagueName.toUpperCase()} LEAGUE${p.arena.rank ? ` · #${p.arena.rank}` : ""}` : null,
    p.course ? `${p.course.worldsCleared}/${p.course.worldsTotal} WORLDS` : null,
    p.arena?.bestDaily ? `BEST DAILY ${p.arena.bestDaily.correct}/${p.arena.bestDaily.total}` : null,
  ].filter(Boolean) as string[];

function Who({ p, nameSize = 64 }: { p: PublicProfile; nameSize?: number }) {
  const name = p.name || `@${p.handle}`;
  const size = name.length > 22 ? Math.round(nameSize * 0.78) : nameSize;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
      <Initials p={p} size={Math.round(nameSize * 1.4)} />
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ display: "flex", ...display, fontWeight: 800, fontSize: size, lineHeight: 1, letterSpacing: "-0.04em", color: C.fg }}>
          {name}
          <span style={{ color: C.signal }}>.</span>
        </div>
        <div style={{ display: "flex", ...mono, fontSize: 22, color: C.fg3 }}>{p.name ? `@${p.handle} · System Design Mastery` : "System Design Mastery"}</div>
      </div>
    </div>
  );
}

export async function profileCard(p: PublicProfile) {
  const chips = chipsOf(p).slice(0, 3);
  const pct = p.course && p.level ? p.course.pct : null;
  return new ImageResponse(
    (
      <Frame right={<div style={{ display: "flex", ...mono, fontSize: 24, color: C.fg3 }}>himanshukukreja.in/u/{p.handle}</div>}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 40 }}>
          <Who p={p} />
          {p.level && (
            <div style={{ display: "flex", padding: "10px 18px", background: C.signal, ...mono, fontSize: 30, fontWeight: 600, letterSpacing: "0.06em", color: C.onSignal }}>
              {p.level.code} · {p.level.name.toUpperCase()}
            </div>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "flex-end", gap: 28, marginTop: 34 }}>
          {pct !== null ? (
            <div style={{ display: "flex", alignItems: "flex-end", ...display, fontWeight: 800, fontSize: 150, lineHeight: 0.86, letterSpacing: "-0.055em", color: C.signal }}>
              {pct}
              <span style={{ fontSize: 70, marginLeft: 6, marginBottom: 8 }}>%</span>
            </div>
          ) : (
            <div style={{ display: "flex", ...display, fontWeight: 800, fontSize: 84, lineHeight: 0.95, letterSpacing: "-0.045em", color: C.fg }}>Learning system design.</div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 6 }}>
            {pct !== null && <div style={{ display: "flex", fontSize: 34, fontWeight: 500, color: C.fg2, letterSpacing: "-0.01em" }}>through System Design Mastery</div>}
            <div style={{ display: "flex", gap: 10 }}>
              {chips.map((c, i) => (
                <Chip key={c} solid={i === 0 && !!p.streak}>
                  {c}
                </Chip>
              ))}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: "auto", marginBottom: 36 }}>
          {p.course ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
                <Label>world map · 00 → {p.course.weeks[p.course.weeks.length - 1]?.code ?? "10"}</Label>
                <Label color={C.signal}>▶ can you beat this run?</Label>
              </div>
              <Worlds p={p} width={1072} height={58} />
            </div>
          ) : (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
              <Label>free course · 11 worlds · 1,000+ quick checks</Label>
              <Label color={C.signal}>▶ press start</Label>
            </div>
          )}
        </div>
      </Frame>
    ),
    { ...OG_SIZE, fonts: await ogFonts() }
  );
}

export async function achievementCard(p: PublicProfile, a: Achievement) {
  const len = a.title.length;
  const size = len > 30 ? 84 : len > 20 ? 100 : 120;
  return new ImageResponse(
    (
      <Frame right={<div style={{ display: "flex", ...mono, fontSize: 24, color: C.fg3 }}>himanshukukreja.in/u/{p.handle}</div>}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 44 }}>
          <div style={{ display: "flex", padding: "6px 12px", background: C.signal, ...mono, fontSize: 20, fontWeight: 600, letterSpacing: "0.08em", color: C.onSignal }}>ACHIEVEMENT</div>
          <Label color={C.fg2}>{a.kicker}</Label>
        </div>
        <div style={{ display: "flex", marginTop: 20, maxWidth: 1072, ...display, fontWeight: 800, fontSize: size, lineHeight: 0.95, letterSpacing: "-0.05em", color: C.fg }}>
          {a.title}
          <span style={{ color: C.signal }}>.</span>
        </div>
        <div style={{ display: "flex", marginTop: 18, maxWidth: 1000, fontSize: 30, fontWeight: 500, color: C.fg2, letterSpacing: "-0.01em" }}>{a.sub}</div>

        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 24, marginTop: "auto", marginBottom: 36 }}>
          <Who p={p} nameSize={40} />
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 12 }}>
            {p.level && <Chip solid>{`${p.level.code} · ${p.level.name.toUpperCase()}${p.course && p.level ? ` · ${p.course.pct}%` : ""}`}</Chip>}
            {p.course && <Worlds p={p} width={470} height={34} />}
          </div>
        </div>
      </Frame>
    ),
    { ...OG_SIZE, fonts: await ogFonts() }
  );
}
