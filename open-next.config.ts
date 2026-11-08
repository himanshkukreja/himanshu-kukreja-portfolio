// Cloudflare (OpenNext) build config. Vercel ignores this file.
import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache";
import { withRegionalCache } from "@opennextjs/cloudflare/overrides/incremental-cache/regional-cache";
import doQueue from "@opennextjs/cloudflare/overrides/queue/do-queue";
import doShardedTagCache from "@opennextjs/cloudflare/overrides/tag-cache/do-sharded-tag-cache";
import { withStaleOnRevalidate } from "./cloudflare/swr-incremental-cache";

const config = defineCloudflareConfig({
  // ISR pages in R2, with Cloudflare's regional cache in front; tags (revalidateTag/Path) in sharded Durable Objects
  // after a content release pages are served stale while they re-render in the background (cloudflare/swr-incremental-cache.ts)
  incrementalCache: withStaleOnRevalidate(withRegionalCache(r2IncrementalCache, { mode: "long-lived" })),
  queue: doQueue,
  // every page request checks its tags: shards replicated in every region (the nearest answers) and the answers cached
  // in the colo for 60 s, including "never revalidated" (most tags): without that, nearly every check went to a
  // Durable Object (often >1 s, Nov 2026). Because a colo may answer "never revalidated" for up to 60 s after a
  // release, a release revalidates TWICE, ~75 s apart (cloudflare-warm's `revalidate` step; scripts do the same), so
  // anything re-rendered inside that window is re-rendered again with the new content
  tagCache: doShardedTagCache({
    baseShardSize: 12,
    regionalCache: true,
    regionalCacheTtlSec: 60,
    regionalCacheDangerouslyPersistMissingTags: true,
    shardReplication: { numberOfSoftReplicas: 4, numberOfHardReplicas: 2, regionalReplication: { defaultRegion: "apac" } },
  }),
  enableCacheInterception: true,
});

// route handlers' client manifests are emptied between `next build` and bundling (scripts/cf/prune-route-manifests.mjs)
export default { ...config, buildCommand: "npm run build && node scripts/cf/prune-route-manifests.mjs" };
