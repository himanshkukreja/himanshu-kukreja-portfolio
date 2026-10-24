/**
 * schema.org structured data for search engines (rich results). Server-rendered once with the page,
 * so it costs nothing per visit on cached (ISR) pages.
 */
import { SITE_URL } from "@/lib/site";

const AUTHOR = { "@type": "Person", name: "Himanshu Kukreja", url: SITE_URL };
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
    provider: { "@type": "Person", name: "Himanshu Kukreja", sameAs: SITE_URL },
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

/** Renders one or more schema.org objects. `<` is escaped so content can never close the script tag. */
export function JsonLd({ data }: { data: object | object[] }) {
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}
