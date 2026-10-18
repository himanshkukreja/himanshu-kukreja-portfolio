/**
 * The concept catalogue (resources/concepts/concepts.yml in the content repo): parsing and the
 * per-page term index the renderer marks terms with. Server code (pages, scripts); pure, so the
 * validator script can load it with jiti.
 *
 * File format: resources/concepts/README.md.
 */
import matter from "gray-matter";
import {
  buildMatcher,
  conceptForms,
  DEFAULT_SETTINGS,
  refCode,
  refHref,
  type Catalogue,
  type CatalogueSettings,
  type Concept,
  type ConceptRef,
  type Matcher,
} from "./match";

export const CATALOGUE_PATH = "resources/concepts/concepts.yml";

const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const REF_RE = /^([a-z0-9-]+\/[A-Za-z0-9-]+)#([a-z0-9-]+)$/;

export function parseRef(raw: unknown): ConceptRef | null {
  if (typeof raw !== "string") return null;
  const m = raw.trim().match(REF_RE);
  return m ? { lesson: m[1], anchor: m[2] } : null;
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");
const list = (v: unknown): string[] => (Array.isArray(v) ? v.map(str).filter(Boolean) : typeof v === "string" && v.trim() ? [v.trim()] : []);
export const words = (s: string) => (s.match(/[\p{L}\p{N}][\p{L}\p{N}'’.\-/]*/gu) || []).length;

/** Parse + validate. Invalid entries are dropped (and reported) so one typo never hides the rest. */
export function parseCatalogue(yamlText: string): { catalogue: Catalogue; errors: string[] } {
  const errors: string[] = [];
  let data: Record<string, unknown> = {};
  try {
    // gray-matter's YAML engine (js-yaml), fed as front matter
    data = matter(`---\n${yamlText.replace(/^﻿/, "")}\n---\n`).data as Record<string, unknown>;
  } catch (e) {
    errors.push(`YAML: ${(e as Error).message}`);
    return { catalogue: { version: 1, settings: DEFAULT_SETTINGS, concepts: [] }, errors };
  }
  const s = (data.settings || {}) as Record<string, unknown>;
  const scope = s.scope === "chapter" || s.scope === "page" || s.scope === "stage" ? s.scope : DEFAULT_SETTINGS.scope;
  const max = Number(s.max_per_section);
  const settings: CatalogueSettings = { scope, maxPerSection: Number.isFinite(max) && max > 0 ? Math.floor(max) : DEFAULT_SETTINGS.maxPerSection };

  const raw = Array.isArray(data.concepts) ? (data.concepts as Record<string, unknown>[]) : [];
  const concepts: Concept[] = [];
  const ids = new Set<string>();
  raw.forEach((r, i) => {
    const id = str(r?.id);
    const where = id || `#${i + 1}`;
    const term = str(r?.term);
    const definition = str(r?.definition).replace(/\s+/g, " ");
    const taught = parseRef(r?.taught_in);
    const refresher = list(r?.refresher).map((x) => x.replace(/\s+/g, " "));
    const bad: string[] = [];
    if (!ID_RE.test(id)) bad.push("id must be lowercase-kebab");
    if (ids.has(id)) bad.push("duplicate id");
    if (!term) bad.push("term missing");
    if (!definition) bad.push("definition missing");
    else if (words(definition) > 25) bad.push(`definition is ${words(definition)} words (max 25)`);
    if (!taught) bad.push("taught_in must be <week folder>/<slug>#<anchor>");
    if (refresher.length < 3 || refresher.length > 5) bad.push(`refresher needs 3-5 points (has ${refresher.length})`);
    if (bad.length) {
      errors.push(`${where}: ${bad.join("; ")}`);
      if (!ID_RE.test(id) || ids.has(id) || !term || !definition || !taught) return;
    }
    ids.add(id);
    const also: ConceptRef[] = [];
    list(r?.also).forEach((a) => {
      const ref = parseRef(a);
      if (ref) also.push(ref);
      else errors.push(`${id}: bad also ref "${a}"`);
    });
    concepts.push({
      id,
      term,
      aliases: list(r?.aliases),
      definition,
      taught: taught!,
      also,
      related: list(r?.related),
      refresher,
      mark: r?.mark !== false,
    });
  });
  concepts.forEach((c) => {
    const missing = c.related.filter((r) => !ids.has(r));
    if (missing.length) errors.push(`${c.id}: unknown related ${missing.join(", ")}`);
    c.related = c.related.filter((r) => ids.has(r) && r !== c.id);
  });
  const version = Number(data.version) || 1;
  return { catalogue: { version, settings, concepts }, errors };
}

/* ------------------------------------------------------------------ term index (renderer input) */

/** What a hover card shows; only the concepts present on a page are shipped with it. */
export type TermCard = {
  id: string;
  term: string;
  def: string;
  /** "taught in" link */
  href: string;
  /** "W02 · Day 2" */
  code: string;
  /** lesson title, e.g. "Idempotency in Practice" */
  title?: string;
  rel: { id: string; term: string; href: string }[];
};

export type LessonLabels = Record<string, { title: string }>;

export type TermIndex = {
  settings: CatalogueSettings;
  matcher: Matcher | null;
  concepts: Map<string, Concept>;
  cards: Map<string, TermCard>;
};

export function buildTermIndex(catalogue: Catalogue, labels: LessonLabels = {}): TermIndex {
  const concepts = new Map(catalogue.concepts.map((c) => [c.id, c]));
  const cards = new Map<string, TermCard>();
  catalogue.concepts.forEach((c) => {
    cards.set(c.id, {
      id: c.id,
      term: c.term,
      def: c.definition,
      href: refHref(c.taught),
      code: refCode(c.taught.lesson),
      ...(labels[c.taught.lesson]?.title ? { title: labels[c.taught.lesson].title } : {}),
      rel: c.related
        .map((r) => concepts.get(r))
        .filter((r): r is Concept => !!r)
        .slice(0, 4)
        .map((r) => ({ id: r.id, term: r.term, href: refHref(r.taught) })),
    });
  });
  const forms = catalogue.concepts.filter((c) => c.mark).flatMap(conceptForms);
  return { settings: catalogue.settings, matcher: buildMatcher(forms), concepts, cards };
}
