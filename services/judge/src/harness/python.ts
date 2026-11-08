// Python driver (server-side verified re-judges; the browser runs Python with
// the same conventions). The learner writes either a module-level function
// named in snake_case, or LeetCode-style `class Solution` with that method
// (camelCase also accepted). ListNode/TreeNode and the typing names are
// predefined in the learner's namespace, as on LeetCode.

import type { ParsedSignature, TypeNode } from "./types.ts";
import { camelCase, snakeCase } from "./types.ts";
import type { GeneratedSource } from "./cpp.ts";
import { RESULT_FILE } from "./cpp.ts";

/** Compact type descriptor the Python/JS drivers interpret at runtime. */
export function typeDescriptor(t: TypeNode): unknown {
  if (t.kind === "array") return ["array", typeDescriptor(t.elem)];
  return t.name;
}

const DRIVER = `import sys, json, threading
from typing import *
from collections import deque as _deque

class ListNode:
    def __init__(self, val=0, next=None):
        self.val = val
        self.next = next

class TreeNode:
    def __init__(self, val=0, left=None, right=None):
        self.val = val
        self.left = left
        self.right = right

_NS = {"__name__": "solution", "__builtins__": __builtins__, "ListNode": ListNode, "TreeNode": TreeNode}
exec("from typing import *", _NS)

def _to(t, v, ns):
    if isinstance(t, list):
        return None if v is None else [_to(t[1], x, ns) for x in v]
    if t == "ListNode":
        cls = ns.get("ListNode", ListNode)
        dummy = cur = cls(0)
        for x in (v or []):
            cur.next = cls(x)
            cur = cur.next
        return dummy.next
    if t == "TreeNode":
        cls = ns.get("TreeNode", TreeNode)
        if not v or v[0] is None:
            return None
        root = cls(v[0]); q = _deque([root]); k = 1
        while q and k < len(v):
            n = q.popleft()
            if k < len(v):
                if v[k] is not None:
                    n.left = cls(v[k]); q.append(n.left)
                k += 1
            if k < len(v):
                if v[k] is not None:
                    n.right = cls(v[k]); q.append(n.right)
                k += 1
        return root
    if t == "double":
        return float(v)
    return v

def _from(t, v):
    if isinstance(t, list):
        return None if v is None else [_from(t[1], x) for x in v]
    if t == "ListNode":
        out = []
        while v is not None and len(out) < 10000000:
            out.append(v.val); v = v.next
        return out
    if t == "TreeNode":
        order = []; q = _deque([v] if v is not None else [])
        while q:
            n = q.popleft(); order.append(n)
            if n is not None:
                q.append(n.left); q.append(n.right)
        while order and order[-1] is None:
            order.pop()
        return [None if n is None else n.val for n in order]
    if t == "double":
        f = float(v)
        return None if f != f or f in (float("inf"), float("-inf")) else f
    if t in ("int", "long"):
        return int(v)
    if t == "bool":
        return bool(v)
    if t in ("string", "char"):
        return str(v)
    return v

def _main():
    with open("solution.py", "r", encoding="utf-8") as f:
        src = f.read()
    exec(compile(src, "solution.py", "exec"), _NS)
    target = None
    if isinstance(_NS.get("Solution"), type):
        inst = _NS["Solution"]()
        target = getattr(inst, FN_SNAKE, None) or getattr(inst, FN_CAMEL, None)
    if target is None:
        target = _NS.get(FN_SNAKE) or _NS.get(FN_CAMEL)
    if not callable(target):
        sys.stderr.write("judge: define a function named %s (or class Solution with that method)\\n" % FN_SNAKE)
        sys.exit(96)
    raw = json.loads(sys.stdin.read())
    args = [_to(t, v, _NS) for t, v in zip(PARAMS, raw)]
    res = target(*args)
    sys.stdout.flush()
    with open(RESULT_FILE, "w", encoding="utf-8") as f:
        f.write(json.dumps(_from(RETURNS, res), separators=(",", ":"), ensure_ascii=False))

sys.setrecursionlimit(1000000)
threading.stack_size(256 * 1024 * 1024)
_err = []
def _run():
    try:
        _main()
    except SystemExit as e:
        _err.append(e.code if isinstance(e.code, int) else 1)
    except BaseException:
        import traceback
        traceback.print_exc()
        _err.append(1)
_t = threading.Thread(target=_run)
_t.start()
_t.join()
sys.exit(_err[0] if _err else 0)
`;

export function generatePython(sig: ParsedSignature, learnerCode: string): GeneratedSource {
  const header =
    `FN_SNAKE = ${JSON.stringify(snakeCase(sig.fn))}\n` +
    `FN_CAMEL = ${JSON.stringify(camelCase(sig.fn))}\n` +
    `PARAMS = json.loads(${JSON.stringify(JSON.stringify(sig.params.map((p) => typeDescriptor(p.type))))})\n` +
    `RETURNS = json.loads(${JSON.stringify(JSON.stringify(typeDescriptor(sig.returns)))})\n` +
    `RESULT_FILE = ${JSON.stringify(RESULT_FILE)}\n`;
  // Constants must exist before the driver body runs; insert after the imports.
  const driver = DRIVER.replace("from collections import deque as _deque\n", `from collections import deque as _deque\n${header}`);
  return { files: { "solution.py": learnerCode, "main.py": driver } };
}
