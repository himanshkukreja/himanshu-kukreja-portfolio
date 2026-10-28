"use client";

/**
 * Drop-off on /admin/shorts, from short_watch (each view's furthest point): the hook leaderboard (share of views
 * past 3 s, by first line), each short's hold, finish and the step that loses the most viewers after the hook,
 * and per short a retention curve with the narration mapped onto it (media.json step times).
 * See src/lib/learn/shorts/retention.ts.
 */
import { useEffect, useRef, useState } from "react";
import { Badge, Card, Drawer, EmptyState, ErrorState, fmtNum, LABEL, Table, Tabs, useAdminData } from "@/components/admin/ui";

type Drop = { step: number; from: number; to: number; scene: number; sceneTitle: string; lost: number };
type Summary = { id: string; views: number; duration: number; hold: number | null; finish: number | null; median: number | null; drop: Drop | null; timing: "recorded" | "estimated" | null };
type Row = Summary & { title: string; group: string; poster: string; hook: string };
type Resp = { days: number; hookSec: number; minViews: number; live: number; shorts: Row[] };
type Line = { scene: number; sceneTitle: string; say: string; from: number | null; to: number | null; lost: number | null };
type Detail = Summary & { days: number; hookSec: number; minViews: number; title: string; group: string; stale: boolean; curve: number[]; lines: Line[] };

const pc = (f: number | null | undefined) => (f == null ? "–" : `${Math.round(f * 100)}%`);
const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;

function TooFew({ n, min }: { n: number; min: number }) {
  return n < min ? (
    <Badge tone="muted" title={`under ${min} views`}>
      too few views to judge
    </Badge>
  ) : null;
}

export default function ShortsRetention({ days }: { days: number }) {
  const { data, error, loading } = useAdminData<Resp>(`/api/admin/shorts/retention?days=${days}`);
  const [tab, setTab] = useState<"best" | "worst" | "few">("best");
  const [open, setOpen] = useState<string | null>(null);
  const min = data?.minViews ?? 20;
  const rows = data?.shorts ?? [];
  const judged = rows.filter((r) => r.views >= min && r.hold != null);
  const few = rows.filter((r) => r.views < min);
  const hooks = tab === "best" ? [...judged].sort((a, b) => b.hold! - a.hold! || b.views - a.views).slice(0, 10) : tab === "worst" ? [...judged].sort((a, b) => a.hold! - b.hold! || b.views - a.views).slice(0, 10) : [...few].sort((a, b) => b.views - a.views);
  const busy = loading && !data;
  const current = open ? rows.find((r) => r.id === open) : undefined;

  return (
    <>
      {error && <ErrorState error={error} title="Couldn't load drop-off" />}
      <Card label="hooks" title={`Best and worst first lines: share of views past ${data?.hookSec ?? 3} s`} pad={false}>
        <div className="px-4 pt-3">
          <Tabs
            label="Hooks"
            tabs={[
              { id: "best", label: "best hooks", count: Math.min(10, judged.length) },
              { id: "worst", label: "worst hooks", count: Math.min(10, judged.length) },
              { id: "few", label: "too few views", count: few.length },
            ]}
            value={tab}
            onChange={setTab}
          />
          <p className="m-0 py-2 font-mono text-[11px] text-fg-3">
            {tab === "few" ? `Under ${min} views: shown, not ranked.` : `Ranked only with ${min}+ views in ${days} days (${judged.length} shorts so far).`}
          </p>
        </div>
        <Table<Row>
          rowKey={(r) => r.id}
          rows={hooks}
          loading={busy}
          minWidth={640}
          dense
          onRowClick={(r) => setOpen(r.id)}
          empty={<EmptyState title={tab === "few" ? "Every watched short has enough views" : `No short has ${min} views yet`} hint={tab === "few" ? undefined : "The leaderboard fills in as the feed gets watched."} />}
          columns={[
            {
              key: "hook",
              header: "First line",
              render: (r) => (
                <span className="flex min-w-0 flex-col">
                  <span className="line-clamp-2 text-[13px] text-fg">“{r.hook}”</span>
                  <span className="truncate font-mono text-[10px] text-fg-4">{r.title}</span>
                </span>
              ),
            },
            { key: "hold", header: "Past 3 s", align: "right", render: (r) => <span className="font-mono tabular-nums text-fg">{pc(r.hold)}</span> },
            { key: "views", header: "Views", align: "right", render: (r) => <span className="font-mono tabular-nums">{fmtNum(r.views)}</span> },
            { key: "judge", header: "", render: (r) => <TooFew n={r.views} min={min} /> },
          ]}
        />
      </Card>

      <Card label="drop-off" title="Where viewers leave each short" pad={false}>
        <Table<Row>
          rowKey={(r) => r.id}
          rows={rows}
          loading={busy}
          minWidth={920}
          dense
          onRowClick={(r) => setOpen(r.id)}
          initialSort={{ key: "views", dir: "desc" }}
          empty={<EmptyState title="No tracked views in this range" hint="short_watch events start 28 Oct 2026." />}
          columns={[
            {
              key: "title",
              header: "Short",
              className: "max-w-[300px]",
              sort: (r) => r.title,
              render: (r) => (
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-[13px] text-fg">{r.title}</span>
                  <span className="truncate font-mono text-[10px] text-fg-4">{r.group}</span>
                </span>
              ),
            },
            { key: "views", header: "Views", align: "right", sort: (r) => r.views, render: (r) => fmtNum(r.views) },
            { key: "hold", header: "Past 3 s", align: "right", sort: (r) => r.hold ?? -1, render: (r) => pc(r.hold) },
            { key: "finish", header: "Finished", align: "right", sort: (r) => r.finish ?? -1, render: (r) => pc(r.finish) },
            { key: "median", header: "Half leave by", align: "right", hideOnPhone: true, sort: (r) => (r.median ?? 0) / (r.duration || 1), render: (r) => (r.median != null ? `${mmss(r.median)} / ${mmss(r.duration)}` : "–") },
            {
              key: "drop",
              header: "Biggest drop after the hook",
              className: "max-w-[240px]",
              sort: (r) => r.drop?.lost ?? -1,
              render: (r) =>
                r.drop ? (
                  <span className="flex min-w-0 flex-col">
                    <span className="whitespace-nowrap font-mono text-xs text-fg">
                      −{pc(r.drop.lost)} <span className="text-fg-3">at {mmss(r.drop.from)}–{mmss(r.drop.to)}</span>
                    </span>
                    <span className="truncate font-mono text-[10px] text-fg-4">{r.drop.sceneTitle}</span>
                  </span>
                ) : (
                  "–"
                ),
            },
            { key: "judge", header: "", hideOnPhone: true, render: (r) => <TooFew n={r.views} min={min} /> },
          ]}
        />
      </Card>

      <Drawer open={!!current} onClose={() => setOpen(null)} label={current?.group} title={current?.title} width={720}>
        {current && <RetentionDetail id={current.id} days={days} />}
      </Drawer>
    </>
  );
}

function RetentionDetail({ id, days }: { id: string; days: number }) {
  const { data: d, error } = useAdminData<Detail>(`/api/admin/shorts/retention?days=${days}&id=${encodeURIComponent(id)}`);
  if (error) return <ErrorState error={error} title="Couldn't load this short's drop-off" />;
  if (!d) return <span className="font-mono text-xs text-fg-3">loading…</span>;
  const maxLost = Math.max(0.0001, ...d.lines.map((l) => l.lost ?? 0));
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ["views", fmtNum(d.views)],
          [`past ${d.hookSec} s`, pc(d.hold)],
          ["finished", pc(d.finish)],
          ["half leave by", d.median != null ? mmss(d.median) : "–"],
        ].map(([k, v]) => (
          <div key={k} className="border border-line bg-surface-2 px-3 py-2">
            <div className={LABEL}>{k}</div>
            <div className="font-mono text-lg tabular-nums text-fg">{v}</div>
          </div>
        ))}
      </div>
      {d.views < d.minViews && (
        <p className="m-0 font-mono text-[11px] text-fg-3">
          <TooFew n={d.views} min={d.minViews} /> Only {d.views} view{d.views === 1 ? "" : "s"} in {d.days} days: read the shape, not the numbers.
        </p>
      )}
      {d.views ? <RetentionChart d={d} /> : <EmptyState title="No tracked views in this range" />}
      <p className="m-0 font-mono text-[11px] text-fg-4">
        A view counts at second t if its furthest point reached t. {d.timing === "estimated" ? "No recorded step times: lines are placed by word count." : "Lines are placed by the recorded narration's step times."}
        {d.stale ? " The recording was made from an older script; times may be slightly off." : ""}
      </p>
      <section className="flex flex-col gap-2">
        <h3 className="m-0 text-[15px] font-semibold text-fg">The narration, and who left during each line</h3>
        <ol className="m-0 flex list-none flex-col p-0">
          {d.lines.map((l, i) => {
            const isDrop = d.drop?.step === i;
            const newScene = i === 0 || d.lines[i - 1].scene !== l.scene;
            return (
              <li key={i} className={`flex flex-col gap-1 border-line py-2 ${newScene ? "border-t" : ""} ${isDrop ? "bg-bad/10 px-2" : ""}`}>
                {newScene && <span className={LABEL}>{l.sceneTitle}</span>}
                <div className="flex items-start gap-3">
                  <span className="w-[74px] shrink-0 font-mono text-[11px] tabular-nums text-fg-3">{l.from != null && l.to != null ? `${mmss(l.from)}–${mmss(l.to)}` : "–"}</span>
                  <span className="min-w-0 flex-1 text-[13px] leading-relaxed text-fg-2">{l.say}</span>
                  <span className="flex w-[92px] shrink-0 items-center justify-end gap-1.5">
                    {l.lost != null && (
                      <>
                        <span aria-hidden className="block h-1.5 bg-fg-4" style={{ width: `${Math.round((l.lost / maxLost) * 40)}px` }} />
                        <span className="font-mono text-[11px] tabular-nums text-fg">{l.lost ? `−${pc(l.lost)}` : "0%"}</span>
                      </>
                    )}
                  </span>
                </div>
                {isDrop && <span className="font-mono text-[11px] font-semibold text-bad-text">biggest drop after the hook</span>}
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}

/** Retention curve: % of views still watching at each second, the hook line at 3 s, scenes as bands, the biggest drop marked. */
function RetentionChart({ d }: { d: Detail }) {
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const h = 240;
  const padL = 40;
  const padR = 12;
  const padT = 22;
  const padB = 26;
  const iw = Math.max(10, w - padL - padR);
  const ih = h - padT - padB;
  const dur = Math.max(1, d.duration);
  const x = (t: number) => padL + (Math.min(t, dur) / dur) * iw;
  const y = (v: number) => padT + ih - (v / 100) * ih;
  const pts = d.curve.map((v, t) => `${t ? "L" : "M"}${x(t).toFixed(1)},${y(v).toFixed(1)}`).join("");
  // scene bands from the lines' times
  const scenes: { from: number; to: number; title: string; k: number }[] = [];
  for (const l of d.lines) {
    if (l.from == null || l.to == null) continue;
    const last = scenes[scenes.length - 1];
    if (last && last.k === l.scene) last.to = l.to;
    else scenes.push({ from: l.from, to: l.to, title: l.sceneTitle, k: l.scene });
  }
  const lineAt = (t: number) => d.lines.find((l) => l.from != null && l.to != null && t >= l.from && t < l.to) ?? d.lines.at(-1);
  const xTicks = Array.from({ length: Math.floor(dur / 10) + 1 }, (_, i) => i * 10);
  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const t = Math.round(((e.clientX - r.left) / r.width) * dur);
    setHover(Math.max(0, Math.min(d.curve.length - 1, t)));
  };
  const hl = hover != null ? lineAt(hover) : null;
  return (
    <div ref={box} className="relative w-full" style={{ height: h }}>
      {w > 0 && (
        <svg width={w} height={h} role="img" aria-label={`Retention curve of ${d.title}: ${pc(d.hold)} past 3 seconds, ${pc(d.finish)} finished`} className="block overflow-visible">
          {scenes.map((s, i) => (
            <rect key={i} x={x(s.from)} y={padT} width={Math.max(0, x(s.to) - x(s.from))} height={ih} fill={i % 2 ? "var(--c-surface-2)" : "transparent"} opacity="0.7">
              <title>{s.title}</title>
            </rect>
          ))}
          {d.drop && <rect x={x(d.drop.from)} y={padT} width={Math.max(2, x(d.drop.to) - x(d.drop.from))} height={ih} fill="var(--c-bad)" opacity="0.14" />}
          {d.drop && (
            <text x={x(d.drop.from) + 4} y={padT - 8} className="fill-fg-2 font-mono text-[10px]">
              biggest drop −{pc(d.drop.lost)}
            </text>
          )}
          {[0, 25, 50, 75, 100].map((v) => (
            <g key={v}>
              <line x1={padL} x2={w - padR} y1={y(v)} y2={y(v)} stroke="var(--c-line)" strokeDasharray={v ? "2 4" : undefined} />
              <text x={padL - 8} y={y(v)} dy="0.32em" textAnchor="end" className="fill-fg-4 font-mono text-[10px]">
                {v}%
              </text>
            </g>
          ))}
          {xTicks.map((t) => (
            <text key={t} x={x(t)} y={h - 8} textAnchor={t === 0 ? "start" : "middle"} className="fill-fg-4 font-mono text-[10px]">
              {mmss(t)}
            </text>
          ))}
          <line x1={x(d.hookSec)} x2={x(d.hookSec)} y1={padT} y2={padT + ih} stroke="var(--c-fg-3)" strokeDasharray="3 3" />
          <text x={x(d.hookSec) + 4} y={padT + 10} className="fill-fg-3 font-mono text-[10px]">
            {d.hookSec} s
          </text>
          <path d={`${pts}L${x(d.curve.length - 1)},${y(0)}L${x(0)},${y(0)}Z`} fill="var(--c-signal)" opacity="0.08" />
          <path d={pts} fill="none" stroke="var(--c-signal)" strokeWidth="2" strokeLinejoin="round" />
          {hover != null && (
            <g pointerEvents="none">
              <line x1={x(hover)} x2={x(hover)} y1={padT} y2={padT + ih} stroke="var(--c-fg-3)" />
              <rect x={x(hover) - 4} y={y(d.curve[hover]) - 4} width="8" height="8" fill="var(--c-signal)" stroke="var(--c-surface)" strokeWidth="2" />
            </g>
          )}
          <rect x={padL} y={padT} width={iw} height={ih} fill="transparent" onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHover(null)} style={{ touchAction: "pan-y" }} />
        </svg>
      )}
      {hover != null && w > 0 && (
        <div
          className="pointer-events-none absolute top-6 z-10 w-[240px] border border-line-strong bg-surface px-3 py-2 shadow-[0_8px_24px_rgba(0,0,0,0.25)]"
          style={x(hover) > w / 2 ? { right: w - x(hover) + 12 } : { left: x(hover) + 12 }}
        >
          <div className="flex justify-between font-mono text-[11px] text-fg-3">
            <span>{mmss(hover)}</span>
            <span className="text-fg">{Math.round(d.curve[hover])}% still watching</span>
          </div>
          {hl && (
            <>
              <div className="mt-1 font-mono text-[10px] uppercase tracking-label text-fg-4">{hl.sceneTitle}</div>
              <div className="mt-0.5 line-clamp-3 text-xs text-fg-2">{hl.say}</div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
