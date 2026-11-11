/** Pure helpers for revision decks, safe in client components (load.ts is server-side). */

/** The low-level design track's deck key (resources/revision/low-level-design.md). */
export const LLD_KEY = "low-level-design";

/** How a deck names itself on the revise and cheat-sheet pages: "World 04", or "Low-level design" for the LLD track. */
export const deckLabel = (w: { key: string; code: string }) => (w.key === LLD_KEY ? "Low-level design" : `World ${w.code}`);
