/**
 * DEV-ONLY synthetic rrweb recording for the admin preview (`?preview=1`): a small lesson page with
 * mouse movement, clicks, scrolling, DOM mutations and a 45 s idle stretch (to try "skip idle" and
 * the 0.5×–8× speeds). Served as blob_v2-style chunks by ./fixtures.ts. Never in production bundles.
 */
if (process.env.NODE_ENV !== "development") {
  throw new Error("replay fixture is dev-only");
}

type Ev = { type: number; timestamp: number; data: unknown };
type Node = Record<string, unknown>;

const W = 1280;
const H = 800;
const DURATION = 150_000;
const BLOBS = 6;
const START = Date.now() - 35 * 60_000;

const el = (id: number, tagName: string, attributes: Record<string, string>, childNodes: Node[] = []): Node => ({ type: 2, id, tagName, attributes, childNodes });
const tx = (id: number, textContent: string): Node => ({ type: 3, id, textContent });

const CSS = `
body{margin:0;font:16px/1.55 system-ui,-apple-system,Segoe UI,sans-serif;background:#fafaf9;color:#111}
.hd{display:flex;justify-content:space-between;padding:14px 32px;border-bottom:1px solid #e5e5e5;font:600 14px ui-monospace,monospace;background:#fff}
main{max-width:760px;margin:0 auto;padding:36px 32px}
h1{font-size:40px;letter-spacing:-.03em;margin:0 0 12px}
.bar{height:8px;background:#eee;margin:18px 0 26px}.bar>div{height:8px;background:#FF6B2B;transition:width .4s}
.btn{display:inline-block;border:1px solid #111;padding:12px 18px;font:600 14px ui-monospace,monospace;background:#fff;cursor:pointer}
.btn.on{background:#FF6B2B;color:#fff;border-color:#FF6B2B}
.quiz{margin-top:30px;border:1px solid #ddd;background:#fff;padding:18px}
.opt{display:block;width:100%;text-align:left;margin-top:8px;border:1px solid #ccc;padding:10px 12px;background:#fff;font:14px system-ui}
.opt.ok{border-color:#16a34a;background:#f0fdf4}
.res{margin-top:12px;font:600 14px ui-monospace,monospace;color:#16a34a;min-height:20px}
.long{height:1400px;margin-top:30px;background:repeating-linear-gradient(#fafaf9 0 38px,#eee 38px 40px)}
`;

function fullSnapshot(): Node {
  return {
    type: 0,
    id: 1,
    childNodes: [
      { type: 1, id: 2, name: "html", publicId: "", systemId: "" },
      el(3, "html", { lang: "en" }, [
        el(4, "head", {}, [el(5, "style", {}, [tx(6, CSS)])]),
        el(7, "body", {}, [
          el(8, "div", { class: "hd" }, [tx(9, "~/himanshu · learn / week 01 / day 01")]),
          el(10, "main", {}, [
            el(11, "h1", {}, [tx(12, "Partitioning Deep-Dive")]),
            el(13, "p", {}, [tx(14, "Split a dataset across nodes so each one owns a slice. Pick the key well and writes spread evenly; pick it badly and one hot shard melts while the rest idle.")]),
            el(15, "div", { class: "bar" }, [el(16, "div", { style: "width: 6%" })]),
            el(17, "button", { class: "btn" }, [tx(18, "Start lesson →")]),
            el(19, "div", { class: "quiz" }, [
              tx(20, "Quiz · Which partition key spreads writes evenly?"),
              el(21, "button", { class: "opt" }, [tx(22, "A · created_at (time-ordered)")]),
              el(23, "button", { class: "opt" }, [tx(24, "B · hash(user_id)")]),
              el(25, "div", { class: "res" }, [tx(26, "")]),
            ]),
            el(27, "div", { class: "long" }, [tx(28, " ")]),
          ]),
        ]),
      ]),
    ],
  };
}

function events(): Ev[] {
  const out: Ev[] = [];
  const at = (ms: number) => START + ms;
  out.push({ type: 4, timestamp: at(0), data: { href: "https://www.himanshukukreja.in/learn/system-design-mastery/week-01-data-at-scale/day-01-partitioning-deep-dive", width: W, height: H } });
  out.push({ type: 2, timestamp: at(5), data: { node: fullSnapshot(), initialOffset: { top: 0, left: 0 } } });
  const move = (from: number, to: number, path: [number, number][]) => {
    const steps = Math.max(2, Math.floor((to - from) / 180));
    for (let i = 0; i <= steps; i++) {
      const f = i / steps;
      const seg = Math.min(path.length - 2, Math.floor(f * (path.length - 1)));
      const lf = f * (path.length - 1) - seg;
      const [x1, y1] = path[seg];
      const [x2, y2] = path[seg + 1];
      out.push({ type: 3, timestamp: at(from + f * (to - from)), data: { source: 1, positions: [{ x: Math.round(x1 + (x2 - x1) * lf), y: Math.round(y1 + (y2 - y1) * lf), id: 7, timeOffset: 0 }] } });
    }
  };
  const click = (ms: number, id: number, x: number, y: number) => {
    out.push({ type: 3, timestamp: at(ms - 60), data: { source: 2, type: 1, id, x, y } });
    out.push({ type: 3, timestamp: at(ms), data: { source: 2, type: 0, id, x, y } });
    out.push({ type: 3, timestamp: at(ms + 10), data: { source: 2, type: 2, id, x, y } });
  };
  const attrs = (ms: number, id: number, attributes: Record<string, string>) => out.push({ type: 3, timestamp: at(ms), data: { source: 0, texts: [], attributes: [{ id, attributes }], removes: [], adds: [] } });
  const text = (ms: number, id: number, value: string) => out.push({ type: 3, timestamp: at(ms), data: { source: 0, texts: [{ id, value }], attributes: [], removes: [], adds: [] } });
  const scroll = (ms: number, y: number) => out.push({ type: 3, timestamp: at(ms), data: { source: 3, id: 1, x: 0, y } });

  move(400, 7800, [
    [900, 120],
    [700, 260],
    [420, 330],
    [330, 420],
    [300, 452],
  ]);
  click(8000, 17, 300, 452);
  attrs(8200, 17, { class: "btn on" });
  text(8300, 18, "Lesson started ✓");
  attrs(8400, 16, { style: "width: 22%" });
  move(9000, 19000, [
    [300, 452],
    [520, 380],
    [610, 520],
    [480, 610],
  ]);
  for (let i = 0; i <= 10; i++) scroll(20000 + i * 900, Math.round(i * 22));
  // 30 s → 75 s: idle (tab left open)
  move(75000, 86000, [
    [480, 610],
    [350, 640],
    [260, 690],
  ]);
  click(86500, 21, 260, 690);
  text(86700, 26, "Not quite: time-ordered keys pile every new write onto the newest shard.");
  attrs(86700, 25, { class: "res", style: "color:#dc2626" });
  move(88000, 97000, [
    [260, 690],
    [300, 720],
    [280, 744],
  ]);
  click(97500, 23, 280, 744);
  attrs(97700, 23, { class: "opt ok" });
  attrs(97700, 25, { class: "res" });
  text(97800, 26, "Correct ✓ hashing the key spreads writes evenly across shards.");
  attrs(98000, 16, { style: "width: 64%" });
  for (let i = 0; i <= 14; i++) scroll(102000 + i * 700, 220 + i * 40);
  move(113000, 140000, [
    [280, 600],
    [640, 420],
    [900, 300],
    [1000, 200],
  ]);
  attrs(141000, 16, { style: "width: 100%" });
  text(141200, 12, "Partitioning Deep-Dive ★ complete");
  move(142000, DURATION, [
    [1000, 200],
    [1080, 140],
  ]);
  return out.sort((a, b) => a.timestamp - b.timestamp);
}

let memo: Ev[] | null = null;
const all = () => (memo ??= events());

export function replayFixtureSources(id: string) {
  const slice = DURATION / BLOBS;
  return {
    configured: true as const,
    id,
    sources: Array.from({ length: BLOBS }, (_, k) => ({ key: k, start: new Date(START + k * slice).toISOString(), end: new Date(START + (k + 1) * slice).toISOString() })),
    start: new Date(START).toISOString(),
    end: new Date(START + DURATION).toISOString(),
    chunk: 2,
  };
}

/** JSONL `[windowId, event]` for blobs from..to (time slices of the synthetic recording). */
export function replayFixtureChunk(from: number, to: number): string {
  const slice = DURATION / BLOBS;
  const a = START + from * slice;
  const b = START + (to + 1) * slice;
  return all()
    .filter((e) => e.timestamp >= a && (e.timestamp < b || (to === BLOBS - 1 && e.timestamp <= b)))
    .map((e) => JSON.stringify(["preview-window", e]))
    .join("\n");
}
