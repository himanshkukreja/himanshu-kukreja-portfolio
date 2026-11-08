/**
 * A small C-family stream mode for the code editor (Java and C++ in DSA Mastery's problem room): keywords, types,
 * strings, chars, numbers, comments and preprocessor lines, highlighted through the editor's own tag styles. Used
 * instead of @codemirror/lang-java and lang-cpp, which would add two grammars (and the C++ one is ~0.4 MB) for what is
 * only highlighting; nothing here parses.
 */
import { StreamLanguage, type StreamParser } from "@codemirror/language";

const words = (s: string) => new Set(s.split(" "));

const COMMON_KW = "if else for while do switch case default break continue return new delete try catch throw class struct this public private protected static const final void";
const JAVA = { kw: words(`${COMMON_KW} import package extends implements interface enum abstract synchronized throws instanceof super var record`), types: words("int long double float boolean char byte short String Integer Long Double Boolean Character List ArrayList Map HashMap Set HashSet Deque ArrayDeque Queue PriorityQueue Arrays Collections Math StringBuilder Object") };
const CPP = { kw: words(`${COMMON_KW} using namespace template typename auto inline virtual operator nullptr sizeof constexpr noexcept friend union enum`), types: words("int long double float bool char short unsigned signed size_t string vector map unordered_map set unordered_set deque queue stack priority_queue pair array std") };

type St = { block: boolean };

function parser(lang: typeof JAVA): StreamParser<St> {
  return {
    name: "clike",
    startState: () => ({ block: false }),
    token(stream, st) {
      if (st.block) {
        if (stream.skipTo("*/")) {
          stream.next();
          stream.next();
          st.block = false;
        } else stream.skipToEnd();
        return "comment";
      }
      if (stream.eatSpace()) return null;
      if (stream.match("//")) {
        stream.skipToEnd();
        return "comment";
      }
      if (stream.match("/*")) {
        st.block = true;
        return "comment";
      }
      if (stream.sol() && stream.match(/^\s*#\w+/)) {
        stream.skipToEnd();
        return "meta";
      }
      const ch = stream.peek();
      if (ch === '"' || ch === "'") {
        stream.next();
        let esc = false;
        let c: string | void;
        while ((c = stream.next()) != null) {
          if (c === ch && !esc) break;
          esc = !esc && c === "\\";
        }
        return "string";
      }
      if (stream.match(/^(?:0x[\da-f]+|\d+(?:\.\d*)?(?:e[+-]?\d+)?)[lfLF]?/i)) return "number";
      if (stream.match(/^[A-Za-z_]\w*/)) {
        const w = stream.current();
        if (w === "true" || w === "false" || w === "null" || w === "nullptr") return "atom";
        if (lang.kw.has(w)) return "keyword";
        if (lang.types.has(w)) return "typeName";
        if (stream.match(/^\s*\(/, false)) return "variableName.function";
        return "variableName";
      }
      stream.next();
      return /[+\-*/%=<>!&|^~?:]/.test(ch || "") ? "operator" : "punctuation";
    },
    languageData: { commentTokens: { line: "//", block: { open: "/*", close: "*/" } } },
  };
}

export const javaLanguage = () => StreamLanguage.define(parser(JAVA));
export const cppLanguage = () => StreamLanguage.define(parser(CPP));
