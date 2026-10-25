/** Interview prep (/learn/prep): companies and the question bank built from them. */

export const PREP_CATEGORIES = ["big-tech", "fintech", "commerce", "food-and-delivery", "mobility", "media", "trading", "saas", "travel", "gaming", "social", "other"] as const;
export type PrepCategory = (typeof PREP_CATEGORIES)[number];
export const CATEGORY_LABEL: Record<PrepCategory, string> = {
  "big-tech": "Big tech",
  fintech: "Fintech",
  commerce: "Commerce",
  "food-and-delivery": "Food & delivery",
  mobility: "Mobility",
  media: "Media & streaming",
  trading: "Trading",
  saas: "SaaS & dev tools",
  travel: "Travel",
  gaming: "Gaming",
  social: "Social",
  other: "Other",
};

export type QuestionType = "system-design" | "lld" | "concept";
export const TYPE_LABEL: Record<QuestionType, string> = { "system-design": "System design", lld: "Low-level design", concept: "Concept" };

export type Evidence = "reported" | "likely";
export type PrepSource = { label: string; url: string };
export type ArticleLink = { code: string; title: string; href: string };

export type CompanyQuestion = { q: string; type: QuestionType; evidence: Evidence; sources: PrepSource[]; links: ArticleLink[] };

export type CompanySummary = {
  slug: string;
  name: string;
  category: PrepCategory;
  hq: string;
  builds: string;
  questions: number;
  reported: number;
  href: string;
};

export type Company = CompanySummary & {
  focus: string[];
  rounds: { name: string; note: string; source: string }[];
  list: CompanyQuestion[];
  /** every linked article once, in question order: the study path */
  path: ArticleLink[];
};

/** One question across companies (the question bank). */
export type BankQuestion = {
  key: string;
  q: string;
  type: QuestionType;
  links: ArticleLink[];
  companies: { slug: string; name: string; evidence: Evidence; sources: PrepSource[] }[];
};

export const companyHref = (slug: string) => `/learn/prep/companies/${slug}`;
/** "Design a URL Shortener" ≈ "design a url-shortener" */
export const questionKey = (q: string) =>
  q
    .toLowerCase()
    .replace(/\(lld\)/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
