import { PORTFOLIO_ALT, portfolioCard } from "@/lib/og/portfolio-card";

export const runtime = "nodejs";
export const alt = PORTFOLIO_ALT;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return portfolioCard();
}
