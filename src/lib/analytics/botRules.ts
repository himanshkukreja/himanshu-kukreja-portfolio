/**
 * Crawlers that pass as ordinary Chrome (found 26 Nov 2026: ~37% of PostHog sessions over 30 days).
 * They spoof a current desktop UA, so UA lists miss them; what gives them away:
 * - a browser time zone on another continent from the IP country (a residential-proxy fleet:
 *   "Chrome 154 / Windows / 1920×1080" from 40 countries, US IPs set to Asia/Singapore, Asia/Tokyo…);
 * - headless Chrome on Linux at 1920×1080 with America/Los_Angeles (US data centres);
 * - the headless default screen 800×600.
 * Signed-in visitors are never counted as bots. One pure rule set, used by the traffic report (JS)
 * and by every PostHog admin query (HogQL), so both dashboards agree.
 */

/** IP country → time zone prefixes a real visitor there would have. Countries not listed are not judged. */
const TZ_BY_COUNTRY: [countries: string[], prefixes: string[]][] = [
  [["US"], ["America/", "Pacific/"]],
  [["CA", "MX", "BR", "AR", "CO", "CL", "PE", "VE", "EC", "BO", "UY", "PY", "GT", "CR", "PA", "DO", "HN", "SV", "NI", "JM", "PR"], ["America/"]],
  [
    ["GB", "IE", "FR", "DE", "ES", "PT", "IT", "NL", "BE", "LU", "CH", "AT", "PL", "CZ", "SK", "HU", "RO", "BG", "GR", "SE", "NO", "FI", "DK", "EE", "LV", "LT", "RS", "HR", "SI", "BA", "AL", "MK", "IS"],
    ["Europe/", "Atlantic/"],
  ],
  [["IN", "PK", "BD", "LK", "NP", "CN", "HK", "TW", "JP", "KR", "SG", "MY", "ID", "TH", "VN", "PH", "AE", "SA", "QA", "KW", "BH", "OM", "IL", "PS", "JO", "LB", "IQ", "MM", "KH"], ["Asia/"]],
  [["AU"], ["Australia/"]],
  [["NG", "KE", "ZA", "EG", "GH", "ET", "MA", "DZ", "TN", "UG", "TZ", "CM", "SN"], ["Africa/"]],
];
/** Zones that say nothing about where a browser is. */
const NEUTRAL_TZ = ["", "UTC", "Etc/UTC", "Etc/Unknown", "GMT"];

export function tzMismatch(country: string | null | undefined, tz: string | null | undefined): boolean {
  const z = tz || "";
  if (NEUTRAL_TZ.includes(z) || !country) return false;
  const entry = TZ_BY_COUNTRY.find(([cs]) => cs.includes(country.toUpperCase()));
  return !!entry && !entry[1].some((p) => z.startsWith(p));
}

export type BotSignals = {
  signedIn: boolean;
  country?: string | null;
  tz?: string | null;
  browser?: string | null;
  os?: string | null;
  sw?: number | null;
  sh?: number | null;
};

/** Why an anonymous view looks like a disguised crawler, or null. */
export function disguisedBotReason(s: BotSignals): "headless" | "dc-linux" | "tz" | null {
  if (s.signedIn) return null;
  if (s.sw === 800 && s.sh === 600) return "headless";
  if (s.os === "Linux" && s.browser === "Chrome" && s.sw === 1920 && s.sh === 1080 && s.tz === "America/Los_Angeles") return "dc-linux";
  if (tzMismatch(s.country, s.tz)) return "tz";
  return null;
}

const list = (xs: string[]) => xs.map((x) => `'${x}'`).join(", ");

/** The same rule over PostHog events, as a HogQL boolean (true = bot). */
export const BOT_HOGQL = (() => {
  const tz = "coalesce(properties.$timezone, '')";
  const cc = "properties.$geoip_country_code";
  const arms = TZ_BY_COUNTRY.map(([cs, ps]) => `${cc} IN (${list(cs)}), [${list(ps)}]`).join(", ");
  return `(person.properties.email IS NULL AND (
    (properties.$screen_width = 800 AND properties.$screen_height = 600)
    OR (properties.$os = 'Linux' AND properties.$browser = 'Chrome' AND properties.$screen_width = 1920 AND properties.$screen_height = 1080 AND properties.$timezone = 'America/Los_Angeles')
    OR (${tz} NOT IN (${list(NEUTRAL_TZ)}) AND NOT arrayExists(p -> startsWith(${tz}, p), multiIf(${arms}, [''])))
  ))`;
})();
