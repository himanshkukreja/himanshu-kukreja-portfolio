/**
 * The DSA redesign's visual kit (the approved canvas, 16 Nov 2026): rounded cards on the paper ground, Geist body, Bricolage
 * headings, mono only for small kicker labels. Class strings only, all theme tokens, so every one of the 8 themes applies.
 * Pages and the phase-2 widgets (course path, warm-up, heatmap, visualiser, flip cards, radar) build from these so they
 * slot in without another restyle.
 */

const FOCUS = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal-text";

/** The main card (Continue, outline, lesson steps): 18 px corners. Add padding per use (p-[30px], p-[22px]). */
export const CARD = "rounded-[18px] border border-line bg-surface";
/** A side-column card (Today, tutor, readiness, quick review, lesson aside): 16 px corners, 22 px padding. */
export const SIDE_CARD = "flex flex-col gap-3 rounded-2xl border border-line bg-surface p-[22px]";
/** A small tile (phone tiles, problem rows): 14 px corners. */
export const TILE = "rounded-[14px] border border-line bg-surface";
/** An inset box inside a card (key idea, example, the review link): 12 px corners on the paper ground. */
export const INSET = "rounded-xl bg-bg";

/** The small mono kicker ("CONTINUE · PART 2", "YOUR TUTOR · WHERE YOU LEFT OFF"). */
export const KICKER = "m-0 font-mono text-[12px] font-normal uppercase tracking-[0.06em] text-fg-3";
/** A card's own heading (Today, Quick review): Geist 16/600. */
export const CARD_H = "m-0 text-[16px] font-semibold text-fg";
/** A section heading ("Your course"): Bricolage ExtraBold 26 (22 on phones). */
export const SECTION_H = "m-0 font-display text-[22px] font-extrabold tracking-[-0.02em] text-fg sm:text-[26px]";
/** A page title (lesson, Practice, Review, Progress): Bricolage ExtraBold 46 (30 on phones). */
export const PAGE_H = "m-0 font-display text-[30px] font-extrabold leading-[1.02] tracking-[-0.03em] text-fg sm:text-[46px]";

/** Buttons. BIG = the 48 px primary of the Continue card; MID = 44 px (footers); SM = 40 px (cards). */
const BTN = `inline-flex items-center justify-center gap-2 whitespace-nowrap text-center ${FOCUS}`;
export const BTN_PRIMARY = `${BTN} rounded-xl bg-signal font-semibold text-on-signal hover:bg-[var(--c-signal-strong,var(--c-signal))]`;
export const BTN_SECONDARY = `${BTN} rounded-xl border border-line-strong bg-surface font-medium text-fg hover:bg-surface-2`;
export const BIG = "min-h-12 px-[22px] text-[15px]";
export const MID = "min-h-11 rounded-[10px] px-4 text-[14px]";
export const SM = "min-h-10 rounded-[10px] px-3.5 text-[14px]";

/** A rounded chip (meta facts, "PRACTICE 2 OF 5", list filters). */
export const CHIP = "inline-flex items-center rounded-full border border-line bg-surface px-2.5 py-[5px] font-mono text-[12px] text-fg-2";
/** A choice pill (filters, lists): on = filled with the ink. */
export const pill = (on: boolean) =>
  `inline-flex min-h-9 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium ${FOCUS} ${on ? "bg-fg text-bg" : "border border-line bg-surface text-fg-2 hover:text-fg"}`;

/** A segmented control (Watch / Read / Listen, Lessons / Lectures): a 10 px track on surface-2 with a white segment. */
export const SEG = "inline-flex rounded-[10px] bg-surface-2 p-[3px]";
export const seg = (on: boolean) =>
  `inline-flex min-h-[34px] items-center justify-center gap-1.5 rounded-lg px-4 text-[13px] ${FOCUS} ${on ? "bg-surface font-semibold text-fg shadow-[0_1px_2px_color-mix(in_srgb,var(--c-fg)_12%,transparent)]" : "font-medium text-fg-3 hover:text-fg"}`;

/** A progress track and its fill (6 px, fully rounded). The track uses line-strong on dark themes so it shows. */
export const TRACK = "block h-1.5 overflow-hidden rounded-full bg-line dark:bg-line-strong";
export const FILL = "block h-full rounded-full";
