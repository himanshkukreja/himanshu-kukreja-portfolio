/**
 * Network rules for the guide screenshots.
 *
 * - Analytics never leave the browser (PostHog, GA, the first-party beacon), on top of hk.notrack=1.
 * - Guests: reads go to the real server as in production; any write to Supabase is refused.
 * - "Signed in" contexts get a fake session and a fake Supabase that answers from fixtures, so the
 *   account-only screens (notebook, highlights) can be shown without a real account and without
 *   writing a single row anywhere.
 * - The leaderboard API answers with example players (no real names or scores in the screenshots).
 * - The share settings API answers with the example share state (`o.share`); saves go nowhere.
 */
export const DEMO_USER = {
  id: "0d1e6a8c-5b4f-4c1e-9a77-6c2f00000042",
  email: "demo.learner@example.com",
  name: "Demo Learner",
};

const json = (body, status = 200, headers = {}) => ({ status, contentType: "application/json", headers: { "access-control-allow-origin": "*", ...headers }, body: JSON.stringify(body) });

export function sessionStorageEntry(supabaseUrl) {
  const ref = new URL(supabaseUrl).hostname.split(".")[0];
  const exp = Math.floor(Date.now() / 1000) + 7 * 24 * 3600;
  const user = {
    id: DEMO_USER.id,
    aud: "authenticated",
    role: "authenticated",
    email: DEMO_USER.email,
    app_metadata: { provider: "email" },
    user_metadata: { full_name: DEMO_USER.name },
    created_at: "2026-09-20T10:00:00Z",
  };
  // header.payload.signature shape; nothing verifies it because every request is answered locally
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const access_token = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: DEMO_USER.id, exp, role: "authenticated", email: DEMO_USER.email })}.guide`;
  return {
    key: `sb-${ref}-auth-token`,
    value: JSON.stringify({ access_token, refresh_token: "guide-refresh", token_type: "bearer", expires_in: 604800, expires_at: exp, user }),
    user,
  };
}

/** Tiny PostgREST filter: eq / is.null / neq on top-level columns; enough for the app's reads. */
function filterRows(rows, url) {
  let out = rows;
  for (const [k, v] of url.searchParams) {
    if (["select", "order", "limit", "offset", "or", "on_conflict"].includes(k)) continue;
    if (v.startsWith("eq.")) out = out.filter((r) => String(r[k]) === decodeURIComponent(v.slice(3)));
    else if (v === "is.null") out = out.filter((r) => r[k] === null || r[k] === undefined);
    else if (v === "not.is.null") out = out.filter((r) => r[k] !== null && r[k] !== undefined);
    else if (v.startsWith("neq.")) out = out.filter((r) => String(r[k] ?? "") !== decodeURIComponent(v.slice(4)));
    else if (v.startsWith("in.")) {
      const set = decodeURIComponent(v.slice(3)).replace(/^\(|\)$/g, "").split(",");
      out = out.filter((r) => set.includes(String(r[k])));
    }
  }
  const or = url.searchParams.get("or");
  if (or && or.includes("note_text.is.null")) out = out.filter((r) => !r.note_text);
  const limit = Number(url.searchParams.get("limit"));
  return limit ? out.slice(0, limit) : out;
}

/**
 * @param {import('playwright').BrowserContext} ctx
 * @param {{ supabaseUrl: string, signedIn: boolean, fixtures: Record<string, any[]>, profile?: any, game?: any, board: (period: string, signedIn: boolean) => any }} o
 */
export async function installRoutes(ctx, o) {
  // (Playwright runs the most recently registered matching route first: generic rules go first.)
  // No writes to the site's own API either (story views, goals, comments, resets…).
  await ctx.route(/\/api\//, (r) => (["GET", "HEAD"].includes(r.request().method()) ? r.continue() : r.fulfill(json({ ok: true, guide: "write skipped" }))));
  await ctx.route(/posthog|googletagmanager|google-analytics|doubleclick|\/hkr\/|\/api\/beat|\/api\/analytics|vercel-insights|_vercel\/insights/, (r) => r.abort());

  await ctx.route(/\/api\/learn\/leaderboard/, (r) => {
    const period = new URL(r.request().url()).searchParams.get("period") || "week";
    return r.fulfill(json(o.board(period, o.signedIn)));
  });

  const host = new URL(o.supabaseUrl).host;
  await ctx.route((u) => u.host === host, (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const method = req.method();
    if (method === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" } });
    if (!o.signedIn) {
      if (method === "GET" || method === "HEAD") return route.continue();
      return route.fulfill(json({ message: "guide: writes disabled" }, 403));
    }
    if (url.pathname.startsWith("/auth/v1/user")) return route.fulfill(json(o.user));
    if (url.pathname.startsWith("/auth/v1/")) return route.fulfill(json({}));
    if (url.pathname.startsWith("/rest/v1/rpc/")) return route.fulfill({ status: 204, body: "" });
    if (url.pathname.startsWith("/storage/") || url.pathname.startsWith("/realtime/")) return route.fulfill(json({}));
    const table = url.pathname.replace("/rest/v1/", "");
    if (method !== "GET" && method !== "HEAD") {
      // writes succeed and go nowhere
      let body = [];
      try {
        const parsed = JSON.parse(req.postData() || "[]");
        body = (Array.isArray(parsed) ? parsed : [parsed]).map((x, i) => ({ id: `guide-${Date.now()}-${i}`, created_at: new Date().toISOString(), ...x }));
      } catch {
        body = [];
      }
      const accept = req.headers()["accept"] || "";
      return route.fulfill(json(accept.includes("vnd.pgrst.object") ? body[0] || {} : body, 201));
    }
    let rows = o.fixtures[table];
    if (table === "user_profiles") rows = [{ ...(o.profile || {}), ...(o.game ? { xp: o.game.xp, game_done: o.game.done, game_flags: o.game.flags } : {}) }];
    if (!rows) rows = [];
    const out = filterRows(rows, url);
    const accept = req.headers()["accept"] || "";
    if (accept.includes("vnd.pgrst.object")) {
      if (!out.length) return route.fulfill(json({ code: "PGRST116", details: "The result contains 0 rows", hint: null, message: "JSON object requested, multiple (or no) rows returned" }, 406));
      return route.fulfill(json(out[0]));
    }
    return route.fulfill(json(out, 200, { "content-range": `0-${Math.max(0, out.length - 1)}/${out.length}` }));
  });

  if (o.signedIn) {
    await ctx.route(/\/api\/profile/, (r) => r.fulfill(json({ data: o.profile })));
  }

  // Share my progress (signed-in mock): the settings, handle check and save answer from `o.share`,
  // a ShareState read from the dev server's fixture learner (see shoot.mjs shareState()).
  if (o.signedIn && o.share) {
    await ctx.route(/\/api\/learn\/share(\?|$)/, (r) => {
      if (r.request().method() === "GET") return r.fulfill(json(o.share));
      return r.fulfill(json({ settings: o.share.settings }));
    });
    await ctx.route(/\/api\/learn\/share\/handle/, (r) => r.fulfill(json({ ok: true })));
  }
}
