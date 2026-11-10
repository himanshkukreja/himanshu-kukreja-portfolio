/**
 * Preview of staged content, on a developer's machine only. The design-patterns plan (content repo, branch
 * design-patterns-plan) keeps its lessons under docs/design-patterns/staged/, a tree that mirrors resources/ path
 * for path, so nothing reaches the live site before the owner approves. To review them first:
 *
 *   SDM_LOCAL_DIR=/path/to/system-design-mastery   (a checkout of the design-patterns-plan branch)
 *   SDM_PREVIEW_STAGED=1
 *   next dev
 *
 * With both set, the content reader falls back to the staged tree for any resources/<x> path that does not exist,
 * and adds the staged files to directory listings (src/lib/github.ts). It can never be on in production: it needs
 * SDM_LOCAL_DIR (a path on the machine that runs the site, which no deployment sets), refuses to run when
 * NODE_ENV is "production" or the deploy environment is production or preview, and the site's lesson list
 * is built from what the reader returns, so with the switch off the staged tree does not exist for the site.
 * Pure (no imports), so node --test runs it (scripts/tests/sdm-preview.test.mjs).
 */

export const STAGED_ROOT = "docs/design-patterns/staged";

type Env = Record<string, string | undefined>;

/** Is the staged preview on? Local checkout set, switch set to 1, and not a production-like run. */
export function stagedPreviewOn(env: Env): boolean {
  if (!env.SDM_LOCAL_DIR || env.SDM_PREVIEW_STAGED !== "1") return false;
  if (env.NODE_ENV === "production") return false;
  const deploy = env.APP_ENV || env.VERCEL_ENV || "";
  return deploy !== "production" && deploy !== "preview";
}

/** resources/<x> → docs/design-patterns/staged/<x>; anything outside resources/ has no staged twin. */
export function stagedPathFor(path: string): string | null {
  if (path === "resources") return STAGED_ROOT;
  if (!path.startsWith("resources/")) return null;
  if (path.includes("..")) return null;
  return `${STAGED_ROOT}/${path.slice("resources/".length)}`;
}
