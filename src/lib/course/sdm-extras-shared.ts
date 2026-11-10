/** The pure half of sdm-extras.ts (no server-only import), so node --test can load it. */

/** The DSA directives a System Design Mastery lesson may use (DsaRenderOpts.only). */
export const SDM_DSA_ONLY = ["tabs", "clip"] as const;

/** The media id of an SDM lesson's clip: lectures/clips--<week>--<slug>--<clip>/ on the lecture host. */
export const sdmClipQuest = (week: string, slug: string, id: string) => `clips--${week}--${slug}--${id}`;

/** Does this markdown use a borrowed directive? (cheap, so a plain lesson skips the clips read) */
export const usesSdmExtras = (md: string) => /^:{3,}tabs\b/m.test(md) || /^::clip\[/m.test(md);
