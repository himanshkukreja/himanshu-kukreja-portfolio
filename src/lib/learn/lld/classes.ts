/**
 * The class explorer's data: the lesson's ```mermaid classDiagram → classes, members and links, and
 * each class's source pulled out of the lesson's Python (so "click a class, see its code" needs no
 * extra writing). Pure; best effort by design: a class with no matching code is shown without it.
 */

export type DiagramClass = {
  name: string;
  /** "interface" / "enumeration" / "abstract" when the diagram says so */
  stereotype: string | null;
  members: string[];
  /** other classes this one points at or is made of: "uses", "has many", "is a" … */
  links: { to: string; how: string }[];
};

const ARROWS: [string, (a: string, b: string) => { from: string; to: string; how: string }][] = [
  ["<|--", (a, b) => ({ from: b, to: a, how: "is a" })],
  ["--|>", (a, b) => ({ from: a, to: b, how: "is a" })],
  ["<|..", (a, b) => ({ from: b, to: a, how: "implements" })],
  ["..|>", (a, b) => ({ from: a, to: b, how: "implements" })],
  ["*--", (a, b) => ({ from: a, to: b, how: "owns" })],
  ["--*", (a, b) => ({ from: b, to: a, how: "owns" })],
  ["o--", (a, b) => ({ from: a, to: b, how: "holds" })],
  ["--o", (a, b) => ({ from: b, to: a, how: "holds" })],
  ["-->", (a, b) => ({ from: a, to: b, how: "uses" })],
  ["<--", (a, b) => ({ from: b, to: a, how: "uses" })],
  ["..>", (a, b) => ({ from: a, to: b, how: "depends on" })],
  ["<..", (a, b) => ({ from: b, to: a, how: "depends on" })],
  ["..", (a, b) => ({ from: a, to: b, how: "relates to" })],
  ["--", (a, b) => ({ from: a, to: b, how: "relates to" })],
];

const NAME = "[A-Za-z_][A-Za-z0-9_]*";
const REL = new RegExp(`^\\s*(${NAME})\\s*(?:"[^"]*"\\s*)?(<\\|--|--\\|>|<\\|\\.\\.|\\.\\.\\|>|\\*--|--\\*|o--|--o|-->|<--|\\.\\.>|<\\.\\.|--|\\.\\.)\\s*(?:"[^"]*"\\s*)?(${NAME})\\s*(?::.*)?$`);

/** Parses a mermaid classDiagram. Returns [] for anything else. */
export function parseClassDiagram(src: string): DiagramClass[] {
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  const at = lines.findIndex((l) => l.trim() && !l.trim().startsWith("%%"));
  if (at < 0 || !lines[at].trim().startsWith("classDiagram")) return [];
  const byName = new Map<string, DiagramClass>();
  const get = (name: string): DiagramClass => {
    let c = byName.get(name);
    if (!c) byName.set(name, (c = { name, stereotype: null, members: [], links: [] }));
    return c;
  };
  let cur: DiagramClass | null = null;
  for (const raw of lines.slice(at + 1)) {
    const line = raw.trim();
    if (!line || line.startsWith("%%")) continue;
    if (cur) {
      if (line === "}") cur = null;
      else {
        const st = /^<<\s*([A-Za-z ]+?)\s*>>$/.exec(line);
        if (st) cur.stereotype = st[1].toLowerCase();
        else cur.members.push(line);
      }
      continue;
    }
    const open = new RegExp(`^class\\s+(${NAME})(?:~[^~]*~)?\\s*(\\{)?\\s*$`).exec(line);
    if (open) {
      const c = get(open[1]);
      if (open[2]) cur = c;
      continue;
    }
    const rel = REL.exec(line);
    if (rel) {
      get(rel[1]);
      get(rel[3]);
      const arrow = ARROWS.find(([a]) => a === rel[2]);
      if (arrow) {
        const { from, to, how } = arrow[1](rel[1], rel[3]);
        const f = get(from);
        if (!f.links.some((l) => l.to === to && l.how === how)) f.links.push({ to, how });
      }
    }
  }
  return [...byName.values()];
}

/** Classes that are data/behaviour holders vs. the interfaces that mark "this varies": for the entity list. */
export function entityKind(c: DiagramClass): "interface" | "enum" | "class" {
  const s = c.stereotype || "";
  if (/interface|abstract|protocol/.test(s)) return "interface";
  if (/enum/.test(s)) return "enum";
  return "class";
}

/**
 * The source of `class Name…` from Python text: its decorators, the class line and its indented body,
 * up to the next top-level statement. Null when the lesson has no such class.
 */
export function extractPythonClass(code: string, name: string): string | null {
  const lines = code.replace(/\r\n/g, "\n").split("\n");
  const re = new RegExp(`^class\\s+${name}\\b`);
  const start = lines.findIndex((l) => re.test(l));
  if (start < 0) return null;
  let from = start;
  while (from > 0 && /^@/.test(lines[from - 1])) from--;
  let end = start + 1;
  while (end < lines.length) {
    const l = lines[end];
    if (l.trim() && !/^\s/.test(l) && !/^[)\]}]/.test(l)) break;
    end++;
  }
  // trailing blank lines and comments that belong to the next block
  while (end > start + 1 && (!lines[end - 1].trim() || /^#/.test(lines[end - 1]))) end--;
  return lines.slice(from, end).join("\n");
}

/** Every fenced code block of a language in markdown, in order. */
export function codeBlocks(md: string, lang: string): string[] {
  const out: string[] = [];
  const re = new RegExp("^(`{3,})\\s*" + lang + "[^\\n]*\\n([\\s\\S]*?)\\n\\1\\s*$", "gm");
  for (const m of md.matchAll(re)) out.push(m[2]);
  return out;
}

/** The first ```mermaid classDiagram of a markdown file. */
export function classDiagramSource(md: string): string | null {
  for (const m of md.matchAll(/^(`{3,})\s*mermaid[^\n]*\n([\s\S]*?)\n\1\s*$/gm)) {
    if (/^\s*(?:%%[^\n]*\n\s*)*classDiagram/.test(m[2])) return m[2];
  }
  return null;
}

export type ExplorerClass = DiagramClass & { code: string | null };

/** The explorer's classes for a lesson: the diagram's classes, each with its Python when the lesson has it. */
export function explorerClasses(md: string): ExplorerClass[] {
  const src = classDiagramSource(md);
  if (!src) return [];
  const py = codeBlocks(md, "python").join("\n\n");
  return parseClassDiagram(src).map((c) => ({ ...c, code: extractPythonClass(py, c.name) }));
}
