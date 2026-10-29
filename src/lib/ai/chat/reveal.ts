/**
 * How an answer appears on the page: a typewriter buffer between the stream and the screen. Pure (the chat
 * thread runs it once per animation frame; scripts/chat-check.ts tests it).
 *
 * On Claude Sonnet 5.5 an answer after a tool round arrives in one or two big pieces after a wait; shown as
 * they land, the text jumps in all at once. The buffer reveals it at a reading pace instead:
 * - a backlog of up to PASS_CHARS (a normal streaming delta) shows at once;
 * - a bigger one is spread over revealMs(backlog): about 800 characters a second, at least 180 ms and never more
 *   than 1.3 s from the moment the last piece arrived (a 900-character answer takes about 1.1 s);
 * - when the answer is done, whatever is left shows by FINISH_MS after it, or DONE_MS after the last piece
 *   arrived when that is later (on Sonnet the last big piece and "done" land together: it still gets its sweep).
 * The buffer only ever delays: `n` (characters shown) never goes down, and the whole text is shown in the end.
 */

export const PASS_CHARS = 24;
export const FINISH_MS = 300;
export const DONE_MS = 1000;
const CHARS_PER_SEC = 800;
const MIN_MS = 180;
const MAX_MS = 1300;

/** How long a backlog of `b` characters takes to show (ms); 0: show it now. */
export const revealMs = (b: number) => (b <= PASS_CHARS ? 0 : Math.min(MAX_MS, Math.max(MIN_MS, (b / CHARS_PER_SEC) * 1000)));

/** The buffer: characters shown, the target length it last saw, when it should catch up, and the last frame. */
export type Pace = { n: number; len: number; endAt: number; at: number; arrived: number; final: boolean };

export const startPace = (n: number, now: number): Pace => ({ n, len: n, endAt: now, at: now, arrived: now, final: false });

/**
 * One frame: the text is now `text` (it only grows while streaming), `final` once the answer is done. Returns the
 * next state; `n` moves towards text.length on a straight line to `endAt`, and lands on a word end when it can.
 */
export function paceStep(p: Pace, text: string, now: number, final: boolean): Pace {
  const len = text.length;
  let { n, endAt, arrived } = p;
  // the text was replaced by a shorter one (the final text after cleaning): keep what is shown, within the new text
  if (n > len) n = len;
  if (len > p.len) {
    endAt = now + revealMs(len - n);
    arrived = now;
  }
  if (final) endAt = Math.min(endAt, Math.max(now + FINISH_MS, arrived + DONE_MS));
  if (n < len) {
    if (now >= endAt) n = len;
    else {
      // one frame's share of what is left before endAt (a frame after an idle wait counts as one frame, not the wait)
      const dt = Math.min(64, Math.max(1, now - p.at));
      n = Math.min(len, n + Math.max(1, Math.ceil(((len - n) * dt) / (endAt - now + dt))));
      // finish the word it is in (up to 10 characters on), so a frame never ends half-way through one
      const ws = text.slice(n, n + 10).search(/\s/);
      if (ws > 0) n += ws;
    }
  }
  return { n, len, endAt, at: now, arrived, final };
}

/**
 * The part of a partly shown answer that renders cleanly: an inline construct still open on the last line
 * (**bold, `code, *italic, a [[ref) is held back to before it opens, and so is a last line that is only a list
 * marker or heading hashes, or a table row that hasn't closed. Inside an open code fence the text is shown as
 * it is (the renderer shows an unclosed fence as code). As the text grows, the cut only moves forward.
 */
export function safeCut(text: string): string {
  const nl = text.lastIndexOf("\n");
  const head = text.slice(0, nl + 1);
  const line = text.slice(nl + 1);
  const fences = (head.match(/^```/gm) || []).length;
  // a fence line being written (```, ```ts): wait for its newline
  if (/^\s*`{1,3}[\w-]*$/.test(line) && line.trim()) return head;
  if (fences % 2 === 1) return text;
  // a last line that is only a marker so far
  if (/^\s*(#{1,6}|[-*•+]|\d{1,3}[.)]?)\s*$/.test(line) && line.trim()) return head;
  // a table row still being written (a row is whole once its newline comes)
  if (/^\s*\|/.test(line)) return head;
  let cut = line.length;
  // a [ or [[ that hasn't closed (a citation chip being written)
  const open = /\[+[^\]]*$/.exec(line);
  if (open) cut = Math.min(cut, open.index);
  const ref = line.lastIndexOf("[[");
  if (ref >= 0 && line.indexOf("]]", ref) < 0) cut = Math.min(cut, ref);
  const bold = [...line.matchAll(/\*\*/g)].map((m) => m.index!);
  if (bold.length % 2 === 1) cut = Math.min(cut, bold[bold.length - 1]);
  const ticks = [...line.matchAll(/`/g)].map((m) => m.index!);
  if (ticks.length % 2 === 1) cut = Math.min(cut, ticks[ticks.length - 1]);
  // a lone * (italic) after taking out **pairs and a leading list marker
  const lone = [...line.replace(/^\s*\*\s/, "  ").replace(/\*\*/g, "  ").matchAll(/\*/g)].map((m) => m.index!);
  if (lone.length % 2 === 1) cut = Math.min(cut, lone[lone.length - 1]);
  return head + line.slice(0, cut);
}

/** What to show of `text` with `n` characters revealed: the whole text once it is all revealed and final. */
export function visibleText(text: string, n: number, final: boolean): string {
  if (n >= text.length && final) return text;
  return safeCut(text.slice(0, n));
}
