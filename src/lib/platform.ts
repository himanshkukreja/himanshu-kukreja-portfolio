/**
 * Which deployment this is, on any host: APP_ENV (set in wrangler.jsonc on Cloudflare) or Vercel's
 * VERCEL_ENV. "production" | "preview" | "development".
 */
export const DEPLOY_ENV = process.env.APP_ENV || process.env.VERCEL_ENV || "development";
export const isProductionDeploy = () => (process.env.APP_ENV || process.env.VERCEL_ENV) === "production";
