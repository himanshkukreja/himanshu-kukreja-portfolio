// Side-quest marks: the real logo of each quest's product from Simple Icons (@iconify-json/simple-icons,
// CC0 SVG data; the marks stay their owners' trademarks), written to
// src/components/learn/sidequest/marks.json so pages never load the whole set. Quests without a fitting
// mark (UPI, Aadhaar, IRCTC; Blinkit, whose only match is its parent; Visa / Mastercard, one quest about
// two networks) keep their original emblem.
// usage: node scripts/build-quest-logos.mjs
import fs from "fs";
import path from "path";

const si = JSON.parse(fs.readFileSync(path.join(process.cwd(), "node_modules/@iconify-json/simple-icons/icons.json"), "utf8"));
const MARKS = { 2: "whatsapp", 5: "google", 6: "netflix", 7: "spotify", 8: "amazons3", 9: "uber", 10: "x", 13: "zerodha", 14: "openai", 15: "figma", 16: "bookmyshow", 17: "swiggy", 18: "razorpay", 19: "youtube", 20: "googledocs", 21: "instagram", 22: "googlemaps", 23: "zoom", 24: "airbnb", 27: "flipkart", 28: "gmail", 29: "github", 30: "tiktok" };
const out = {};
for (const [n, key] of Object.entries(MARKS)) {
  const icon = si.icons[key];
  if (!icon) throw new Error(`no Simple Icons mark "${key}"`);
  out[n] = { body: icon.body, size: icon.width ?? si.width ?? 24 };
}
fs.writeFileSync(path.join(process.cwd(), "src/components/learn/sidequest/marks.json"), JSON.stringify(out) + "\n");
console.log(`marks ${Object.keys(out).length}`);
