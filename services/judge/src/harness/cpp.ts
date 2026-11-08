// C++ driver generator. The learner writes LeetCode-style code:
//
//   class Solution { public: long long busiestStretch(vector<int>& plays, int k) { ... } };
//
// We emit ONE translation unit: prelude (includes, node structs, JSON reader and
// writer) + `#line 1 "solution.cpp"` + learner code + driver main. The #line
// directive keeps compiler errors pointing at the learner's own line numbers.

import type { ParsedSignature, TypeNode } from "./types.ts";
import { camelCase } from "./types.ts";

export const RESULT_FILE = "__result.json";

export function cppType(t: TypeNode): string {
  switch (t.kind) {
    case "array":
      return `vector<${cppType(t.elem)}>`;
    case "node":
      return `${t.name}*`;
    case "scalar":
      switch (t.name) {
        case "int":
          return "int";
        case "long":
          return "long long";
        case "double":
          return "double";
        case "bool":
          return "bool";
        case "string":
          return "string";
        case "char":
          return "char";
      }
  }
}

const LIST_NODE = `struct ListNode {
    int val;
    ListNode *next;
    ListNode() : val(0), next(nullptr) {}
    ListNode(int x) : val(x), next(nullptr) {}
    ListNode(int x, ListNode *next) : val(x), next(next) {}
};
`;

const TREE_NODE = `struct TreeNode {
    int val;
    TreeNode *left;
    TreeNode *right;
    TreeNode() : val(0), left(nullptr), right(nullptr) {}
    TreeNode(int x) : val(x), left(nullptr), right(nullptr) {}
    TreeNode(int x, TreeNode *left, TreeNode *right) : val(x), left(left), right(right) {}
};
`;

// Inline JSON reader/writer (plan 7.1: "Java and C++ get inline JSON parsing").
const RUNTIME = String.raw`namespace judge_rt {
struct Reader {
    const std::string& s; size_t i = 0;
    explicit Reader(const std::string& src) : s(src) {}
    [[noreturn]] void fail(const char* what) {
        std::fprintf(stderr, "judge: bad test input (%s at offset %zu)\n", what, i); std::exit(97);
    }
    void ws() { while (i < s.size() && (s[i] == ' ' || s[i] == '\n' || s[i] == '\r' || s[i] == '\t')) i++; }
    char peek() { ws(); return i < s.size() ? s[i] : '\0'; }
    void expect(char c) { if (peek() != c) fail("unexpected character"); i++; }
    bool tryNull() { if (peek() == 'n' && s.compare(i, 4, "null") == 0) { i += 4; return true; } return false; }
    long long integer() {
        ws(); size_t st = i; if (i < s.size() && (s[i] == '-' || s[i] == '+')) i++;
        while (i < s.size() && std::isdigit((unsigned char)s[i])) i++;
        if (i < s.size() && (s[i] == '.' || s[i] == 'e' || s[i] == 'E')) {
            while (i < s.size() && (std::isdigit((unsigned char)s[i]) || std::strchr(".eE+-", s[i]))) i++;
            return (long long)std::strtod(s.c_str() + st, nullptr);
        }
        if (st == i) fail("expected integer");
        return std::strtoll(s.c_str() + st, nullptr, 10);
    }
    double number() {
        ws(); const char* b = s.c_str() + i; char* e = nullptr; double v = std::strtod(b, &e);
        if (e == b) fail("expected number"); i += (size_t)(e - b); return v;
    }
    bool boolean() {
        ws(); if (s.compare(i, 4, "true") == 0) { i += 4; return true; }
        if (s.compare(i, 5, "false") == 0) { i += 5; return false; } fail("expected bool");
    }
    static void utf8(std::string& o, unsigned cp) {
        if (cp < 0x80) o += (char)cp;
        else if (cp < 0x800) { o += (char)(0xC0 | (cp >> 6)); o += (char)(0x80 | (cp & 0x3F)); }
        else if (cp < 0x10000) { o += (char)(0xE0 | (cp >> 12)); o += (char)(0x80 | ((cp >> 6) & 0x3F)); o += (char)(0x80 | (cp & 0x3F)); }
        else { o += (char)(0xF0 | (cp >> 18)); o += (char)(0x80 | ((cp >> 12) & 0x3F)); o += (char)(0x80 | ((cp >> 6) & 0x3F)); o += (char)(0x80 | (cp & 0x3F)); }
    }
    unsigned hex4() {
        if (i + 4 > s.size()) fail("bad \\u escape");
        unsigned v = 0; for (int k = 0; k < 4; k++) { char c = s[i++]; v <<= 4;
            if (c >= '0' && c <= '9') v |= c - '0'; else if (c >= 'a' && c <= 'f') v |= c - 'a' + 10;
            else if (c >= 'A' && c <= 'F') v |= c - 'A' + 10; else fail("bad \\u escape"); }
        return v;
    }
    std::string str() {
        expect('"'); std::string o;
        while (true) {
            if (i >= s.size()) fail("unterminated string");
            char c = s[i++];
            if (c == '"') break;
            if (c != '\\') { o += c; continue; }
            if (i >= s.size()) fail("bad escape");
            char e = s[i++];
            switch (e) {
                case '"': o += '"'; break; case '\\': o += '\\'; break; case '/': o += '/'; break;
                case 'b': o += '\b'; break; case 'f': o += '\f'; break; case 'n': o += '\n'; break;
                case 'r': o += '\r'; break; case 't': o += '\t'; break;
                case 'u': { unsigned cp = hex4();
                    if (cp >= 0xD800 && cp < 0xDC00 && i + 1 < s.size() && s[i] == '\\' && s[i + 1] == 'u') {
                        i += 2; unsigned lo = hex4(); cp = 0x10000 + ((cp - 0xD800) << 10) + (lo - 0xDC00); }
                    utf8(o, cp); break; }
                default: fail("bad escape");
            }
        }
        return o;
    }
};

template <class T> struct Read;
template <> struct Read<int> { static int go(Reader& r) { return (int)r.integer(); } };
template <> struct Read<long long> { static long long go(Reader& r) { return r.integer(); } };
template <> struct Read<double> { static double go(Reader& r) { return r.number(); } };
template <> struct Read<bool> { static bool go(Reader& r) { return r.boolean(); } };
template <> struct Read<std::string> { static std::string go(Reader& r) { return r.str(); } };
template <> struct Read<char> { static char go(Reader& r) { std::string t = r.str(); return t.empty() ? '\0' : t[0]; } };
template <class T> struct Read<std::vector<T>> {
    static std::vector<T> go(Reader& r) {
        std::vector<T> v; if (r.tryNull()) return v;
        r.expect('['); if (r.peek() == ']') { r.i++; return v; }
        while (true) { v.push_back(Read<T>::go(r)); char c = r.peek(); r.i++; if (c == ']') break; if (c != ',') r.fail("expected , or ]"); }
        return v;
    }
};
/*__NODE_READERS__*/

inline void fmtDouble(std::string& o, double v) {
    if (std::isnan(v) || std::isinf(v)) { o += "null"; return; }
    char b[40]; std::snprintf(b, sizeof b, "%.17g", v); o += b;
}
inline void w(std::string& o, int v) { o += std::to_string(v); }
inline void w(std::string& o, long long v) { o += std::to_string(v); }
inline void w(std::string& o, double v) { fmtDouble(o, v); }
inline void w(std::string& o, bool v) { o += v ? "true" : "false"; }
inline void wstr(std::string& o, const std::string& v) {
    o += '"';
    for (unsigned char c : v) {
        switch (c) {
            case '"': o += "\\\""; break; case '\\': o += "\\\\"; break;
            case '\n': o += "\\n"; break; case '\r': o += "\\r"; break; case '\t': o += "\\t"; break;
            default: if (c < 0x20) { char b[8]; std::snprintf(b, sizeof b, "\\u%04x", c); o += b; } else o += (char)c;
        }
    }
    o += '"';
}
inline void w(std::string& o, const std::string& v) { wstr(o, v); }
inline void w(std::string& o, char v) { wstr(o, std::string(1, v)); }
/*__NODE_WRITERS__*/
template <class T> void w(std::string& o, const std::vector<T>& v) {
    o += '[';
    for (size_t k = 0; k < v.size(); k++) {
        if (k) o += ',';
        if constexpr (std::is_same_v<T, bool>) w(o, (bool)v[k]); else w(o, v[k]);
    }
    o += ']';
}
inline std::string slurp() { std::ostringstream ss; ss << std::cin.rdbuf(); return ss.str(); }
inline void emit(const std::string& o) {
    std::FILE* f = std::fopen("${RESULT_FILE}", "wb");
    if (!f) { std::fprintf(stderr, "judge: cannot write result\n"); std::exit(98); }
    std::fwrite(o.data(), 1, o.size(), f); std::fclose(f);
}
} // namespace judge_rt
`;

const LIST_READER = String.raw`template <> struct Read<ListNode*> {
    static ListNode* go(Reader& r) {
        std::vector<int> v = Read<std::vector<int>>::go(r); ListNode dummy; ListNode* t = &dummy;
        for (int x : v) { t->next = new ListNode(x); t = t->next; } return dummy.next;
    }
};
`;

const TREE_READER = String.raw`template <> struct Read<TreeNode*> {
    static TreeNode* go(Reader& r) {
        if (r.tryNull()) return nullptr;
        std::vector<std::optional<int>> v; r.expect('[');
        if (r.peek() == ']') { r.i++; return nullptr; }
        while (true) { if (r.tryNull()) v.push_back(std::nullopt); else v.push_back((int)r.integer());
            char c = r.peek(); r.i++; if (c == ']') break; if (c != ',') r.fail("expected , or ]"); }
        if (v.empty() || !v[0]) return nullptr;
        TreeNode* root = new TreeNode(*v[0]); std::deque<TreeNode*> q{root}; size_t k = 1;
        while (!q.empty() && k < v.size()) {
            TreeNode* n = q.front(); q.pop_front();
            if (k < v.size()) { if (v[k]) { n->left = new TreeNode(*v[k]); q.push_back(n->left); } k++; }
            if (k < v.size()) { if (v[k]) { n->right = new TreeNode(*v[k]); q.push_back(n->right); } k++; }
        }
        return root;
    }
};
`;

const LIST_WRITER = String.raw`inline void w(std::string& o, ListNode* n) {
    o += '['; bool first = true; size_t guard = 0;
    while (n && guard++ < 10000000) { if (!first) o += ','; first = false; o += std::to_string(n->val); n = n->next; }
    o += ']';
}
`;

const TREE_WRITER = String.raw`inline void w(std::string& o, TreeNode* root) {
    std::vector<TreeNode*> order; std::deque<TreeNode*> q; if (root) q.push_back(root);
    while (!q.empty() && order.size() < 20000000) { TreeNode* n = q.front(); q.pop_front(); order.push_back(n);
        if (n) { q.push_back(n->left); q.push_back(n->right); } }
    while (!order.empty() && !order.back()) order.pop_back();
    o += '['; for (size_t k = 0; k < order.size(); k++) { if (k) o += ','; if (order[k]) o += std::to_string(order[k]->val); else o += "null"; } o += ']';
}
`;

export interface GeneratedSource {
  files: Record<string, string>;
}

export function generateCpp(sig: ParsedSignature, learnerCode: string): GeneratedSource {
  let runtime = RUNTIME;
  runtime = runtime.replace(
    "/*__NODE_READERS__*/",
    (sig.usesListNode ? LIST_READER : "") + (sig.usesTreeNode ? TREE_READER : ""),
  );
  runtime = runtime.replace(
    "/*__NODE_WRITERS__*/",
    (sig.usesListNode ? LIST_WRITER : "") + (sig.usesTreeNode ? TREE_WRITER : ""),
  );

  const reads = sig.params
    .map((p, i) => {
      const sep = i < sig.params.length - 1 ? `    if (r_.peek() != ',') r_.fail("expected ,"); r_.i++;\n` : "";
      return `    ${cppType(p.type)} a${i} = judge_rt::Read<${cppType(p.type)}>::go(r_);\n${sep}`;
    })
    .join("");
  const args = sig.params.map((_, i) => `a${i}`).join(", ");
  const method = camelCase(sig.fn);
  const ret = cppType(sig.returns);

  const source =
    `#include <bits/stdc++.h>\n` +
    `using namespace std;\n` +
    (sig.usesListNode ? LIST_NODE : "") +
    (sig.usesTreeNode ? TREE_NODE : "") +
    runtime +
    `#line 1 "solution.cpp"\n` +
    learnerCode +
    `\n#line 1 "judge_driver.cpp"\n` +
    `int main() {\n` +
    `    std::string in_ = judge_rt::slurp();\n` +
    `    judge_rt::Reader r_(in_);\n` +
    `    r_.expect('[');\n` +
    reads +
    `    r_.expect(']');\n` +
    `    Solution sol_;\n` +
    `    ${ret} res_ = sol_.${method}(${args});\n` +
    `    std::cout.flush();\n` +
    `    std::string out_;\n` +
    `    judge_rt::w(out_, res_);\n` +
    `    judge_rt::emit(out_);\n` +
    `    return 0;\n` +
    `}\n`;
  return { files: { "main.cpp": source } };
}
