/**
 * Build-time syntax highlighting (shiki). Both themes are emitted as CSS variables
 * (`defaultColor: false`), so course-content.css picks --shiki-light / --shiki-dark
 * from the site theme without any client JS.
 */
import type { Element as HastElement, ElementContent } from "hast";

type ShikiModule = typeof import("shiki");
type Highlighter = Awaited<ReturnType<ShikiModule["createHighlighter"]>>;

const THEMES = { light: "github-light", dark: "github-dark" } as const;
const PRELOAD = ["python", "sql", "bash", "yaml", "json", "markdown"];
const ALIASES: Record<string, string> = { py: "python", sh: "bash", shell: "bash", zsh: "bash", yml: "yaml", md: "markdown", js: "javascript", ts: "typescript" };

type HighlighterHandle = Promise<{ hl: Highlighter; mod: ShikiModule }>;

// Cached on globalThis so dev-mode module re-evaluation (HMR / per-route compiles) reuses one highlighter.
const cache = globalThis as typeof globalThis & { __sdShikiHighlighter?: HighlighterHandle | null };

function getHighlighter(): HighlighterHandle {
  if (!cache.__sdShikiHighlighter) {
    cache.__sdShikiHighlighter = (async () => {
      const mod = await import("shiki");
      const hl = await mod.createHighlighter({ themes: [THEMES.light, THEMES.dark], langs: PRELOAD });
      return { hl, mod };
    })().catch((err) => {
      cache.__sdShikiHighlighter = null;
      throw err;
    });
  }
  return cache.__sdShikiHighlighter;
}

/** Normalise a fence language; returns null when shiki has no grammar for it. */
export async function resolveLang(lang: string | null | undefined): Promise<string | null> {
  if (!lang) return null;
  const l = (ALIASES[lang.toLowerCase()] || lang.toLowerCase()).trim();
  try {
    const { hl, mod } = await getHighlighter();
    if (hl.getLoadedLanguages().includes(l)) return l;
    if (l in mod.bundledLanguages || l in mod.bundledLanguagesAlias) {
      await hl.loadLanguage(l as Parameters<Highlighter["loadLanguage"]>[0]);
      return l;
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Highlight `code` and return the `<code>` element's children (one `span.line` per
 * source line, separated by "\n" text nodes). Falls back to plain lines.
 */
export async function highlightLines(code: string, lang: string | null): Promise<ElementContent[]> {
  const resolved = await resolveLang(lang);
  if (resolved) {
    try {
      const { hl } = await getHighlighter();
      const root = hl.codeToHast(code, { lang: resolved, themes: THEMES, defaultColor: false });
      const pre = root.children.find((c): c is HastElement => c.type === "element" && c.tagName === "pre");
      const codeEl = pre?.children.find((c): c is HastElement => c.type === "element" && c.tagName === "code");
      if (codeEl) return codeEl.children;
    } catch {
      /* fall through to plain */
    }
  }
  return plainLines(code);
}

export function plainLines(code: string): ElementContent[] {
  const out: ElementContent[] = [];
  code.split("\n").forEach((line, i) => {
    if (i > 0) out.push({ type: "text", value: "\n" });
    out.push({ type: "element", tagName: "span", properties: { className: ["line"] }, children: line ? [{ type: "text", value: line }] : [] });
  });
  return out;
}
