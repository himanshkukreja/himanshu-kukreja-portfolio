/**
 * The certificates themselves, drawn at a 1200 × 848 design size (A4 landscape, 1 : 1.414) and
 * scaled to their box with container units, so the same markup is the phone preview, the
 * verification page and the printed PDF (297 × 210 mm, see certificate.css).
 *   CourseCertificate  "A": paper (print / PDF) or dark (verification page), orange accent, stats
 *                      row and a QR seal that opens the verification page
 *   WorldCertificate   "E" in the blueprint style: grid paper, engineering title block, the
 *                      world's number, title and day topics
 * Server- and client-safe (no hooks). Colours are fixed on purpose: a certificate looks the same
 * in either site theme.
 */
import type { CSSProperties, ReactNode } from "react";
import { CERT_TITLE, DISCLAIMER, ISSUER, LEVEL_TEXT, SIGNER, SIGNER_ROLE, VERDICT_TEXT, certDisplayUrl, certUrl, fmtCertDate, worldsPhrase, type CertificateView } from "@/lib/certificates/core";
import { qrPath } from "@/lib/certificates/qr";

/** n design pixels (of 1200) in the certificate's own box */
const u = (n: number) => `calc(var(--cu) * ${n})`;
const MONO: CSSProperties = { fontFamily: "var(--font-geist-mono), ui-monospace, monospace" };
const DISPLAY: CSSProperties = { fontFamily: "var(--font-display), ui-sans-serif, system-ui, sans-serif" };
const SANS: CSSProperties = { fontFamily: "var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif" };

/** Long names step down so they stay on one or two lines. */
function nameSize(name: string, big: number) {
  const n = name.length;
  if (n <= 16) return big;
  if (n <= 24) return Math.round(big * 0.82);
  if (n <= 34) return Math.round(big * 0.66);
  if (n <= 50) return Math.round(big * 0.52);
  return Math.round(big * 0.42);
}

const withDot = (name: string, color: string) => (
  <>
    {name}
    {!/[.!?]$/.test(name) && <span style={{ color }}>.</span>}
  </>
);

/** QR on a light tile (scanners want dark modules on light, whatever the certificate's colours). */
export function QrSeal({ code, size, dark = "#111111", light = "#FFFFFF", border }: { code: string; size: number; dark?: string; light?: string; border: string }) {
  const { size: n, d } = qrPath(certUrl(code));
  const q = 2;
  return (
    <div aria-hidden style={{ width: u(size), height: u(size), boxSizing: "border-box", border: `${u(2)} solid ${border}`, background: light, padding: u(5), flexShrink: 0 }}>
      <svg viewBox={`${-q} ${-q} ${n + q * 2} ${n + q * 2}`} width="100%" height="100%" shapeRendering="crispEdges" style={{ display: "block" }}>
        <rect x={-q} y={-q} width={n + q * 2} height={n + q * 2} fill={light} />
        <path d={d} fill={dark} />
      </svg>
    </div>
  );
}

/** Scales the 1200 × 848 sheet to the width of its box. */
export function Sheet({ children, className = "", label, id }: { children: ReactNode; className?: string; label: string; id?: string }) {
  return (
    <div className={`cert-box ${className}`} id={id}>
      <div className="cert-sheet" role="img" aria-label={label}>
        {children}
      </div>
    </div>
  );
}

type Palette = { paper: string; ink: string; muted: string; rule: string; accent: string; accentInk: string };
const PAPER: Palette = { paper: "#F5F4F0", ink: "#111111", muted: "#5C5B57", rule: "#D6D4CC", accent: "#FF6B2B", accentInk: "#C2410C" };
const DARK: Palette = { paper: "#000000", ink: "#F3F2EE", muted: "#A3A29C", rule: "#2A2A28", accent: "#FF6B2B", accentInk: "#FF8A57" };

const verdictWord = (v: string) => (VERDICT_TEXT[v] || v).toUpperCase();

export function CourseCertificate({ cert, theme = "paper", id }: { cert: CertificateView; theme?: "paper" | "dark"; id?: string }) {
  const p = theme === "dark" ? DARK : PAPER;
  const s = cert.stats;
  const worlds = s?.worlds.total;
  const stats = s
    ? [
        { v: `${s.worlds.cleared}/${s.worlds.total}`, l: "worlds cleared" },
        { v: `${s.trialParts.passed}/${s.trialParts.total}`, l: "trial parts passed at 80%+" },
        { v: `${s.bosses.beaten}/${s.bosses.total}`, l: "interview bosses beaten" },
        s.offers
          ? { v: `${s.offers.have}× HIRE+`, l: s.mock ? `mock interviews · best ${LEVEL_TEXT[s.mock.level] || s.mock.level} level` : "mock interviews", accent: true }
          : { v: s.mock ? verdictWord(s.mock.verdict) : "—", l: s.mock ? `mock interview · ${LEVEL_TEXT[s.mock.level] || s.mock.level} level` : "mock interview", accent: true },
      ]
    : null;
  return (
    <Sheet id={id} label={`${CERT_TITLE}: ${cert.name} completed ${ISSUER}. Certificate ID ${cert.code}, issued ${fmtCertDate(cert.issuedAt)}.`}>
      <div style={{ ...SANS, position: "absolute", inset: 0, boxSizing: "border-box", padding: u(40), background: p.paper, color: p.ink }}>
        <div style={{ width: "100%", height: "100%", boxSizing: "border-box", border: `${u(2)} solid ${p.ink}`, display: "flex", flexDirection: "column" }}>
          <div style={{ height: u(10), background: p.accent, flexShrink: 0 }} />
          <div style={{ flexGrow: 1, display: "flex", flexDirection: "column", padding: `${u(46)} ${u(64)} ${u(36)}`, minHeight: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: u(6) }}>
                <span style={{ ...MONO, fontSize: u(15), letterSpacing: "0.18em", textTransform: "uppercase", color: p.accentInk, fontWeight: 600 }}>{ISSUER}</span>
                <span style={{ ...MONO, fontSize: u(13), letterSpacing: "0.12em", textTransform: "uppercase", color: p.muted }}>~/himanshu · learn</span>
              </div>
              <div style={{ ...MONO, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: u(6), fontSize: u(13), color: p.muted }}>
                <span>CERTIFICATE ID</span>
                <span style={{ fontSize: u(16), color: p.ink, fontWeight: 600, letterSpacing: "0.08em" }}>{cert.code}</span>
              </div>
            </div>

            <div style={{ marginTop: u(44), display: "flex", flexDirection: "column", gap: u(14) }}>
              <span style={{ ...MONO, fontSize: u(14), letterSpacing: "0.16em", textTransform: "uppercase", color: p.muted }}>{CERT_TITLE}</span>
              <span style={{ fontSize: u(20), color: p.muted }}>This certifies that</span>
              <h1 style={{ ...DISPLAY, margin: 0, fontWeight: 800, fontSize: u(nameSize(cert.name, 88)), lineHeight: 0.98, letterSpacing: "-0.035em", overflowWrap: "anywhere" }}>{withDot(cert.name, p.accent)}</h1>
              <p style={{ margin: `${u(8)} 0 0`, fontSize: u(21), lineHeight: 1.5, maxWidth: u(860) }}>
                completed <b>{ISSUER}</b>, {worldsPhrase(worlds)} on designing systems at scale, and passed its trials, interview bosses and {s?.offers ? `${s.offers.need} timed mock interviews` : "a timed mock interview"}.
              </p>
            </div>

            {stats && (
              <div style={{ marginTop: u(32), display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", borderTop: `${u(1.5)} solid ${p.ink}`, borderBottom: `${u(1.5)} solid ${p.ink}` }}>
                {stats.map((x, i) => (
                  <div key={x.l} style={{ padding: `${u(16)} ${i === 3 ? 0 : u(20)} ${u(16)} ${i === 0 ? 0 : u(20)}`, display: "flex", flexDirection: "column", gap: u(4), borderRight: i < 3 ? `${u(1)} solid ${p.rule}` : undefined }}>
                    <span style={{ ...MONO, fontSize: u(x.v.length > 8 ? 26 : 34), fontWeight: 600, color: x.accent ? p.accentInk : p.ink, whiteSpace: "nowrap" }}>{x.v}</span>
                    <span style={{ fontSize: u(14), color: p.muted }}>{x.l}</span>
                  </div>
                ))}
              </div>
            )}

            <div style={{ marginTop: "auto", display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: u(36), paddingTop: u(20) }}>
              <div style={{ display: "flex", flexDirection: "column", gap: u(8), minWidth: u(300) }}>
                <span style={{ ...DISPLAY, fontSize: u(34), fontWeight: 700, letterSpacing: "-0.02em" }}>{SIGNER}</span>
                <span style={{ height: u(1.5), background: p.ink, width: u(300) }} />
                <span style={{ fontSize: u(14), color: p.muted }}>
                  {SIGNER_ROLE}, {ISSUER}
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: u(6), fontSize: u(14), color: p.muted }}>
                <span style={{ ...MONO, color: p.ink }}>Issued {fmtCertDate(cert.issuedAt)}</span>
                <span>
                  Verify at <b style={{ color: p.ink }}>{certDisplayUrl(cert.code)}</b>
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: u(14) }}>
                <QrSeal code={cert.code} size={104} border={p.ink} />
                <span style={{ ...MONO, fontSize: u(12), color: p.muted, maxWidth: u(80), lineHeight: 1.4 }}>scan to verify</span>
              </div>
            </div>

            <p style={{ margin: `${u(22)} 0 0`, fontSize: u(12), color: p.muted, lineHeight: 1.5 }}>
              {DISCLAIMER} Earned by reading every lesson and capstone and passing every trial, boss and {s?.offers ? `${s.offers.need} mock interviews` : "a mock interview"}; verify the ID above.
            </p>
          </div>
        </div>
      </div>
    </Sheet>
  );
}

const BP = { ground: "#123A63", line: "#CFE2F5", grid: "rgba(207,226,245,0.14)", name: "#FFFFFF", accent: "#FF8A57", qr: "#0E2A47" };

/** One box of the drawing's title block. */
function Cell({ label, value, big = false, accent = false, last = false }: { label: string; value: ReactNode; big?: boolean; accent?: boolean; last?: boolean }) {
  return (
    <div style={{ padding: `${u(18)} ${u(22)}`, borderBottom: last ? undefined : `${u(1.5)} solid ${BP.line}`, display: "flex", flexDirection: "column", gap: u(6), flex: 1, justifyContent: "center" }}>
      <span style={{ fontSize: u(12), opacity: 0.75, letterSpacing: "0.06em" }}>{label}</span>
      <span style={{ fontSize: u(big ? 34 : 26), fontWeight: 600, color: accent ? BP.accent : BP.name, whiteSpace: "nowrap" }}>{value}</span>
    </div>
  );
}

export function WorldCertificate({ cert, id }: { cert: CertificateView; id?: string }) {
  const w = cert.world;
  const s = cert.stats;
  const code = w?.code ?? cert.code.slice(1, 3);
  const title = w?.title ?? `World ${code}`;
  const topics = (w?.topics || []).slice(0, 6);
  const total = w?.of;
  const titleSize = title.length > 34 ? 48 : title.length > 24 ? 56 : 64;
  return (
    <Sheet id={id} label={`${CERT_TITLE}: ${cert.name} completed World ${code}, ${title}, of ${ISSUER}. Certificate ID ${cert.code}, issued ${fmtCertDate(cert.issuedAt)}.`}>
      <div style={{ ...MONO, position: "absolute", inset: 0, boxSizing: "border-box", padding: u(28), background: BP.ground, color: BP.line, overflow: "hidden" }}>
        <div aria-hidden style={{ position: "absolute", inset: 0, backgroundImage: `linear-gradient(${BP.grid} 1px, transparent 1px), linear-gradient(90deg, ${BP.grid} 1px, transparent 1px)`, backgroundSize: `${u(24)} ${u(24)}` }} />
        <div style={{ position: "relative", width: "100%", height: "100%", boxSizing: "border-box", border: `${u(2)} solid ${BP.line}`, display: "grid", gridTemplateColumns: `minmax(0, 1fr) ${u(320)}`, gridTemplateRows: "minmax(0, 1fr) auto" }}>
          <div style={{ padding: `${u(36)} ${u(44)} ${u(28)}`, display: "flex", flexDirection: "column", borderRight: `${u(1.5)} solid ${BP.line}`, minHeight: 0 }}>
            <span style={{ fontSize: u(14), letterSpacing: "0.16em", textTransform: "uppercase", color: BP.accent, fontWeight: 600 }}>
              Drawing no. {cert.code} · {CERT_TITLE}
            </span>
            <span style={{ marginTop: u(12), fontSize: u(14), letterSpacing: "0.04em", opacity: 0.85 }}>
              SPECIFICATION: World {code} of {ISSUER} cleared: every lesson read, every trial part passed at 80%+{cert.stats?.bosses.total ? ", its interview boss beaten" : ""}.
            </span>
            <h1 style={{ ...DISPLAY, margin: `${u(26)} 0 0`, fontWeight: 800, fontSize: u(titleSize), lineHeight: 0.98, letterSpacing: "-0.035em", color: BP.name }}>
              {title}
              <span style={{ color: BP.accent }}>.</span>
            </h1>
            <span style={{ ...SANS, marginTop: u(28), fontSize: u(17), opacity: 0.85 }}>Completed by</span>
            <span style={{ ...DISPLAY, marginTop: u(4), fontWeight: 700, fontSize: u(nameSize(cert.name, 52)), letterSpacing: "-0.03em", color: BP.name, lineHeight: 1.02, overflowWrap: "anywhere" }}>{cert.name}</span>
            {topics.length > 0 && (
              <ul style={{ ...SANS, margin: `${u(24)} 0 0`, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: u(9), fontSize: u(16), color: BP.name }}>
                {topics.map((t, i) => (
                  <li key={t} style={{ display: "flex", gap: u(12), alignItems: "center" }}>
                    <span style={{ ...MONO, fontSize: u(12), color: BP.accent, width: u(30) }}>{String(i + 1).padStart(2, "0")}</span>
                    {t}
                  </li>
                ))}
              </ul>
            )}
            <div aria-hidden style={{ marginTop: "auto", paddingTop: u(18), display: "flex", alignItems: "center", fontSize: u(12) }}>
              {["CLIENT", "LB", `WORLD ${code}`, "CACHE", "DB"].map((b, i) => (
                <span key={b} style={{ display: "flex", alignItems: "center" }}>
                  {i > 0 && <span style={{ width: u(36), height: u(1.5), background: BP.line }} />}
                  <span style={{ border: `${u(1.5)} solid ${i === 2 ? BP.accent : BP.line}`, color: i === 2 ? BP.accent : BP.line, padding: `${u(8)} ${u(12)}` }}>{b}</span>
                </span>
              ))}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
            <div style={{ padding: `${u(22)} ${u(22)} ${u(18)}`, borderBottom: `${u(1.5)} solid ${BP.line}`, display: "flex", flexDirection: "column", gap: u(2), background: "rgba(207,226,245,0.06)" }}>
              <span style={{ fontSize: u(12), opacity: 0.75 }}>WORLD</span>
              <span style={{ ...DISPLAY, fontWeight: 800, fontSize: u(120), lineHeight: 0.9, letterSpacing: "-0.05em", color: BP.name }}>{code}</span>
              {total ? <span style={{ fontSize: u(12), opacity: 0.75 }}>of {total} worlds</span> : null}
            </div>
            <Cell label="LESSONS READ" value={s ? `${s.lessons.done} / ${s.lessons.total}` : "—"} />
            <Cell label="TRIAL PARTS ≥ 80%" value={s ? `${s.trialParts.passed} / ${s.trialParts.total}` : "—"} />
            <Cell label="INTERVIEW BOSS" value={s && s.bosses.total ? (s.bosses.beaten ? "BEATEN" : "—") : "N/A"} accent={!!s?.bosses.beaten} last />
          </div>

          <div style={{ gridColumn: "1 / -1", borderTop: `${u(2)} solid ${BP.line}`, display: "grid", gridTemplateColumns: `minmax(0, 1.3fr) minmax(0, 0.8fr) minmax(0, 1.25fr) ${u(116)}` }}>
            <div style={{ padding: `${u(14)} ${u(20)}`, borderRight: `${u(1.5)} solid ${BP.line}`, display: "flex", flexDirection: "column", gap: u(4) }}>
              <span style={{ fontSize: u(11), opacity: 0.75 }}>ISSUED BY</span>
              <span style={{ ...DISPLAY, fontSize: u(24), fontWeight: 700, color: BP.name }}>{SIGNER}</span>
              <span style={{ fontSize: u(12), opacity: 0.85 }}>
                {SIGNER_ROLE}, {ISSUER}
              </span>
            </div>
            <div style={{ padding: `${u(14)} ${u(20)}`, borderRight: `${u(1.5)} solid ${BP.line}`, display: "flex", flexDirection: "column", gap: u(4) }}>
              <span style={{ fontSize: u(11), opacity: 0.75 }}>DATE</span>
              <span style={{ fontSize: u(18), color: BP.name }}>{fmtCertDate(cert.issuedAt).toUpperCase()}</span>
            </div>
            <div style={{ padding: `${u(14)} ${u(20)}`, borderRight: `${u(1.5)} solid ${BP.line}`, display: "flex", flexDirection: "column", gap: u(4), minWidth: 0 }}>
              <span style={{ fontSize: u(11), opacity: 0.75 }}>VERIFY</span>
              <span style={{ fontSize: u(14), color: BP.name, overflowWrap: "anywhere" }}>{certDisplayUrl(cert.code)}</span>
            </div>
            <div style={{ padding: u(10), display: "grid", placeItems: "center" }}>
              <QrSeal code={cert.code} size={92} border={BP.line} dark={BP.qr} />
            </div>
          </div>
        </div>
        <span style={{ position: "absolute", bottom: u(7), left: u(30), right: u(30), fontSize: u(10.5), opacity: 0.85 }}>{DISCLAIMER}</span>
      </div>
    </Sheet>
  );
}

/** The right design for a certificate. */
export function CertificateArt({ cert, theme = "paper", id }: { cert: CertificateView; theme?: "paper" | "dark"; id?: string }) {
  return cert.kind === "world" ? <WorldCertificate cert={cert} id={id} /> : <CourseCertificate cert={cert} theme={theme} id={id} />;
}
