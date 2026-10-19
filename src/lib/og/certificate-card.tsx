/**
 * Share card "F" for a certificate (/cert/<code> OG + Twitter image, 1200 × 627): true black, dot
 * grid, the holder's name and the four numbers. Only public certificates get it; anything else
 * gets the neutral card (no name).
 */
import { ImageResponse } from "next/og";
import { CERT_TITLE, ISSUER, VERDICT_TEXT, type CertificateView } from "@/lib/certificates/core";
import { C, display, mono, ogFonts } from "./brand";

export const CERT_OG_SIZE = { width: 1200, height: 627 };

function Shell({ badge, children }: { badge: string | null; children: React.ReactNode }) {
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", padding: "56px 64px", backgroundColor: C.bg, backgroundImage: `radial-gradient(circle at 14px 14px, ${C.lineStrong} 6%, transparent 0%)`, backgroundSize: "28px 28px", color: C.fg, fontFamily: "Geist" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", ...mono, fontSize: 22, fontWeight: 600 }}>
          <span style={{ color: C.signal }}>~/</span>
          <span>himanshu</span>
          <span style={{ color: C.fg4, margin: "0 10px" }}>/</span>
          <span>learn</span>
          <span style={{ color: C.signal }}>.</span>
        </div>
        {badge && <div style={{ display: "flex", ...mono, fontSize: 18, letterSpacing: "0.14em", textTransform: "uppercase", border: `2px solid ${C.signal}`, color: C.signal, padding: "10px 16px" }}>{badge}</div>}
      </div>
      {children}
    </div>
  );
}

const nameSize = (n: string) => (n.length <= 16 ? 104 : n.length <= 24 ? 86 : n.length <= 34 ? 68 : 54);

export async function certificateCard(cert: CertificateView | null) {
  const fonts = await ogFonts();
  if (!cert) {
    return new ImageResponse(
      (
        <Shell badge={null}>
          <div style={{ display: "flex", flexDirection: "column", gap: 18, marginTop: 120 }}>
            <div style={{ display: "flex", ...mono, fontSize: 20, letterSpacing: "0.16em", textTransform: "uppercase", color: C.fg3 }}>{ISSUER}</div>
            <div style={{ display: "flex", ...display, fontWeight: 800, fontSize: 92, lineHeight: 0.95, letterSpacing: "-0.04em" }}>
              Verify a certificate<span style={{ color: C.signal }}>.</span>
            </div>
          </div>
        </Shell>
      ),
      { ...CERT_OG_SIZE, fonts }
    );
  }
  const s = cert.stats;
  const revoked = cert.status === "revoked";
  const cells =
    cert.kind === "course" && s
      ? [
          { v: `${s.worlds.cleared}/${s.worlds.total}`, l: "worlds" },
          { v: `${s.trialParts.passed}/${s.trialParts.total}`, l: "trial parts" },
          { v: `${s.bosses.beaten}/${s.bosses.total}`, l: "bosses" },
          { v: s.mock ? (VERDICT_TEXT[s.mock.verdict] || s.mock.verdict).toUpperCase() : "—", l: "mock interview", accent: true },
        ]
      : s
        ? [
            { v: `W${cert.world?.code ?? ""}`, l: "world", accent: true },
            { v: `${s.lessons.done}/${s.lessons.total}`, l: "lessons" },
            { v: `${s.trialParts.passed}/${s.trialParts.total}`, l: "trial parts" },
            { v: s.bosses.total ? (s.bosses.beaten ? "BEATEN" : "—") : "N/A", l: "interview boss" },
          ]
        : [];
  const kicker = cert.kind === "course" ? `${ISSUER} · ${CERT_TITLE}` : `${ISSUER} · World ${cert.world?.code ?? ""} · ${cert.world?.title ?? ""}`;
  return new ImageResponse(
    (
      <Shell badge={revoked ? `Revoked · ${cert.code}` : `Certified · ${cert.code}`}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 56 }}>
          <div style={{ display: "flex", ...mono, fontSize: 20, letterSpacing: "0.16em", textTransform: "uppercase", color: C.fg3 }}>{kicker}</div>
          <div style={{ display: "flex", ...display, fontWeight: 800, fontSize: nameSize(cert.name), lineHeight: 0.95, letterSpacing: "-0.04em" }}>
            {cert.name}
            {!/[.!?]$/.test(cert.name) && <span style={{ color: C.signal }}>.</span>}
          </div>
        </div>
        <div style={{ display: "flex", marginTop: "auto", borderTop: `2px solid ${C.lineStrong}` }}>
          {cells.map((c) => (
            <div key={c.l} style={{ display: "flex", flexDirection: "column", flex: 1, paddingTop: 22, gap: 6 }}>
              <div style={{ display: "flex", ...mono, fontSize: c.v.length > 7 ? 32 : 40, fontWeight: 600, color: c.accent ? C.signal : C.fg }}>{c.v}</div>
              <div style={{ display: "flex", fontSize: 19, color: C.fg3 }}>{c.l}</div>
            </div>
          ))}
        </div>
      </Shell>
    ),
    { ...CERT_OG_SIZE, fonts }
  );
}
