/**
 * schema.org structured data for search engines (rich results). Server-rendered once with the page,
 * so it costs nothing per visit on cached (ISR) pages.
 */
// structured data of course pages (and case files): URLs on the course host; the author is the portfolio
import { COURSE_ORIGIN as SITE_URL, PORTFOLIO_ORIGIN } from "@/lib/site/hosts";

const AUTHOR = { "@type": "Person", name: "Himanshu Kukreja", url: PORTFOLIO_ORIGIN };
const COURSE_NAME = "System Design Mastery";

type Crumb = { name: string; path: string };

export function breadcrumbs(items: Crumb[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: `${SITE_URL}${c.path}` })),
  };
}

export function lessonArticle(o: { title: string; description: string | null; path: string; coursePath: string; section: string }) {
  return {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    headline: o.title.slice(0, 110),
    ...(o.description ? { description: o.description } : {}),
    url: `${SITE_URL}${o.path}`,
    mainEntityOfPage: `${SITE_URL}${o.path}`,
    articleSection: o.section,
    inLanguage: "en",
    isAccessibleForFree: true,
    author: AUTHOR,
    publisher: AUTHOR,
    isPartOf: { "@type": "Course", name: COURSE_NAME, url: `${SITE_URL}${o.coursePath}` },
  };
}

export function course(o: { path: string; description: string; lessons: number; hours: number }) {
  return {
    "@context": "https://schema.org",
    "@type": "Course",
    name: COURSE_NAME,
    description: o.description,
    url: `${SITE_URL}${o.path}`,
    inLanguage: "en",
    isAccessibleForFree: true,
    provider: { "@type": "Person", name: "Himanshu Kukreja", sameAs: PORTFOLIO_ORIGIN },
    offers: { "@type": "Offer", price: 0, priceCurrency: "INR", category: "Free" },
    hasCourseInstance: {
      "@type": "CourseInstance",
      courseMode: "Online",
      courseWorkload: `PT${o.hours}H`,
    },
    educationalLevel: "Intermediate",
    teaches: "Designing scalable, reliable distributed systems and passing system design interviews",
    about: `${o.lessons} lessons, interview bosses, trials and mock interviews`,
  };
}

export function caseFileArticle(o: { title: string; description: string; path: string; date?: string; image?: string }) {
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: o.title.slice(0, 110),
    description: o.description,
    url: `${SITE_URL}${o.path}`,
    mainEntityOfPage: `${SITE_URL}${o.path}`,
    ...(o.date ? { datePublished: o.date } : {}),
    ...(o.image ? { image: o.image.startsWith("http") ? o.image : `${SITE_URL}${o.image}` } : {}),
    inLanguage: "en",
    author: AUTHOR,
    publisher: AUTHOR,
  };
}

/** An article page of the course with no richer type of its own (war stories, DSA lessons). */
export function plainArticle(o: { title: string; description?: string | null; path: string }) {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: o.title.slice(0, 110),
    ...(o.description ? { description: o.description } : {}),
    url: `${SITE_URL}${o.path}`,
    mainEntityOfPage: `${SITE_URL}${o.path}`,
    inLanguage: "en",
    author: AUTHOR,
    publisher: AUTHOR,
  };
}

/**
 * A DSA Mastery lesson or practice problem: an Article that is also a schema.org LearningResource of the DSA Mastery course
 * (free to read; signInGated marks the part a guest sees after the sign-in card).
 */
export function dsaResource(o: { title: string; description?: string | null; path: string; type: "Lesson" | "Practice problem"; level?: string }) {
  return {
    ...plainArticle(o),
    "@type": ["Article", "LearningResource"],
    learningResourceType: o.type,
    educationalLevel: o.level || "Beginner to advanced",
    teaches: o.title,
    isAccessibleForFree: true,
    isPartOf: { "@type": "Course", name: "DSA Mastery", url: `${SITE_URL}/dsa`, provider: AUTHOR },
  };
}

/**
 * The sign-in gate (src/lib/gate) as Google's markup for gated content: the text marked .hk-gated is in the HTML
 * for everyone but shown to signed-in readers only, so it says so (not cloaking: one HTML for all). `gated` false
 * (gate off, or a page too short to cut) leaves the object as it was.
 */
export function signInGated<T extends object>(ld: T, gated: boolean): T {
  if (!gated) return ld;
  return { ...ld, isAccessibleForFree: false, hasPart: { "@type": "WebPageElement", isAccessibleForFree: false, cssSelector: ".hk-gated" } };
}

/** Renders one or more schema.org objects. `<` is escaped so content can never close the script tag. */
/**
 * A video (lecture or short) for Google's video results: the watch page, the file, the poster, the
 * length and, for lectures, the chapters as key moments (Clip, linked with ?t=<seconds>).
 */
export function videoObject(o: {
  name: string;
  description: string;
  path: string;
  thumbnailUrl: string;
  contentUrl: string;
  uploadDate: string;
  duration: string;
  chapters?: { title: string; at: number }[];
  durationSec?: number;
}) {
  const page = `${SITE_URL}${o.path}`;
  const parts = (o.chapters || []).filter((c) => c.at >= 0);
  return {
    "@context": "https://schema.org",
    "@type": "VideoObject",
    name: o.name.slice(0, 100),
    description: o.description,
    thumbnailUrl: [o.thumbnailUrl],
    uploadDate: o.uploadDate,
    duration: o.duration,
    contentUrl: o.contentUrl,
    url: page,
    inLanguage: "en",
    isAccessibleForFree: true,
    author: AUTHOR,
    publisher: AUTHOR,
    ...(parts.length > 1
      ? {
          hasPart: parts.map((c, i) => ({
            "@type": "Clip",
            name: c.title,
            startOffset: Math.floor(c.at),
            endOffset: Math.floor(parts[i + 1]?.at ?? o.durationSec ?? c.at + 60),
            url: `${page}${page.includes("?") ? "&" : "?"}t=${Math.floor(c.at)}`,
          })),
        }
      : {}),
  };
}

export function JsonLd({ data }: { data: object | object[] }) {
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}
