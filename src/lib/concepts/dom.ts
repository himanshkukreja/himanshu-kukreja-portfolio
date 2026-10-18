/**
 * Client helpers for the renderer's term marks (<span class="sd-term" data-term="…">, see
 * src/lib/course/terms.ts) and the reader setting that turns hover cards off.
 */

/* ------------------------------------------------------------------ highlights keep working */

export type LiftedTerm = { at: number; len: number; attrs: [string, string][] };

const SKIP = (el: Element) => el.hasAttribute("data-sd-chrome") || el.tagName === "SCRIPT" || el.tagName === "STYLE";

function textNodes(root: Node): Text[] {
  const out: Text[] = [];
  const w = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode(n) {
      if (n.nodeType === Node.ELEMENT_NODE) return SKIP(n as Element) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_SKIP;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  for (let n = w.nextNode(); n; n = w.nextNode()) out.push(n as Text);
  return out;
}

/**
 * Unwrap the term marks (remembering where they were, as character offsets over non-chrome text)
 * so text-node based passes, e.g. applying saved highlights, see whole sentences again.
 */
export function liftTerms(root: HTMLElement): LiftedTerm[] {
  const spans = Array.from(root.querySelectorAll<HTMLElement>("span.sd-term"));
  if (!spans.length) return [];
  const lifted: LiftedTerm[] = [];
  const marked = new Set(spans);
  let at = 0;
  for (const t of textNodes(root)) {
    const span = t.parentElement;
    if (span && marked.has(span) && span.firstChild === t) {
      lifted.push({ at, len: span.textContent?.length || 0, attrs: Array.from(span.attributes).map((a) => [a.name, a.value]) });
    }
    at += t.nodeValue?.length || 0;
  }
  spans.forEach((s) => s.replaceWith(...Array.from(s.childNodes)));
  root.normalize();
  return lifted;
}

/** Put lifted marks back where their text still sits in one text node (not inside a highlight). */
export function restoreTerms(root: HTMLElement, lifted: LiftedTerm[]) {
  if (!lifted.length) return;
  const queue = [...lifted].sort((a, b) => a.at - b.at);
  let qi = 0;
  let at = 0;
  for (const t of textNodes(root)) {
    const len = t.nodeValue?.length || 0;
    const end = at + len;
    // restore right-to-left within one node so earlier offsets stay valid
    const here: LiftedTerm[] = [];
    while (qi < queue.length && queue[qi].at < end) {
      const q = queue[qi++];
      if (q.at >= at && q.at + q.len <= end && !t.parentElement?.closest("mark")) here.push(q);
    }
    for (let i = here.length - 1; i >= 0; i--) {
      const q = here[i];
      const node = t;
      const start = q.at - at;
      const mid = node.splitText(start);
      mid.splitText(q.len);
      const span = document.createElement("span");
      q.attrs.forEach(([k, v]) => span.setAttribute(k, v));
      mid.replaceWith(span);
      span.appendChild(mid);
    }
    at = end;
  }
}

/* ------------------------------------------------------------------ reader setting */

export const TERMS_KEY = "hk.terms.v1";
export const TERMS_EVENT = "hk:terms";

export function termsEnabled(): boolean {
  try {
    return window.localStorage.getItem(TERMS_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setTermsEnabled(on: boolean) {
  try {
    if (on) window.localStorage.removeItem(TERMS_KEY);
    else window.localStorage.setItem(TERMS_KEY, "off");
  } catch {
    // storage blocked: the change lasts for this page view
  }
  window.dispatchEvent(new CustomEvent(TERMS_EVENT, { detail: { on } }));
}

export function subscribeTerms(cb: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key === TERMS_KEY) cb();
  };
  window.addEventListener(TERMS_EVENT, cb);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(TERMS_EVENT, cb);
    window.removeEventListener("storage", onStorage);
  };
}
