// Cloudflare (OpenNext) build config. Vercel ignores this file.
import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache";
import { withRegionalCache } from "@opennextjs/cloudflare/overrides/incremental-cache/regional-cache";
import doQueue from "@opennextjs/cloudflare/overrides/queue/do-queue";
import doShardedTagCache from "@opennextjs/cloudflare/overrides/tag-cache/do-sharded-tag-cache";

const config = defineCloudflareConfig({
  // ISR pages in R2, with Cloudflare's regional cache in front; tags (revalidateTag/Path) in sharded Durable Objects
  incrementalCache: withRegionalCache(r2IncrementalCache, { mode: "long-lived" }),
  queue: doQueue,
  tagCache: doShardedTagCache({ baseShardSize: 12 }),
  enableCacheInterception: true,
});

// route handlers' client manifests are emptied between `next build` and bundling (scripts/cf/prune-route-manifests.mjs)
export default { ...config, buildCommand: "npm run build && node scripts/cf/prune-route-manifests.mjs" };
