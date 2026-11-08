// Language-neutral problem signature (plan section 7.1):
//   signature: { fn: busiest_stretch, params: [{ name: plays, type: "int[]" }, { name: k, type: int }], returns: long }
//
// Supported types:
//   scalars   int, long, double, bool, string, char
//   arrays    T[] for any supported T, nested to any depth (int[][], string[], ListNode[] ...)
//   nodes     ListNode (singly linked list, JSON: [1,2,3]),
//             TreeNode (binary tree, JSON: LeetCode level order with nulls, [1,null,2,3])
//
// JSON encoding of values (tests and driver output):
//   int/long/double -> number, bool -> true/false, string -> "..", char -> "c" (one character)

export type ScalarName = "int" | "long" | "double" | "bool" | "string" | "char";
export type NodeName = "ListNode" | "TreeNode";

export type TypeNode =
  | { kind: "scalar"; name: ScalarName }
  | { kind: "node"; name: NodeName }
  | { kind: "array"; elem: TypeNode };

export interface ParamSpec {
  name: string;
  type: string;
}

export interface Signature {
  fn: string;
  params: ParamSpec[];
  returns: string;
}

export interface ParsedParam {
  name: string;
  type: TypeNode;
}

export interface ParsedSignature {
  fn: string;
  params: ParsedParam[];
  returns: TypeNode;
  usesListNode: boolean;
  usesTreeNode: boolean;
}

const SCALARS: Record<string, ScalarName> = {
  int: "int",
  long: "long",
  double: "double",
  bool: "bool",
  boolean: "bool",
  string: "string",
  char: "char",
};

const NODES: Record<string, NodeName> = { ListNode: "ListNode", TreeNode: "TreeNode" };

export class SignatureError extends Error {}

export function parseType(raw: string): TypeNode {
  const s = String(raw).replace(/\s+/g, "");
  if (s.endsWith("[]")) {
    return { kind: "array", elem: parseType(s.slice(0, -2)) };
  }
  if (SCALARS[s]) return { kind: "scalar", name: SCALARS[s] };
  if (NODES[s]) return { kind: "node", name: NODES[s] };
  throw new SignatureError(`unsupported type "${raw}"`);
}

export function typeToString(t: TypeNode): string {
  if (t.kind === "array") return `${typeToString(t.elem)}[]`;
  return t.name;
}

function usesNode(t: TypeNode, name: NodeName): boolean {
  if (t.kind === "array") return usesNode(t.elem, name);
  return t.kind === "node" && t.name === name;
}

const IDENT = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;

// Words that cannot be parameter names in at least one target language.
const RESERVED = new Set(
  (
    "abstract assert auto bool boolean break byte case catch char class const continue default delete do double " +
    "else enum extends false final finally float for function goto if implements import in instanceof int " +
    "interface let long namespace native new null operator package private protected public return short " +
    "signed sizeof static struct super switch synchronized template this throw throws transient true try " +
    "typedef typename union unsigned using var virtual void volatile while yield and or not is lambda def " +
    "pass raise global nonlocal del elif except from with async await None True False main"
  ).split(" "),
);

export function parseSignature(sig: Signature): ParsedSignature {
  if (!sig || typeof sig !== "object") throw new SignatureError("signature must be an object");
  if (typeof sig.fn !== "string" || !IDENT.test(sig.fn)) throw new SignatureError("signature.fn must be an identifier");
  if (!Array.isArray(sig.params) || sig.params.length > 16) {
    throw new SignatureError("signature.params must be an array of at most 16 params");
  }
  const seen = new Set<string>();
  const params = sig.params.map((p, i) => {
    if (!p || typeof p.name !== "string" || !IDENT.test(p.name)) {
      throw new SignatureError(`signature.params[${i}].name must be an identifier`);
    }
    if (RESERVED.has(p.name)) throw new SignatureError(`param name "${p.name}" is reserved in a target language`);
    if (seen.has(p.name)) throw new SignatureError(`duplicate param name "${p.name}"`);
    seen.add(p.name);
    return { name: p.name, type: parseType(p.type) };
  });
  if (typeof sig.returns !== "string") throw new SignatureError("signature.returns must be a type string");
  const returns = parseType(sig.returns);
  const all = [returns, ...params.map((p) => p.type)];
  return {
    fn: sig.fn,
    params,
    returns,
    usesListNode: all.some((t) => usesNode(t, "ListNode")),
    usesTreeNode: all.some((t) => usesNode(t, "TreeNode")),
  };
}

/** busiest_stretch -> busiestStretch (Java, C++, JS method names). */
export function camelCase(fn: string): string {
  return fn.replace(/_+([a-zA-Z0-9])/g, (_m, c: string) => c.toUpperCase());
}

/** busiestStretch -> busiest_stretch (Python function names). */
export function snakeCase(fn: string): string {
  return fn.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
}

/**
 * The name the learner must use in each language. Python keeps the plan's
 * snake_case; Java, C++ and JS use camelCase on a `Solution` class (LeetCode
 * convention). The browser harness must use the same rule.
 */
export function fnNameFor(language: string, fn: string): string {
  return language === "python" ? snakeCase(fn) : camelCase(fn);
}
