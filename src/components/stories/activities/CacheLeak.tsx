"use client";

import { useState } from "react";
import ActivityShell from "./ActivityShell";
import { BTN_GHOST, BTN_PRIMARY, ClassifyStep, Feedback, SpotStep, StepPrompt } from "./kit";
import type { ActivityProps } from "./registry";
import type { ActivityDef, StepCtx } from "./types";

type Req = { who: "Alice" | "Bob"; path: string; personal: boolean };
const TRAFFIC: Req[] = [
  { who: "Alice", path: "/api/user/cart", personal: true },
  { who: "Bob", path: "/api/user/cart", personal: true },
  { who: "Alice", path: "/api/products/123", personal: false },
  { who: "Bob", path: "/api/products/123", personal: false },
];

type Row = { req: Req; key: string; status: "HIT" | "MISS" | "BYPASS"; body: string; leak: boolean };

function replay(authInKey: boolean, bypassUser: boolean): Row[] {
  const cache = new Map<string, string>();
  return TRAFFIC.map((req) => {
    const own = req.personal ? `${req.who}'s cart` : "product 123";
    if (bypassUser && req.personal) return { req, key: "(bypass)", status: "BYPASS", body: own, leak: false };
    const key = authInKey ? `${req.path} : token_${req.who[0]}` : req.path;
    const hit = cache.get(key);
    if (hit) return { req, key, status: "HIT", body: hit, leak: req.personal && hit !== own };
    cache.set(key, own);
    return { req, key, status: "MISS", body: own, leak: false };
  });
}

function KeyLab({ ctx }: { ctx: StepCtx }) {
  const [auth, setAuth] = useState(false);
  const [bypass, setBypass] = useState(false);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [runs, setRuns] = useState(0);
  const [shipped, setShipped] = useState(false);
  const leaks = rows ? rows.filter((r) => r.leak).length : 0;
  const productHits = rows ? rows.filter((r) => !r.req.personal && r.status === "HIT").length : 0;
  const goal = !!rows && leaks === 0 && productHits > 0;

  const toggle = (which: "auth" | "bypass") => {
    if (shipped) return;
    if (which === "auth") setAuth(!auth);
    else setBypass(!bypass);
    setRows(null);
  };
  const run = () => {
    if (shipped) return;
    setRows(replay(auth, bypass));
    setRuns(runs + 1);
  };
  const ship = () => {
    if (!rows || shipped) return;
    setShipped(true);
    ctx.done(goal ? (runs <= 2 ? 2 : 1) : 0);
  };

  return (
    <div className="flex flex-col gap-4">
      <StepPrompt sub="Change the edge config, replay four requests, and ship when no one sees anyone else's cart and products still come from cache.">
        Cache key lab: stop the leak without killing the cache.
      </StepPrompt>
      <div className="grid gap-2 sm:grid-cols-2" role="group" aria-label="Edge config">
        {(
          [
            ["auth", auth, "Add Authorization to the cache key", "key = url_path + token"],
            ["bypass", bypass, "Bypass the cache for /api/user/*", "cache_ttl: 0 · bypass_cache: true"],
          ] as const
        ).map(([id, on, text, hint]) => (
          <button
            key={id}
            type="button"
            role="switch"
            aria-checked={on}
            disabled={shipped}
            onClick={() => toggle(id)}
            className={`flex min-h-14 items-center gap-3 border px-3.5 py-2.5 text-left disabled:cursor-default ${on ? "border-signal bg-signal/10" : "border-line-strong bg-bg hover:bg-surface-2"}`}
          >
            <span aria-hidden className={`relative h-6 w-10 shrink-0 border ${on ? "border-signal bg-signal" : "border-line-strong bg-surface-2"}`}>
              <span className={`absolute top-0.5 h-[18px] w-[18px] ${on ? "right-0.5 bg-on-signal" : "left-0.5 bg-fg-3"}`} />
            </span>
            <span className="flex flex-col gap-0.5">
              <span className="text-[15px] font-semibold text-fg">{text}</span>
              <span className="font-mono text-[11px] text-fg-3">{hint}</span>
            </span>
          </button>
        ))}
      </div>
      <div className="border border-line-strong bg-bg">
        <div className="flex items-center justify-between gap-3 border-b border-line px-3 py-2 font-mono text-[11px] text-fg-3">
          <span>edge: us-west-1 · respect_origin_headers: false</span>
          <span>{rows ? `replay #${runs}` : "not run"}</span>
        </div>
        <ol className="m-0 flex list-none flex-col p-0" aria-live="polite">
          {TRAFFIC.map((req, i) => {
            const r = rows?.[i];
            return (
              <li key={i} className={`flex flex-col gap-1 border-b border-line px-3 py-2.5 last:border-b-0 ${r?.leak ? "bg-bad/10" : ""}`}>
                <span className="flex flex-wrap items-baseline justify-between gap-x-3 font-mono text-[12.5px]">
                  <span className="text-fg">
                    {req.who} · GET {req.path}
                  </span>
                  {r && (
                    <span className={`font-semibold ${r.status === "HIT" ? (r.leak ? "text-bad-text" : "text-signal-text") : "text-fg-3"}`}>{r.status}</span>
                  )}
                </span>
                {r && (
                  <span className="font-mono text-[11.5px] text-fg-3 [overflow-wrap:anywhere]">
                    key {r.key} → {r.leak ? <span className="font-semibold text-bad-text">LEAK: {req.who} sees {r.body}</span> : r.body}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </div>
      {rows && !shipped && (
        <p className="m-0 font-mono text-[12.5px] text-fg-2" aria-live="polite">
          leaks <span className={leaks ? "font-semibold text-bad-text" : "text-fg"}>{leaks}</span> · product cache hits{" "}
          <span className={productHits ? "text-fg" : "font-semibold text-signal-text"}>{productHits}</span>
          {!leaks && !productHits ? " · safe, but the catalog is now cached per user" : ""}
        </p>
      )}
      {!shipped && (
        <div className="flex flex-wrap gap-2.5">
          <button type="button" onClick={run} className={BTN_GHOST}>
            ▶ replay traffic
          </button>
          <button type="button" onClick={ship} disabled={!rows} className={BTN_PRIMARY}>
            ship this config
          </button>
        </div>
      )}
      <div aria-live="polite">
        {shipped && (
          <Feedback ok={goal} title={goal ? "Zero leaks, catalog still cached." : leaks ? "Shipped a leak." : "Safe, but the cache is wasted on products."}>
            Personal endpoints (/api/user, cart, orders…) should not be cached at the edge at all: cache_ttl 0, bypass. Public data like /api/products keeps a URL-only key
            and stays a HIT for everyone. Putting the user in the key also stops the leak; on its own it makes every product page a per-user miss.
          </Feedback>
        )}
      </div>
    </div>
  );
}

const DEF: ActivityDef = {
  kind: "spot the bug",
  title: "Find the leak",
  blurb:
    "10:47 AM, Black Friday: 47 people just got the same shopping cart. Find the bad lines in ShopFast's CDN config, fix the cache key in a live replay, and classify four endpoints.",
  minutes: 3,
  steps: [
    {
      id: "spot",
      label: "Spot the bug",
      max: 2,
      render: (ctx) => (
        <SpotStep
          ctx={ctx}
          file="cdn-config.yaml (what they had)"
          prompt="The backend sent Cache-Control: private. Which lines made the edge serve one user's cart to everyone?"
          sub="Tap every guilty line, then flag them. False alarms cost a point."
          lines={[
            { code: "cache_rules:", note: "Just the list header." },
            { code: '  - pattern: "/api/*"', neutral: true, note: "Broad, yes, but caching /api/* is only a leak because of the two lines below." },
            { code: "    cache_ttl: 300  # 5 minutes", note: "A 5-minute TTL is fine for products. It only made the leak last longer." },
            { code: '    cache_key: "url_path"', faulty: true, note: "URL-only key: Alice's and Bob's GET /api/user/cart hash to the same entry." },
            { code: "    respect_origin_headers: false", faulty: true, note: "The edge ignored the backend's Cache-Control: private, no-cache and Vary: Authorization." },
          ]}
        />
      ),
    },
    { id: "lab", label: "Fix the key", max: 2, render: (ctx) => <KeyLab ctx={ctx} /> },
    {
      id: "classify",
      label: "Classify endpoints",
      max: 4,
      render: (ctx) => (
        <ClassifyStep
          ctx={ctx}
          prompt="The never-again classification system: where does each endpoint go?"
          buckets={[
            { id: "static", label: "STATIC", hint: "public · 24 h" },
            { id: "semi", label: "SEMI_STATIC", hint: "public · 5 min · + query" },
            { id: "user", label: "USER_SPECIFIC", hint: "no caching · bypass" },
            { id: "session", label: "SESSION_DEPENDENT", hint: "private · 1 min max" },
          ]}
          items={[
            {
              label: "orders",
              text: "GET /api/orders/recent",
              bucket: "user",
              explain: "Orders are personal: USER_SPECIFIC means cache_ttl 0 and Cache-Control: private, no-cache, no-store, must-revalidate.",
            },
            {
              label: "logo",
              text: "GET /images/logo.png",
              bucket: "static",
              explain: "Assets, images, CSS and JS are STATIC: public, max-age 86400, URL-only key.",
            },
            {
              label: "wishlist",
              text: "GET /api/wishlist/items",
              bucket: "session",
              explain: "Wishlists and recommendations are SESSION_DEPENDENT: private, at most 60 s, key = url_path + user_id + session_id, Vary: Authorization, Cookie.",
            },
            {
              label: "categories",
              text: "GET /api/categories/shoes?page=2",
              bucket: "semi",
              explain: "Products, categories and search are SEMI_STATIC: public for 5 minutes, key includes query params, Vary: Accept-Language, X-Currency.",
            },
          ]}
        />
      ),
    },
  ],
};

export default function CacheLeak({ slug, caseId }: ActivityProps) {
  return <ActivityShell slug={slug} caseId={caseId} def={DEF} />;
}
