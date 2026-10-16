/**
 * Server-side Mermaid syntax check with the site's own mermaid package (the same version that draws
 * the diagrams in the browser). mermaid.parse() needs no layout, but its sanitizer (DOMPurify) wants a
 * DOM; in Node DOMPurify has no hooks, so they are stubbed with an escaping no-op before mermaid loads.
 * Nothing here renders or returns HTML. Server-only.
 */
import "server-only";

type Mermaid = { parse: (text: string, opts?: { suppressErrors?: boolean }) => Promise<unknown> };

let loading: Promise<Mermaid | null> | null = null;

const escape = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

async function load(): Promise<Mermaid | null> {
  loading ??= (async () => {
    try {
      const purify = (await import("dompurify")).default as unknown as Record<string, unknown>;
      if (typeof purify.addHook !== "function") {
        // Node: no window, so DOMPurify is an inert stub. Parse only needs these to exist.
        purify.addHook = () => {};
        purify.removeHook = () => {};
        purify.removeHooks = () => {};
        purify.removeAllHooks = () => {};
        purify.sanitize = escape;
      }
      const m = (await import("mermaid")).default as unknown as Mermaid;
      return m;
    } catch (e) {
      console.warn("[case-files] mermaid unavailable on the server:", (e as Error)?.message);
      return null;
    }
  })();
  return loading;
}

export type MermaidCheck = { ok: true } | { ok: false; message: string; line?: number; unverified?: boolean };

let chain: Promise<unknown> = Promise.resolve();

/** Parse one diagram. `line` in the result is 1-based within the diagram source. Calls are serialized. */
export function checkMermaid(src: string): Promise<MermaidCheck> {
  const run = async (): Promise<MermaidCheck> => {
    const m = await load();
    if (!m) return { ok: false, unverified: true, message: "Mermaid could not be loaded on the server; check the diagram in the preview." };
    try {
      await m.parse(src);
      return { ok: true };
    } catch (e) {
      const msg = String((e as Error)?.message || e);
      if (/document is not defined|window is not defined|DOMPurify|is not a function/i.test(msg)) {
        return { ok: false, unverified: true, message: "This diagram type can't be checked on the server; check it in the preview." };
      }
      const lineM = /line (\d+)/i.exec(msg);
      const first = msg.split("\n").filter(Boolean);
      const expecting = first.find((l) => /^Expecting/.test(l));
      const head = first[0]?.replace(/^Parse error on line \d+:?/i, "").trim();
      const text = [first[0]?.startsWith("Parse error") ? "Parse error" : head, expecting ? expecting.replace(/'/g, "").slice(0, 160) : null].filter(Boolean).join(": ");
      return { ok: false, message: text || "Invalid Mermaid diagram", line: lineM ? Number(lineM[1]) : undefined };
    }
  };
  const p = chain.then(run, run);
  chain = p.catch(() => undefined);
  return p;
}
