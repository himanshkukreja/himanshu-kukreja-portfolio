/**
 * Side quest identities: one per bonus problem (resources/bonus-problems/bonus-NN-*.md).
 *
 * These are NOT the companies' logos or brand artwork. Each quest gets an original emblem drawn
 * for this course (QuestEmblem.tsx) that evokes the product's engineering problem (a QR finder
 * for UPI, a play tile for streaming video, a train for IRCTC, a bolt-stamped bag for Blinkit, candlesticks for Zerodha Kite, a GPU chip streaming tokens for ChatGPT, two cursors on a frame for Figma, an upload arrow over a film strip for YouTube, a page with two carets for Google Docs, a photo grid under a story ring for Instagram, a seat grid with a held pair for BookMyShow, a takeaway bag on a route to a pin for Swiggy, a shield with a check for Razorpay…), tinted with the product's general
 * colour as an accent. The product is always named in text.
 */
export type EmblemId = "upi" | "chat" | "fingerprint" | "card" | "search" | "play" | "eq" | "bucket" | "map" | "fanout" | "train" | "bolt" | "candles" | "tokens" | "cursors" | "upload" | "carets" | "grid" | "seats" | "route" | "shield";

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
  12: { n: 12, product: "Blinkit", field: "Quick commerce", emblem: "bolt", accent: "#F8C51C", ink: "#1A1600" },
  13: { n: 13, product: "Zerodha Kite", field: "Stock trading", emblem: "candles", accent: "#387ED1", ink: "#FFFFFF" },
  14: { n: 14, product: "ChatGPT", field: "LLM serving", emblem: "tokens", accent: "#0D8C6D", ink: "#FFFFFF" },
  15: { n: 15, product: "Figma", field: "Multiplayer editing", emblem: "cursors", accent: "#FF7262", ink: "#2A0A05" },
  16: { n: 16, product: "BookMyShow", field: "Seat booking", emblem: "seats", accent: "#DC354B", ink: "#FFFFFF" },
  17: { n: 17, product: "Swiggy", field: "Food delivery", emblem: "route", accent: "#FC8019", ink: "#2A1200" },
  18: { n: 18, product: "Razorpay", field: "Payment gateway", emblem: "shield", accent: "#1C5FE0", ink: "#FFFFFF" },
  19: { n: 19, product: "YouTube", field: "Video uploads", emblem: "upload", accent: "#E62117", ink: "#FFFFFF" },
  20: { n: 20, product: "Google Docs", field: "Collaborative editing", emblem: "carets", accent: "#1A73E8", ink: "#FFFFFF" },
  21: { n: 21, product: "Instagram", field: "Feed and stories", emblem: "grid", accent: "#E1306C", ink: "#FFFFFF" },
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
