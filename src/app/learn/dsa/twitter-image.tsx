import { DSA_ALT, dsaCard } from "@/lib/og/dsa-card";

export const runtime = "nodejs";
export const alt = DSA_ALT;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return dsaCard();
}
