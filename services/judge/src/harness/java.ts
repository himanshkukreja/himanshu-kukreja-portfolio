// Java driver generator. The learner writes LeetCode-style code in Solution.java:
//
//   class Solution { public long busiestStretch(int[] plays, int k) { ... } }
//
// We compile two files: Solution.java (learner code, with common imports
// prepended on line 1 so line numbers do not shift) and Main.java (driver,
// inline JSON reader/writer, and ListNode/TreeNode when the signature uses them).

import type { ParsedSignature, TypeNode } from "./types.ts";
import { camelCase } from "./types.ts";
import type { GeneratedSource } from "./cpp.ts";
import { RESULT_FILE } from "./cpp.ts";

// Kept on one line: it is prepended to the learner's first line.
export const JAVA_IMPORTS =
  "import java.util.*;import java.util.function.*;import java.util.stream.*;import java.io.*;import java.math.*;";

export function javaType(t: TypeNode): string {
  switch (t.kind) {
    case "array":
      return `${javaType(t.elem)}[]`;
    case "node":
      return t.name;
    case "scalar":
      switch (t.name) {
        case "int":
          return "int";
        case "long":
          return "long";
        case "double":
          return "double";
        case "bool":
          return "boolean";
        case "string":
          return "String";
        case "char":
          return "char";
      }
  }
}

/** Java expression that reads a value of type t from JudgeReader `r`. */
export function javaReadExpr(t: TypeNode): string {
  if (t.kind === "scalar") {
    const m = { int: "readInt", long: "readLong", double: "readDouble", bool: "readBool", string: "readString", char: "readChar" }[t.name];
    return `r.${m}()`;
  }
  if (t.kind === "node") return t.name === "ListNode" ? "r.readList()" : "r.readTree()";
  const e = t.elem;
  if (e.kind === "scalar" && e.name !== "string") {
    const m = { int: "readIntArray", long: "readLongArray", double: "readDoubleArray", bool: "readBoolArray", char: "readCharArray" }[e.name];
    return `r.${m}()`;
  }
  return `r.readArray(() -> ${javaReadExpr(e)}, ${javaType(e)}[]::new)`;
}

const LIST_NODE = `class ListNode {
    int val; ListNode next;
    ListNode() {}
    ListNode(int val) { this.val = val; }
    ListNode(int val, ListNode next) { this.val = val; this.next = next; }
}
`;

const TREE_NODE = `class TreeNode {
    int val; TreeNode left; TreeNode right;
    TreeNode() {}
    TreeNode(int val) { this.val = val; }
    TreeNode(int val, TreeNode left, TreeNode right) { this.val = val; this.left = left; this.right = right; }
}
`;

const READER = String.raw`final class JudgeReader {
    private final String s; int i = 0;
    JudgeReader(String s) { this.s = s; }
    RuntimeException fail(String what) { return new IllegalArgumentException("judge: bad test input (" + what + " at offset " + i + ")"); }
    void ws() { while (i < s.length()) { char c = s.charAt(i); if (c == ' ' || c == '\n' || c == '\r' || c == '\t') i++; else break; } }
    char peek() { ws(); return i < s.length() ? s.charAt(i) : '\0'; }
    void expect(char c) { if (peek() != c) throw fail("expected '" + c + "'"); i++; }
    boolean tryNull() { if (peek() == 'n' && s.startsWith("null", i)) { i += 4; return true; } return false; }
    private String numToken() {
        ws(); int st = i;
        while (i < s.length() && "+-0123456789.eE".indexOf(s.charAt(i)) >= 0) i++;
        if (st == i) throw fail("expected number");
        return s.substring(st, i);
    }
    long readLong() { String t = numToken(); try { return Long.parseLong(t); } catch (NumberFormatException e) { return (long) Double.parseDouble(t); } }
    int readInt() { return (int) readLong(); }
    double readDouble() { return Double.parseDouble(numToken()); }
    boolean readBool() {
        ws(); if (s.startsWith("true", i)) { i += 4; return true; }
        if (s.startsWith("false", i)) { i += 5; return false; } throw fail("expected bool");
    }
    String readString() {
        expect('"'); StringBuilder o = new StringBuilder();
        while (true) {
            if (i >= s.length()) throw fail("unterminated string");
            char c = s.charAt(i++);
            if (c == '"') break;
            if (c != '\\') { o.append(c); continue; }
            char e = s.charAt(i++);
            switch (e) {
                case 'b': o.append('\b'); break; case 'f': o.append('\f'); break; case 'n': o.append('\n'); break;
                case 'r': o.append('\r'); break; case 't': o.append('\t'); break;
                case 'u': o.append((char) Integer.parseInt(s.substring(i, i + 4), 16)); i += 4; break;
                default: o.append(e);
            }
        }
        return o.toString();
    }
    char readChar() { String t = readString(); return t.isEmpty() ? '\0' : t.charAt(0); }
    <T> List<T> readList(Supplier<T> f) {
        List<T> v = new ArrayList<>(); if (tryNull()) return v;
        expect('['); if (peek() == ']') { i++; return v; }
        while (true) { v.add(f.get()); char c = peek(); i++; if (c == ']') break; if (c != ',') throw fail("expected , or ]"); }
        return v;
    }
    <T> T[] readArray(Supplier<T> f, java.util.function.IntFunction<T[]> mk) { return readList(f).toArray(mk.apply(0)); }
    int[] readIntArray() { List<Long> v = readList(this::readLong); int[] a = new int[v.size()]; for (int k = 0; k < a.length; k++) a[k] = (int) (long) v.get(k); return a; }
    long[] readLongArray() { List<Long> v = readList(this::readLong); long[] a = new long[v.size()]; for (int k = 0; k < a.length; k++) a[k] = v.get(k); return a; }
    double[] readDoubleArray() { List<Double> v = readList(this::readDouble); double[] a = new double[v.size()]; for (int k = 0; k < a.length; k++) a[k] = v.get(k); return a; }
    boolean[] readBoolArray() { List<Boolean> v = readList(this::readBool); boolean[] a = new boolean[v.size()]; for (int k = 0; k < a.length; k++) a[k] = v.get(k); return a; }
    char[] readCharArray() { List<Character> v = readList(this::readChar); char[] a = new char[v.size()]; for (int k = 0; k < a.length; k++) a[k] = v.get(k); return a; }
/*__NODE_READERS__*/
}

final class JudgeWriter {
    static void str(StringBuilder o, String v) {
        o.append('"');
        for (int k = 0; k < v.length(); k++) {
            char c = v.charAt(k);
            switch (c) {
                case '"': o.append("\\\""); break; case '\\': o.append("\\\\"); break;
                case '\n': o.append("\\n"); break; case '\r': o.append("\\r"); break; case '\t': o.append("\\t"); break;
                default: if (c < 0x20) o.append(String.format("\\u%04x", (int) c)); else o.append(c);
            }
        }
        o.append('"');
    }
    static void dbl(StringBuilder o, double d) { if (Double.isNaN(d) || Double.isInfinite(d)) o.append("null"); else o.append(Double.toString(d)); }
    static void w(StringBuilder o, Object v) {
        if (v == null) { o.append("null"); return; }
        if (v instanceof Integer || v instanceof Long || v instanceof Short || v instanceof Byte || v instanceof java.math.BigInteger) { o.append(v.toString()); return; }
        if (v instanceof Double) { dbl(o, (Double) v); return; }
        if (v instanceof Float) { dbl(o, ((Float) v).doubleValue()); return; }
        if (v instanceof Boolean) { o.append(((Boolean) v) ? "true" : "false"); return; }
        if (v instanceof Character) { str(o, String.valueOf((char) (Character) v)); return; }
        if (v instanceof CharSequence) { str(o, v.toString()); return; }
        if (v instanceof int[]) { int[] a = (int[]) v; o.append('['); for (int k = 0; k < a.length; k++) { if (k > 0) o.append(','); o.append(a[k]); } o.append(']'); return; }
        if (v instanceof long[]) { long[] a = (long[]) v; o.append('['); for (int k = 0; k < a.length; k++) { if (k > 0) o.append(','); o.append(a[k]); } o.append(']'); return; }
        if (v instanceof double[]) { double[] a = (double[]) v; o.append('['); for (int k = 0; k < a.length; k++) { if (k > 0) o.append(','); dbl(o, a[k]); } o.append(']'); return; }
        if (v instanceof boolean[]) { boolean[] a = (boolean[]) v; o.append('['); for (int k = 0; k < a.length; k++) { if (k > 0) o.append(','); o.append(a[k] ? "true" : "false"); } o.append(']'); return; }
        if (v instanceof char[]) { char[] a = (char[]) v; o.append('['); for (int k = 0; k < a.length; k++) { if (k > 0) o.append(','); str(o, String.valueOf(a[k])); } o.append(']'); return; }
        if (v instanceof Object[]) { Object[] a = (Object[]) v; o.append('['); for (int k = 0; k < a.length; k++) { if (k > 0) o.append(','); w(o, a[k]); } o.append(']'); return; }
        if (v instanceof Iterable) { o.append('['); boolean first = true; for (Object x : (Iterable<?>) v) { if (!first) o.append(','); first = false; w(o, x); } o.append(']'); return; }
/*__NODE_WRITERS__*/
        throw new IllegalStateException("judge: cannot serialise " + v.getClass());
    }
}
`;

const LIST_READER = `    ListNode readList() {
        long[] v = readLongArray(); ListNode dummy = new ListNode(0), t = dummy;
        for (long x : v) { t.next = new ListNode((int) x); t = t.next; } return dummy.next;
    }
`;

const TREE_READER = `    TreeNode readTree() {
        if (tryNull()) return null;
        List<Integer> v = readList(() -> tryNull() ? null : readInt());
        if (v.isEmpty() || v.get(0) == null) return null;
        TreeNode root = new TreeNode(v.get(0)); ArrayDeque<TreeNode> q = new ArrayDeque<>(); q.add(root); int k = 1;
        while (!q.isEmpty() && k < v.size()) {
            TreeNode n = q.poll();
            if (k < v.size()) { Integer x = v.get(k++); if (x != null) { n.left = new TreeNode(x); q.add(n.left); } }
            if (k < v.size()) { Integer x = v.get(k++); if (x != null) { n.right = new TreeNode(x); q.add(n.right); } }
        }
        return root;
    }
`;

const LIST_WRITER = `        if (v instanceof ListNode) { ListNode n = (ListNode) v; o.append('['); boolean first = true; int guard = 0;
            while (n != null && guard++ < 10000000) { if (!first) o.append(','); first = false; o.append(n.val); n = n.next; } o.append(']'); return; }
`;

const TREE_WRITER = `        if (v instanceof TreeNode) { List<TreeNode> order = new ArrayList<>(); ArrayDeque<Optional<TreeNode>> q = new ArrayDeque<>();
            q.add(Optional.of((TreeNode) v));
            while (!q.isEmpty()) { TreeNode n = q.poll().orElse(null); order.add(n);
                if (n != null) { q.add(Optional.ofNullable(n.left)); q.add(Optional.ofNullable(n.right)); } }
            int end = order.size(); while (end > 0 && order.get(end - 1) == null) end--;
            o.append('['); for (int k = 0; k < end; k++) { if (k > 0) o.append(','); TreeNode n = order.get(k); o.append(n == null ? "null" : String.valueOf(n.val)); } o.append(']'); return; }
`;

export function generateJava(sig: ParsedSignature, learnerCode: string): GeneratedSource {
  const reader = READER.replace(
    "/*__NODE_READERS__*/",
    (sig.usesListNode ? LIST_READER : "") + (sig.usesTreeNode ? TREE_READER : ""),
  ).replace("/*__NODE_WRITERS__*/", (sig.usesListNode ? LIST_WRITER : "") + (sig.usesTreeNode ? TREE_WRITER : ""));

  const reads = sig.params
    .map((p, i) => {
      const sep = i < sig.params.length - 1 ? `        r.expect(',');\n` : "";
      return `        ${javaType(p.type)} a${i} = ${javaReadExpr(p.type)};\n${sep}`;
    })
    .join("");
  const args = sig.params.map((_, i) => `a${i}`).join(", ");
  const ret = javaType(sig.returns);

  const main =
    `import java.util.*;\nimport java.util.function.*;\nimport java.nio.file.*;\nimport java.nio.charset.StandardCharsets;\n\n` +
    `public class Main {\n` +
    `    public static void main(String[] args) throws Exception {\n` +
    `        String in = new String(System.in.readAllBytes(), StandardCharsets.UTF_8);\n` +
    `        JudgeReader r = new JudgeReader(in);\n` +
    `        r.expect('[');\n` +
    reads +
    `        r.expect(']');\n` +
    `        ${ret} res = new Solution().${camelCase(sig.fn)}(${args});\n` +
    `        System.out.flush();\n` +
    `        StringBuilder sb = new StringBuilder();\n` +
    `        JudgeWriter.w(sb, res);\n` +
    `        Files.write(Paths.get("${RESULT_FILE}"), sb.toString().getBytes(StandardCharsets.UTF_8));\n` +
    `    }\n` +
    `}\n\n` +
    (sig.usesListNode ? LIST_NODE : "") +
    (sig.usesTreeNode ? TREE_NODE : "") +
    reader;

  return {
    files: {
      "Solution.java": JAVA_IMPORTS + learnerCode,
      "Main.java": main,
    },
  };
}

/** For stdio mode: the file name javac needs (the public class, else Main). */
export function javaStdioClass(code: string): string {
  const m = /\bpublic\s+(?:final\s+|abstract\s+)*class\s+([A-Za-z_$][A-Za-z0-9_$]*)/.exec(code);
  return m ? m[1] : "Main";
}
