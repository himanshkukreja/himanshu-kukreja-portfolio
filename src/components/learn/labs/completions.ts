/**
 * Basic (non-AI) code suggestions for the lab editor. Python and JS/TS already carry the libraries' own sources (names
 * in scope, keywords, builtins, snippets); this adds what they lack (the interview staples: collections, heapq, bisect,
 * the methods after a dot, a few loop snippets). Java and C++ are highlight-only stream modes with no completion data,
 * so they get the whole set here (the document's own words, keywords, types, members, snippets).
 * Never offers anything inside a string, comment or regex. Pure data and one function: it ships in the editor chunk.
 */
import { snippetCompletion, type Completion, type CompletionContext, type CompletionResult, type CompletionSource } from "@codemirror/autocomplete";
import { syntaxTree } from "@codemirror/language";

export type SuggestLang = "python" | "javascript" | "typescript" | "java" | "cpp";

const list = (s: string, type: string, extra: Partial<Completion> = {}): Completion[] => s.split(" ").map((label) => ({ label, type, ...extra }));
const snip = (label: string, template: string, detail = "snippet"): Completion => snippetCompletion(template, { label, type: "snippet", detail, boost: -2 });

/* ---------------------------------------------------------------- data */
const PY_MODULES: Record<string, Completion[]> = {
  collections: list("defaultdict Counter deque OrderedDict", "class", { detail: "collections" }),
  heapq: list("heappush heappop heapify nlargest nsmallest heappushpop", "function", { detail: "heapq" }),
  bisect: list("bisect_left bisect_right bisect insort", "function", { detail: "bisect" }),
  math: [...list("gcd sqrt ceil floor log log2 comb factorial", "function", { detail: "math" }), ...list("inf pi", "constant", { detail: "math" })],
  functools: list("lru_cache cache reduce cmp_to_key", "function", { detail: "functools" }),
};
const PY_MEMBERS = list("append pop popleft appendleft extend sort keys values items get setdefault add discard remove join split strip startswith endswith find count index lower upper", "method");
const PY_EXTRAS: Completion[] = [
  ...Object.values(PY_MODULES).flat(),
  ...list("sorted reversed zip isinstance", "function"),
  snip("for i in range", "for ${i} in range(${n}):\n\t${}", "for loop"),
  snip("for i, x in enumerate", "for ${i}, ${x} in enumerate(${items}):\n\t${}", "indexed loop"),
  snip("for x in", "for ${x} in ${items}:\n\t${}", "for-each loop"),
  snip("print main", 'if __name__ == "__main__":\n\tprint(${})', "main"),
];

const JS_MEMBERS = [...list("push pop shift unshift slice splice map filter reduce forEach sort includes indexOf join has get set add delete keys values entries split trim startsWith charCodeAt", "method"), ...list("length size", "property")];
const JS_EXTRAS: Completion[] = [snip("for let i", "for (let ${i} = 0; ${i} < ${n}; ${i}++) {\n\t${}\n}", "index loop"), snip("for const of", "for (const ${x} of ${arr}) {\n\t${}\n}", "for-each loop")];

const JAVA_KEYWORDS = list("abstract break case catch class continue default do else enum extends final finally for if implements import instanceof interface new package private protected public return static super switch this throw throws try void while var record null true false", "keyword");
const JAVA_TYPES = list("int long double boolean char String Integer Long List ArrayList Map HashMap TreeMap Set HashSet TreeSet Deque ArrayDeque Queue LinkedList PriorityQueue Stack Arrays Collections Math StringBuilder", "class");
const JAVA_MEMBERS = list("add get put getOrDefault containsKey contains remove size isEmpty poll offer peek push pop append toString length charAt substring sort fill asList max min abs", "method");
const JAVA_STATICS: Record<string, Completion[]> = {
  Integer: [...list("MAX_VALUE MIN_VALUE", "constant"), ...list("parseInt valueOf compare toString", "method")],
  Long: [...list("MAX_VALUE MIN_VALUE", "constant"), ...list("parseLong valueOf compare", "method")],
  Math: list("max min abs sqrt pow floor ceil", "method"),
  Arrays: list("sort fill asList toString copyOf copyOfRange stream equals", "method"),
  Collections: list("sort reverse max min swap emptyList unmodifiableList", "method"),
};
const JAVA_SNIPPETS: Completion[] = [
  snip("for (int i", "for (int ${i} = 0; ${i} < ${n}; ${i}++) {\n\t${}\n}", "index loop"),
  snip("for (int x :", "for (int ${x} : ${arr}) {\n\t${}\n}", "for-each loop"),
  snip("if else", "if (${cond}) {\n\t${}\n} else {\n\t\n}", "if / else"),
  snip("while", "while (${cond}) {\n\t${}\n}", "while loop"),
  snip("method", "public static ${int} ${name}(${params}) {\n\t${}\n}", "method"),
  snip("class", "class ${Name} {\n\t${}\n}", "class"),
  snip("main", "public static void main(String[] args) {\n\tSystem.out.println(${});\n}", "main"),
];

const CPP_KEYWORDS = list("break case catch class const constexpr continue default delete do else enum for if namespace new nullptr operator private protected public return sizeof static struct switch template this throw try typename using virtual void while auto true false", "keyword");
const CPP_TYPES = list("int long bool char double float string vector unordered_map unordered_set map set queue deque stack priority_queue pair size_t", "class");
const CPP_STD = [...CPP_TYPES, ...list("sort reverse max min swap lower_bound upper_bound accumulate max_element min_element fill make_pair cout cin endl", "function")];
const CPP_MEMBERS = list("push_back pop_back emplace_back size empty begin end front back insert erase find count top push pop first second substr length", "method");
const CPP_SNIPPETS: Completion[] = [
  snip("for (int i", "for (int ${i} = 0; ${i} < ${n}; ${i}++) {\n\t${}\n}", "index loop"),
  snip("for (auto& x :", "for (auto& ${x} : ${v}) {\n\t${}\n}", "for-each loop"),
  snip("if else", "if (${cond}) {\n\t${}\n} else {\n\t\n}", "if / else"),
  snip("while", "while (${cond}) {\n\t${}\n}", "while loop"),
  snip("function", "${int} ${name}(${params}) {\n\t${}\n}", "function"),
  snip("class", "class ${Name} {\npublic:\n\t${}\n};", "class"),
  snip("main", "int main() {\n\t${}\n\treturn 0;\n}", "main"),
];

type Pack = { plain: Completion[]; members: Completion[]; statics?: Record<string, Completion[]>; scope?: Completion[]; ownWords: boolean };
const PACKS: Record<SuggestLang, Pack> = {
  // the libraries' own sources cover words, keywords and builtins for these three
  python: { plain: PY_EXTRAS, members: PY_MEMBERS, statics: PY_MODULES, ownWords: false },
  javascript: { plain: JS_EXTRAS, members: JS_MEMBERS, ownWords: false },
  typescript: { plain: JS_EXTRAS, members: JS_MEMBERS, ownWords: false },
  java: { plain: [...JAVA_KEYWORDS, ...JAVA_TYPES, ...JAVA_SNIPPETS], members: JAVA_MEMBERS, statics: JAVA_STATICS, ownWords: true },
  cpp: { plain: [...CPP_KEYWORDS, ...CPP_TYPES, ...CPP_SNIPPETS], members: CPP_MEMBERS, scope: CPP_STD, ownWords: true },
};

/* ---------------------------------------------------------------- logic */
const NO_COMPLETE = /string|comment|regexp|template/i;

/** true when the cursor sits inside a string, comment or regex (by the syntax tree's node names) */
export function inQuiet(ctx: CompletionContext): boolean {
  for (let n: { name: string; parent: unknown } | null = syntaxTree(ctx.state).resolveInner(ctx.pos, -1); n; n = n.parent as typeof n) {
    if (NO_COMPLETE.test(n.name)) return true;
  }
  return false;
}

const IDENT = /[A-Za-z_$][\w$]*/g;

/** the identifiers the learner typed (code only: strings and line comments are blanked out), minus the word at the cursor */
export function documentWords(doc: string, skipFrom: number): string[] {
  const seen = new Set<string>();
  let off = 0;
  for (const line of doc.slice(0, 100_000).split("\n")) {
    const code = line.replace(/(["'`])(?:\\.|(?!\1).)*\1/g, (m) => " ".repeat(m.length)).replace(/(\/\/|#).*$/, (m) => " ".repeat(m.length));
    for (const m of code.matchAll(IDENT)) if (off + (m.index ?? 0) !== skipFrom && m[0].length > 1) seen.add(m[0]);
    off += line.length + 1;
  }
  return [...seen];
}

export function makeSource(lang: SuggestLang): CompletionSource {
  const pack = PACKS[lang];
  return (ctx: CompletionContext): CompletionResult | null => {
    const word = ctx.matchBefore(/[\w$]*/);
    if (!word || /^\d/.test(word.text)) return null;
    const from = word.from;
    const before2 = ctx.state.sliceDoc(Math.max(0, from - 2), from);
    const scope = before2 === "::";
    const dot = !scope && before2.endsWith(".") && !before2.endsWith("..");
    if (!dot && !scope && word.text.length < 2 && !ctx.explicit) return null;
    if (inQuiet(ctx)) return null;
    if (dot || scope) {
      let options = scope ? (pack.scope ?? pack.members) : pack.members;
      if (dot && pack.statics) {
        const recv = /([A-Za-z_$][\w$]*)\.$/.exec(ctx.state.sliceDoc(Math.max(0, from - 40), from));
        const own = recv && pack.statics[recv[1]];
        if (own) options = own;
      }
      return { from, options, validFor: /^[\w$]*$/ };
    }
    const options = pack.plain.slice();
    if (pack.ownWords) {
      const taken = new Set(options.map((o) => o.label));
      for (const w of documentWords(ctx.state.doc.toString(), from)) if (!taken.has(w)) options.push({ label: w, type: "variable", boost: 2 });
    }
    return { from, options, validFor: /^[\w$]*$/ };
  };
}
