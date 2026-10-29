/**
 * Query text for the content-gap radar and the smart-search query log. Pure (no server imports), shared by
 * the logger, the sources and the clustering. The stored and shown form of a query is `normaliseQuery`:
 * personal details removed first, then smart search's own normalisation (lowercase, punctuation dropped).
 */
import { queryKey } from "@/lib/search/smart/text";

/** emails, links, phone-like digit runs and long numbers (ids, card numbers): never stored or shown */
const PRIVATE = [
  /[^\s@]+@[^\s@]+\.[^\s@]+/g,
  /\bhttps?:\/\/\S+/gi,
  /\bwww\.\S+/gi,
  /\+?\d[\d\s().-]{6,}\d/g,
];

export function scrubPrivate(s: string, mark = " "): string {
  let out = s;
  for (const re of PRIVATE) out = out.replace(re, mark);
  return out;
}

/** How a query is stored and grouped: scrubbed, normalised, at most 160 characters ("" when nothing is left). */
export const normaliseQuery = (q: string): string => queryKey(scrubPrivate(String(q ?? "")).slice(0, 400)).slice(0, 160).trim();

/** UTC day bucket, YYYY-MM-DD. */
export const dayOf = (d: Date | string | number = Date.now()): string => new Date(d).toISOString().slice(0, 10);
