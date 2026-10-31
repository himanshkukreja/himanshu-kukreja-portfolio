/**
 * GFM tables in AI text: an answer or a typed page that holds "| Strategy | Latency |" lines. Shared by the renderers
 * that write escaped HTML (AiText, the notebook's Text view in NotesMd) and by the plain text a notebook text box gets
 * (explain/api.ts plainText). No dependency: a header row, a "| --- | :-: |" delimiter row, then rows, the GitHub way.
 * (Here, not in lib/: the Tailwind classes below must be in a scanned folder.)
 */

export type MdTable = { head: string[]; align: ("left" | "center" | "right" | null)[]; rows: string[][] };

const DELIM = /^\s*\|?\s*:?-{2,}:?\s*(?:\|\s*:?-{2,}:?\s*)*\|?\s*$/;

/** A row's cells: outer pipes off, split on pipes not escaped (\|) and not inside `code`. */
export function splitRow(line: string): string[] {
  let t = line.trim().replace(/^\|/, "");
  // the closing pipe (not an escaped one; no lookbehind: older Safari can't parse it)
  if (t.endsWith("|") && !t.endsWith("\\|")) t = t.slice(0, -1);
  const cells: string[] = [];
  let cur = "";
  let code = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (c === "\\" && t[i + 1] === "|") {
      cur += "|";
      i++;
    } else if (c === "`") {
      code = !code;
      cur += c;
    } else if (c === "|" && !code) {
      cells.push(cur.trim());
      cur = "";
    } else cur += c;
  }
  cells.push(cur.trim());
  return cells;
}

const isRow = (l: string | undefined) => !!l && l.includes("|") && l.trim().length > 1;

/** Is a table starting at lines[i]? (a row with pipes, then a delimiter row with as many columns) */
export function tableAt(lines: string[], i: number): boolean {
  if (!isRow(lines[i]) || !DELIM.test(lines[i + 1] ?? "") || !lines[i + 1].includes("-")) return false;
  const n = splitRow(lines[i]).length;
  return n >= 2 && splitRow(lines[i + 1]).length === n;
}

/** Reads the table at lines[i] (tableAt must be true); returns it and the index of the first line after it. */
export function readTable(lines: string[], i: number): { table: MdTable; next: number } {
  const head = splitRow(lines[i]);
  const align = splitRow(lines[i + 1]).map((d) => (/^:-+:$/.test(d) ? "center" : /-:$/.test(d) ? "right" : /^:-/.test(d) ? "left" : null));
  const rows: string[][] = [];
  let j = i + 2;
  for (; j < lines.length && isRow(lines[j]) && !DELIM.test(lines[j]); j++) {
    const cells = splitRow(lines[j]);
    // the row as wide as the header: a short row padded, a long one cut (as GitHub does)
    rows.push(head.map((_, k) => cells[k] ?? ""));
  }
  return { table: { head, align, rows }, next: j };
}

/** Lines split into runs of plain lines and tables, in order. */
export function splitTables(lines: string[]): ({ lines: string[] } | { table: MdTable })[] {
  const out: ({ lines: string[] } | { table: MdTable })[] = [];
  let run: string[] = [];
  for (let i = 0; i < lines.length; ) {
    if (tableAt(lines, i)) {
      if (run.length) out.push({ lines: run });
      run = [];
      const { table, next } = readTable(lines, i);
      out.push({ table });
      i = next;
    } else run.push(lines[i++]);
  }
  if (run.length) out.push({ lines: run });
  return out;
}

/**
 * A table as HTML, compact: cells go through `inline` (which must escape), the first column reads as the row's name,
 * and a table wider than its column scrolls sideways inside its own box (the page never does).
 */
export function tableHtml(t: MdTable, inline: (s: string) => string): string {
  const al = (k: number) => (t.align[k] ? ` style="text-align:${t.align[k]}"` : "");
  const head = t.head.map((h, k) => `<th scope="col" class="whitespace-nowrap border-b border-line-strong bg-surface px-2.5 py-1.5 text-left text-[0.88em] font-semibold text-fg"${al(k)}>${inline(h)}</th>`).join("");
  const rows = t.rows
    .map(
      (r) =>
        `<tr>${r
          .map((c, k) =>
            k === 0
              ? `<th scope="row" class="min-w-[7rem] border-t border-line px-2.5 py-1.5 text-left align-top font-medium text-fg"${al(k)}>${inline(c)}</th>`
              : `<td class="min-w-[7rem] border-t border-line px-2.5 py-1.5 align-top text-fg-2"${al(k)}>${inline(c)}</td>`,
          )
          .join("")}</tr>`,
    )
    .join("");
  return `<div class="hk-md-table max-w-full overflow-x-auto overscroll-x-contain border border-line [-webkit-overflow-scrolling:touch]" role="region" aria-label="Table" tabindex="0"><table class="m-0 w-full border-collapse text-[0.9em] leading-snug"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
}

/**
 * A table as plain text for a notebook text box (drawn on the canvas in a proportional font, so aligned columns can't
 * line up): one line per row, the first cell as its name and the others as "Header: value", e.g.
 * "- Locking — Latency: High (waiters block) · Complexity: Low · Best for: Moderate traffic".
 */
export function tablePlain(t: MdTable): string {
  return t.rows
    .map((r) => {
      const name = r[0]?.trim();
      const rest = r
        .slice(1)
        .map((c, k) => [t.head[k + 1]?.trim(), c.trim()] as const)
        .filter(([, c]) => c && c !== "-" && c !== "—")
        .map(([h, c]) => (h ? `${h}: ${c}` : c))
        .join(" · ");
      return `- ${name ? (rest ? `${name} — ${rest}` : name) : rest}`;
    })
    .filter((l) => l.trim() !== "-")
    .join("\n");
}

/** Every table in a Markdown text turned into plain rows (tablePlain); everything else as it was. */
export function tablesToPlain(md: string): string {
  const parts = splitTables(md.replace(/\r\n?/g, "\n").split("\n"));
  return parts.map((p) => ("table" in p ? tablePlain(p.table) : p.lines.join("\n"))).join("\n");
}
