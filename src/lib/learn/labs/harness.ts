/**
 * The code-lab test harness for Python: plain Python, run inside Pyodide (the browser worker
 * public/labs-runtime/py-worker.mjs, and Node in scripts/labs/check-labs.mjs, so a lab's solution is
 * checked by the exact runtime readers use). The JavaScript/TypeScript harness (jsHarness.ts) mirrors
 * it name for name and returns the same JSON.
 *
 *   __hk_lab_run(user_src, given_src, groups_json)            -> HarnessResult JSON
 *   __hk_lab_chaos(user_src, given_src, chaos_src, opts_json)  -> ChaosResult JSON
 *   __hk_lab_scale(user_src, given_src, scale_src, opts_json)  -> ScaleResult JSON
 *
 * - `given_src` (the lab's read-only support code: fake clocks, fake brokers) runs first, then the
 *   reader's code, in one fresh namespace per run.
 * - each group ("visible", "hidden", "repro", "followup", "stage2"…) is a test file; every top-level
 *   `def test_*()` in it runs in definition order with its own timing. A test passes when it returns; a
 *   failing `assert` shows its message (or its source line when it has none); any other exception shows
 *   its type, message and the reader's own frames of the traceback.
 * - tests see the reader's names plus `__source__` (their code as text) for checks such as
 *   "don't import OrderedDict".
 * - `viz.emit(type, **fields)` (anywhere: given code, the reader's code, tests) records an event for the
 *   run visualiser, per test.
 * - chaos tests get `sim`, a seeded deterministic scheduler (interleavings, crashes, lost replies,
 *   duplicate deliveries, partitions); a failing seed comes back with its step-by-step trace and replays
 *   exactly with the same seed. Its random numbers (mulberry32) match the JS harness bit for bit.
 * - scale tests: `def scale(n)` sets up n items and returns the function to time; it runs at each size
 *   (fresh setup per repetition, setup untimed), skipping sizes that would blow the time budget.
 *
 * Hidden tests are not shown before a run, but they ship to the browser with the page: anyone can
 * read them in dev tools. That's fine for practice; nothing is graded server-side.
 *
 * Kept free of backticks and dollar-brace so it can live in a template literal.
 */
export const HARNESS_PY = String.raw`
import json as __hk_json
import linecache as __hk_linecache
import math as __hk_math
import sys as __hk_sys
import time as __hk_time
import traceback as __hk_tb

__HK_MAX_MSG = 1500
_HK_VIZ_PER_TEST = 1500
_HK_VIZ_TOTAL = 6000
_HK_TRACE_MAX = 400


def __hk_register(name, src):
    lines = [l + "\n" for l in src.splitlines()]
    __hk_linecache.cache[name] = (len(src), None, lines, name)


def __hk_clip(s, n=__HK_MAX_MSG):
    s = str(s)
    return s if len(s) <= n else s[:n] + " ... (truncated)"


_hk_clip = __hk_clip


def __hk_title(name, fn):
    doc = (getattr(fn, "__doc__", None) or "").strip()
    if doc:
        return doc.splitlines()[0].strip()
    s = name[5:] if name.startswith("test_") else (name[6:] if name.startswith("chaos_") else name)
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


def __hk_test_error(e, fname, files):
    if isinstance(e, AssertionError):
        lineno, code = __hk_last_line(e, fname)
        msg = str(e)
        return {
            "kind": "AssertionError",
            "message": __hk_clip(msg) if msg else ("assert failed: " + (code or "")),
            "line": lineno,
            "code": code,
            "frames": __hk_frames(e, files),
        }
    err = __hk_error(e, files | {fname})
    lineno, code = __hk_last_line(e, fname)
    err["line"] = lineno
    err["code"] = code
    return err


def _hk_safe(v, depth=0):
    if v is None or isinstance(v, (bool, int, str)):
        return v
    if isinstance(v, float):
        return v if __hk_math.isfinite(v) else str(v)
    if depth > 4:
        return str(v)[:80]
    if isinstance(v, dict):
        return {str(k): _hk_safe(x, depth + 1) for k, x in list(v.items())[:200]}
    if isinstance(v, (list, tuple, set, frozenset)):
        xs = list(v)
        if isinstance(v, (set, frozenset)):
            try:
                xs = sorted(xs)
            except TypeError:
                pass
        return [_hk_safe(x, depth + 1) for x in xs[:200]]
    return str(v)[:120]


class _HkViz:
    """viz.emit("request", t=1.0, allowed=True): an event for the run visualiser."""

    def __init__(self):
        self.events = {}
        self.cur = None
        self.total = 0

    def emit(self, type, data=None, **fields):
        if self.cur is None or self.total >= _HK_VIZ_TOTAL:
            return
        lst = self.events.setdefault(self.cur, [])
        if len(lst) >= _HK_VIZ_PER_TEST:
            return
        d = dict(data) if isinstance(data, dict) else {}
        d.update(fields)
        lst.append({"type": str(type), "data": _hk_safe(d)})
        self.total += 1


def __hk_setup(user_src, given_src):
    """(namespace, setup error or None, viz)"""
    user_file = "solution.py"
    files = {user_file, "given.py"}
    viz = _HkViz()
    ns = {"__name__": "__lab__", "__builtins__": __builtins__, "viz": viz}
    if given_src:
        __hk_register("given.py", given_src)
        try:
            exec(compile(given_src, "given.py", "exec"), ns)
        except BaseException as e:
            return ns, dict(__hk_error(e, files), where="given"), viz
    __hk_register(user_file, user_src)
    try:
        exec(compile(user_src, user_file, "exec"), ns)
    except BaseException as e:
        return ns, dict(__hk_error(e, files), where="solution"), viz
    return ns, None, viz


def __hk_lab_run(user_src, given_src, groups_json):
    groups = __hk_json.loads(groups_json)
    started = __hk_time.perf_counter()
    out = {"setup": None, "tests": [], "ms": 0, "viz": {}}
    files = {"solution.py", "given.py"}
    ns, err, viz = __hk_setup(user_src, given_src)
    if err:
        out["setup"] = err
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
            viz.cur = gname + ":" + name
            t0 = __hk_time.perf_counter()
            try:
                fn()
                rec["ok"] = True
            except BaseException as e:
                rec["error"] = __hk_test_error(e, fname, files)
            rec["ms"] = round((__hk_time.perf_counter() - t0) * 1000, 2)
            viz.cur = None
            out["tests"].append(rec)
            __hk_sys.stdout.flush()
    out["viz"] = viz.events
    out["ms"] = round((__hk_time.perf_counter() - started) * 1000, 1)
    return __hk_json.dumps(out)


# ------------------------------------------------------------------------------------------------
# chaos: a seeded, deterministic scheduler


def _hk_rng(seed):
    """mulberry32, bit for bit the same as the JS harness's."""
    state = [seed & 0xFFFFFFFF]

    def nxt():
        a = (state[0] + 0x6D2B79F5) & 0xFFFFFFFF
        state[0] = a
        t = ((a ^ (a >> 15)) * (1 | a)) & 0xFFFFFFFF
        t = ((t + (((t ^ (t >> 7)) * (61 | t)) & 0xFFFFFFFF)) & 0xFFFFFFFF) ^ t
        return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296

    return nxt


class SimCrash(Exception):
    pass


class _HkNet:
    """Fake nodes and a network between them: sends queue, deliveries are scheduler steps."""

    def __init__(self, sim, nodes):
        self.sim = sim
        self.nodes = list(nodes)
        self.handlers = {}
        self.inflight = []
        self.cut = None

    def on(self, node, handler):
        self.handlers[node] = handler

    def send(self, src, dst, msg):
        self.inflight.append((src, dst, msg))
        self.sim._t(src, "send", str(src) + " -> " + str(dst) + ": " + str(msg))

    def connected(self, a, b):
        return self.cut is None or ((a in self.cut) == (b in self.cut))

    def _deliver_one(self):
        sim = self.sim
        i = int(sim._rand() * len(self.inflight)) if sim.enabled("interleave") else 0
        src, dst, msg = self.inflight.pop(i)
        what = str(src) + " -> " + str(dst) + ": " + str(msg)
        if not self.connected(src, dst):
            sim._t("net", "drop", what + " (partitioned)")
            return
        if sim.fault("duplicate", 0.3):
            self.inflight.append((src, dst, msg))
            sim._t("net", "duplicate", what + " (will arrive twice)")
        sim._t("net", "deliver", what)
        h = self.handlers.get(dst)
        if h is not None:
            h(src, msg)


class _HkSim:
    def __init__(self, seed, scenarios):
        self.seed = seed
        self._rand = _hk_rng(seed)
        self.scenarios = list(scenarios)
        self.trace = []
        self.step = 0
        self.crashes = 0
        self.max_crashes = 1
        self._tasks = []
        self._net = None
        self._cur = None

    # seeded randomness for tests: the same seed gives the same choices
    def rand(self):
        return self._rand()

    def randint(self, a, b):
        return a + int(self._rand() * (b - a + 1))

    def choice(self, xs):
        xs = list(xs)
        return xs[int(self._rand() * len(xs))]

    def shuffle(self, xs):
        for i in range(len(xs) - 1, 0, -1):
            j = int(self._rand() * (i + 1))
            xs[i], xs[j] = xs[j], xs[i]
        return xs

    def enabled(self, scenario):
        return scenario in self.scenarios

    def fault(self, kind, p):
        return kind in self.scenarios and self._rand() < p

    def _t(self, actor, kind, label=""):
        if len(self.trace) < _HK_TRACE_MAX:
            self.trace.append({"step": self.step, "actor": str(actor), "kind": kind, "label": _hk_clip(label, 200)})

    def log(self, msg):
        self._t(self._cur or "test", "note", msg)

    def spawn(self, name, fn, on_crash=None):
        gen = fn if hasattr(fn, "send") else fn()
        if not hasattr(gen, "send"):
            raise TypeError("sim.spawn needs a generator function (a def with yield): each yield is a point where another task may run")
        self._tasks.append({"name": str(name), "gen": gen, "done": False, "started": False, "on_crash": on_crash})
        self._t(name, "spawn", "")

    def network(self, nodes):
        self._net = _HkNet(self, nodes)
        return self._net

    def call(self, label, fn):
        """r = yield from sim.call("charge", lambda: store.charge(k)): with 'retry' on, the reply may be lost and the call made again."""
        actor = self._cur or "test"
        r = fn()
        self._t(actor, "call", label)
        if self.fault("retry", 0.25):
            self._t(actor, "retry", str(label) + ": reply lost, the caller retries")
            yield str(label) + " (retry)"
            r = fn()
            self._t(actor, "call", str(label) + " (retry)")
        return r

    def deliver(self, label, fn):
        """yield from sim.deliver("order-7", lambda: consumer.handle(m)): with 'duplicate' on, it may run twice."""
        actor = self._cur or "test"
        r = fn()
        self._t(actor, "deliver", label)
        if self.fault("duplicate", 0.3):
            yield str(label) + " (duplicate on the way)"
            r = fn()
            self._t(actor, "duplicate", str(label) + " delivered again")
        return r

    def run(self, max_steps=5000):
        net = self._net
        plan = None
        if net is not None and len(net.nodes) >= 2 and self.enabled("partition"):
            start = self.randint(1, 12)
            length = self.randint(3, 12)
            order = self.shuffle(list(net.nodes))
            k = self.randint(1, len(order) - 1)
            plan = (start, start + length, set(order[:k]))
        while True:
            live = [t for t in self._tasks if not t["done"]]
            options = live + (["net"] if net is not None and net.inflight else [])
            if not options:
                break
            if self.step >= max_steps:
                raise AssertionError("the simulation didn't finish in " + str(max_steps) + " steps (a task waiting forever?)")
            self.step += 1
            if plan is not None:
                if self.step == plan[0]:
                    net.cut = plan[2]
                    rest = [n for n in net.nodes if n not in plan[2]]
                    self._t("net", "partition", ", ".join(map(str, sorted(plan[2], key=str))) + " | " + ", ".join(map(str, rest)))
                elif self.step == plan[1] and net.cut is not None:
                    net.cut = None
                    self._t("net", "heal", "partition healed")
            pick = options[int(self._rand() * len(options))] if self.enabled("interleave") else options[0]
            if pick == "net":
                net._deliver_one()
                continue
            if pick["started"] and self.crashes < self.max_crashes and self.fault("crash", 0.06):
                pick["done"] = True
                self.crashes += 1
                self._t(pick["name"], "crash", "crashed")
                try:
                    pick["gen"].close()
                except BaseException:
                    pass
                if pick["on_crash"] is not None:
                    self.spawn(pick["name"] + "'", pick["on_crash"])
                continue
            self._cur = pick["name"]
            try:
                label = next(pick["gen"])
                pick["started"] = True
                self._t(pick["name"], "step", "" if label is None else label)
            except StopIteration:
                pick["done"] = True
                self._t(pick["name"], "done", "")
            finally:
                self._cur = None
        if net is not None and net.cut is not None:
            net.cut = None
        return self


def __hk_lab_chaos(user_src, given_src, chaos_src, opts_json):
    opts = __hk_json.loads(opts_json)
    started = __hk_time.perf_counter()
    out = {"setup": None, "chaos": [], "ms": 0}
    files = {"solution.py", "given.py"}
    ns, err, viz = __hk_setup(user_src, given_src)
    if err:
        out["setup"] = err
        return __hk_json.dumps(out)
    fname = "chaos_tests.py"
    __hk_register(fname, chaos_src)
    tns = dict(ns)
    tns["__source__"] = user_src
    tns["SimCrash"] = SimCrash
    try:
        exec(compile(chaos_src, fname, "exec"), tns)
    except BaseException as e:
        out["chaos"].append({"name": "(load)", "title": "chaos tests failed to load", "ok": False, "runs": 0, "ms": 0, "error": __hk_error(e, files | {fname})})
        return __hk_json.dumps(out)
    tests = [
        (k, v)
        for k, v in list(tns.items())
        if k.startswith("chaos_") and callable(v) and getattr(getattr(v, "__code__", None), "co_filename", "") == fname
    ]
    only = opts.get("test")
    seed = opts.get("seed")
    runs = int(opts.get("runs") or 40)
    scenarios = opts.get("scenarios") or ["interleave"]
    for name, fn in tests:
        if only and name != only:
            continue
        rec = {"name": name, "title": __hk_title(name, fn), "ok": True, "runs": 0}
        t0 = __hk_time.perf_counter()
        seeds = [int(seed)] if seed is not None else list(range(1, runs + 1))
        for s in seeds:
            sim = _HkSim(s, scenarios)
            rec["runs"] += 1
            try:
                fn(sim)
            except BaseException as e:
                rec["ok"] = False
                rec["seed"] = s
                rec["error"] = __hk_test_error(e, fname, files)
                rec["trace"] = sim.trace
                rec["steps"] = sim.step
                break
            if seed is not None:
                rec["seed"] = s
                rec["trace"] = sim.trace
                rec["steps"] = sim.step
        rec["ms"] = round((__hk_time.perf_counter() - t0) * 1000, 1)
        out["chaos"].append(rec)
    out["ms"] = round((__hk_time.perf_counter() - started) * 1000, 1)
    return __hk_json.dumps(out)


# ------------------------------------------------------------------------------------------------
# scale


def __hk_lab_scale(user_src, given_src, scale_src, opts_json):
    opts = __hk_json.loads(opts_json)
    started = __hk_time.perf_counter()
    out = {"setup": None, "scale": {"points": [], "skipped": [], "error": None}, "ms": 0}
    files = {"solution.py", "given.py"}
    ns, err, viz = __hk_setup(user_src, given_src)
    if err:
        out["setup"] = err
        return __hk_json.dumps(out)
    fname = "scale.py"
    __hk_register(fname, scale_src)
    tns = dict(ns)
    res = out["scale"]
    try:
        exec(compile(scale_src, fname, "exec"), tns)
        make = tns["scale"]
        sizes = [int(n) for n in opts["sizes"]]
        budget = float(opts.get("budget_ms") or 3000)
        clock = __hk_time.perf_counter
        make(sizes[0])()  # warm-up: imports, first-call costs
        points = res["points"]
        for i, n in enumerate(sizes):
            if points:
                p = points[-1]
                e = 1.0
                if len(points) >= 2 and points[-2]["ms"] > 0.05 and p["ms"] > 0.05:
                    e = max(1.0, __hk_math.log(p["ms"] / points[-2]["ms"]) / __hk_math.log(p["n"] / points[-2]["n"]))
                projected = max(p["ms"], 0.05) * (n / p["n"]) ** e
                if projected > budget:
                    for m in sizes[i:]:
                        res["skipped"].append({"n": m, "projectedMs": round(max(p["ms"], 0.05) * (m / p["n"]) ** e, 1)})
                    break
            samples = []
            wall0 = clock()
            while True:
                fn = make(n)
                t0 = clock()
                fn()
                samples.append((clock() - t0) * 1000)
                total = sum(samples)
                wall = (clock() - wall0) * 1000
                if samples[-1] > budget or len(samples) >= 25 or wall > 2500 or (len(samples) >= 3 and total >= 80):
                    break
            ordered = sorted(samples)
            med = ordered[len(ordered) // 2]
            est = med if med >= 2 else sum(samples) / len(samples)
            points.append({"n": n, "ms": round(est, 4), "reps": len(samples), "min": round(ordered[0], 4)})
            if samples[-1] > budget:
                for m in sizes[i + 1:]:
                    res["skipped"].append({"n": m, "projectedMs": round(est * (m / n) ** 2, 1)})
                break
    except BaseException as e:
        res["error"] = __hk_test_error(e, fname, files)
    out["ms"] = round((__hk_time.perf_counter() - started) * 1000, 1)
    return __hk_json.dumps(out)
`;

/** What one run returns (the JSON above, parsed). The JS harness returns the same shapes. */
export type HarnessFrame = { file: string; line: number; fn: string; code: string };
export type HarnessError = { kind: string; message: string; line?: number | null; code?: string | null; file?: string; frames?: HarnessFrame[]; where?: "given" | "solution" };
export type HarnessTest = { group: string; name: string; title: string; ok: boolean; ms: number; error?: HarnessError };
export type HarnessVizEvent = { type: string; data: Record<string, unknown> };
export type HarnessResult = { setup: HarnessError | null; tests: HarnessTest[]; ms: number; viz?: Record<string, HarnessVizEvent[]> };

export type ChaosStep = { step: number; actor: string; kind: "spawn" | "step" | "done" | "call" | "retry" | "crash" | "send" | "deliver" | "duplicate" | "drop" | "partition" | "heal" | "note"; label: string };
export type ChaosTestResult = { name: string; title: string; ok: boolean; runs: number; ms: number; seed?: number; steps?: number; trace?: ChaosStep[]; error?: HarnessError };
export type ChaosResult = { setup: HarnessError | null; chaos: ChaosTestResult[]; ms: number };

export type ScalePoint = { n: number; ms: number; reps: number; min: number };
export type ScaleRun = { points: ScalePoint[]; skipped: { n: number; projectedMs: number }[]; error: HarnessError | null };
export type ScaleResult = { setup: HarnessError | null; scale: ScaleRun; ms: number };

/** The harness entry points (Python function names; the JS worker uses the same names). */
export type HarnessEntry = "__hk_lab_run" | "__hk_lab_chaos" | "__hk_lab_scale";
