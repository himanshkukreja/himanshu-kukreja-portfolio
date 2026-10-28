/**
 * Side quest identities: one per bonus problem (resources/bonus-problems/bonus-NN-*.md). Each quest's
 * tile (QuestEmblem.tsx) is drawn to look like the product's own app icon, in the brand's real colours:
 *
 * - Full-colour logo (`logos`, from "gb"): the logo from SVG Logos by Gil Barbara (github.com/gilbarbara/logos,
 *   CC0, via @iconify-json/logos) on the background its app icon uses: Google, Gmail, Maps, YouTube, Airbnb
 *   and Visa / Mastercard on white, Netflix's red N, Spotify's green disc and TikTok's offset note on black,
 *   WhatsApp's bubble on its green, S3's own green tile, Zoom's white mark on its blue.
 * - Single-colour mark (`logos`, from "si"): Simple Icons (CC0, @iconify-json/simple-icons) where Gil Barbara has
 *   no logo or its app icon is one colour on another, drawn in `ink` on `tile`: Uber, X, ChatGPT, GitHub and
 *   Figma white on black, Discord's white Clyde on blurple, Instagram's white glyph on its gradient, Swiggy and
 *   BookMyShow white on their colour, Flipkart's yellow bag on its blue, Razorpay's blue on its navy, Docs blue
 *   on white. Figma stays one colour because its full logo has a purple part (the site is purple-free; only
 *   Instagram and Discord show their true purple).
 * - Original emblem (`emblem`, no logo in either set: UPI, Aadhaar, IRCTC, Blinkit, Zerodha, Dream11, Truecaller,
 *   ONDC, NSE): a glyph drawn for this course that evokes the product's engineering problem (a QR finder and a
 *   rupee for UPI, a fingerprint for Aadhaar, a train for IRCTC, a bolt-stamped bag for Blinkit, candlesticks for
 *   Zerodha Kite, stumps beside a leaderboard for Dream11, a ringing phone for Truecaller, a phone and a shop
 *   trading a sealed message for ONDC, an order-book ladder for NSE), in the brand's colours: `ink` on `tile`
 *   with `hi` for its second colour. No company's own logo artwork is copied for these.
 *
 * The emblem is also every quest's fallback if its logo is missing. `accent` is the brand colour the quest's
 * pages use for stripes and borders (--quest-accent), not the tile. Logos are their owners' trademarks, shown
 * only to identify the product, which is always named in text. scripts/build-quest-logos.mjs vendors the
 * logos into logos.json and marks.json.
 */
export type EmblemId = "upi" | "chat" | "fingerprint" | "card" | "search" | "play" | "eq" | "bucket" | "map" | "fanout" | "train" | "bolt" | "candles" | "tokens" | "cursors" | "upload" | "carets" | "grid" | "seats" | "route" | "shield" | "tiles" | "gallery" | "stay" | "stumps" | "ring" | "tag" | "mail" | "branch" | "swipe" | "voice" | "peer" | "ladder";

/** a logo placed on the tile: `gb` = logos.json (full colour), `si` = marks.json (drawn in the tile's ink) */
export type QuestLogo = {
  from: "gb" | "si";
  /** Gil Barbara file name ("google-gmail") or Simple Icons slug ("github") */
  name: string;
  /** the box it is fitted and centred in, in the 64×64 tile: [x, y, w, h] (default: the middle 60%) */
  box?: [number, number, number, number];
};

/** a gradient tile, in tile fractions (0..1), like the app icon's background */
export type TileGradient =
  | { kind: "linear"; x1: number; y1: number; x2: number; y2: number; stops: [number, string][] }
  | { kind: "radial"; cx: number; cy: number; r: number; stops: [number, string][] };

export type QuestBrand = {
  /** bonus number, 1-based */
  n: number;
  /** product name as the course writes it */
  product: string;
  /** the domain, for the hero kicker: "UPI · real-time payments" */
  field: string;
  /** original emblem: drawn when the quest has no logo (or its logo is missing) */
  emblem: EmblemId;
  /** the brand colour for the quest's pages (stripes, borders), not the tile */
  accent: string;
  /** tile background, as on the product's app icon */
  tile: string;
  /** a gradient over the tile (Instagram, WhatsApp) */
  tileGradient?: TileGradient;
  /** colour of a single-colour mark or of the emblem's lines */
  ink: string;
  /** the emblem's second brand colour (UPI's orange, Aadhaar's sun); defaults to ink */
  hi?: string;
  /** the product's real logo(s), drawn instead of the emblem */
  logos?: QuestLogo[];
};

const W = "#FFFFFF";
const K = "#000000";
const gb = (name: string, box?: QuestLogo["box"]): QuestLogo => ({ from: "gb", name, box });
const si = (name: string, box?: QuestLogo["box"]): QuestLogo => ({ from: "si", name, box });

const BRANDS: Record<number, QuestBrand> = {
  1: { n: 1, product: "UPI", field: "Real-time payments", emblem: "upi", accent: "#27803B", tile: W, ink: "#097939", hi: "#ED752E", logos: [gb("upi", [7, 20, 50, 24])] },
  2: {
    n: 2, product: "WhatsApp", field: "Messaging", emblem: "chat", accent: "#25D366", tile: "#25D366", ink: W,
    tileGradient: { kind: "linear", x1: 0.5, y1: 0, x2: 0.5, y2: 1, stops: [[0, "#5FFC7B"], [1, "#28D146"]] },
    logos: [gb("whatsapp-icon", [10, 10, 44, 44])],
  },
  3: { n: 3, product: "Aadhaar", field: "Digital identity", emblem: "fingerprint", accent: "#D32828", tile: W, ink: "#D32828", hi: "#F6B000" },
  4: { n: 4, product: "Visa / Mastercard", field: "Card payments", emblem: "card", accent: "#1A1F71", tile: W, ink: "#1A1F71", logos: [gb("visa", [8, 11, 48, 17]), gb("mastercard", [17, 33.5, 30, 19])] },
  5: { n: 5, product: "Google Search", field: "Web search", emblem: "search", accent: "#4285F4", tile: W, ink: "#4285F4", logos: [gb("google-icon", [14, 14, 36, 36])] },
  6: { n: 6, product: "Netflix", field: "Video streaming", emblem: "play", accent: "#E50914", tile: K, ink: "#E50914", logos: [gb("netflix-icon", [3, 3, 58, 58])] },
  7: { n: 7, product: "Spotify", field: "Audio streaming", emblem: "eq", accent: "#1DB954", tile: K, ink: "#1ED760", logos: [gb("spotify-icon", [12, 12, 40, 40])] },
  8: { n: 8, product: "Amazon S3", field: "Object storage", emblem: "bucket", accent: "#3F8624", tile: "#3F8624", ink: W, logos: [gb("aws-s3", [0, 0, 64, 64])] },
  9: { n: 9, product: "Uber", field: "Ride-hailing", emblem: "map", accent: "#141414", tile: K, ink: W, logos: [si("uber", [10, 10, 44, 44])] },
  10: { n: 10, product: "Twitter / X", field: "Social timelines", emblem: "fanout", accent: "#1D9BF0", tile: K, ink: W, logos: [si("x", [17, 17, 30, 30])] },
  11: { n: 11, product: "IRCTC Tatkal", field: "Ticket booking", emblem: "train", accent: "#004B8D", tile: "#004B8D", ink: W, hi: "#F7941D" },
  12: { n: 12, product: "Blinkit", field: "Quick commerce", emblem: "bolt", accent: "#F8CB46", tile: "#F8CB46", ink: "#1C1C1C", hi: "#0C831F", logos: [gb("blinkit", [5.5, 25, 53, 14])] },
  13: { n: 13, product: "Zerodha Kite", field: "Stock trading", emblem: "candles", accent: "#F6461A", tile: W, ink: "#387ED1", hi: "#FF6A2B", logos: [gb("kite", [12, 17, 40, 30])] },
  14: { n: 14, product: "ChatGPT", field: "LLM serving", emblem: "tokens", accent: "#10A37F", tile: K, ink: W, logos: [si("openai", [14, 14, 36, 36])] },
  15: { n: 15, product: "Figma", field: "Multiplayer editing", emblem: "cursors", accent: "#F24E1E", tile: "#1E1E1E", ink: W, logos: [si("figma", [16, 14, 32, 36])] },
  16: { n: 16, product: "BookMyShow", field: "Seat booking", emblem: "seats", accent: "#F84464", tile: "#F84464", ink: W, logos: [si("bookmyshow", [13, 13, 38, 38])] },
  17: { n: 17, product: "Swiggy", field: "Food delivery", emblem: "route", accent: "#FC8019", tile: "#FC8019", ink: W, logos: [si("swiggy", [14, 13, 36, 38])] },
  18: { n: 18, product: "Razorpay", field: "Payment gateway", emblem: "shield", accent: "#3395FF", tile: "#072654", ink: "#3395FF", logos: [si("razorpay", [14, 14, 36, 36])] },
  19: { n: 19, product: "YouTube", field: "Video uploads", emblem: "upload", accent: "#FF0000", tile: W, ink: "#FF0000", logos: [gb("youtube-icon", [10, 10, 44, 44])] },
  20: { n: 20, product: "Google Docs", field: "Collaborative editing", emblem: "carets", accent: "#4285F4", tile: W, ink: "#4285F4", logos: [si("googledocs", [14, 12, 36, 40])] },
  21: {
    n: 21, product: "Instagram", field: "Feed and stories", emblem: "grid", accent: "#E1306C", tile: "#E1306C", ink: W,
    tileGradient: { kind: "radial", cx: 0.3, cy: 1.07, r: 1.5, stops: [[0, "#FDF497"], [0.05, "#FDF497"], [0.45, "#FD5949"], [0.6, "#D6249F"], [0.9, "#285AEB"]] },
    logos: [si("instagram", [15, 15, 34, 34])],
  },
  22: { n: 22, product: "Google Maps", field: "Routing and live traffic", emblem: "tiles", accent: "#34A853", tile: W, ink: "#34A853", logos: [gb("google-maps", [14, 11, 36, 42])] },
  23: { n: 23, product: "Zoom", field: "Video meetings", emblem: "gallery", accent: "#0B5CFF", tile: "#0B5CFF", ink: W, logos: [gb("zoom-icon", [3, 3, 58, 58])] },
  24: { n: 24, product: "Airbnb", field: "Stays marketplace", emblem: "stay", accent: "#FF385C", tile: W, ink: "#FF385C", logos: [gb("airbnb-icon", [14, 13, 36, 38])] },
  25: { n: 25, product: "Dream11", field: "Fantasy sports", emblem: "stumps", accent: "#E00000", tile: "#E00000", ink: W, logos: [gb("dream11", [11, 12, 42, 40])] },
  26: { n: 26, product: "Truecaller", field: "Caller ID and spam", emblem: "ring", accent: "#0A6CFF", tile: "#0A6CFF", ink: W, logos: [gb("truecaller", [6, 26.5, 52, 10])] },
  27: { n: 27, product: "Flipkart", field: "Sale-day commerce", emblem: "tag", accent: "#2874F0", tile: "#2874F0", ink: "#FFE11B", logos: [si("flipkart", [13, 13, 38, 38])] },
  28: { n: 28, product: "Gmail", field: "Email at scale", emblem: "mail", accent: "#EA4335", tile: W, ink: "#EA4335", logos: [gb("google-gmail", [12, 12, 40, 40])] },
  29: { n: 29, product: "GitHub", field: "Code hosting", emblem: "branch", accent: "#24292F", tile: K, ink: W, logos: [si("github", [14, 14, 36, 36])] },
  30: { n: 30, product: "TikTok", field: "For You feed", emblem: "swipe", accent: "#FE2C55", tile: K, ink: W, logos: [gb("tiktok-icon", [14, 13, 36, 38])] },
  31: { n: 31, product: "Discord", field: "Community chat and voice", emblem: "voice", accent: "#5865F2", tile: "#5865F2", ink: W, logos: [si("discord", [12, 12, 40, 40])] },
  32: { n: 32, product: "ONDC", field: "Open commerce network", emblem: "peer", accent: "#1C75BC", tile: W, ink: "#1C4E9D", hi: "#F4A118", logos: [gb("ondc", [6, 19, 52, 26])] },
  33: { n: 33, product: "NSE", field: "Stock exchange", emblem: "ladder", accent: "#E66F25", tile: W, ink: "#1F2B5B", hi: "#E07122", logos: [gb("nse", [5, 21, 54, 22])] },
};

const FALLBACK: Omit<QuestBrand, "n"> = { product: "Side quest", field: "System design", emblem: "fanout", accent: "#0B0B0B", tile: "#0B0B0B", ink: "#FFFFFF" };

export const questNumber = (slug: string): number | null => {
  const m = slug.match(/^bonus-(\d+)/);
  return m ? parseInt(m[1], 10) : null;
};

/** The quest identity for a bonus slug ("bonus-06-netflix-streaming"). */
export function questBrand(slug: string): QuestBrand {
  const n = questNumber(slug) ?? 0;
  return BRANDS[n] ?? { n, ...FALLBACK };
}
