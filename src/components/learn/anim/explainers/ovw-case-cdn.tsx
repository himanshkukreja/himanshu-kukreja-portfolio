/**
 * The whole case file "The CDN cache poisoning disaster": ShopFast's Black Friday, 10:47 AM,
 * customers seeing other people's carts while every backend dashboard is green; the HIT with
 * x-cache-hits 47; the rule that cached /api/* by URL path for 300 s and ignored the origin's
 * headers; purge, bypass, Vary; classifying endpoints and three layers of checks; impact, recovery
 * and "caching is a security boundary".
 */
import { Box, defineExplainer, ease, lerp, seg, Token, Txt, Wire, type SceneProps, type Tone } from "../kit";


const W = 600;
const H = 340;
type L = string | readonly [string, string];
const pk = (l: L, n: boolean) => (typeof l === "string" ? l : n ? l[1] : l[0]);
const fade = (t: number, i = 0, n = 0.14) => ease(seg(t, 0.1 + i * n, 0.4 + i * n));

function Head({ k, c, tone, narrow }: { k: L; c?: L; tone?: Tone; narrow: boolean }) {
  return (
    <g>
      <Txt x={16} y={28} k="k" anchor="start" tone={tone}>
        {pk(k, narrow)}
      </Txt>
      {c && (
        <Txt x={W - 16} y={28} k="k" anchor="end" tone={tone || "mute"}>
          {pk(c, narrow)}
        </Txt>
      )}
    </g>
  );
}

function Chips({ items, t, y = 290, tone, narrow }: { items: L[]; t: number; y?: number; tone?: Tone; narrow: boolean }) {
  const w = (W - 32 - (items.length - 1) * 8) / items.length;
  return (
    <g>
      {items.map((l, i) => {
        const x = 16 + i * (w + 8);
        return (
          <g key={i} opacity={fade(t, i)}>
            <rect className={`ax-box ${tone || ""}`} x={x} y={y} width={w} height={32} />
            <Txt x={x + w / 2} y={y + 21} k="s" tone={tone}>
              {pk(l, narrow)}
            </Txt>
          </g>
        );
      })}
    </g>
  );
}

function Figs({ items, t, y = 288, narrow }: { items: [L, L, Tone?][]; t: number; y?: number; narrow: boolean }) {
  const w = W / items.length;
  return (
    <g>
      {items.map(([d, s, tone], i) => (
        <g key={i} opacity={fade(t, i, 0.18)}>
          <Txt x={w * (i + 0.5)} y={y} k="d" tone={tone}>
            {pk(d, narrow)}
          </Txt>
          <Txt x={w * (i + 0.5)} y={y + 28} k="s">
            {pk(s, narrow)}
          </Txt>
        </g>
      ))}
    </g>
  );
}

/** User A, User B, the CDN edge and the origin API */
function Net({ narrow, edge, origin, a, b, cache, sub }: { narrow: boolean; edge?: Tone; origin?: Tone; a?: Tone; b?: Tone; cache?: string; sub?: string }) {
  return (
    <g>
      <Box x={16} y={56} w={120} h={52} label="User A" sub={narrow ? undefined : "token_A"} tone={a || "sky"} />
      <Box x={16} y={160} w={120} h={52} label="User B" sub={narrow ? undefined : "token_B"} tone={b || "sky"} />
      <Wire d="M136 82H180V110H220" arrow />
      <Wire d="M136 186H180V158H220" arrow />
      <rect className={`ax-box ${edge || ""}`} x={220} y={70} width={190} height={128} />
      <Txt x={315} y={94} k="t">
        {narrow ? "CDN" : "CDN edge"}
      </Txt>
      {cache && (
        <Txt x={315} y={150} k="s" tone={edge}>
          {cache}
        </Txt>
      )}
      {sub && (
        <Txt x={315} y={176} k="s">
          {sub}
        </Txt>
      )}
      <Wire d="M410 134H450" arrow />
      <Box x={450} y={100} w={134} h={68} label="Origin" sub={narrow ? "API" : "api.shopfast"} tone={origin} />
    </g>
  );
}
const tok = (pts: [number, number][], t: number, a: number, b: number, tone?: Tone) => {
  const q = seg(t, a, b);
  if (q <= 0 || q >= 1) return null;
  const k = ease(q) * (pts.length - 1);
  const i = Math.min(pts.length - 2, Math.floor(k));
  const f = k - i;
  return <Token x={lerp(pts[i][0], pts[i + 1][0], f)} y={lerp(pts[i][1], pts[i + 1][1], f)} tone={tone} />;
};

function Hook({ step, t, narrow }: SceneProps) {
  if (step === 0) {
    return (
      <g>
        <Head k={["ShopFast · Black Friday", "Black Friday"]} c="10:47 AM" tone="bad" narrow={narrow} />
        {[
          ["someone else's cart: $2,400", "a stranger's cart"],
          ["logged into the wrong account", "wrong account"],
          ["partial card info, a stranger's", "card digits"],
        ].map(([w, n], i) => (
          <g key={w} opacity={fade(t, i, 0.18)}>
            <rect className="ax-box bad" x={16} y={52 + i * 54} width={400} height={42} />
            <Txt x={30} y={78 + i * 54} k="s" anchor="start" tone="bad">
              {narrow ? n : w}
            </Txt>
          </g>
        ))}
        <Box x={440} y={52} w={144} h={150} label="Backend" sub={narrow ? "green" : "all green"} tone="ok" />
        <Figs items={[["500,000", narrow ? "users online" : "concurrent users"], ["~15,000", narrow ? "exposed" : "customers exposed", "bad"], ["12", narrow ? "edges" : "edge locations"]]} y={262} t={seg(t, 0.3, 1)} narrow={narrow} />
      </g>
    );
  }
  if (step === 1) {
    return (
      <g>
        <Head k={["the wrong places to look", "misdirection"]} c={["backend is fine", "backend fine"]} tone="warn" narrow={narrow} />
        {[
          ["database: carts", "carts", "ok"],
          ["auth logs", "auth", "ok"],
          ["recent commits", "commits", "ok"],
        ].map(([w, n], i) => (
          <g key={w} opacity={fade(t, i, 0.16)}>
            <Box x={16 + i * 196} y={60} w={176} h={60} label={narrow ? n : w} sub="healthy" tone="ok" />
          </g>
        ))}
        <g opacity={fade(t, 3)}>
          <Box x={16} y={150} w={568} h={60} label={narrow ? "The edge" : "The edge layer"} sub={narrow ? "answers alone" : "answers without the backend ever knowing"} tone="bad" />
        </g>
        <Chips items={[["monitoring watched only the origin", "origin-only monitoring"]]} t={t} tone="warn" narrow={narrow} />
      </g>
    );
  }
  return (
    <g>
      <Head k={["the aha moment", "aha"]} c="curl -I" tone="bad" narrow={narrow} />
      <rect className="ax-box bad" x={16} y={52} width={568} height={150} />
      {[
        ["HTTP/2 200", undefined],
        ["cache-control: public, max-age=300", "bad"],
        ["cf-cache-status: HIT", "bad"],
        ["x-cache-hits: 47", "bad"],
      ].map(([l, tone], i) => (
        <g key={l} opacity={fade(t, i, 0.15)}>
          <Txt x={36} y={84 + i * 34} k="t" anchor="start" tone={tone as Tone}>
            {narrow ? l!.replace("cache-control: ", "").replace("cf-cache-status: ", "status: ") : l}
          </Txt>
        </g>
      ))}
      <Chips items={[["47 users got the same cart", "47 users, 1 cart"]]} t={seg(t, 0.5, 1)} tone="bad" narrow={narrow} />
    </g>
  );
}

const A_IN: [number, number][] = [[136, 82], [180, 82], [180, 110], [220, 110], [410, 134], [450, 134]];
const B_IN: [number, number][] = [[136, 186], [180, 186], [180, 158], [220, 158], [300, 158]];
function Cause({ step, t, narrow }: SceneProps) {
  if (step === 0) {
    const stored = t > 0.45;
    return (
      <g>
        <Head k={["how one cart reached 47", "one cart, 47 users"]} c="GET /api/user/cart" narrow={narrow} />
        <Net narrow={narrow} edge={stored ? "bad" : undefined} b={t > 0.9 ? "bad" : undefined} cache={stored ? (narrow ? "key: path" : "key: /api/user/cart") : undefined} sub={stored ? (narrow ? "A's cart" : "= User A's cart") : undefined} />
        {tok(A_IN, t, 0.05, 0.4)}
        {tok(B_IN, t, 0.55, 0.85, "bad")}
        <Chips items={[["A: miss → stored by path", "A: miss, stored"], ["B: HIT on A's cart", "B: HIT, A's cart"]]} t={seg(t, 0.4, 1)} tone="bad" narrow={narrow} />
      </g>
    );
  }
  if (step === 1) {
    const rows: [string, string, Tone][] = [
      ["pattern", "/api/*", undefined],
      ["cache_ttl", "300", undefined],
      ["cache_key", "url_path", "bad"],
      ["respect_origin_headers", "false", "bad"],
    ];
    return (
      <g>
        <Head k={["the CDN rule", "the rule"]} c={["the chain of mistakes", "the chain"]} tone="bad" narrow={narrow} />
        <rect className="ax-box bad" x={16} y={50} width={330} height={170} />
        {rows.map(([k, v, tone], i) => (
          <g key={k} opacity={fade(t, i, 0.12)}>
            <Txt x={30} y={82 + i * 38} k="s" anchor="start">
              {narrow && k === "respect_origin_headers" ? "origin hdrs" : k}
            </Txt>
            <Txt x={334} y={82 + i * 38} k="t" anchor="end" tone={tone}>
              {v}
            </Txt>
          </g>
        ))}
        <Box x={380} y={50} w={204} h={80} label="Origin says" sub={narrow ? "private" : "private, no-cache"} tone="ok" />
        <Wire d="M482 130V170H346" arrow dash tone="bad" />
        <Txt x={466} y={200} k="s" tone="bad" opacity={fade(t, 4)}>
          ignored
        </Txt>
        <Chips items={[["Vary: Authorization, ignored too", "Vary ignored"]]} t={seg(t, 0.4, 1)} tone="bad" narrow={narrow} />
      </g>
    );
  }
  return (
    <g>
      <Head k={["why Black Friday", "why that day"]} tone="warn" narrow={narrow} />
      {[
        ["high traffic", "more cache hits on personal data", "more hits"],
        ["new CDN config", "deployed the week before", "new config"],
        ["load tests", "no multi-user, same-URL scenarios", "single-user"],
        ["monitoring", "checked the backend, not the edge", "origin only"],
      ].map(([k, w, n], i) => (
        <g key={k} opacity={fade(t, i, 0.15)}>
          <rect className="ax-box warn" x={16} y={50 + i * 56} width={568} height={44} />
          <Txt x={30} y={77 + i * 56} k="k" anchor="start" tone="warn">
            {k}
          </Txt>
          <Txt x={570} y={77 + i * 56} k="s" anchor="end">
            {narrow ? n : w}
          </Txt>
        </g>
      ))}
      <Chips items={[["some edges respected origin headers, some didn't", "edges differed"]]} t={seg(t, 0.5, 1)} tone="warn" narrow={narrow} />
    </g>
  );
}

function Fix({ step, t, narrow }: SceneProps) {
  if (step === 0) {
    const acts: [string, string, string][] = [
      ["Purge", "personal caches", "0–5 min"],
      ["Bypass", "personal endpoints", "5–10 min"],
      ["Vary", "Authorization, Cookie", "10–15 min"],
    ];
    return (
      <g>
        <Head k={["the first three actions", "first 3 actions"]} c={["damage control", "contain"]} tone="ok" narrow={narrow} />
        {acts.map(([l, s, c], i) => (
          <g key={l} opacity={fade(t, i, 0.18)}>
            <Box x={16 + i * 196} y={70} w={176} h={70} label={l} sub={narrow ? undefined : s} tone="ok" />
            <Txt x={104 + i * 196} y={162} k="k" tone="mute">
              {c}
            </Txt>
            {i < 2 && <Wire d={`M${192 + i * 196} 105H${212 + i * 196}`} arrow tone="ok" />}
          </g>
        ))}
        <Chips items={[["private, no-store on /api/user/*", "no-store on personal"]]} t={seg(t, 0.5, 1)} tone="ok" narrow={narrow} />
      </g>
    );
  }
  if (step === 1) {
    const cls: [string, string, string, Tone][] = [
      ["STATIC", "/assets · 24 h", "24 h", "ok"],
      ["SEMI_STATIC", "/api/products · 5 min", "5 min", "ok"],
      ["USER_SPECIFIC", "/api/user, cart · none", "never", "bad"],
      ["SESSION", "1 min · user in key", "user in key", "warn"],
    ];
    return (
      <g>
        <Head k={["classify every endpoint", "classify"]} c={["then cache", "then cache"]} tone="ok" narrow={narrow} />
        {cls.map(([l, s, n, tone], i) => (
          <g key={l} opacity={fade(t, i, 0.14)}>
            <rect className={`ax-box ${tone}`} x={16} y={50 + i * 56} width={568} height={44} />
            <Txt x={30} y={77 + i * 56} k="t" anchor="start">
              {narrow && l === "USER_SPECIFIC" ? "USER" : narrow && l === "SEMI_STATIC" ? "SEMI" : l}
            </Txt>
            <Txt x={570} y={77 + i * 56} k="s" anchor="end" tone={tone}>
              {narrow ? n : s}
            </Txt>
          </g>
        ))}
        <Chips items={[["whose data is this?", "whose data?"]]} t={seg(t, 0.5, 1)} tone="ok" narrow={narrow} />
      </g>
    );
  }
  return (
    <g>
      <Head k={["defence in depth", "in depth"]} c={["never again", "never again"]} tone="ok" narrow={narrow} />
      <Net narrow={narrow} edge="ok" a="ok" b="ok" origin="ok" cache={narrow ? "BYPASS" : "personal: BYPASS"} sub={narrow ? undefined : "products: HIT"} />
      <Chips items={[["app headers", "headers"], ["CDN rules", "CDN rules"], ["multi-user tests", "2-user tests"], ["edge monitoring", "edge watch"]]} t={t} tone="ok" narrow={narrow} />
    </g>
  );
}

function After({ step, t, narrow }: SceneProps) {
  if (step === 0) {
    return (
      <g>
        <Head k={["the damage", "the damage"]} tone="bad" narrow={narrow} />
        <Figs items={[["15,000", narrow ? "affected" : "users affected", "bad"], ["347", narrow ? "tickets, 2 h" : "tickets in 2 hours"]]} y={110} t={t} narrow={narrow} />
        <Figs items={[["23", narrow ? "saw card info" : "saw partial payment info", "bad"], ["1,200+", narrow ? "wrong carts" : "saw the wrong cart"]]} y={210} t={seg(t, 0.3, 1)} narrow={narrow} />
        <Chips items={[["potential GDPR exposure", "GDPR risk"]]} t={seg(t, 0.5, 1)} tone="bad" narrow={narrow} />
      </g>
    );
  }
  if (step === 1) {
    const ph: [string, string, string][] = [
      ["0–30 min", "contain", "purge, bypass, tell customers"],
      ["30 min–4 h", "fix", "root cause, config, monitoring"],
      ["4 h–2 weeks", "recover", "outreach, resets, GDPR notices"],
    ];
    return (
      <g>
        <Head k={["the recovery", "recovery"]} c={["three phases", "3 phases"]} tone="ok" narrow={narrow} />
        {ph.map(([c, l, s], i) => (
          <g key={c} opacity={fade(t, i, 0.18)}>
            <rect className="ax-box ok" x={16} y={52 + i * 66} width={568} height={54} />
            <Txt x={30} y={84 + i * 66} k="k" anchor="start" tone="mute">
              {c}
            </Txt>
            <Txt x={570} y={84 + i * 66} k="s" anchor="end">
              {narrow ? l : s}
            </Txt>
          </g>
        ))}
        <Chips items={[["CDN changes now need security review", "security reviews CDN"]]} t={seg(t, 0.5, 1)} tone="ok" narrow={narrow} />
      </g>
    );
  }
  return (
    <g>
      <Head k="the lesson" tone="ok" narrow={narrow} />
      <Txt x={300} y={110} k="t">
        {narrow ? "caching is a" : "caching is not just performance:"}
      </Txt>
      <Txt x={300} y={150} k="d" tone="lit" opacity={fade(t, 1)}>
        {narrow ? "security line" : "a security boundary"}
      </Txt>
      <Txt x={300} y={204} k="s" opacity={fade(t, 2)}>
        {narrow ? "whose data, who sees it?" : "max-age=300: whose data, and who might see it?"}
      </Txt>
      <Chips items={[["user context in the key", "user in key"], ["or never cache it", "or bypass"]]} t={t} tone="ok" narrow={narrow} />
    </g>
  );
}

function Scene(p: SceneProps) {
  if (p.variant === "cause") return <Cause {...p} />;
  if (p.variant === "fix") return <Fix {...p} />;
  if (p.variant === "after") return <After {...p} />;
  return <Hook {...p} />;
}

export default defineExplainer({
  w: W,
  h: H,
  variants: [
    {
      id: "hook",
      label: "10:47 AM",
      steps: [
        { caption: "Black Friday at ShopFast, 10:47 AM. About 15,000 customers see strangers' carts, accounts and card digits, yet every backend dashboard is green.", tween: 1600, ms: 3600 },
        { caption: "David checks the database, auth logs and recent commits. All healthy. The problem lives at the edge, which answers without the backend knowing.", tween: 1400 },
        { caption: "Then one curl: cache-control public, max-age 300, cf-cache-status HIT, x-cache-hits 47. Forty-seven users got the same cart.", tween: 1600 },
      ],
    },
    {
      id: "cause",
      label: "Root cause",
      steps: [
        { caption: "User A's GET /api/user/cart misses and is cached under the path alone. User B, with a different token, gets a HIT: User A's cart.", tween: 2400, ms: 3400 },
        { caption: "The CDN rule cached /api/* for 300 seconds, keyed by URL path, and ignored the origin's headers, so private, no-cache and Vary did nothing.", tween: 1400, ms: 3400 },
        { caption: "Why that day: heavy traffic meant more hits, a new config shipped the week before, load tests used one user, monitoring watched only the backend.", tween: 1600, ms: 3400 },
      ],
    },
    {
      id: "fix",
      label: "The fix",
      steps: [
        { caption: "Damage control in minutes: purge the personal caches, force personal endpoints to bypass the CDN, and add Vary on Authorization and Cookie.", tween: 1400 },
        { caption: "Then classify endpoints: static assets cache 24 hours, product pages 5 minutes, user data never, session data only with the user in the key.", tween: 1400, ms: 3400 },
        { caption: "Defence in depth: app headers, CDN rules, automated tests that call each endpoint as two users, and monitoring of the edge itself.", tween: 1200 },
      ],
    },
    {
      id: "after",
      label: "The cost",
      steps: [
        { caption: "The damage: 15,000 users affected, 347 support tickets in two hours, 23 customers shown partial payment details, 1,200+ wrong carts.", tween: 1400 },
        { caption: "Recovery ran in three phases: contain within 30 minutes, fix within 4 hours, then two weeks of outreach, resets and GDPR notices.", tween: 1400 },
        { caption: "The lesson: caching is a security boundary. Before adding max-age, ask whose data you're caching, and who might see it.", tween: 1200 },
      ],
    },
  ],
  Scene,
});
