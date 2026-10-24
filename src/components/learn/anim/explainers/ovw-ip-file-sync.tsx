/**
 * The whole problem, interview problem bank 10 (design a file sync service, Dropbox / Google Drive style):
 * requirements and the estimate (~100 PB, ~1,160 commits a second, ~9–10 Gbit/s of uploads, ~50 TB of
 * metadata, 4 MB chunks); the sync loop (ask for missing chunks, upload to S3, commit with a base revision,
 * journal + notify, other devices pull changes); the deep dives (fixed vs content-defined chunks, dedupe,
 * journal and cursors, conflicted copies); and failure modes (partial uploads, garbage, big shared folders).
 */
import { Box, defineExplainer, ease, lerp, Meter, seg, Token, Txt, Wire, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 380;
type Pt = { x: number; y: number };
type Nd = { x: number; y: number; w: number; h: number; label: string; nl?: string };
type St = { tone?: Tone; sub?: string; ns?: string; dim?: boolean };
type Row = { k: string; v: string; nv?: string; tone?: Tone; m?: number };
type Go = { r: string[]; a: number; b: number; tone?: Tone };
type Fr = { kick: string; kt?: Tone; on?: string[]; st?: Record<string, St>; rows?: Row[]; mx?: number; go?: Go[]; l: [string, string]; nl?: [string, string] };
type Sp = { c: string; f: Fr; tween?: number; ms?: number };

const N: Record<string, Nd> = {
  la: { x: 16, y: 52, w: 96, h: 56, label: "Laptop" },
  md: { x: 150, y: 52, w: 124, h: 56, label: "Metadata" },
  nt: { x: 318, y: 52, w: 108, h: 56, label: "Notify" },
  bk: { x: 150, y: 150, w: 124, h: 56, label: "Blocks" },
  s3: { x: 150, y: 256, w: 124, h: 52, label: "S3" },
  ph: { x: 470, y: 256, w: 114, h: 52, label: "Phone" },
};
const EDGES: [string, string, boolean?][] = [
  ["la", "md"],
  ["la", "bk"],
  ["bk", "s3"],
  ["md", "nt"],
  ["nt", "ph"],
  ["s3", "ph"],
];
const UP = ["la", "md", "bk", "s3"];
const ALLN = [...UP, "nt", "ph"];

const V: { id: string; label: string; steps: Sp[] }[] = [
  {
    id: "req",
    label: "Requirements",
    steps: [
      {
        c: "Keep a folder identical across devices and shared users: edits, renames and deletes converge, with version history and offline edits.",
        f: {
          kick: "the brief",
          rows: [
            { k: "sync", v: "add, edit, move, delete: all devices", nv: "every device" },
            { k: "share", v: "folders with read or edit access", nv: "shared folders" },
            { k: "history", v: "restore versions, say 30 days", nv: "30-day versions" },
            { k: "offline", v: "edits sync on reconnect", nv: "sync on reconnect" },
            { k: "conflicts", v: "surfaced, never silently dropped", nv: "never dropped", tone: "ok" },
          ],
          l: ["files up to 50 GB", "whole-file sync, not real-time co-editing"],
          nl: ["files up to 50 GB", "no co-editing"],
        },
      },
      {
        c: "Never lose a synced file, show changes on other devices within seconds, and move only the bytes that changed.",
        f: {
          kick: "non-functional",
          rows: [
            { k: "durable", v: "synced = never lost", nv: "never lost", tone: "ok" },
            { k: "fast", v: "other devices within seconds", nv: "seconds", tone: "lit" },
            { k: "efficient", v: "send only changes, store once", nv: "only changes" },
            { k: "consistent", v: "all agree on the current version", nv: "one current version" },
          ],
          l: ["storage is solved by object stores", "the interview is about sync"],
          nl: ["storage is solved", "sync is the question"],
        },
      },
      {
        c: "About 100 PB of files and ~1,160 commits a second. With 4 MB chunks, a one-paragraph edit to a 100 MB file uploads one chunk, not 25.",
        f: {
          kick: "estimate",
          rows: [
            { k: "storage", v: "50M users × 2 GB ≈ 100 PB", nv: "≈ 100 PB" },
            { k: "commits", v: "100M changes a day ≈ 1,160/s", nv: "≈ 1,160/s" },
            { k: "uploads", v: "~100 TB a day ≈ 9–10 Gbit/s", nv: "≈ 9–10 Gbit/s" },
            { k: "metadata", v: "~100B entries × 500 B ≈ 50 TB", nv: "≈ 50 TB" },
            { k: "chunks", v: "100 MB = 25 × 4 MB; edit → 1", nv: "edit → 1 chunk", tone: "ok" },
          ],
          l: ["blobs: huge, immutable, content-addressed", "metadata: small, changing, strongly consistent"],
          nl: ["blobs: object store", "metadata: sharded SQL"],
        },
      },
    ],
  },
  {
    id: "design",
    label: "Design",
    steps: [
      {
        c: "The laptop splits the changed file into 4 MB chunks, hashes each, and asks the metadata service which of the 25 chunks it lacks.",
        f: {
          kick: "1 · what's missing?",
          on: ["la", "md"],
          st: { la: { tone: "lit", sub: "25 hashes", ns: "hashes" }, md: { sub: "missing: 7", ns: "need 7" } },
          go: [{ r: ["la", "md"], a: 0.05, b: 0.6, tone: "lit" }],
          l: ["SHA-256 per chunk, computed on the client", "the server answers: only chunk 7 is new"],
          nl: ["hash each chunk", "only chunk 7 is new"],
        },
      },
      {
        c: "It uploads only chunk 7, straight to S3 through a pre-signed URL. Chunks are stored under their own hash, so the bytes are stored once.",
        f: {
          kick: "2 · upload the new chunk",
          on: UP,
          st: { bk: { tone: "lit", sub: "pre-signed", ns: "signed" }, s3: { tone: "ok", sub: "key = hash", ns: "by hash" } },
          go: [{ r: ["la", "bk", "s3"], a: 0.05, b: 0.95, tone: "lit" }],
          l: ["file bytes never pass through metadata servers", "a retried upload is naturally idempotent"],
          nl: ["bytes skip metadata", "retries are idempotent"],
        },
      },
      {
        c: "Then it commits: revision 8, based on revision 7. The metadata service checks every chunk exists and appends the change to the journal.",
        f: {
          kick: "3 · commit",
          on: UP,
          st: { md: { tone: "lit", sub: "rev 8 · j_1042", ns: "rev 8" }, la: { sub: "base 7", ns: "base 7" } },
          go: [{ r: ["la", "md"], a: 0.1, b: 0.8, tone: "lit" }],
          l: ["sharded MySQL, one shard per namespace", "check and journal append in one transaction"],
          nl: ["sharded by namespace", "one transaction"],
        },
      },
      {
        c: "The notification service wakes the phone. It asks for changes since its cursor, gets revision 8, and downloads only chunk 7.",
        f: {
          kick: "4 · the other device syncs",
          kt: "ok",
          on: ALLN,
          st: { nt: { tone: "sky", sub: "long poll", ns: "poll" }, ph: { tone: "ok", sub: "after j_1041", ns: "> j_1041" }, s3: { sub: "chunk 7", ns: "chunk 7" } },
          go: [{ r: ["md", "nt", "ph"], a: 0.05, b: 0.5, tone: "sky" }, { r: ["s3", "ph"], a: 0.55, b: 0.95, tone: "ok" }],
          l: ["the phone already has the other 24 chunks", "within seconds of the commit"],
          nl: ["it has the other 24", "within seconds"],
        },
      },
    ],
  },
  {
    id: "deep",
    label: "Deep dives",
    steps: [
      {
        c: "Fixed 4 MB chunks are ideal for in-place edits, but inserting a sentence at the start shifts every byte, so all 25 chunks change.",
        f: {
          kick: "1 · fixed chunks",
          kt: "warn",
          mx: 25,
          rows: [
            { k: "edit in place", v: "1 of 25 chunks changes", nv: "1 of 25", m: 1, tone: "ok" },
            { k: "append", v: "only the last chunk changes", nv: "last chunk", m: 1, tone: "ok" },
            { k: "insert at start", v: "every boundary shifts: 25 of 25", nv: "25 of 25", m: 25, tone: "bad" },
          ],
          l: ["simple and fast, but brittle to insertions", "the whole file re-uploads"],
          nl: ["brittle to insertions", "whole file re-uploads"],
        },
      },
      {
        c: "Content-defined chunking lets a rolling hash pick boundaries from the content itself, so an insertion only changes the chunks around it.",
        f: {
          kick: "1 · content-defined chunks",
          kt: "ok",
          rows: [
            { k: "boundaries", v: "where a rolling hash matches a pattern", nv: "set by content" },
            { k: "insertion", v: "only nearby chunks change", nv: "nearby only", tone: "ok" },
            { k: "sizes", v: "vary, e.g. 1–8 MB, around 4 MB", nv: "1–8 MB, ~4 MB" },
            { k: "dedupe", v: "within a user or namespace", nv: "per namespace", tone: "warn" },
          ],
          l: ["global dedupe leaks: 'do you have this hash?'", "require proof of the bytes, or dedupe per user"],
          nl: ["global dedupe leaks", "dedupe per user"],
        },
      },
      {
        c: "Each namespace has an append-only journal. A device stores its cursor and asks for everything after it, whether a second or a week later.",
        f: {
          kick: "2 · journal and cursors",
          rows: [
            { k: "journal", v: "append-only, numbered changes", nv: "append-only" },
            { k: "cursor", v: "the device's position: j_1041", nv: "j_1041" },
            { k: "catch up", v: "everything after the cursor", nv: "after cursor", tone: "ok" },
            { k: "replay", v: "harmless: path → revision", nv: "harmless", tone: "ok" },
          ],
          l: ["renames and deletes are journal entries too", "a rename moves no data"],
          nl: ["renames, deletes too", "a rename moves no data"],
        },
      },
      {
        c: "The laptop edited revision 7 offline; the phone already made revision 8. The commit gets a 409 and the laptop keeps a conflicted copy.",
        f: {
          kick: "2 · conflicts",
          kt: "warn",
          on: ALLN,
          st: { la: { tone: "warn", sub: "base 7", ns: "base 7" }, md: { tone: "bad", sub: "409: at rev 8", ns: "409" }, ph: { tone: "ok", sub: "made rev 8", ns: "rev 8" } },
          go: [{ r: ["la", "md"], a: 0.1, b: 0.6, tone: "warn" }],
          l: ["thesis (Alice's laptop's conflicted copy).docx", "no edit lost; the user chooses"],
          nl: ["a conflicted copy", "no edit lost"],
        },
      },
    ],
  },
  {
    id: "fail",
    label: "Trade-offs",
    steps: [
      {
        c: "If an upload crashes, its chunks sit unreferenced. The retry sends only what's missing, and nothing changes until the commit.",
        f: {
          kick: "a crash mid-upload",
          kt: "warn",
          on: UP,
          st: { la: { tone: "warn", sub: "retry", ns: "retry" }, s3: { sub: "some chunks", ns: "partial" }, md: { tone: "ok", sub: "still rev 7", ns: "rev 7" } },
          go: [{ r: ["la", "bk", "s3"], a: 0.1, b: 0.9, tone: "warn" }],
          l: ["commit last: metadata never points at missing data", "other devices never see half a file"],
          nl: ["commit last", "never half a file"],
        },
      },
      {
        c: "Deleted files and old versions leave unreferenced chunks. Mark and sweep with a grace period is safer than reference counts on every commit.",
        f: {
          kick: "garbage chunks",
          rows: [
            { k: "sources", v: "deletes, expired versions, abandoned uploads", nv: "deletes, old versions" },
            { k: "ref counts", v: "fragile on every commit", nv: "fragile", tone: "bad" },
            { k: "mark + sweep", v: "unreferenced longer than a grace period", nv: "grace period", tone: "ok" },
            { k: "deletion", v: "metadata first, chunks once unreferenced", nv: "metadata first" },
          ],
          l: ["the grace period protects in-flight uploads", "deletion must also reach backups"],
          nl: ["protects in-flight uploads", "reach backups too"],
        },
      },
      {
        c: "A folder shared by 50,000 people is one hot shard that wakes 50,000 devices per change. Batch notifications and let devices fetch lazily.",
        f: {
          kick: "big shared folders",
          kt: "warn",
          on: ALLN,
          st: { md: { tone: "warn", sub: "hot shard", ns: "hot" }, nt: { tone: "warn", sub: "50,000 wakes", ns: "50,000" } },
          go: [0, 0.2, 0.4].map((a) => ({ r: ["md", "nt", "ph"], a, b: a + 0.5, tone: "warn" as Tone })),
          l: ["batch and rate-limit the change feed", "throttle background sync; phones download on demand"],
          nl: ["batch notifications", "phones fetch on demand"],
        },
      },
    ],
  },
];

const ALL = Object.keys(N);
/** orthogonal wire from box a to box b: an elbow when they sit side by side, straight when stacked */
function pts(a: string, b: string): Pt[] {
  const p = N[a];
  const q = N[b];
  const pc = p.y + p.h / 2;
  const qc = q.y + q.h / 2;
  if (q.x >= p.x + p.w) {
    const m = Math.round((p.x + p.w + q.x) / 2);
    return [{ x: p.x + p.w, y: pc }, { x: m, y: pc }, { x: m, y: qc }, { x: q.x, y: qc }];
  }
  if (q.x + q.w <= p.x) {
    const m = Math.round((q.x + q.w + p.x) / 2);
    return [{ x: p.x, y: pc }, { x: m, y: pc }, { x: m, y: qc }, { x: q.x + q.w, y: qc }];
  }
  const x = Math.round((Math.max(p.x, q.x) + Math.min(p.x + p.w, q.x + q.w)) / 2);
  return q.y >= p.y + p.h ? [{ x, y: p.y + p.h }, { x, y: q.y }] : [{ x, y: p.y }, { x, y: q.y + q.h }];
}
const path = (ps: Pt[]) => "M" + ps.map((p) => `${p.x} ${p.y}`).join("L");
function walk(ps: Pt[], k: number): Pt {
  const lens = ps.slice(1).map((q, i) => Math.abs(q.x - ps[i].x) + Math.abs(q.y - ps[i].y));
  let d = k * lens.reduce((s, v) => s + v, 0);
  for (let i = 0; i < lens.length; i++) {
    if (d <= lens[i] || i === lens.length - 1) {
      const u = lens[i] ? Math.min(1, d / lens[i]) : 1;
      return { x: lerp(ps[i].x, ps[i + 1].x, u), y: lerp(ps[i].y, ps[i + 1].y, u) };
    }
    d -= lens[i];
  }
  return ps[ps.length - 1];
}

function Scene({ variant, step, t, narrow }: SceneProps) {
  const v = V.find((x) => x.id === variant) || V[0];
  const i = Math.min(step, v.steps.length - 1);
  const f = v.steps[i].f;
  const before = i > 0 ? v.steps[i - 1].f.on || [] : [];
  const on = f.on || [];
  const l = narrow && f.nl ? f.nl : f.l;
  return (
    <g>
      <Txt x={16} y={28} k="k" anchor="start" tone={f.kt}>
        {f.kick}
      </Txt>
      {f.rows ? (
        <g>
          <rect className="ax-box lit" x={16} y={44} width={W - 32} height={Math.min(270, 24 + f.rows.length * 50)} />
          {f.rows.map((r, j) => {
            const y = 76 + j * 50;
            return (
              <g key={r.k} opacity={ease(seg(t, j * 0.12, j * 0.12 + 0.4))}>
                <Txt x={32} y={y} k="k" anchor="start" tone="mute">
                  {r.k}
                </Txt>
                <Txt x={32} y={y + 24} anchor="start" tone={r.tone}>
                  {narrow ? r.nv || r.v : r.v}
                </Txt>
                {r.m !== undefined && <Meter x={420} y={y + 12} w={148} h={14} value={r.m * ease(seg(t, 0.2, 0.9))} max={f.mx || r.m} tone={r.tone || "sky"} />}
              </g>
            );
          })}
        </g>
      ) : (
        <g>
          {EDGES.filter(([a, b]) => on.includes(a) && on.includes(b)).map(([a, b, dash]) => (
            <Wire key={a + b} d={path(pts(a, b))} arrow dash={dash} />
          ))}
          {ALL.filter((k) => on.includes(k)).map((k) => {
            const n = N[k];
            const s = f.st?.[k] || {};
            const sub = narrow ? (s.ns ?? s.sub) : s.sub;
            return (
              <g key={k} opacity={before.includes(k) ? 1 : ease(seg(t, 0, 0.4))}>
                <Box x={n.x} y={n.y} w={n.w} h={n.h} label={narrow ? n.nl || n.label : n.label} sub={sub || undefined} tone={s.tone} dim={s.dim} />
              </g>
            );
          })}
          {f.go?.map((g, j) => {
            const q = seg(t, g.a, g.b);
            if (q <= 0 || q >= 1) return null;
            const p = walk(g.r.slice(1).flatMap((b, n) => pts(g.r[n], b)), ease(q));
            return <Token key={j} x={p.x} y={p.y} tone={g.tone} />;
          })}
        </g>
      )}
      <Txt x={16} y={H - 34} k="s" anchor="start" tone={f.kt}>
        {l[0]}
      </Txt>
      <Txt x={16} y={H - 10} k="s" anchor="start">
        {l[1]}
      </Txt>
    </g>
  );
}

export default defineExplainer({
  w: W,
  h: H,
  variants: V.map((v) => ({ id: v.id, label: v.label, steps: v.steps.map((s) => ({ caption: s.c, tween: s.tween ?? 1400, ms: s.ms ?? 3600 })) })),
  Scene,
});
