/**
 * Allow-list HTML sanitizer for user-written rich text (lesson and story comments).
 *
 * Comment HTML is written straight into lesson_comments / story_comments by the browser (RLS only
 * checks the author), so it must be treated as hostile when rendered: without this, a comment
 * like `<img src=x onerror=…>` ran in every reader's session — including the admin's, whose
 * Supabase token sits in localStorage.
 *
 * Keeps only the formatting the comment editor produces (bold, italic, code, lists, quotes, links,
 * line breaks); every attribute except a safe `href` is dropped. Browser-only (DOMParser); on the
 * server it returns the text with all markup escaped.
 */
const ALLOWED = new Set([
  "p", "br", "div", "span", "b", "strong", "i", "em", "u", "s", "strike", "del",
  "code", "pre", "blockquote", "ul", "ol", "li", "a", "h3", "h4",
]);
/** dropped together with everything inside them */
const DROP = new Set(["script", "style", "iframe", "object", "embed", "svg", "math", "template", "noscript", "form", "input", "button", "textarea", "select", "link", "meta", "base"]);

function escapeText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function safeHref(raw: string | null): string | null {
  if (!raw) return null;
  const href = raw.trim();
  if (/^(https?:|mailto:)/i.test(href)) return href;
  if (/^[/#]/.test(href) && !href.startsWith("//")) return href;
  return null;
}

function clean(node: Node, doc: Document): Node | null {
  if (node.nodeType === 3) return doc.createTextNode(node.textContent || "");
  if (node.nodeType !== 1) return null;
  const el = node as Element;
  const tag = el.tagName.toLowerCase();
  if (DROP.has(tag)) return null;
  const kids = Array.from(el.childNodes)
    .map((c) => clean(c, doc))
    .filter((c): c is Node => !!c);
  if (!ALLOWED.has(tag)) {
    // unknown wrapper (font, img, table…): keep its text, lose the element
    const frag = doc.createDocumentFragment();
    kids.forEach((k) => frag.appendChild(k));
    return frag;
  }
  const out = doc.createElement(tag);
  if (tag === "a") {
    const href = safeHref(el.getAttribute("href"));
    if (href) {
      out.setAttribute("href", href);
      out.setAttribute("target", "_blank");
      out.setAttribute("rel", "nofollow noopener noreferrer ugc");
    }
  }
  kids.forEach((k) => out.appendChild(k));
  return out;
}

export function sanitizeRichText(html: string | null | undefined): string {
  const input = String(html ?? "").slice(0, 50_000);
  if (typeof window === "undefined" || typeof DOMParser === "undefined") return escapeText(input);
  try {
    const parsed = new DOMParser().parseFromString(`<body>${input}</body>`, "text/html");
    const out = document.implementation.createHTMLDocument("");
    const root = out.createElement("div");
    Array.from(parsed.body.childNodes).forEach((c) => {
      const k = clean(c, out);
      if (k) root.appendChild(k);
    });
    return root.innerHTML;
  } catch {
    return escapeText(input);
  }
}
