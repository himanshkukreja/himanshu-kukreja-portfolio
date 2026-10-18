/**
 * The code-lab test harness: plain Python, run inside Pyodide (the browser worker in
 * src/lib/learn/labs/py.worker.ts, and Node in scripts/labs/check-labs.mjs, so a lab's solution is
 * checked by the exact runtime readers use).
 *
 *   __hk_lab_run(user_src, given_src, groups_json) -> JSON string
 *
 * - `given_src` (the lab's read-only support code: fake clocks, fake brokers) runs first, then the
 *   reader's code, in one fresh namespace per run.
 * - each group ("visible", "hidden") is a test file; every top-level `def test_*()` in it runs in
 *   definition order with its own timing. A test passes when it returns; a failing `assert` shows
 *   its message (or its source line when it has none); any other exception shows its type, message
 *   and the reader's own frames of the traceback.
 * - tests see the reader's names plus `__source__` (their code as text) for checks such as
 *   "don't import OrderedDict".
 *
 * Hidden tests are not shown before a run, but they ship to the browser with the page: anyone can
 * read them in dev tools. That's fine for practice; nothing is graded server-side.
 *
 * Kept free of backticks and dollar-brace so it can live in a template literal.
 */
export const HARNESS_PY = String.raw`
import json as __hk_json
import linecache as __hk_linecache
import sys as __hk_sys
import time as __hk_time
import traceback as __hk_tb

__HK_MAX_MSG = 1500


def __hk_register(name, src):
    lines = [l + "\n" for l in src.splitlines()]
    __hk_linecache.cache[name] = (len(src), None, lines, name)


def __hk_clip(s, n=__HK_MAX_MSG):
    s = str(s)
    return s if len(s) <= n else s[:n] + " ... (truncated)"


def __hk_title(name, fn):
    doc = (getattr(fn, "__doc__", None) or "").strip()
    if doc:
        return doc.splitlines()[0].strip()
    s = name[5:] if name.startswith("test_") else name
    return s.replace("_", " ").strip()


def __hk_frames(exc, files):
    out = []
    for fr in __hk_tb.extract_tb(exc.__traceback__):
        if fr.filename in files:
            out.append({"file": fr.filename, "line": fr.lineno, "fn": fr.name, "code": (fr.line or "").strip()})
    return out[-8:]


def __hk_last_line(exc, fname):
    for fr in reversed(__hk_tb.extract_tb(exc.__traceback__)):
        if fr.filename == fname:
            return fr.lineno, (fr.line or "").strip()
    return None, None


def __hk_error(exc, files):
    name = type(exc).__name__
    if isinstance(exc, SyntaxError):
        return {"kind": name, "message": __hk_clip(exc.msg or str(exc)), "line": exc.lineno, "file": exc.filename, "frames": []}
    if isinstance(exc, RecursionError):
        msg = "maximum recursion depth exceeded (infinite recursion?)"
    else:
        msg = str(exc)
    return {"kind": name, "message": __hk_clip(msg), "frames": __hk_frames(exc, files)}


def __hk_lab_run(user_src, given_src, groups_json):
    groups = __hk_json.loads(groups_json)
    started = __hk_time.perf_counter()
    out = {"setup": None, "tests": [], "ms": 0}
    user_file = "solution.py"
    files = {user_file, "given.py"}
    ns = {"__name__": "__lab__", "__builtins__": __builtins__}
    if given_src:
        __hk_register("given.py", given_src)
        try:
            exec(compile(given_src, "given.py", "exec"), ns)
        except BaseException as e:
            out["setup"] = dict(__hk_error(e, files), where="given")
            return __hk_json.dumps(out)
    __hk_register(user_file, user_src)
    try:
        exec(compile(user_src, user_file, "exec"), ns)
    except BaseException as e:
        out["setup"] = dict(__hk_error(e, files), where="solution")
        out["ms"] = round((__hk_time.perf_counter() - started) * 1000, 1)
        return __hk_json.dumps(out)

    for group in groups:
        gname = group["name"]
        fname = gname + "_tests.py"
        __hk_register(fname, group["src"])
        tns = dict(ns)
        tns["__source__"] = user_src
        try:
            exec(compile(group["src"], fname, "exec"), tns)
        except BaseException as e:
            out["tests"].append({"group": gname, "name": "(load)", "title": gname + " tests failed to load", "ok": False, "ms": 0, "error": __hk_error(e, files | {fname})})
            continue
        tests = [
            (k, v)
            for k, v in list(tns.items())
            if k.startswith("test_") and callable(v) and getattr(getattr(v, "__code__", None), "co_filename", "") == fname
        ]
        for name, fn in tests:
            rec = {"group": gname, "name": name, "title": __hk_title(name, fn), "ok": False}
            t0 = __hk_time.perf_counter()
            try:
                fn()
                rec["ok"] = True
            except AssertionError as e:
                lineno, code = __hk_last_line(e, fname)
                msg = str(e)
                rec["error"] = {
                    "kind": "AssertionError",
                    "message": __hk_clip(msg) if msg else ("assert failed: " + (code or "")),
                    "line": lineno,
                    "code": code,
                    "frames": __hk_frames(e, files),
                }
            except BaseException as e:
                rec["error"] = __hk_error(e, files | {fname})
                lineno, code = __hk_last_line(e, fname)
                rec["error"]["line"] = lineno
                rec["error"]["code"] = code
            rec["ms"] = round((__hk_time.perf_counter() - t0) * 1000, 2)
            out["tests"].append(rec)
            __hk_sys.stdout.flush()
    out["ms"] = round((__hk_time.perf_counter() - started) * 1000, 1)
    return __hk_json.dumps(out)
`;

/** What one run returns (the JSON above, parsed). */
export type HarnessFrame = { file: string; line: number; fn: string; code: string };
export type HarnessError = { kind: string; message: string; line?: number | null; code?: string | null; file?: string; frames?: HarnessFrame[]; where?: "given" | "solution" };
export type HarnessTest = { group: string; name: string; title: string; ok: boolean; ms: number; error?: HarnessError };
export type HarnessResult = { setup: HarnessError | null; tests: HarnessTest[]; ms: number };
