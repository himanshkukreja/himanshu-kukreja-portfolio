import { ImageResponse } from "next/og";
import { C, Label, OG_SIZE, display, mono, ogFonts } from "./brand";
import { DSA_MARK_COLORS as K } from "@/lib/site/dsaMark";
import { Mark } from "./dsa-card";
import { DSA_CERT_NAME, type DsaCertView } from "@/lib/dsa/cert/rules";

/**
 * The share card of a DSA Mastery certificate (/dsa/cert/<code>): DSA's card frame (true black, dot grid, teal) with the
 * learner's name, the certificate and its ID. Unknown or private codes get the neutral card (no name).
 */
const TEAL = K.accent;
const ON_TEAL = "#021A16";

const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });

export async function dsaCertCard(v: DsaCertView | null) {
  const name = v && v.status === "valid" ? v.name : null;
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
          <div style={{ display: "flex", ...mono, fontSize: 22, color: C.fg3 }}>{v ? `systemdesignmastery.dev/dsa/cert/${v.code}` : "systemdesignmastery.dev/dsa"}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", flex: 1, padding: "0 64px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 48 }}>
            <div style={{ display: "flex", padding: "6px 12px", background: TEAL, ...mono, fontSize: 20, fontWeight: 600, letterSpacing: "0.08em", color: ON_TEAL }}>CERTIFICATE OF COMPLETION</div>
            {v && v.status === "valid" ? <Label color={C.fg2}>{`verified · issued ${fmt(v.issuedAt)}`}</Label> : null}
          </div>
          <div style={{ display: "flex", marginTop: 26, ...display, fontWeight: 800, fontSize: name ? 92 : 80, lineHeight: 1, letterSpacing: "-0.045em", color: C.fg, maxWidth: 1072 }}>
            {name || DSA_CERT_NAME}
          </div>
          <div style={{ display: "flex", marginTop: 22, fontSize: 30, color: C.fg2, maxWidth: 1000, lineHeight: 1.3 }}>
            {name ? `completed ${DSA_CERT_NAME}: the Foundations world, every concept, problem, checkpoint and the Launch week final.` : "Finish the Foundations world of DSA Mastery and earn a verifiable certificate."}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 18, marginTop: "auto", marginBottom: 40 }}>
            <Label>{v ? `ID ${v.code}` : "DSA-XXXX-XXXX"}</Label>
            <Label color={C.fg3}>{"signed by Himanshu Kukreja · System Design Mastery"}</Label>
          </div>
        </div>
        <div style={{ display: "flex", height: 10, background: TEAL }} />
      </div>
    ),
    { ...OG_SIZE, fonts: await ogFonts() },
  );
}
