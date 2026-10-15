import "server-only";
import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { channelFor, cleanReferrer } from "./channels";
import { isBotUA, parseUA } from "./ua";

/**
 * Server side of tracking contract v2 (POST /api/beat, alias /api/analytics/track).
 *
 * Body (JSON, sent as text/plain by sendBeacon so it never preflights):
 *   { v: 2, vid, sid, tk?, sw?, sh?, now?, lang?, tz?, items: BeatItem[] }
 *   pv → page_view   { k:"pv", id, p, ti?, r?, e?:1 (session entry), n?:1 (new visitor), u?:{s,m,c,t,ct}, ref?, ts }
 *   pl → page_leave  { k:"pl", pv, p, d (engaged ms), dp (max scroll %), f?:1 (final), ts }
 *   ev → event       { k:"ev", n, p, pr?: {..}, pv?, ts }
 *
 * page_leave rows are UPDATED IN PLACE: the row id is a hash of (visitor, view id), so the 30 s
 * heartbeats (metadata.partial = true) and the final leave beacon all upsert the same row, whose
 * duration / depth only grow and whose created_at moves to the latest beat. Aggregation still takes
 * max(duration) per view id, so a duplicate row (e.g. from an older client) can never double count.
 */

export const MAX_BODY = 16 * 1024;
export const MAX_ITEMS = 25;

const ID_RE = /^[A-Za-z0-9_-]{6,64}$/;
const VIEW_RE = /^[A-Za-z0-9_-]{4,40}$/;
const EVENT_RE = /^[a-z][a-z0-9_]{1,39}$/;
const PROP_KEY_RE = /^[A-Za-z_][A-Za-z0-9_]{0,39}$/;
const MAX_ENGAGED_MS = 6 * 60 * 60 * 1000;

type Props = Record<string, string | number | boolean>;
type Utm = { s?: string; m?: string; c?: string; t?: string; ct?: string };
type PvItem = { k: "pv"; id: string; p: string; ti?: string; r?: string; e?: number; n?: number; u?: Utm; ref?: string; ts?: number };
type PlItem = { k: "pl"; pv: string; p: string; d: number; dp?: number; f?: number; ts?: number };
type EvItem = { k: "ev"; n: string; p: string; pr?: Props; pv?: string; ts?: number };
export type BeatItem = PvItem | PlItem | EvItem;
export type BeatPayload = {
  v?: number;
  vid: string;
  sid: string;
  tk?: string;
  sw?: number;
  sh?: number;
  now?: number;
  lang?: string;
  tz?: string;
  items: BeatItem[];
};

type Row = Record<string, unknown>;

// ---------------------------------------------------------------------------------------------
// small helpers

const str = (v: unknown, max: number): string | undefined => {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t ? t.slice(0, max) : undefined;
};
const int = (v: unknown, min: number, max: number): number | undefined => {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return undefined;
  return Math.min(max, Math.max(min, Math.round(n)));
};

function cleanPath(p: unknown): string | null {
  const s = str(p, 500);
  if (!s || !s.startsWith("/")) return null;
  return s.split("#")[0].split("?")[0] || "/";
}

function cleanProps(pr: unknown): Props {
  const out: Props = {};
  if (!pr || typeof pr !== "object") return out;
  let n = 0;
  for (const [k, v] of Object.entries(pr as Record<string, unknown>)) {
    if (n >= 20 || !PROP_KEY_RE.test(k) || k === "name") continue;
    if (typeof v === "string") out[k] = v.slice(0, 200);
    else if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
    else if (typeof v === "boolean") out[k] = v;
    else continue;
    n++;
  }
  return out;
}

/** Deterministic UUID (v5-shaped) so heartbeats of one view upsert a single row. */
export function leaveRowId(visitorId: string, viewId: string): string {
  const h = createHash("sha256").update(`leave:${visitorId}:${viewId}`).digest("hex");
  const v = ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${v}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

// ---------------------------------------------------------------------------------------------
// rate limit (per instance, in memory): 90 requests / minute / IP

const hits = new Map<string, { n: number; reset: number }>();
export function rateLimited(ip: string, limit = 90): boolean {
  const now = Date.now();
  if (hits.size > 5000) for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
  const cur = hits.get(ip);
  if (!cur || cur.reset < now) {
    hits.set(ip, { n: 1, reset: now + 60_000 });
    return false;
  }
  cur.n++;
  return cur.n > limit;
}

// ---------------------------------------------------------------------------------------------
// auth: the client sends its Supabase access token; we verify it (never trust a client user id)

const tokenCache = new Map<string, { uid: string | null; exp: number }>();
async function userFromToken(token: string | undefined): Promise<string | null> {
  if (!token || token.length < 20 || token.length > 4096) return null;
  const key = createHash("sha256").update(token).digest("base64url");
  const now = Date.now();
  const hit = tokenCache.get(key);
  if (hit && hit.exp > now) return hit.uid;
  let uid: string | null = null;
  try {
    const { data, error } = await supabase.auth.getUser(token);
    uid = !error && data?.user?.id ? data.user.id : null;
  } catch {
    uid = null;
  }
  if (tokenCache.size > 1000) tokenCache.clear();
  tokenCache.set(key, { uid, exp: now + (uid ? 10 : 2) * 60_000 });
  return uid;
}

// ---------------------------------------------------------------------------------------------

function header(req: Request, name: string): string | undefined {
  const v = req.headers.get(name);
  if (!v) return undefined;
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}

export function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";
}

/** Validate + normalise a raw payload. Returns null when it is not a usable beat. */
export function parsePayload(raw: unknown): BeatPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const b = raw as Record<string, unknown>;
  const vid = str(b.vid, 64);
  const sid = str(b.sid, 64);
  if (!vid || !sid || !ID_RE.test(vid) || !ID_RE.test(sid)) return null;
  if (!Array.isArray(b.items) || b.items.length === 0 || b.items.length > MAX_ITEMS) return null;
  return {
    v: 2,
    vid,
    sid,
    tk: str(b.tk, 4096),
    sw: int(b.sw, 0, 20000),
    sh: int(b.sh, 0, 20000),
    now: int(b.now, 0, 8.64e15),
    lang: str(b.lang, 20),
    tz: str(b.tz, 60),
    items: b.items as BeatItem[],
  };
}

/** Map the pre-v2 single-event body (old cached clients) onto a beat. */
export function legacyToBeat(raw: unknown): BeatPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const b = raw as Record<string, unknown>;
  if (Array.isArray(b.items)) return parsePayload(raw);
  const path = cleanPath(b.page_path);
  if (!path || b.event_type !== "page_view") return null;
  return parsePayload({
    vid: b.visitor_id,
    sid: b.session_id,
    sw: b.screen_width,
    sh: b.screen_height,
    items: [
      {
        k: "pv",
        id: Math.random().toString(36).slice(2, 12),
        p: path,
        ti: b.page_title,
        r: b.referrer,
        u: { s: b.utm_source, m: b.utm_medium, c: b.utm_campaign },
      },
    ],
  });
}

export type IngestResult = { status: number; stored: number; reason?: string };

export async function ingest(req: Request, payload: BeatPayload): Promise<IngestResult> {
  const ua = req.headers.get("user-agent") || "";
  if (isBotUA(ua)) return { status: 202, stored: 0, reason: "bot" };
  const parsed = parseUA(ua);

  const userId = await userFromToken(payload.tk);
  const host = (req.headers.get("host") || "").toLowerCase();
  const dev = /^(localhost|127\.0\.0\.1)(:|$)/.test(host) || process.env.NODE_ENV !== "production";

  const country = str(header(req, "x-vercel-ip-country"), 2)?.toUpperCase() ?? null;
  const city = str(header(req, "x-vercel-ip-city"), 120) ?? null;
  const region = str(header(req, "x-vercel-ip-country-region"), 20);

  const serverNow = Date.now();
  const clientNow = payload.now ?? serverNow;
  const at = (ts: unknown) => {
    const t = typeof ts === "number" && Number.isFinite(ts) ? ts : clientNow;
    const lag = Math.min(15 * 60_000, Math.max(0, clientNow - t));
    return new Date(serverNow - lag).toISOString();
  };

  const base = {
    visitor_id: payload.vid,
    session_id: payload.sid,
    user_id: userId,
    user_agent: ua.slice(0, 512),
    device_type: parsed.device,
    browser: parsed.browser,
    os: parsed.os,
    screen_width: payload.sw ?? null,
    screen_height: payload.sh ?? null,
    country,
    city,
    ip_address: null,
  };
  const geoMeta = {
    ...(region ? { region } : {}),
    ...(payload.tz ? { tz: payload.tz } : {}),
    ...(payload.lang ? { lang: payload.lang } : {}),
    ...(parsed.inApp ? { in_app: parsed.inApp } : {}),
    ...(dev ? { dev: true } : {}),
  };

  const inserts: Row[] = [];
  const leaves = new Map<string, Row>();

  for (const raw of payload.items) {
    if (!raw || typeof raw !== "object") continue;
    const it = raw as BeatItem;
    const path = cleanPath(it.p);
    if (!path || path === "/admin" || path.startsWith("/admin/")) continue;

    if (it.k === "pv") {
      const pv = str(it.id, 40);
      if (!pv || !VIEW_RE.test(pv)) continue;
      const u = (it.u && typeof it.u === "object" ? it.u : {}) as Utm;
      const ref = str(it.ref, 100);
      const utmSource = str(u.s, 100) ?? ref;
      const utmMedium = str(u.m, 100);
      const utmCampaign = str(u.c, 150);
      const r = it.e ? cleanReferrer(str(it.r, 1000)) : null;
      const channel = channelFor(r?.host, { source: utmSource, medium: utmMedium, campaign: utmCampaign });
      inserts.push({
        ...base,
        event_type: "page_view",
        page_path: path,
        page_title: str(it.ti, 300) ?? null,
        referrer: r?.url ?? null,
        referrer_domain: r?.host ?? null,
        utm_source: utmSource ?? null,
        utm_medium: utmMedium ?? null,
        utm_campaign: utmCampaign ?? null,
        created_at: at(it.ts),
        metadata: {
          pv,
          ...(it.e ? { entry: true, channel } : {}),
          ...(it.n ? { new_visitor: true } : {}),
          ...(ref ? { ref } : {}),
          ...(str(u.t, 100) ? { utm_term: str(u.t, 100) } : {}),
          ...(str(u.ct, 100) ? { utm_content: str(u.ct, 100) } : {}),
          ...geoMeta,
        },
      });
    } else if (it.k === "pl") {
      const pv = str(it.pv, 40);
      if (!pv || !VIEW_RE.test(pv)) continue;
      const d = int(it.d, 0, MAX_ENGAGED_MS) ?? 0;
      const depth = int(it.dp, 0, 100) ?? 0;
      const id = leaveRowId(payload.vid, pv);
      const prev = leaves.get(id);
      const prevD = (prev?.duration as number | undefined) ?? -1;
      if (prev && prevD > d) continue;
      leaves.set(id, {
        ...base,
        id,
        event_type: "page_leave",
        page_path: path,
        page_title: null,
        referrer: null,
        referrer_domain: null,
        utm_source: null,
        utm_medium: null,
        utm_campaign: null,
        duration: d,
        created_at: at(it.ts),
        metadata: { pv, depth, partial: !it.f, ...geoMeta },
      });
    } else if (it.k === "ev") {
      const name = str(it.n, 40);
      if (!name || !EVENT_RE.test(name)) continue;
      const pv = str(it.pv, 40);
      inserts.push({
        ...base,
        event_type: "event",
        page_path: path,
        page_title: null,
        referrer: null,
        referrer_domain: null,
        utm_source: null,
        utm_medium: null,
        utm_campaign: null,
        created_at: at(it.ts),
        metadata: { name, ...cleanProps(it.pr), ...(pv && VIEW_RE.test(pv) ? { pv } : {}), ...geoMeta },
      });
    }
  }

  let stored = 0;
  if (inserts.length) {
    const { error } = await supabase.from("analytics_events").insert(inserts);
    if (error) {
      console.error("[beat] insert failed:", error.message);
      return { status: 500, stored: 0, reason: "insert" };
    }
    stored += inserts.length;
  }
  if (leaves.size) {
    const { error } = await supabase.from("analytics_events").upsert([...leaves.values()], { onConflict: "id" });
    if (error) {
      console.error("[beat] upsert failed:", error.message);
      return { status: 500, stored, reason: "upsert" };
    }
    stored += leaves.size;
  }
  return { status: 200, stored };
}

/** Shared route handler for /api/beat and /api/analytics/track. */
export async function handleBeat(req: Request, { legacy = false } = {}): Promise<Response> {
  const len = Number(req.headers.get("content-length") || 0);
  if (len > MAX_BODY) return NextResponse.json({ error: "too large" }, { status: 413 });
  if (rateLimited(clientIp(req))) return NextResponse.json({ error: "slow down" }, { status: 429 });

  let text = "";
  try {
    text = await req.text();
  } catch {
    return NextResponse.json({ error: "bad body" }, { status: 400 });
  }
  if (text.length > MAX_BODY) return NextResponse.json({ error: "too large" }, { status: 413 });

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const payload = legacy ? legacyToBeat(raw) : parsePayload(raw);
  if (!payload) return NextResponse.json({ error: "invalid" }, { status: 400 });

  const res = await ingest(req, payload);
  if (res.status >= 500) return NextResponse.json({ error: "store failed" }, { status: 500 });
  return NextResponse.json({ ok: true, stored: res.stored }, { status: res.status === 202 ? 202 : 200 });
}
