/**
 * Case file "The Silent Cache Poisoning Disaster" (ShopFast, Black Friday): the CDN rule for /api/*
 * cached for 300 s with cache_key url_path and ignored the origin's headers, so User A's cart was
 * served to every later user of GET /api/user/cart (x-cache-hits: 47). The fix tab: personal
 * endpoints bypass the cache, public product pages stay cached by path.
 */
import { Box, defineExplainer, lerp, seg, Token, Txt, Wire, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 330;
const U = [
  { id: "A", y: 24 },
  { id: "B", y: 136 },
  { id: "C", y: 248 },
];
const UX = 16;
const UW = 116;
const UH = 58;
const CDN = { x: 176, y: 56, w: 236, h: 218 };
const ORI = { x: 440, y: 124, w: 148, h: 82 };

type Got = { text: string; tone: Tone } | null;
type Move = { from: { x: number; y: number }; to: { x: number; y: number }; p: number; tone: Tone };

const uR = (i: number) => ({ x: UX + UW, y: U[i].y + UH / 2 });
const cL = (i: number) => ({ x: CDN.x, y: U[i].y + UH / 2 });
const cR = { x: CDN.x + CDN.w, y: ORI.y + ORI.h / 2 };
const oL = { x: ORI.x, y: ORI.y + ORI.h / 2 };

function Scene({ variant, step, t, narrow }: SceneProps) {
  const fix = variant === "fix";
  const got: Got[] = [null, null, null];
  const moves: Move[] = [];
  const go = (i: number, a: number, b: number) => seg(t, a, b);
  let rows: { key: string; val: string; tone: Tone; hl?: boolean }[] = [];
  let status = "";
  let statusTone: Tone = undefined;
  let hits = 0;
  let originBusy = false;
  if (!fix) {
    if (step === 0) {
      moves.push({ from: uR(0), to: cL(0), p: go(0, 0, 0.4), tone: "lit" });
      moves.push({ from: cR, to: oL, p: go(0, 0.55, 1), tone: "lit" });
      rows = [{ key: "/api/user/cart", val: "(empty)", tone: "mute", hl: t > 0.4 }];
      status = t > 0.4 ? "MISS · forward to origin" : "";
      statusTone = "warn";
      originBusy = t > 0.9;
    } else if (step === 1) {
      moves.push({ from: oL, to: cR, p: go(1, 0, 0.45), tone: "sky" });
      moves.push({ from: cL(0), to: uR(0), p: go(1, 0.55, 1), tone: "ok" });
      rows = [{ key: "/api/user/cart", val: t > 0.45 ? (narrow ? "A's cart · 300 s" : "User A's cart · 300 s") : "(empty)", tone: t > 0.45 ? "warn" : "mute", hl: t > 0.4 && t < 0.6 }];
      if (t > 0.95) got[0] = { text: "A's cart ✓", tone: "ok" };
      status = t > 0.45 ? (narrow ? "stored by path only" : "stored under the path alone") : "";
      statusTone = "warn";
      originBusy = t < 0.4;
    } else {
      rows = [{ key: "/api/user/cart", val: narrow ? "A's cart · 300 s" : "User A's cart · 300 s", tone: "warn", hl: step === 2 && t > 0.35 && t < 0.7 }];
      got[0] = { text: "A's cart ✓", tone: "ok" };
      if (step === 2) {
        moves.push({ from: uR(1), to: cL(1), p: go(2, 0, 0.35), tone: "lit" });
        moves.push({ from: cL(1), to: uR(1), p: go(2, 0.65, 1), tone: "bad" });
        if (t > 0.95) got[1] = { text: "A's cart ✗", tone: "bad" };
        status = t > 0.35 ? (narrow ? "HIT · token_B ignored" : "HIT · token_B not in the key") : "";
        statusTone = "bad";
        hits = t > 0.65 ? 1 : 0;
      } else {
        got[1] = { text: "A's cart ✗", tone: "bad" };
        moves.push({ from: uR(2), to: cL(2), p: go(3, 0, 0.3), tone: "lit" });
        moves.push({ from: cL(2), to: uR(2), p: go(3, 0.4, 0.7), tone: "bad" });
        if (t > 0.7) got[2] = { text: "A's cart ✗", tone: "bad" };
        hits = Math.max(1, Math.round(lerp(1, 47, seg(t, 0.3, 1))));
        status = "cf-cache-status: HIT";
        statusTone = "bad";
      }
    }
  } else {
    rows = [
      { key: "/api/user/*", val: "bypass · ttl 0", tone: "ok", hl: step <= 1 },
      { key: "/api/products/*", val: step === 2 && t > 0.5 ? (narrow ? "cached · 300 s" : "same for all · 300 s") : "public · 300 s", tone: step === 2 ? "lit" : "mute", hl: step === 2 },
    ];
    if (step === 0) {
      [0, 1].forEach((i) => {
        moves.push({ from: uR(i), to: cL(i), p: go(0, i * 0.1, 0.35 + i * 0.1), tone: "lit" });
        moves.push({ from: { x: cR.x, y: cR.y + (i ? 10 : -10) }, to: { x: oL.x, y: oL.y + (i ? 10 : -10) }, p: go(0, 0.5 + i * 0.1, 0.9 + i * 0.1), tone: "lit" });
      });
      status = t > 0.4 ? "BYPASS · no cache entry" : "";
      statusTone = "ok";
      originBusy = t > 0.9;
    } else {
      [0, 1].forEach((i) => {
        if (step === 1) {
          moves.push({ from: { x: oL.x, y: oL.y + (i ? 10 : -10) }, to: { x: cR.x, y: cR.y + (i ? 10 : -10) }, p: go(1, i * 0.12, 0.4 + i * 0.12), tone: "ok" });
          moves.push({ from: cL(i), to: uR(i), p: go(1, 0.5 + i * 0.12, 0.85 + i * 0.12), tone: "ok" });
          if (t > 0.85 + i * 0.12) got[i] = { text: `${U[i].id}'s cart ✓`, tone: "ok" };
        } else got[i] = { text: `${U[i].id}'s cart ✓`, tone: "ok" };
      });
      if (step === 1) {
        status = narrow ? "origin reads each token" : "origin reads each Bearer token";
        statusTone = "ok";
        originBusy = t < 0.3;
      }
      if (step === 2) {
        moves.push({ from: uR(2), to: cL(2), p: go(2, 0, 0.4), tone: "lit" });
        moves.push({ from: cL(2), to: uR(2), p: go(2, 0.55, 1), tone: "ok" });
        if (t > 0.95) got[2] = { text: narrow ? "product ✓" : "product page ✓", tone: "ok" };
        status = t > 0.4 ? (narrow ? "HIT · public page" : "HIT · public product page") : "";
        statusTone = "ok";
      }
    }
  }
  const path = fix && step === 2 ? "/api/products/…" : "/api/user/cart";
  return (
    <g>
      {U.map((u, i) => (
        <g key={u.id}>
          <Box x={UX} y={u.y} w={UW} h={UH} label={`User ${u.id}`} sub={`token_${u.id}`} tone={got[i]?.tone} />
          <Wire d={`M${uR(i).x} ${uR(i).y}H${CDN.x}`} arrow tone={moves.some((m) => m.p > 0 && m.p < 1 && (m.from.y === uR(i).y || m.to.y === uR(i).y)) ? "lit" : undefined} />
          {got[i] && (
            <Txt x={UX + 4} y={u.y + UH + 15} k="s" anchor="start" tone={got[i]!.tone}>
              {got[i]!.text}
            </Txt>
          )}
        </g>
      ))}
      <rect x={CDN.x} y={CDN.y} width={CDN.w} height={CDN.h} className={`ax-box${!fix && step >= 2 ? " bad" : fix ? " ok" : ""}`} />
      <Txt x={CDN.x + 14} y={CDN.y + 24} anchor="start">
        CDN edge
      </Txt>
      <Txt x={CDN.x + 14} y={CDN.y + 44} k="s" anchor="start" tone={fix ? "ok" : "warn"}>
        {fix ? (narrow ? "per class" : "rule per endpoint") : narrow ? "key: path" : "cache_key: url_path"}
      </Txt>
      <Txt x={CDN.x + 14} y={CDN.y + 62} k="s" anchor="start">
        {`GET ${path}`}
      </Txt>
      {rows.map((r, i) => (
        <g key={i}>
          <rect x={CDN.x + 10} y={CDN.y + 74 + i * 58} width={CDN.w - 20} height={50} className={`cdn-row${r.hl ? " hl" : ""}`} />
          <Txt x={CDN.x + 20} y={CDN.y + 94 + i * 58} k="s" anchor="start" tone={r.hl ? "lit" : undefined}>
            {`key ${r.key}`}
          </Txt>
          <Txt x={CDN.x + 20} y={CDN.y + 114 + i * 58} k="s" anchor="start" tone={r.tone}>
            {`→ ${r.val}`}
          </Txt>
        </g>
      ))}
      {hits > 0 && (
        <Txt x={CDN.x + CDN.w / 2} y={CDN.y + CDN.h - 12} k="k" tone="bad">
          {`x-cache-hits: ${hits}`}
        </Txt>
      )}
      <Wire d={`M${cR.x} ${cR.y}H${oL.x}`} arrow tone={originBusy ? "lit" : undefined} />
      <Box x={ORI.x} y={ORI.y} w={ORI.w} h={ORI.h} label="Origin" sub={narrow ? "shopfast" : "api.shopfast.com"} tone={originBusy ? "lit" : undefined} dim={!fix && step >= 2} />
      {!fix && step >= 2 && (
        <Txt x={ORI.x + ORI.w / 2} y={ORI.y + ORI.h + 20} k="s" tone="mute">
          never asked
        </Txt>
      )}
      {moves
        .filter((m) => m.p > 0 && m.p < 1)
        .map((m, i) => (
          <Token key={i} x={lerp(m.from.x, m.to.x, m.p)} y={lerp(m.from.y, m.to.y, m.p)} s={11} tone={m.tone} />
        ))}
      <Txt x={CDN.x + CDN.w / 2} y={CDN.y - 14} k="k" tone={statusTone}>
        {status}
      </Txt>
    </g>
  );
}

export default defineExplainer({
  w: W,
  h: H,
  css: `.cdn-row{fill:none;stroke:var(--ax-line-soft);stroke-width:1.5}.cdn-row.hl{stroke:var(--ax-accent)}`,
  variants: [
    {
      id: "path",
      label: "Key = URL path",
      steps: [
        { caption: "User A requests /api/user/cart with token_A. Cache miss, so the edge forwards it to the origin.", tween: 1800, ms: 2400 },
        { caption: "The origin returns User A's cart. With cache_key url_path, the edge stores it under the path alone, for 300 s.", tween: 1800, ms: 3000 },
        { caption: "User B sends a different Bearer token, but the key ignores it: HIT, and B sees User A's cart.", tween: 1800, ms: 3000 },
        { caption: "Every user hitting that path in the next 300 seconds gets the same cart. x-cache-hits reached 47.", tween: 2200, ms: 3600 },
      ],
    },
    {
      id: "fix",
      label: "Bypass personal",
      steps: [
        { caption: "The fix: /api/user/* bypasses the cache (ttl 0, private). Every cart request goes through to the origin.", tween: 1800, ms: 2400 },
        { caption: "The origin reads each Bearer token, so User A gets A's cart and User B gets B's.", tween: 1600, ms: 2800 },
        { caption: "Public /api/products/* pages stay cached by path for 300 s: the same answer for everyone is safe to share.", tween: 1800, ms: 3600 },
      ],
    },
  ],
  Scene,
});
