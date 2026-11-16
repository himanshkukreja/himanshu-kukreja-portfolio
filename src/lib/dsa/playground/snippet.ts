/**
 * A lesson's code snippet → a program that runs. Lesson snippets are mostly one function (the template in four
 * languages, `:::tabs`), so a bare function gets a small driver: the snippet, then an "example input" block that sets
 * each parameter and prints the result. The example comes from the lesson's own trace for that template when there is
 * one (generated/traces/<id>.json: `template` names the tabs id, `input` the parameters), else from plain defaults by
 * type and name. A snippet that is already a program (top-level calls, Java/C++ main) runs as it is.
 *
 * Java snippets are methods: they go inside `class Solution` with a `public class Main` that calls them. C++ snippets
 * get a main() and a small printer that shows vectors as [1, 2, 3]. Parameters of types the driver can't build
 * (ListNode, TreeNode, a lesson's own class) get no call: the program says where to add one.
 *
 * Pure (type imports only): the browser, the server and node --test load it.
 */
import type { DsaLang } from "../types";

export type Param = { name: string; type: string | null };
export type FnInfo = { name: string; params: Param[]; returns: string | null; inClass: string | null; returnsValue: boolean; /** the body, comments and strings blanked */ body: string };
/** `runnable`: running it shows something (a program that prints, or a function with its example call); a fragment of
 *  a larger piece of code (a loop body, a "bug:" line) or a definition the driver can't call is not. */
export type SnippetProgram = { code: string; wrapped: boolean; runnable: boolean; example: { name: string; value: unknown }[] | null };
export type TraceLike = { template?: string | null; input: Record<string, unknown> };

/** A fence or tab's language → DSA's language id, or null when it doesn't run (text, sql, quiz…). */
export function snippetLang(raw: string | null | undefined): DsaLang | null {
  const l = (raw || "").trim().toLowerCase();
  if (l === "python" || l === "py" || l === "python3") return "python";
  if (l === "javascript" || l === "js" || l === "node") return "javascript";
  if (l === "java") return "java";
  if (l === "cpp" || l === "c++" || l === "cc") return "cpp";
  return null;
}

/* ------------------------------------------------------------------ small parsing helpers */

/** Split on commas that are not inside (), [], {} or <>. */
function splitTop(s: string, angle = false): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  let q: string | null = null;
  for (const ch of s) {
    if (q) {
      cur += ch;
      if (ch === q) q = null;
      continue;
    }
    if (ch === '"' || ch === "'") q = ch;
    if ("([{".includes(ch) || (angle && ch === "<")) depth++;
    if (")]}".includes(ch) || (angle && ch === ">")) depth--;
    if (ch === "," && depth === 0) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}

/** Text from `open` (an index just after "(") to its matching ")". */
function untilClose(s: string, open: number): string | null {
  let depth = 1;
  for (let i = open; i < s.length; i++) {
    if (s[i] === "(") depth++;
    else if (s[i] === ")" && --depth === 0) return s.slice(open, i);
  }
  return null;
}

const norm = (n: string) => n.toLowerCase().replace(/_/g, "");

/** Code with comments and string contents blanked (same length), so brace and keyword scans don't trip on them. */
function blank(code: string, lang: DsaLang): string {
  let out = "";
  let i = 0;
  const hash = lang === "python";
  while (i < code.length) {
    const c = code[i];
    const two = code.slice(i, i + 2);
    if (hash && c === "#") {
      while (i < code.length && code[i] !== "\n") (out += " "), i++;
    } else if (!hash && two === "//") {
      while (i < code.length && code[i] !== "\n") (out += " "), i++;
    } else if (!hash && two === "/*") {
      while (i < code.length && code.slice(i, i + 2) !== "*/") (out += code[i] === "\n" ? "\n" : " "), i++;
      out += "  ";
      i += 2;
    } else if (hash && (code.startsWith('"""', i) || code.startsWith("'''", i))) {
      const q = code.slice(i, i + 3);
      out += q;
      i += 3;
      while (i < code.length && !code.startsWith(q, i)) (out += code[i] === "\n" ? "\n" : " "), i++;
      out += code.slice(i, i + 3);
      i += 3;
    } else if (c === '"' || c === "'" || (c === "`" && !hash)) {
      out += c;
      i++;
      while (i < code.length && code[i] !== c && !(code[i] === "\n" && c !== "`")) {
        if (code[i] === "\\") (out += " "), i++;
        out += code[i] === "\n" ? "\n" : " ";
        i++;
      }
      if (i < code.length) (out += code[i]), i++;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

/** Lines at brace depth 0 (C-like languages), with their text from the blanked code. */
function topLevelLines(b: string): string[] {
  const out: string[] = [];
  let depth = 0;
  for (const line of b.split("\n")) {
    if (depth === 0) out.push(line);
    for (const ch of line) {
      if (ch === "{") depth++;
      else if (ch === "}") depth = Math.max(0, depth - 1);
    }
  }
  return out;
}

/* ------------------------------------------------------------------ is it already a program? */

export function isFullProgram(lang: DsaLang, code: string): boolean {
  const b = blank(code, lang);
  if (lang === "java") return /\bstatic\s+void\s+main\s*\(/.test(b);
  if (lang === "cpp") return /\bint\s+main\s*\(/.test(b);
  if (lang === "python") {
    let depth = 0;
    for (const line of b.split("\n")) {
      const t = line.trim();
      const top = depth === 0 && /^\S/.test(line);
      for (const ch of line) {
        if ("([{".includes(ch)) depth++;
        else if (")]}".includes(ch)) depth = Math.max(0, depth - 1);
      }
      if (!top || !t) continue;
      if (/^(async\s+def|def|class|import|from|@|"""|'''|[)\]}])/.test(t)) continue;
      const assign = /^[A-Za-z_][\w.]*(\s*,\s*[A-Za-z_][\w.]*)*\s*(:[^=]+)?=(?!=)\s*(.*)$/.exec(t);
      if (assign && !/[A-Za-z_]\w*\s*\(/.test(assign[3] || "")) continue; // a constant (MOD = 10**9 + 7)
      return true;
    }
    return false;
  }
  // JavaScript: a top-level statement that isn't a declaration of a function, class or constant
  for (const line of topLevelLines(b)) {
    const t = line.trim();
    if (!t || /^[}\])]/.test(t)) continue;
    if (/^(export\s+)?(default\s+)?(async\s+)?function\b|^(export\s+)?class\b|^["']use strict["']/.test(t)) continue;
    const decl = /^(?:const|let|var)\s+[\w${}[\],\s]+=\s*(.*)$/.exec(t);
    if (decl) {
      const rhs = decl[1];
      if (/^(async\s*)?(function\b|\([^)]*\)\s*=>|[\w$]+\s*=>)/.test(rhs)) continue;
      if (!/[\w$\])]\s*\(/.test(rhs) || /^new\s+(Map|Set|Array|Object)\s*\(\s*\)/.test(rhs)) continue;
      return true;
    }
    if (/^(?:const|let|var)\s+[\w$]+\s*;?$/.test(t)) continue;
    return true;
  }
  return false;
}

/* ------------------------------------------------------------------ the function a snippet defines */

function pickMain(cands: FnInfo[], code: string): FnInfo | null {
  if (!cands.length) return null;
  // the entry point is the function no other part of the snippet calls (helpers are called); the last such one
  const unused = cands.filter((f) => (code.match(new RegExp(`\\b${f.name}\\s*\\(`, "g")) || []).length <= 1);
  return (unused.length ? unused[unused.length - 1] : cands[cands.length - 1]) || null;
}

function bodyAfter(b: string, from: number): string {
  const start = b.indexOf("{", from);
  if (start < 0) return "";
  let depth = 0;
  for (let i = start; i < b.length; i++) {
    if (b[i] === "{") depth++;
    else if (b[i] === "}" && --depth === 0) return b.slice(start + 1, i);
  }
  return b.slice(start + 1);
}

function pyParams(raw: string): Param[] | null {
  const out: Param[] = [];
  for (const p of splitTop(raw)) {
    if (p === "self" || p === "cls" || p === "*" || p === "/") continue;
    if (p.startsWith("*") || p.includes("=")) continue; // *args, **kwargs and optional parameters
    const m = /^([A-Za-z_]\w*)\s*(?::\s*(.+))?$/.exec(p);
    if (!m) return null;
    out.push({ name: m[1], type: m[2]?.trim() || null });
  }
  return out;
}

function findPython(code: string): FnInfo | null {
  const b = blank(code, "python");
  const cands: FnInfo[] = [];
  const re = /^([ \t]*)(?:async\s+)?def\s+([A-Za-z_]\w*)\s*\(/gm;
  let m: RegExpExecArray | null;
  const classAt = [...b.matchAll(/^class\s+([A-Za-z_]\w*)/gm)].map((c) => ({ name: c[1], at: c.index ?? 0 }));
  while ((m = re.exec(b))) {
    const indent = m[1].length;
    const raw = untilClose(b, m.index + m[0].length);
    if (raw === null) continue;
    const after = b.slice(m.index + m[0].length + raw.length + 1);
    const ret = /^\s*->\s*([^:]+):/.exec(after)?.[1]?.trim() ?? null;
    const params = pyParams(code.slice(m.index + m[0].length, m.index + m[0].length + raw.length));
    if (!params) continue;
    // the body: the following lines indented deeper than the def
    const lines = b.slice(m.index).split("\n").slice(1);
    const body: string[] = [];
    for (const l of lines) {
      if (l.trim() && l.length - l.trimStart().length <= indent) break;
      body.push(l);
    }
    const at = m.index;
    const owner = indent > 0 ? [...classAt].reverse().find((c) => c.at < at) : undefined;
    // inside a class only public methods on self can be called from outside (no nested or static helpers)
    if (indent > 0 && (!owner || splitTop(raw)[0] !== "self" || m[2].startsWith("_"))) continue;
    cands.push({ name: m[2], params, returns: ret, inClass: owner?.name ?? null, returnsValue: /\breturn\s+[^\s#]/.test(body.join("\n")) || /\byield\b/.test(body.join("\n")), body: body.join("\n") });
  }
  const top = cands.filter((c) => !c.inClass);
  return pickMain(top.length ? top : cands, b);
}

function findJs(code: string): FnInfo | null {
  const b = blank(code, "javascript");
  const cands: FnInfo[] = [];
  const re = /^(?:export\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)\s*\(|^(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?(?:function\b[^(]*)?\(/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(b))) {
    const raw = untilClose(b, m.index + m[0].length);
    if (raw === null) continue;
    const src = code.slice(m.index + m[0].length, m.index + m[0].length + raw.length);
    const params: Param[] = [];
    let ok = true;
    for (const p of splitTop(src)) {
      if (p.includes("=")) continue;
      if (!/^[A-Za-z_$][\w$]*$/.test(p)) {
        ok = false;
        break;
      }
      params.push({ name: p, type: null });
    }
    if (!ok) continue;
    const body = bodyAfter(b, m.index + m[0].length + raw.length);
    const arrowExpr = !!m[2] && /^\s*=>\s*[^{\s]/.test(b.slice(m.index + m[0].length + raw.length + 1));
    cands.push({ name: m[1] || m[2], params, returns: null, inClass: null, returnsValue: arrowExpr || /\breturn\s+[^\s;]/.test(body), body });
  }
  return pickMain(cands, b);
}

const C_KEYWORDS = new Set(["if", "for", "while", "switch", "catch", "return", "else", "new", "sizeof", "do", "case", "delete", "throw", "using", "namespace", "template", "typedef", "operator"]);
const JAVA_MODS = /\b(public|private|protected|static|final|synchronized|abstract|native|default)\b/g;

function cParams(raw: string, lang: "java" | "cpp"): Param[] | null {
  const out: Param[] = [];
  for (let p of splitTop(raw, true)) {
    p = p.replace(/\b(final|const)\s+/g, "").replace(/@\w+\s*/g, "").trim();
    if (p.includes("=")) return null;
    const m = /^(.*?)([A-Za-z_]\w*)\s*(\[\s*\])*$/.exec(p);
    if (!m) return null;
    let type = m[1].replace(/\s+/g, " ").trim();
    if (m[3]) type += "[]";
    if (lang === "java" && type.endsWith("...")) type = type.slice(0, -3) + "[]";
    if (!type) return null;
    out.push({ name: m[2], type });
  }
  return out;
}

function findC(code: string, lang: "java" | "cpp"): FnInfo | null {
  const b = blank(code, lang);
  const cands: FnInfo[] = [];
  const re = /(^|[;{}\n])\s*((?:template\s*<[^>]*>\s*)?[A-Za-z_][\w:<>,.\[\]\s*&?]*?)\s*\b([A-Za-z_]\w*)\s*\(/g;
  let m: RegExpExecArray | null;
  const classes = [...b.matchAll(/\b(?:class|struct)\s+([A-Za-z_]\w*)[^;{]*\{/g)].map((c) => ({ name: c[1], at: c.index ?? 0, end: (c.index ?? 0) + c[0].length + bodyAfter(b, c.index ?? 0).length }));
  while ((m = re.exec(b))) {
    const name = m[3];
    const type = m[2].replace(JAVA_MODS, " ").replace(/\b(inline|virtual|constexpr|explicit|friend)\b/g, " ").replace(/\s+/g, " ").trim();
    if (!type || C_KEYWORDS.has(name) || C_KEYWORDS.has(type.split(" ").pop() || "")) continue;
    if (/^(return|else|new|throw|case)\b/.test(type) || /[=+\-/%!|]/.test(type)) continue;
    const open = m.index + m[0].length;
    const raw = untilClose(b, open);
    if (raw === null) continue;
    const after = b.slice(open + raw.length + 1);
    if (!/^\s*(const\s*)?(noexcept\s*)?(throws\s+[\w.,\s]+)?\{/.test(after)) continue; // a declaration or a call, not a definition
    const params = cParams(code.slice(open, open + raw.length), lang);
    if (!params) continue;
    const owner = classes.find((c) => c.at < m!.index && m!.index < c.end);
    if (owner && owner.name === name) continue; // a constructor
    const body = bodyAfter(b, open + raw.length);
    cands.push({ name, params, returns: type.replace(/^template\s*<[^>]*>\s*/, ""), inClass: owner?.name ?? null, returnsValue: type !== "void", body });
    re.lastIndex = open + raw.length + 1 + (after.indexOf("{") >= 0 ? after.indexOf("{") : 0) + body.length;
  }
  const top = lang === "java" ? cands : cands.filter((c) => !c.inClass);
  return pickMain(top.length ? top : cands, b);
}

export function findFunction(lang: DsaLang, code: string): FnInfo | null {
  if (lang === "python") return findPython(code);
  if (lang === "javascript") return findJs(code);
  return findC(code, lang);
}

/* ------------------------------------------------------------------ types and example values */

type T = { k: "int" | "long" | "double" | "bool" | "string" | "char" | "array" | "unknown"; of?: T };

/** A parameter's declared type → a small type model (Java, C++, Python hints). */
export function typeModel(lang: DsaLang, raw: string | null): T | null {
  if (!raw) return null;
  const s = raw.replace(/\s+/g, " ").replace(/&/g, "").replace(/\bstd::/g, "").trim();
  const arr = /^(.*)\[\]$/.exec(s);
  if (arr) return { k: "array", of: typeModel(lang, arr[1]) ?? { k: "unknown" } };
  const gen = /^(?:vector|List|ArrayList|LinkedList|list|List|Sequence|Iterable|deque|Deque)\s*[<[]\s*(.*)\s*[>\]]$/.exec(s);
  if (gen) return { k: "array", of: typeModel(lang, gen[1]) ?? { k: "unknown" } };
  if (lang === "python" && /^(list|tuple)$/.test(s)) return { k: "array", of: { k: "unknown" } };
  if (/^(int|short|Integer|int32_t|unsigned|unsigned int)$/.test(s)) return { k: "int" };
  if (/^(long|Long|long long|long long int|int64_t|size_t|unsigned long long)$/.test(s)) return { k: "long" };
  if (/^(double|float|Double|Float|long double)$/.test(s)) return { k: "double" };
  if (/^(boolean|Boolean|bool)$/.test(s)) return { k: "bool" };
  if (/^(String|string|str|CharSequence)$/.test(s)) return { k: "string" };
  if (/^(char|Character)$/.test(s)) return { k: "char" };
  return { k: "unknown" };
}

/**
 * Python and JavaScript parameters have no types: guess one from how the body uses the name. `unknown` means an object
 * the driver can't build (a node with .next / .left, a lesson's own class): no example call then. null: no evidence.
 */
const STRING_NAMES = /^(s|t|str|text|word|string|pattern|line|sentence|name|key|code)$/;
const PAIR_NAMES = /^(edges|links|pairs|intervals|queries|shifts|connections|meetings|ranges|bookings|updates|roads|flights|prerequisites)$/;

export function inferUntyped(name: string, body: string): T | null {
  const n = name.replace(/\$/g, "\\$");
  const has = (re: string) => new RegExp(re.replace(/@/g, n)).test(body);
  const low = name.toLowerCase();
  if (/^(root|node|head|tail|tree|l1|l2|list1|list2|graph|adj)$/.test(low)) return { k: "unknown" };
  if (STRING_NAMES.test(low)) return { k: "string" };
  if (PAIR_NAMES.test(low) || has("\\bfor\\s+\\(?\\s*\\w+\\s*,\\s*\\w+\\s*\\)?\\s+in\\s+@\\b|\\bfor\\s*\\(\\s*(const|let|var)\\s*\\[[^\\]]*\\]\\s+of\\s+@\\b")) return { k: "array", of: { k: "array", of: { k: "int" } } };
  if (has("\\b@\\.(next|left|right|val|value|children|key|parent|neighbors|prev)\\b")) return { k: "unknown" };
  if (has("\\b@\\s*\\[[^\\]]*\\]\\s*\\[")) return { k: "array", of: { k: "array", of: { k: "int" } } };
  if (has("\\b@\\.(lower|upper|split|strip|startswith|endswith|isdigit|isalpha|toLowerCase|toUpperCase|charAt|charCodeAt|substring|trim|startsWith|endsWith)\\s*\\(")) return { k: "string" };
  if (has("\\b@\\.(items|keys|values|get)\\s*\\(") && !has("\\b@\\.(push|append|length)\\b")) return { k: "unknown" };
  if (has("\\blen\\(\\s*@\\s*\\)|\\b@\\s*\\[|\\bin\\s+@\\b|\\bof\\s+@\\b|\\b@\\.(append|pop|sort|push|length|map|filter|slice|forEach|reduce|indexOf|includes)\\b|\\bsorted\\(\\s*@\\b|\\b(sum|min|max|enumerate|reversed|set|list)\\(\\s*@\\b")) return { k: "array", of: { k: "int" } };
  if (has("\\brange\\(\\s*@\\b|\\b@\\s*[-+*/%<>]=?\\s*\\d|\\b\\d+\\s*[-+*/%<>]=?\\s*@\\b|[<>]=?\\s*@\\b")) return { k: "int" };
  return null;
}

const typeKnown = (t: T | null): boolean => !!t && t.k !== "unknown" && (t.k !== "array" || typeKnown(t.of ?? null));

/** A plain default for a parameter, by its type (typed languages) or its name (Python, JavaScript). */
export function defaultValue(p: Param, t: T | null): unknown {
  if (t && t.k !== "unknown") {
    if (t.k === "int" || t.k === "long") return 3;
    if (t.k === "double") return 1.5;
    if (t.k === "bool") return true;
    if (t.k === "string") return "banana";
    if (t.k === "char") return "a";
    if (t.k === "array") {
      const o = t.of;
      if (o?.k === "array") return /^(grid|matrix|board|mat|points)$/.test(p.name.toLowerCase()) ? [[1, 2], [3, 4]] : [[0, 1], [1, 2]];
      if (o?.k === "string") return ["apple", "bat", "cat"];
      if (o?.k === "char") return ["a", "b", "c"];
      if (o?.k === "bool") return [true, false, true];
      if (o?.k === "double") return [1.5, 2.5, 3.5];
      return [2, 1, 3, 1, 4];
    }
  }
  const n = p.name.toLowerCase();
  if (PAIR_NAMES.test(n)) return [[0, 1], [1, 2]];
  if (/^(grid|matrix|board|mat|points)$/.test(n)) return [[1, 2], [3, 4]];
  if (/^(words|strs|strings|names|tokens)$/.test(n)) return ["apple", "bat", "cat"];
  if (STRING_NAMES.test(n)) return "banana";
  if (/^(nums|arr|a|xs|values|vals|list|data|items|array|amounts|prices|heights|scores|numbers|costs|weights|temps|temperatures)$/.test(n) || (n.length > 3 && n.endsWith("s"))) return [2, 1, 3, 1, 4];
  return 3;
}

/** The lesson's example for this function: its trace for the same template, else any trace naming every parameter. */
export function exampleFromTraces(fn: FnInfo, traces: TraceLike[], templateId?: string | null): Record<string, unknown> | null {
  if (!fn.params.length) return null;
  const fits = (t: TraceLike) => {
    const keys = new Map(Object.keys(t.input || {}).map((k) => [norm(k), k]));
    if (!fn.params.every((p) => keys.has(norm(p.name)))) return null;
    return Object.fromEntries(fn.params.map((p) => [p.name, t.input[keys.get(norm(p.name)) as string]]));
  };
  const ordered = [...traces.filter((t) => templateId && t.template === templateId), ...traces.filter((t) => !templateId || t.template !== templateId)];
  for (const t of ordered) {
    const v = fits(t);
    if (v) return v;
  }
  return null;
}

/* ------------------------------------------------------------------ literals */

const pyLit = (v: unknown): string => {
  if (v === null || v === undefined) return "None";
  if (v === true) return "True";
  if (v === false) return "False";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : v > 0 ? 'float("inf")' : v < 0 ? '-float("inf")' : 'float("nan")';
  if (typeof v === "string") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(pyLit).join(", ")}]`;
  if (typeof v === "object") return `{${Object.entries(v as Record<string, unknown>).map(([k, x]) => `${JSON.stringify(k)}: ${pyLit(x)}`).join(", ")}}`;
  return String(v);
};
const jsLit = (v: unknown): string => {
  if (Array.isArray(v)) return `[${v.map(jsLit).join(", ")}]`;
  if (typeof v === "number" && !Number.isFinite(v)) return v > 0 ? "Infinity" : v < 0 ? "-Infinity" : "NaN";
  if (v && typeof v === "object") return `{ ${Object.entries(v as Record<string, unknown>).map(([k, x]) => `${/^[A-Za-z_$][\w$]*$/.test(k) ? k : JSON.stringify(k)}: ${jsLit(x)}`).join(", ")} }`;
  return v === undefined ? "undefined" : JSON.stringify(v);
};
const charLit = (v: unknown) => `'${String(v ?? " ").charAt(0).replace(/\\/g, "\\\\").replace(/'/g, "\\'") || " "}'`;

function scalarLit(v: unknown, t: T, lang: "java" | "cpp"): string | null {
  if (t.k === "int") return typeof v === "number" && Number.isInteger(v) ? String(v) : null;
  if (t.k === "long") return typeof v === "number" && Number.isInteger(v) ? `${v}${lang === "java" ? "L" : "LL"}` : null;
  if (t.k === "double") return typeof v === "number" ? (Number.isInteger(v) ? `${v}.0` : String(v)) : null;
  if (t.k === "bool") return typeof v === "boolean" ? String(v) : null;
  if (t.k === "string") return typeof v === "string" ? JSON.stringify(v) : null;
  if (t.k === "char") return typeof v === "string" ? charLit(v) : null;
  return null;
}

/** An initializer for a Java/C++ declaration: `{1, 2}` for arrays and vectors, List.of(...) for Java lists. */
function cInit(v: unknown, t: T, lang: "java" | "cpp", javaList: boolean): string | null {
  if (t.k === "array") {
    if (!Array.isArray(v) || !t.of) return null;
    const items = v.map((x) => cInit(x, t.of as T, lang, javaList));
    if (items.some((x) => x === null)) return null;
    if (lang === "java" && javaList) return `new ArrayList<>(List.of(${items.join(", ")}))`;
    return `{${items.join(", ")}}`;
  }
  return scalarLit(v, t, lang);
}

/* ------------------------------------------------------------------ the driver */

/** a program that shows something when it runs */
const PRINTS: Record<DsaLang, RegExp> = {
  python: /\bprint\s*\(|\bsys\.stdout\b/,
  javascript: /\bconsole\.(log|info|table)\s*\(|\bprocess\.stdout\b/,
  java: /\bSystem\.out\b/,
  cpp: /\bcout\b|\bprintf\s*\(|\bputs\s*\(/,
};

const EXAMPLE_NOTE: Record<DsaLang, string> = {
  python: "# Example input: change it and run again",
  javascript: "// Example input: change it and run again",
  java: "        // Example input: change it and run again",
  cpp: "    // Example input: change it and run again",
};

function indent(code: string, by: string): string {
  return code
    .split("\n")
    .map((l) => (l.trim() ? by + l : l))
    .join("\n");
}

const CPP_PRINT = `// Prints a value the way the other languages do: vectors as [1, 2, 3]
template <typename T> void hkPrint(const T& x) { cout << x; }
inline void hkPrint(const string& s) { cout << s; }
inline void hkPrint(bool b) { cout << (b ? "true" : "false"); }
template <typename T> void hkPrint(const vector<T>& v) {
    cout << "[";
    for (size_t i = 0; i < v.size(); i++) {
        if (i) cout << ", ";
        hkPrint(v[i]);
    }
    cout << "]";
}`;

/**
 * The snippet as a runnable program, with the example input it was given (the lesson's, or defaults). `wrapped` is
 * false when the snippet was a program already (it runs as it is) or defines nothing callable.
 */
export function programFromSnippet(lang: DsaLang, code: string, example?: Record<string, unknown> | null): SnippetProgram {
  const src = code.replace(/\s+$/, "");
  if (isFullProgram(lang, src)) return { code: src + "\n", wrapped: false, runnable: PRINTS[lang].test(blank(src, lang)), example: null };
  const fn = findFunction(lang, src);
  const typed = lang === "java" || lang === "cpp";
  const models: (T | null)[] = fn ? fn.params.map((p) => (p.type ? typeModel(lang, p.type) : inferUntyped(p.name, fn.body))) : [];
  const given = (p: Param) => !!example && p.name in example;
  let callable = !!fn && fn.params.every((p, i) => (typed ? typeKnown(models[i]) : given(p) || !models[i] || typeKnown(models[i])));
  // a Python method: its class must be constructible with no arguments
  if (callable && fn?.inClass && lang === "python") {
    const init = new RegExp(`class\\s+${fn.inClass}\\b[\\s\\S]*?def\\s+__init__\\s*\\(([^)]*)\\)`).exec(blank(src, "python"));
    if (init && (pyParams(init[1]) ?? [null]).length) callable = false;
  }
  const values = fn ? fn.params.map((p, i) => (given(p) ? (example as Record<string, unknown>)[p.name] : defaultValue(p, models[i]))) : [];
  const ex = fn && callable ? fn.params.map((p, i) => ({ name: p.name, value: values[i] })) : null;

  if (lang === "python") {
    if (!fn) return { code: `${src}\n`, wrapped: false, runnable: false, example: null };
    if (!callable) return { code: `${src}\n\n\n# Call ${fn.name}(...) here with your own input and print the result.\n`, wrapped: true, runnable: false, example: null };
    const args = fn.params.map((p) => p.name).join(", ");
    const target = fn.inClass ? `${fn.inClass}().${fn.name}` : fn.name;
    const lines = [EXAMPLE_NOTE.python, ...fn.params.map((p, i) => `${p.name} = ${pyLit(values[i])}`)];
    if (fn.returnsValue || !fn.params.length) lines.push(`print(${target}(${args}))`);
    else lines.push(`${target}(${args})`, `print(${fn.params[0].name})`);
    return { code: `${src}\n\n\n${lines.join("\n")}\n`, wrapped: true, runnable: true, example: ex };
  }

  if (lang === "javascript") {
    if (!fn) return { code: `${src}\n`, wrapped: false, runnable: false, example: null };
    if (!callable) return { code: `${src}\n\n// Call ${fn.name}(...) here with your own input and print the result.\n`, wrapped: true, runnable: false, example: null };
    const args = fn.params.map((p) => p.name).join(", ");
    const lines = [EXAMPLE_NOTE.javascript, ...fn.params.map((p, i) => `const ${p.name} = ${jsLit(values[i])};`)];
    if (fn.returnsValue || !fn.params.length) lines.push(`console.log(${fn.name}(${args}));`);
    else lines.push(`${fn.name}(${args});`, `console.log(${fn.params[0].name});`);
    return { code: `${src}\n\n${lines.join("\n")}\n`, wrapped: true, runnable: true, example: ex };
  }

  if (lang === "java") {
    const imports = src.split("\n").filter((l) => /^\s*import\s+[\w.*]+\s*;\s*$/.test(l));
    let body = src
      .split("\n")
      .filter((l) => !/^\s*import\s+[\w.*]+\s*;\s*$/.test(l))
      .join("\n")
      .trim();
    // one public class per file: Main is the public one
    body = body.replace(/^(\s*)public\s+(?=(?:final\s+|abstract\s+)?(?:class|interface|enum|record)\b)/gm, "$1");
    const hasClass = /^\s*(?:final\s+|abstract\s+|static\s+)*(?:class|interface|enum|record)\s+\w+/m.test(blank(body, "java"));
    const owner = fn?.inClass ?? (hasClass ? null : "Solution");
    const classPart = hasClass ? body : `class Solution {\n${indent(body, "    ")}\n}`;
    const head = ["import java.util.*;", ...imports.filter((l) => l.trim() !== "import java.util.*;").map((l) => l.trim())].join("\n");
    const mainLines: string[] = [];
    if (fn && owner && callable) {
      mainLines.push(EXAMPLE_NOTE.java);
      fn.params.forEach((p, i) => {
        const t = models[i] as T;
        const javaList = /\b(List|ArrayList|LinkedList)\b/.test(p.type || "");
        const init = cInit(values[i], t, "java", javaList);
        mainLines.push(`        ${(p.type || "var").replace(/\s+/g, " ")} ${p.name} = ${init};`);
      });
      const call = `new ${owner}().${fn.name}(${fn.params.map((p) => p.name).join(", ")})`;
      const ret = typeModel("java", fn.returns);
      const show = (expr: string, t: T | null, raw: string | null) =>
        t?.k === "array" && !/\b(List|ArrayList|LinkedList)\b/.test(raw || "") ? (t.of?.k === "array" ? `Arrays.deepToString(${expr})` : `Arrays.toString(${expr})`) : expr;
      if (fn.returnsValue) mainLines.push(`        System.out.println(${show(call, ret, fn.returns)});`);
      else if (fn.params.length) mainLines.push(`        ${call};`, `        System.out.println(${show(fn.params[0].name, models[0], fn.params[0].type)});`);
      else mainLines.push(`        ${call};`);
    } else {
      mainLines.push(fn ? `        // Call ${fn.name}(...) here with your own input, then print the result.` : "        // Try the code above here: create values, call it and print the results.");
    }
    return {
      code: `${head}\n\n${classPart}\n\npublic class Main {\n    public static void main(String[] mainArgs) {\n${mainLines.join("\n")}\n    }\n}\n`,
      wrapped: true,
      runnable: !!(fn && owner && callable),
      example: fn && owner && callable ? ex : null,
    };
  }

  // C++
  const hasInclude = /^\s*#include\b/m.test(src);
  const head = hasInclude && /bits\/stdc\+\+\.h/.test(src) && /using\s+namespace\s+std\s*;/.test(src) ? "" : "#include <bits/stdc++.h>\nusing namespace std;\n\n";
  const mainLines: string[] = [];
  if (fn && callable) {
    mainLines.push(EXAMPLE_NOTE.cpp);
    fn.params.forEach((p, i) => {
      const t = models[i] as T;
      const decl = (p.type || "auto").replace(/\bconst\b/g, "").replace(/&/g, "").replace(/\s+/g, " ").trim();
      mainLines.push(`    ${decl} ${p.name} = ${cInit(values[i], t, "cpp", false)};`);
    });
    const call = `${fn.inClass ? `${fn.inClass}().` : ""}${fn.name}(${fn.params.map((p) => p.name).join(", ")})`;
    if (fn.returnsValue) mainLines.push(`    hkPrint(${call});`, '    cout << "\\n";');
    else if (fn.params.length) mainLines.push(`    ${call};`, `    hkPrint(${fn.params[0].name});`, '    cout << "\\n";');
    else mainLines.push(`    ${call};`);
  } else {
    mainLines.push(fn ? `    // Call ${fn.name}(...) here with your own input, then print the result.` : "    // Try the code above here: create values, call it and print the results.");
  }
  return {
    code: `${head}${src}\n\n${fn && callable ? CPP_PRINT + "\n\n" : ""}int main() {\n${mainLines.join("\n")}\n    return 0;\n}\n`,
    wrapped: true,
    runnable: !!(fn && callable),
    example: fn && callable ? ex : null,
  };
}

/** "amounts = [3, -3], target = 0" for the line under a snippet's output. */
export function exampleLabel(ex: { name: string; value: unknown }[] | null): string {
  if (!ex || !ex.length) return "";
  const show = (v: unknown): string => (Array.isArray(v) ? `[${v.map(show).join(", ")}]` : typeof v === "string" ? JSON.stringify(v) : String(v));
  return ex.map((e) => `${e.name} = ${show(e.value)}`).join(", ");
}
