/**
 * Which deployment this is, on any host: APP_ENV (set in wrangler.jsonc on Cloudflare) or Vercel's
 * VERCEL_ENV. "production" | "preview" | "development".
 */
export const DEPLOY_ENV = process.env.APP_ENV || process.env.VERCEL_ENV || "development";
export const isProductionDeploy = () => (process.env.APP_ENV || process.env.VERCEL_ENV) === "production";

type SelfRef = { fetch(input: string | Request, init?: RequestInit): Promise<Response> };

/**
 * fetch() for this site's own URLs from server code. On Cloudflare a Worker can't fetch its own custom domain (the
 * subrequest fails), so the request goes through the Worker's self-reference binding (WORKER_SELF_REFERENCE,
 * wrangler.jsonc) and still meets every cache layer. Elsewhere (Vercel, next dev) it is plain fetch. The course chat's
 * search index came back empty that way on 8 Nov 2026 and every Ask AI ended "course search still loading".
 */
export function selfFetch(url: string, init?: RequestInit): Promise<Response> {
  const ctx = (globalThis as unknown as Record<symbol, { env?: { WORKER_SELF_REFERENCE?: SelfRef } } | undefined>)[Symbol.for("__cloudflare-context__")];
  const self = ctx?.env?.WORKER_SELF_REFERENCE;
  return self ? self.fetch(url, init) : fetch(url, init);
}

/** The visitor's IP: Cloudflare's own header first (Workers), then the usual proxy headers (Vercel, next dev). */
export function clientIp(req: Request): string | null {
  const h = req.headers;
  return h.get("cf-connecting-ip") || h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
}

/**
 * Keep background work alive after the response: on Cloudflare a promise nothing waits for may be cancelled once the
 * response is sent (a stale-while-revalidate rebuild then never finishes and its "building" flag stays set), so it
 * goes to the request's waitUntil. Elsewhere the server process simply carries on.
 */
export function background(p: Promise<unknown>): void {
  const ctx = (globalThis as unknown as Record<symbol, { ctx?: { waitUntil(p: Promise<unknown>): void } } | undefined>)[Symbol.for("__cloudflare-context__")];
  const safe = p.catch(() => {});
  if (ctx?.ctx?.waitUntil) ctx.ctx.waitUntil(safe);
}
