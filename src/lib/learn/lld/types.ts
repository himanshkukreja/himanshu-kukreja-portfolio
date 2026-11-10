/** What the case-study page's client pieces need (built by src/lib/learn/lld/load.ts, serialisable). */
import type { CaseMeta } from "./meta";
import type { CaseRow } from "./filters";

export type LldMeta = {
  name: string;
  difficulty: CaseMeta["difficulty"];
  roundMinutes: number;
  patterns: { slug: string; name: string; href: string }[];
  companies: CaseRow["companies"];
  /** code languages the lesson has: the code tabs enable these */
  langs: string[];
  labs: { id: string; title: string; href: string; minutes: number; languages: string[] }[];
  /** the class explorer: each class with its highlighted Python */
  classes: { name: string; stereotype: string | null; members: string[]; links: { to: string; how: string }[]; codeHtml: string | null }[];
  /** per step key, whether the lesson has real content for it */
  present: string[];
  /** what a writer still has to supply */
  missing: string[];
  /** the series' next case study */
  next: { href: string; name: string } | null;
};

