/**
 * User-agent parsing shared by ingest (server) and the traffic report (re-derives device /
 * browser / OS from the stored UA so legacy rows, parsed by the old client code, read the same).
 * Small and dependency-free on purpose: good enough for analytics buckets, not a full UA database.
 */

export type Device = "mobile" | "tablet" | "desktop";

export type ParsedUA = {
  device: Device;
  os: string;
  browser: string;
  /** in-app browser host app, e.g. "LinkedIn", "Instagram" */
  inApp: string | null;
  bot: boolean;
};

/** Contract regex (tracking v2) plus a few fetchers seen in the real data. */
export const BOT_UA =
  /bot|crawl|spider|slurp|preview|fetch|monitor|headless|curl|wget|python-|axios|node-fetch|HeadlessChrome|Lighthouse|vercel-screenshot|GoogleOther|NotebookLM|Google-Read-Aloud|Chrome-Lighthouse|PTST|Pingdom|uptime|scrapy|httpclient|okhttp|Go-http-client|java\/|libwww|phantomjs|puppeteer|playwright|selenium|facebookexternalhit|embedly|Bytespider|AhrefsBot|SemrushBot|MJ12bot|DotBot|PetalBot|YandexBot|Baiduspider|Applebot|DuckDuckBot|bingbot|Googlebot|GPTBot|ClaudeBot|PerplexityBot|CCBot|Amazonbot|meta-externalagent/i;

export function isBotUA(ua: string | null | undefined): boolean {
  if (!ua) return true; // real browsers always send one
  if (ua.length < 20) return true;
  return BOT_UA.test(ua);
}

const IN_APP: Array<[RegExp, string]> = [
  [/LinkedInApp|com\.linkedin/i, "LinkedIn"],
  [/Instagram/i, "Instagram"],
  [/FBAN|FBAV|FB_IAB|FBIOS/i, "Facebook"],
  [/Twitter|TwitterAndroid/i, "X"],
  [/MicroMessenger/i, "WeChat"],
  [/musical_ly|BytedanceWebview|TikTok/i, "TikTok"],
  [/Snapchat/i, "Snapchat"],
  [/Line\//i, "LINE"],
  [/WhatsApp/i, "WhatsApp"],
  [/Telegram/i, "Telegram"],
  [/GSA\//i, "Google app"],
  [/Pinterest/i, "Pinterest"],
  [/Discord/i, "Discord"],
  [/Slack/i, "Slack"],
];

export function parseUA(ua: string | null | undefined): ParsedUA {
  const s = ua || "";
  const bot = isBotUA(s);

  // ---- OS (Android before Linux; iPadOS before macOS) ----
  let os = "Unknown";
  if (/Windows Phone/i.test(s)) os = "Windows Phone";
  else if (/Windows NT|Win64|Windows/i.test(s)) os = "Windows";
  else if (/iPad/i.test(s)) os = "iPadOS";
  else if (/iPhone|iPod/i.test(s)) os = "iOS";
  else if (/Android/i.test(s)) os = "Android";
  else if (/CrOS/i.test(s)) os = "ChromeOS";
  else if (/Mac OS X|Macintosh/i.test(s)) os = "macOS";
  else if (/Linux|X11/i.test(s)) os = "Linux";

  // ---- device ----
  let device: Device = "desktop";
  if (/iPad|Tablet|PlayBook|Silk|Kindle/i.test(s) || (/Android/i.test(s) && !/Mobile/i.test(s))) device = "tablet";
  else if (/Mobi|iPhone|iPod|Android|IEMobile|BlackBerry|Opera Mini/i.test(s)) device = "mobile";

  // ---- in-app ----
  let inApp: string | null = null;
  for (const [re, name] of IN_APP) {
    if (re.test(s)) {
      inApp = name;
      break;
    }
  }

  // ---- browser (order matters: most UAs claim Safari/Chrome) ----
  let browser = "Unknown";
  if (inApp) browser = `${inApp} in-app`;
  else if (/SamsungBrowser/i.test(s)) browser = "Samsung Internet";
  else if (/EdgiOS|EdgA|Edg\//i.test(s)) browser = "Edge";
  else if (/OPR\/|Opera|OPiOS/i.test(s)) browser = "Opera";
  else if (/YaBrowser/i.test(s)) browser = "Yandex";
  else if (/UCBrowser/i.test(s)) browser = "UC Browser";
  else if (/Vivaldi/i.test(s)) browser = "Vivaldi";
  else if (/DuckDuckGo/i.test(s)) browser = "DuckDuckGo";
  else if (/FxiOS|Firefox/i.test(s)) browser = "Firefox";
  else if (/CriOS|Chrome|Chromium/i.test(s)) browser = "Chrome";
  else if (/Safari/i.test(s)) browser = /iPhone|iPad|iPod/i.test(s) && !/Version\//i.test(s) ? "WebView" : "Safari";
  else if (/AppleWebKit/i.test(s) && /iPhone|iPad|iPod/i.test(s)) browser = "WebView";
  else if (/; wv\)/i.test(s)) browser = "WebView";

  return { device, os, browser, inApp, bot };
}
