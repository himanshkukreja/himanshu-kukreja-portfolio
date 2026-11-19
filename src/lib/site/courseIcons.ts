/**
 * Favicon set per course. The root layout's <head> links are SD Mastery's (orange mark, /manifest.webmanifest); on DSA Mastery
 * pages (<html data-course="dsa">, set before first paint by READING_JS and kept by SiteHeader) they point at DSA's own set in
 * public/course-brand/dsa (scripts/brand/build-dsa-icons.mjs) and its manifest (/dsa/manifest.webmanifest). The /dsa layout
 * declares the same set through Next metadata, so crawlers and the streamed head agree.
 */
export const SDM_ICONS = { ico: "/favicon.ico?v=3", svg: "/icon.svg?v=3", apple: "/apple-icon.png?v=3", manifest: "/manifest.webmanifest", title: "SD Mastery" } as const;
export const DSA_ICONS = {
  ico: "/course-brand/dsa/favicon.ico?v=1",
  svg: "/course-brand/dsa/icon.svg?v=1",
  apple: "/course-brand/dsa/apple-icon.png?v=1",
  manifest: "/dsa/manifest.webmanifest",
  title: "DSA Mastery",
} as const;

/** Re-points the page's icon, apple-touch-icon, manifest and web-app title links to a course's set (client navigation between the courses). */
export function applyCourseIcons(dsa: boolean) {
  // Next streams the file-convention icon link into the head after hydration on some pages: run again once the page has loaded
  if (typeof window !== "undefined" && document.readyState !== "complete") window.addEventListener("load", () => applyCourseIcons(dsa), { once: true });
  const s = dsa ? DSA_ICONS : SDM_ICONS;
  const set = (sel: string, attr: string, v: string) => document.querySelectorAll(sel).forEach((el) => el.getAttribute(attr) !== v && el.setAttribute(attr, v));
  set('link[rel="icon"][sizes="any"], link[rel="icon"][href*="favicon.ico"]', "href", s.ico);
  set('link[rel="icon"][type="image/svg+xml"]', "href", s.svg);
  set('link[rel="apple-touch-icon"]', "href", s.apple);
  set('link[rel="manifest"]', "href", s.manifest);
  set('meta[name="apple-mobile-web-app-title"]', "content", s.title);
}

/** The same swap as plain ES5 for a <script> right after the icon links (a direct load of a DSA page: no flash of the orange icon). */
export const COURSE_ICONS_JS = `(function(){try{if(document.documentElement.getAttribute("data-course")!=="dsa")return;var d=${JSON.stringify(DSA_ICONS)};
var q=function(s,a,v){var l=document.querySelectorAll(s);for(var i=0;i<l.length;i++)l[i].setAttribute(a,v)};
q('link[rel="icon"][sizes="any"],link[rel="icon"][href*="favicon.ico"]',"href",d.ico);q('link[rel="icon"][type="image/svg+xml"]',"href",d.svg);q('link[rel="apple-touch-icon"]',"href",d.apple);q('link[rel="manifest"]',"href",d.manifest);q('meta[name="apple-mobile-web-app-title"]',"content",d.title)}catch(e){}})();`;
