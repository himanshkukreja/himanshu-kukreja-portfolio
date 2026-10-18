/**
 * Perimeter vs zero trust (week 9, day 5 · 1.2 / 1.3 / 3.1): with phished VPN credentials an attacker
 * passes the firewall; in the perimeter model everything inside is trusted, in zero trust every
 * service authenticates and authorizes each request (mTLS between services, least privilege).
 */
import { Box, defineExplainer, lerp, seg, Token, Txt, Wire, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 320;
const FW = 158;
const NET = { x: 182, y: 50, w: 394, h: 238 };
const APP = { x: 214, y: 82, w: 132, h: 56 };
const API = { x: 214, y: 210, w: 132, h: 56 };
const DB = { x: 430, y: 146, w: 124, h: 56 };
const GATE = 14;
const START = { x: 70, y: 176 };
const INSIDE = { x: 200, y: 176 };

function Gate({ x, y, h, tone }: { x: number; y: number; h: number; tone?: Tone }) {
  return (
    <g>
      <rect className={`zt-gate${tone ? ` ${tone}` : ""}`} x={x - GATE} y={y} width={GATE} height={h} />
    </g>
  );
}

function Stage({ narrow, zt, subs, tones, gates }: { narrow: boolean; zt: boolean; subs: [string, string, string]; tones: [Tone, Tone, Tone]; gates?: [Tone, Tone, Tone] }) {
  return (
    <g>
      <Txt x={24} y={66} k="k" anchor="start" tone="mute">
        internet
      </Txt>
      <rect className="zt-net" x={NET.x} y={NET.y} width={NET.w} height={NET.h} />
      <Txt x={NET.x + 12} y={NET.y + 20} k="k" anchor="start" tone={zt ? "mute" : "ok"}>
        {zt ? (narrow ? "network · no trust" : "network · no implicit trust") : narrow ? "inside · trusted" : "corporate network · all trusted"}
      </Txt>
      <rect className="zt-fw" x={FW - 6} y={NET.y} width={12} height={NET.h} />
      <Txt x={FW} y={NET.y + NET.h + 22} k="s">
        firewall
      </Txt>
      <Wire d={`M${APP.x + APP.w} ${APP.y + APP.h / 2}C${APP.x + APP.w + 40} ${APP.y + APP.h / 2} ${DB.x - 50} ${DB.y + 18} ${DB.x - (zt ? GATE : 0)} ${DB.y + 18}`} arrow />
      <Wire d={`M${API.x + API.w} ${API.y + API.h / 2}C${API.x + API.w + 40} ${API.y + API.h / 2} ${DB.x - 50} ${DB.y + 38} ${DB.x - (zt ? GATE : 0)} ${DB.y + 38}`} arrow />
      <Box x={APP.x} y={APP.y} w={APP.w} h={APP.h} label="App" sub={subs[0]} tone={tones[0]} />
      <Box x={API.x} y={API.y} w={API.w} h={API.h} label="API" sub={subs[1]} tone={tones[1]} />
      <Box x={DB.x} y={DB.y} w={DB.w} h={DB.h} label="DB" sub={subs[2]} tone={tones[2]} />
      {zt && gates && (
        <g>
          <Gate x={APP.x} y={APP.y} h={APP.h} tone={gates[0]} />
          <Gate x={API.x} y={API.y} h={API.h} tone={gates[1]} />
          <Gate x={DB.x} y={DB.y} h={DB.h} tone={gates[2]} />
          {!narrow && (
            <Txt x={DB.x - GATE / 2} y={DB.y - 8} k="s" tone={gates[2] || "lit"}>
              auth
            </Txt>
          )}
        </g>
      )}
    </g>
  );
}

function Perimeter({ step, t, narrow }: SceneProps) {
  const enter = step === 1 ? seg(t, 0.1, 0.8) : step > 1 ? 1 : 0;
  const roam = step === 2 ? seg(t, 0.1, 0.9) : 0;
  const pos = step < 2 ? { x: lerp(START.x, INSIDE.x, enter), y: START.y } : roam < 0.5 ? { x: lerp(INSIDE.x, DB.x - 10, roam * 2), y: lerp(INSIDE.y, DB.y + DB.h / 2, roam * 2) } : { x: lerp(DB.x - 10, API.x + API.w / 2, (roam - 0.5) * 2), y: lerp(DB.y + DB.h / 2, API.y - 10, (roam - 0.5) * 2) };
  const hitDb = step === 2 && roam >= 0.5;
  const hitApi = step === 2 && roam >= 1;
  return (
    <g>
      <Txt x={24} y={32} k="k" anchor="start" tone={step === 2 ? "bad" : undefined}>
        {step === 2 ? (narrow ? "once inside: free access" : "once inside: free access") : narrow ? "perimeter model" : "perimeter model · the firewall is the only check"}
      </Txt>
      <Stage
        narrow={narrow}
        zt={false}
        subs={["trusted", hitApi ? "reached ✗" : "trusted", hitDb ? "reached ✗" : "trusted"]}
        tones={[undefined, hitApi ? "bad" : undefined, hitDb ? "bad" : undefined]}
      />
      {step >= 2 && <path className="zt-trail" d={`M${INSIDE.x} ${INSIDE.y}L${DB.x - 10} ${DB.y + DB.h / 2}`} opacity={seg(roam, 0, 0.5)} />}
      <Token x={pos.x} y={pos.y} s={14} tone="bad" label={narrow ? undefined : step === 0 ? "attacker" : undefined} />
      {step >= 1 && (
        <Txt x={FW + 12} y={START.y + 30} k="s" anchor="start" tone="warn" opacity={enter}>
          VPN ✓
        </Txt>
      )}
    </g>
  );
}

function ZeroTrust({ step, t, narrow }: SceneProps) {
  const enter = step === 1 ? seg(t, 0.1, 0.8) : step > 1 ? 1 : 0;
  const tryDb = step === 2 ? seg(t, 0.05, 0.55) : 0;
  const back = step === 2 ? seg(t, 0.6, 0.9) : 0;
  const denied = step >= 2 && (step > 2 || tryDb >= 1);
  const call = step === 3 ? seg(t, 0.1, 0.7) : 0;
  const ok = step === 3 && call >= 1;
  const at = { x: DB.x - GATE - 10, y: DB.y + DB.h / 2 };
  const pos =
    step < 2
      ? { x: lerp(START.x, INSIDE.x, enter), y: START.y }
      : step === 2
        ? back > 0
          ? { x: lerp(at.x, INSIDE.x + 30, back), y: lerp(at.y, INSIDE.y, back) }
          : { x: lerp(INSIDE.x, at.x, tryDb), y: lerp(INSIDE.y, at.y, tryDb) }
        : { x: INSIDE.x + 30, y: INSIDE.y };
  const appTok = { x: lerp(APP.x + APP.w, DB.x - GATE - 6, call), y: lerp(APP.y + APP.h / 2, DB.y + 18, call) };
  return (
    <g>
      <Txt x={24} y={32} k="k" anchor="start" tone={step === 2 ? "bad" : step === 3 ? "ok" : undefined}>
        {step === 0 ? (narrow ? "zero trust" : "zero trust · never trust, always verify") : step === 1 ? (narrow ? "inside the network" : "inside the network · still untrusted") : step === 2 ? (narrow ? "DB: denied" : "DB checks the request: denied") : narrow ? "app → DB: allowed" : "app → DB: verified, least privilege"}
      </Txt>
      <Stage
        narrow={narrow}
        zt
        subs={[ok ? (narrow ? "read only" : "mTLS · read only") : narrow ? "verifies" : "verifies all", narrow ? "verifies" : "verifies all", denied && step === 2 ? "denied ✗" : ok ? "read ✓" : narrow ? "verifies" : "verifies all"]}
        tones={[ok ? "ok" : undefined, undefined, denied && step === 2 ? "bad" : ok ? "ok" : undefined]}
        gates={["lit", "lit", denied && step === 2 ? "bad" : ok ? "ok" : "lit"]}
      />
      <Token x={pos.x} y={pos.y} s={14} tone="bad" opacity={step === 3 ? 0.4 : 1} />
      {step >= 1 && (
        <Txt x={FW + 12} y={START.y + 30} k="s" anchor="start" tone="warn" opacity={enter}>
          VPN ✓
        </Txt>
      )}
      {step === 2 && (
        <Txt x={DB.x + DB.w / 2} y={DB.y + DB.h + 20} k="s" tone="bad" opacity={seg(t, 0.45, 0.7)}>
          {narrow ? "authN/authZ ✗" : "no identity, no grant ✗"}
        </Txt>
      )}
      {step === 3 && call < 1 && <Token x={appTok.x} y={appTok.y} s={12} tone="ok" />}
    </g>
  );
}

function Scene(p: SceneProps) {
  return p.variant === "zero" ? <ZeroTrust {...p} /> : <Perimeter {...p} />;
}

export default defineExplainer({
  w: W,
  h: H,
  css: `.zt-net{fill:none;stroke:var(--ax-line);stroke-width:1.5;stroke-dasharray:6 6}
.zt-fw{fill:var(--ax-amber);opacity:.7}
.zt-gate{fill:var(--ax-accent)}.zt-gate.bad{fill:var(--ax-bad)}.zt-gate.ok{fill:var(--ax-ok)}
.zt-trail{fill:none;stroke:var(--ax-bad);stroke-width:2;stroke-dasharray:4 5}`,
  variants: [
    {
      id: "perimeter",
      label: "Perimeter",
      steps: [
        { caption: "Perimeter model: the firewall is the only check. Inside the corporate network, App, DB and API trust each other.", ms: 3200 },
        { caption: "An attacker phishes an employee's VPN credentials and passes the firewall like any employee would.", tween: 1600, ms: 2800 },
        { caption: "Once inside, nothing checks again: the attacker reaches the database and the API freely.", tween: 2400, ms: 3400 },
      ],
    },
    {
      id: "zero",
      label: "Zero trust",
      steps: [
        { caption: "Zero trust: each service has its own auth. Every connection authenticated, every request authorized, wherever it comes from.", ms: 3400 },
        { caption: "The same attacker gets onto the network with the phished VPN credentials. Network location grants nothing.", tween: 1600, ms: 2800 },
        { caption: "Their request to the database fails its own authentication and authorization check: denied.", tween: 2000, ms: 3200 },
        { caption: "The app's call to the database is verified over mTLS and authorized for what it needs: read, not schema changes.", tween: 1600, ms: 3600 },
      ],
    },
  ],
  Scene,
});
