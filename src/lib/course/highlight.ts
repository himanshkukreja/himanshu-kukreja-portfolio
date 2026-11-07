/**
 * Build-time syntax highlighting (shiki). Both themes are emitted as CSS variables
 * (`defaultColor: false`), so course-content.css picks --shiki-light / --shiki-dark
 * from the site theme without any client JS.
 */
import type { Element as HastElement, ElementContent } from "hast";

import type { HighlighterCore } from "shiki/core";

const THEMES = { light: "github-light", dark: "github-dark" } as const;
const ALIASES: Record<string, string> = {
  py: "python", sh: "bash", shell: "bash", shellscript: "bash", zsh: "bash", yml: "yaml", md: "markdown",
  js: "javascript", jsx: "javascript", mjs: "javascript", cjs: "javascript", ts: "typescript", tsx: "typescript",
  proto: "protobuf", dockerfile: "docker", golang: "go", rs: "rust", htm: "html", cfg: "ini", conf: "ini",
};
/**
 * Only the grammars the course uses (plus a few likely ones), each loaded on first use: the full
 * shiki bundle is ~7.5 MB of grammars on the server (too big for a Cloudflare Worker).
 * A language missing here renders as plain text, never an error; add it here when content needs it.
 */
const LANGS: Record<string, () => Promise<{ default: unknown }>> = {
  python: () => import("@shikijs/langs/python"),
  javascript: () => import("@shikijs/langs/javascript"),
  typescript: () => import("@shikijs/langs/typescript"),
  sql: () => import("@shikijs/langs/sql"),
  http: () => import("@shikijs/langs/http"),
  json: () => import("@shikijs/langs/json"),
  jsonc: () => import("@shikijs/langs/jsonc"),
  yaml: () => import("@shikijs/langs/yaml"),
  bash: () => import("@shikijs/langs/shellscript"),
  markdown: () => import("@shikijs/langs/markdown"),
  c: () => import("@shikijs/langs/c"),
  lua: () => import("@shikijs/langs/lua"),
  protobuf: () => import("@shikijs/langs/proto"),
  nginx: () => import("@shikijs/langs/nginx"),
  graphql: () => import("@shikijs/langs/graphql"),
  go: () => import("@shikijs/langs/go"),
  diff: () => import("@shikijs/langs/diff"),
  java: () => import("@shikijs/langs/java"),
  rust: () => import("@shikijs/langs/rust"),
  html: () => import("@shikijs/langs/html"),
  css: () => import("@shikijs/langs/css"),
  docker: () => import("@shikijs/langs/docker"),
  toml: () => import("@shikijs/langs/toml"),
  ini: () => import("@shikijs/langs/ini"),
  xml: () => import("@shikijs/langs/xml"),
};

// Cached on globalThis so dev-mode module re-evaluation (HMR / per-route compiles) reuses one highlighter.
const cache = globalThis as typeof globalThis & { __sdShikiHighlighter?: Promise<HighlighterCore> | null };

function getHighlighter(): Promise<HighlighterCore> {
  if (!cache.__sdShikiHighlighter) {
    cache.__sdShikiHighlighter = (async () => {
      const [{ createHighlighterCore }, { createJavaScriptRegexEngine }] = await Promise.all([import("shiki/core"), import("shiki/engine/javascript")]);
      // JavaScript regex engine: no oniguruma WASM to ship or instantiate
      return createHighlighterCore({
        themes: [import("@shikijs/themes/github-light"), import("@shikijs/themes/github-dark")],
        langs: [],
        engine: createJavaScriptRegexEngine(),
      });
    })().catch((err) => {
      cache.__sdShikiHighlighter = null;
      throw err;
    });
  }
  return cache.__sdShikiHighlighter;
}

/** Normalise a fence language; returns null when there's no grammar for it. */
export async function resolveLang(lang: string | null | undefined): Promise<string | null> {
  if (!lang) return null;
  const l = (ALIASES[lang.toLowerCase().trim()] || lang.toLowerCase()).trim();
  const load = LANGS[l];
  if (!load) return null;
  try {
    const hl = await getHighlighter();
    if (!hl.getLoadedLanguages().includes(l)) await hl.loadLanguage((await load()).default as Parameters<HighlighterCore["loadLanguage"]>[0]);
    return hl.getLoadedLanguages().includes(l) ? l : null;
  } catch {
    return null;
  }
}

/**
 * Highlight `code` and return the `<code>` element's children (one `span.line` per
 * source line, separated by "\n" text nodes). Falls back to plain lines.
 */
export async function highlightLines(code: string, lang: string | null): Promise<ElementContent[]> {
  const resolved = await resolveLang(lang);
  if (resolved) {
    try {
      const hl = await getHighlighter();
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
