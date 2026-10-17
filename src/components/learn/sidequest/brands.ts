/**
 * Side quest identities: one per bonus problem (resources/bonus-problems/bonus-NN-*.md).
 *
 * These are NOT the companies' logos or brand artwork. Each quest gets an original emblem drawn
 * for this course (QuestEmblem.tsx) that evokes the product's engineering problem (a QR finder
 * for UPI, a play tile for streaming video, a train for IRCTC…), tinted with the product's general
 * colour as an accent. The product is always named in text.
 */
export type EmblemId = "upi" | "chat" | "fingerprint" | "card" | "search" | "play" | "eq" | "bucket" | "map" | "fanout" | "train";

export type QuestBrand = {
  /** bonus number, 1-based */
  n: number;
  /** product name as the course writes it */
  product: string;
  /** the domain, for the hero kicker: "UPI · real-time payments" */
  field: string;
  emblem: EmblemId;
  /** tile fill (the product's general colour) */
  accent: string;
  /** glyph colour on the tile */
  ink: string;
};

const BRANDS: Record<number, QuestBrand> = {
  1: { n: 1, product: "UPI", field: "Real-time payments", emblem: "upi", accent: "#0E7A46", ink: "#FFFFFF" },
  2: { n: 2, product: "WhatsApp", field: "Messaging", emblem: "chat", accent: "#25D366", ink: "#052E16" },
  3: { n: 3, product: "Aadhaar", field: "Digital identity", emblem: "fingerprint", accent: "#F2A900", ink: "#2B1A00" },
  4: { n: 4, product: "Visa / Mastercard", field: "Card payments", emblem: "card", accent: "#1A1F71", ink: "#FFFFFF" },
  5: { n: 5, product: "Google Search", field: "Web search", emblem: "search", accent: "#4285F4", ink: "#FFFFFF" },
  6: { n: 6, product: "Netflix", field: "Video streaming", emblem: "play", accent: "#E50914", ink: "#FFFFFF" },
  7: { n: 7, product: "Spotify", field: "Audio streaming", emblem: "eq", accent: "#1DB954", ink: "#04230F" },
  8: { n: 8, product: "Amazon S3", field: "Object storage", emblem: "bucket", accent: "#3F8624", ink: "#FFFFFF" },
  9: { n: 9, product: "Uber", field: "Ride-hailing", emblem: "map", accent: "#141414", ink: "#FFFFFF" },
  10: { n: 10, product: "Twitter / X", field: "Social timelines", emblem: "fanout", accent: "#1D9BF0", ink: "#FFFFFF" },
  11: { n: 11, product: "IRCTC Tatkal", field: "Ticket booking", emblem: "train", accent: "#1F3C88", ink: "#FFFFFF" },
};

const FALLBACK: Omit<QuestBrand, "n"> = { product: "Side quest", field: "System design", emblem: "fanout", accent: "#0B0B0B", ink: "#FFFFFF" };

export const questNumber = (slug: string): number | null => {
  const m = slug.match(/^bonus-(\d+)/);
  return m ? parseInt(m[1], 10) : null;
};

/** The quest identity for a bonus slug ("bonus-06-netflix-streaming"). */
export function questBrand(slug: string): QuestBrand {
  const n = questNumber(slug) ?? 0;
  return BRANDS[n] ?? { n, ...FALLBACK };
}
