/**
 * Traffic channel classification (tracking contract v2).
 * `channelFor(referrerDomain, utm)` → Direct | Search | Social | AI | Email | Paid | Campaign | Referral.
 * Pure and isomorphic: used at ingest (stored in metadata.channel) and re-derived at query time so
 * legacy rows and future rule changes classify the same way.
 */

export type Channel = "Direct" | "Search" | "Social" | "AI" | "Email" | "Paid" | "Campaign" | "Referral";

export const CHANNELS: Channel[] = ["Direct", "Search", "Social", "AI", "Email", "Paid", "Campaign", "Referral"];

export type Utm = { source?: string | null; medium?: string | null; campaign?: string | null };

/** Hosts that are this site (or its previews / auth round-trips) — never an external referrer. */
const OWN_HOST = /(^|\.)himanshukukreja\.in$|^localhost$|^127\.0\.0\.1$|\.vercel\.app$|(^|\.)supabase\.co$|^accounts\.google\.com$|^accounts\.youtube\.com$/i;

export function isOwnHost(host: string | null | undefined): boolean {
  if (!host) return false;
  return OWN_HOST.test(host.toLowerCase());
}

const AI_HOST = /(^|\.)(chatgpt\.com|chat\.openai\.com|openai\.com|perplexity\.ai|claude\.ai|gemini\.google\.com|bard\.google\.com|notebooklm\.google\.com|aistudio\.google\.com|copilot\.microsoft\.com|you\.com|phind\.com|poe\.com|chat\.deepseek\.com|deepseek\.com|grok\.com|meta\.ai|chat\.mistral\.ai|kagi\.com\/assistant)$/i;
const AI_SOURCE = /^(chatgpt(\.com)?|openai|perplexity|claude|gemini|copilot|deepseek|grok|phind|you\.com|poe)$/i;

const SEARCH_HOST = /(^|\.)(google\.[a-z.]+|bing\.com|duckduckgo\.com|search\.yahoo\.com|yahoo\.com|yandex\.[a-z.]+|baidu\.com|ecosia\.org|search\.brave\.com|startpage\.com|qwant\.com|naver\.com|seznam\.cz|sogou\.com|so\.com|kagi\.com|mojeek\.com|search\.aol\.com)$/i;
const SEARCH_SOURCE = /^(google|bing|duckduckgo|yahoo|yandex|baidu|ecosia|brave|kagi)$/i;

const SOCIAL_HOST = /(^|\.)(linkedin\.com|lnkd\.in|com\.linkedin\.android|twitter\.com|x\.com|t\.co|facebook\.com|fb\.com|m\.facebook\.com|l\.facebook\.com|lm\.facebook\.com|instagram\.com|l\.instagram\.com|threads\.net|reddit\.com|old\.reddit\.com|out\.reddit\.com|youtube\.com|youtu\.be|news\.ycombinator\.com|bsky\.app|mastodon\.social|tiktok\.com|pinterest\.com|quora\.com|whatsapp\.com|wa\.me|web\.whatsapp\.com|telegram\.org|t\.me|discord\.com|discord\.gg|slack\.com|app\.slack\.com|snapchat\.com|weibo\.com|vk\.com|org\.telegram\.messenger|com\.whatsapp|com\.twitter\.android|com\.instagram\.android|com\.facebook\.katana|com\.reddit\.frontpage|com\.google\.android\.gm)$/i;
const SOCIAL_SOURCE = /^(linkedin|twitter|x|facebook|fb|instagram|ig|reddit|youtube|hn|hackernews|bluesky|threads|whatsapp|telegram|discord|slack|tiktok|mastodon)$/i;

const EMAIL_HOST = /(^|\.)(mail\.google\.com|outlook\.live\.com|outlook\.office\.com|outlook\.office365\.com|mail\.yahoo\.com|mail\.proton\.me|app\.fastmail\.com|mail\.zoho\.com|com\.google\.android\.gm)$/i;
const EMAIL_MEDIUM = /^(e-?mail|newsletter|mail)$/i;
const PAID_MEDIUM = /^(cpc|ppc|paid|paidsearch|paid_search|paid-social|paid_social|paidsocial|display|cpm|cpv|ads?|banner|retargeting|affiliate)$/i;

export function channelFor(referrerDomain: string | null | undefined, utm: Utm = {}): Channel {
  const host = (referrerDomain || "").toLowerCase().replace(/^www\./, "");
  const source = (utm.source || "").trim();
  const medium = (utm.medium || "").trim();
  const campaign = (utm.campaign || "").trim();

  if (medium && PAID_MEDIUM.test(medium)) return "Paid";
  if ((medium && EMAIL_MEDIUM.test(medium)) || /newsletter|e-?mail/i.test(source) || (host && EMAIL_HOST.test(host))) return "Email";
  if ((source && AI_SOURCE.test(source)) || (host && AI_HOST.test(host))) return "AI";

  const external = host && !isOwnHost(host);
  if (external && SEARCH_HOST.test(host)) return "Search";
  if (external && SOCIAL_HOST.test(host)) return "Social";
  if (source && SEARCH_SOURCE.test(source)) return medium && medium !== "organic" ? "Campaign" : "Search";
  if (source && SOCIAL_SOURCE.test(source)) return "Social";
  if (source || medium || campaign) return "Campaign";
  if (external) return "Referral";
  return "Direct";
}

/** Normalise a referrer host for display (`www.` stripped, android-app scheme unwrapped). */
export function cleanHost(host: string | null | undefined): string | null {
  if (!host) return null;
  const h = host.toLowerCase().replace(/^www\./, "").replace(/^m\./, "");
  return h || null;
}

/**
 * Reduce a referrer URL to `host/path` (no query, no fragment, no credentials) — or null when it
 * is empty, unparsable or this site. `android-app://com.linkedin.android/` → `com.linkedin.android`.
 */
export function cleanReferrer(raw: string | null | undefined): { host: string; url: string } | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    const host = (u.protocol === "android-app:" ? u.hostname || u.pathname.replace(/^\/+/, "").split("/")[0] : u.hostname).toLowerCase();
    if (!host || isOwnHost(host)) return null;
    const path = u.protocol === "android-app:" ? "" : u.pathname.replace(/\/+$/, "");
    return { host, url: (host + path).slice(0, 300) };
  } catch {
    return null;
  }
}
