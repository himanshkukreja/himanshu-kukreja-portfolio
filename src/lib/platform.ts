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
