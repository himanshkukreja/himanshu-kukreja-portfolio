# Previewing the staged design-pattern lessons

The plan's lessons live in the content repo on the `design-patterns-plan` branch, under
`docs/design-patterns/staged/` (a tree that mirrors `resources/`). The site never reads that tree in production.
To review them before release, run the site locally with a staging-only switch (`src/lib/content-staged.ts`).

```sh
# 1. a checkout of the plan branch (any folder)
git -C /path/to/system-design-mastery worktree add /tmp/sdm-dp design-patterns-plan

# 2. the site, reading content from that checkout and adding the staged tree
SDM_LOCAL_DIR=/tmp/sdm-dp SDM_PREVIEW_STAGED=1 npx next dev
```

Open `http://localhost:3000/learn/system-design-mastery/low-level-design/patterns/strategy`
(or `/low-level-design/patterns/strategy` with the course host rewrite). Also visible: the DP-16 card on
`/low-level-design`, the lab at `/labs/strategy-delivery-fee`, the lesson FAQ at the foot of the page.

How it stays off production:

- it needs `SDM_LOCAL_DIR` (a path on the machine running the site; no deployment sets it);
- it needs `SDM_PREVIEW_STAGED=1`;
- it refuses to run when `NODE_ENV` is `production` or `APP_ENV`/`VERCEL_ENV` is `production` or `preview`.

With it on, a `resources/<x>` path that does not exist falls back to `docs/design-patterns/staged/<x>`, and the
staged files are added to directory listings (the real ones win). Clips show only once their media is recorded
(`lectures/clips--low-level-design--<lesson>--<clip>/` on the lecture host); until then the figure hides itself.

Release (owner decision, not part of the site): `git mv docs/design-patterns/staged/<dir>/* resources/<dir>/`
in the content repo, after the site changes are deployed. Published lessons replace "coming soon" on their own.
