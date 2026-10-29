"use client";

/**
 * /admin/course/dropoff: how far readers get through each lesson, section by section, and where they stop.
 * Pick a week and a lesson for its section funnel (readers who reached each section, share of starters, drop
 * from the previous section with the largest ones marked, where readers stopped, who genuinely read it, median
 * time to reach it); the summary ranks lessons by completion and by their worst single-section drop.
 * Data: GET /api/admin/course/dropoff (src/lib/admin/dropoff). Sections under the sample-size line are greyed.
 */
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ExternalLink } from "lucide-react";
import { adminFetch } from "@/lib/admin/fetch";
import { Badge, Card, EmptyState, ErrorState, Kpi, LABEL, PageHead, RangePicker, Skeleton, Table, Tabs, fmtDuration, fmtNum, useAdminClient, useRange, type Column } from "@/components/admin/ui";
import { cx } from "@/components/admin/learners/bits";
import type { DropoffDetail, DropoffLessonRow, DropoffResponse, SectionStat } from "@/lib/admin/dropoff/aggregate";
import CourseTabs from "./CourseTabs";

const PREVIEW_HEADER = "x-hk-admin-preview";
const RANGE_OPTIONS = ["7d", "30d", "90d"] as const;
/** a median time from fewer visits than this is shown faint */
const MIN_TIMED = 5;

const pc = (f: number | null | undefined) => (f == null ? "–" : `${Math.round(f * 100)}%`);

/** JSON from an admin API; the dev preview sends its header so the server answers with sample data. */
function useJson() {
  const client = useAdminClient();
  return useCallback(
    async <T,>(url: string): Promise<T> => {
      if (!client.preview) return client.json<T>(url);
      const res = await adminFetch(url, { headers: { [PREVIEW_HEADER]: "1" } });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw Object.assign(new Error(body?.error || `HTTP ${res.status}`), { status: res.status });
      return body as T;
    },
    [client],
  );
}

function useLoad<T>(url: string) {
  const json = useJson();
  const [state, setState] = useState<{ url: string; data?: T; error?: Error }>({ url: "" });
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    let off = false;
    json<T>(url)
      .then((data) => !off && setState({ url, data }))
      .catch((error: Error) => !off && setState({ url, error }));
    return () => {
      off = true;
    };
  }, [url, nonce, json]);
  return { data: state.url === url ? state.data : undefined, stale: state.data, error: state.url === url ? state.error : undefined, reload: () => setNonce((n) => n + 1) };
}

export default function DropoffPage() {
  const range = useRange("30d");
  const days = range === "7d" ? 7 : range === "90d" ? 90 : 30;
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const lessonParam = params.get("lesson") || "";
  const { data: fresh, stale, error, reload } = useLoad<DropoffResponse>(`/api/admin/course/dropoff?days=${days}${lessonParam ? `&lesson=${encodeURIComponent(lessonParam)}` : ""}`);
  // keep the previous answer on screen while a new lesson or window loads
  const data = fresh ?? stale;
  const loading = !fresh;

  const setParam = useCallback(
    (k: string, v: string) => {
      const next = new URLSearchParams(params.toString());
      next.set(k, v);
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [params, pathname, router],
  );

  // no lesson picked: the most-read lesson of the window
  const fallback = useMemo(() => {
    if (!data) return "";
    const top = [...data.lessons].sort((a, b) => b.starters - a.starters || a.order - b.order)[0];
    return top?.starters ? top.key : (data.lessons[0]?.key ?? "");
  }, [data]);
  useEffect(() => {
    if (!lessonParam && fallback) setParam("lesson", fallback);
  }, [lessonParam, fallback, setParam]);

  const pick = (key: string, scroll = false) => {
    setParam("lesson", key);
    if (scroll) window.requestAnimationFrame(() => document.getElementById("funnel")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  const kpis = useMemo(() => {
    if (!data) return null;
    const opened = data.lessons.filter((l) => l.starters > 0);
    const judged = opened.filter((l) => l.starters >= data.minReaders);
    const comp = judged.map((l) => l.completion).sort((a, b) => a - b);
    const worst = judged.filter((l) => l.worst).sort((a, b) => b.worst!.share - a.worst!.share)[0];
    return { opened: opened.length, judged: judged.length, medComp: comp.length ? comp[Math.floor((comp.length - 1) / 2)] : null, worst };
  }, [data]);

  return (
    <div>
      <PageHead
        path="sudo ~/admin/course/dropoff"
        title="Section drop-off"
        sub={<>How far readers get through each lesson, section by section, and where they stop. From the reader&apos;s own lesson_open / stage_reach events (guests included, the owner&apos;s test traffic left out), last {days} days.</>}
        actions={<RangePicker options={RANGE_OPTIONS} fallback="30d" />}
      />
      <CourseTabs />
      {data?.sample && (
        <p className="mb-4 border border-dashed border-signal bg-signal/10 px-3 py-2 font-mono text-xs text-fg">
          <span className="font-semibold text-signal-text">SAMPLE</span> · DROPOFF_FIXTURES=1: generated readers on real lessons, run through the real aggregation.
        </p>
      )}
      {error && !data ? (
        <ErrorState error={error} onRetry={reload} title="Drop-off unavailable" />
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label={`readers · ${days} days`} loading={!data} value={fmtNum(data?.readers)} hint={data ? `${fmtNum(data.events)} lesson events` : undefined} />
            <Kpi label="lessons opened" loading={!data} value={kpis ? fmtNum(kpis.opened) : "–"} hint={kpis && data ? `${kpis.judged} with ${data.minReaders}+ readers` : undefined} />
            <Kpi label="median completion" loading={!data} value={pc(kpis?.medComp)} hint={`reached the last section · lessons with ${data?.minReaders ?? 20}+ readers`} />
            <Kpi
              label="worst single drop"
              loading={!data}
              value={kpis?.worst ? `−${pc(kpis.worst.worst!.share)}` : "–"}
              hint={kpis?.worst ? `${kpis.worst.tag} · into “${kpis.worst.worst!.title}”` : "needs a section with 20+ readers"}
            />
          </div>

          <FunnelCard data={data} loading={loading} lessonKey={lessonParam || fallback} onPick={pick} />

          <SummaryCard data={data} onPick={(k) => pick(k, true)} />

          <Card label="how it's counted" title="Reading the numbers" className="mt-6">
            <ul className="m-0 flex list-disc flex-col gap-1.5 pl-5 text-sm text-fg-3">
              <li>
                <b className="text-fg-2">Reader</b>: a signed-in learner, or a browser for guests (a browser that later signed in counts once). <b className="text-fg-2">Starters</b>: readers who opened the lesson in the window.
              </li>
              <li>
                <b className="text-fg-2">Reached</b>: the furthest section a reader scrolled into in the window (any visit), so everything before it counts too. Jumping ahead from the contents counts as reaching; <b className="text-fg-2">read</b> is the stricter
                count: readers whose reading time cleared the section (stage_done).
              </li>
              <li>
                <b className="text-fg-2">Drop</b> on a row is the readers lost between the section above and this one: they stopped in the section above. <b className="text-fg-2">Stopped here</b> is the same seen from the section they stopped in.
                Up to 3 drops are marked: the largest, and any at least half its size (10% or more), only where the section above had {data?.minReaders ?? 20}+ readers.
              </li>
              <li>
                <b className="text-fg-2">Time to reach</b>: wall-clock time from opening the lesson to entering the section in the same visit, only for visits that started at the top (resumed visits are left out); the median, with the
                number of visits.
              </li>
              <li>Sections with fewer than {data?.minReaders ?? 20} readers are greyed: read their shape, not their numbers. Events from a heading that has since been renamed are counted as unmatched.</li>
            </ul>
          </Card>
        </>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ funnel

function FunnelCard({ data, loading, lessonKey, onPick }: { data?: DropoffResponse; loading: boolean; lessonKey: string; onPick: (k: string) => void }) {
  const lessons = data?.lessons ?? [];
  const sel = lessons.find((l) => l.key === lessonKey);
  // the week follows the lesson (picking a week opens its most-read lesson)
  const week = sel?.weekCode ?? data?.weeks[0]?.code ?? "";
  const inWeek = lessons.filter((l) => l.weekCode === week);
  const d = data?.detail && data.detail.key === lessonKey ? data.detail : null;
  const weekLabel = (code: string, title: string) => (/^\d+$/.test(code) ? `W${code} · ${title}` : title);

  return (
    <Card id="funnel" label="section funnel" title={d ? `${d.tag} · ${d.title}` : "Pick a lesson"} className="mb-6" pad={false}>
      <div className="grid gap-3 border-b border-line p-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className={LABEL}>week</span>
          <select
            value={week}
            disabled={!data}
            onChange={(e) => {
              const first = lessons.filter((l) => l.weekCode === e.target.value).sort((a, b) => b.starters - a.starters || a.order - b.order)[0];
              if (first) onPick(first.key);
            }}
            className="h-10 w-full border border-line-strong bg-surface px-2 text-sm text-fg focus:border-signal focus:outline-none"
          >
            {(data?.weeks ?? []).map((w) => {
              const n = lessons.filter((l) => l.weekCode === w.code).reduce((a, l) => a + l.starters, 0);
              return (
                <option key={w.code} value={w.code}>
                  {weekLabel(w.code, w.title)}
                  {n ? ` (${n})` : ""}
                </option>
              );
            })}
          </select>
        </label>
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className={LABEL}>lesson</span>
          <select
            value={inWeek.some((l) => l.key === lessonKey) ? lessonKey : ""}
            disabled={!data}
            onChange={(e) => onPick(e.target.value)}
            className="h-10 w-full border border-line-strong bg-surface px-2 text-sm text-fg focus:border-signal focus:outline-none"
          >
            {!inWeek.some((l) => l.key === lessonKey) && <option value="">choose a lesson</option>}
            {inWeek.map((l) => (
              <option key={l.key} value={l.key}>
                {l.title} · {l.starters ? `${l.starters} reader${l.starters === 1 ? "" : "s"}` : "no readers"}
              </option>
            ))}
          </select>
        </label>
      </div>

      {!d ? (
        <div className="p-4">{loading || !data ? <Skeleton className="h-64 w-full" /> : <EmptyState title="No lesson selected" hint="Pick a week and a lesson above." />}</div>
      ) : (
        <LessonFunnel d={d} minReaders={data!.minReaders} loading={loading} />
      )}
    </Card>
  );
}

function LessonFunnel({ d, minReaders, loading }: { d: DropoffDetail; minReaders: number; loading: boolean }) {
  if (!d.sections.length) return <EmptyState className="m-4" title="No sections" hint="This lesson renders as a single page, or its markdown couldn't be read." />;
  return (
    <div className={cx("transition-opacity", loading && "opacity-60")}>
      <div className="grid grid-cols-2 gap-px border-b border-line bg-line sm:grid-cols-4">
        {[
          ["starters", fmtNum(d.starters)],
          ["reached the end", d.starters ? `${pc(d.completion)} · ${fmtNum(d.finished)}` : "–"],
          ["completed (read)", d.starters ? `${pc(d.completed / d.starters)} · ${fmtNum(d.completed)}` : "–"],
          ["worst drop", d.worst ? `−${pc(d.worst.share)} · §${d.worst.index + 1}` : "–"],
        ].map(([k, v]) => (
          <div key={k} className="bg-surface px-4 py-2.5">
            <div className={LABEL}>{k}</div>
            <div className="font-mono text-lg tabular-nums text-fg">{v}</div>
          </div>
        ))}
      </div>
      {d.starters === 0 ? (
        <EmptyState className="m-4" title="Nobody opened this lesson in the window" hint="Try a longer range." />
      ) : (
        <>
          {d.starters < minReaders && (
            <p className="m-0 border-b border-line px-4 py-2 font-mono text-[11px] text-fg-3">
              <Badge tone="muted">small sample</Badge> {d.starters} starter{d.starters === 1 ? "" : "s"}: every section is under {minReaders} readers, so read the shape, not the numbers.
            </p>
          )}
          <div className="relative max-w-full overflow-x-auto">
            <table className="w-full table-fixed border-collapse text-[13px] sm:table-auto sm:min-w-[860px]">
              <caption className="sr-only">Readers reaching each section of {d.title}</caption>
              <thead>
                <tr className="border-b border-line bg-surface-2/60 text-left font-mono text-[11px] uppercase tracking-label text-fg-3">
                  <th scope="col" className="px-3 py-2 font-normal">
                    section
                  </th>
                  <th scope="col" className="hidden px-3 py-2 text-right font-normal sm:table-cell">
                    reached
                  </th>
                  <th scope="col" className="hidden px-3 py-2 text-right font-normal sm:table-cell">
                    of starters
                  </th>
                  <th scope="col" className="hidden px-3 py-2 text-right font-normal sm:table-cell">
                    drop from prev
                  </th>
                  <th scope="col" className="hidden px-3 py-2 text-right font-normal sm:table-cell">
                    stopped here
                  </th>
                  <th scope="col" className="hidden px-3 py-2 text-right font-normal sm:table-cell">
                    read
                  </th>
                  <th scope="col" className="hidden px-3 py-2 text-right font-normal sm:table-cell">
                    time to reach
                  </th>
                </tr>
              </thead>
              <tbody>
                {d.sections.map((s) => (
                  <SectionRow key={s.id} s={s} d={d} last={s.index === d.sections.length - 1} />
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line px-4 py-2.5 font-mono text-[11px] text-fg-3">
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 bg-signal/35" /> reached
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 bg-signal" /> read (stage_done)
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 bg-bad/25" /> largest drops
            </span>
            <span className="inline-flex items-center gap-1.5 opacity-50">
              <span className="inline-block h-2.5 w-2.5 bg-fg-4" /> under {minReaders} readers
            </span>
            {d.unmatched > 0 && <span className="text-fg-4">{d.unmatched} event{d.unmatched === 1 ? "" : "s"} from headings no longer in the lesson</span>}
          </div>
        </>
      )}
    </div>
  );
}

function SectionRow({ s, d, last }: { s: SectionStat; d: DropoffDetail; last: boolean }) {
  const read = d.starters ? s.read / d.starters : 0;
  const tip = `${s.label ? `${s.label} · ` : ""}${s.title}\nreached ${s.reached} (${pc(s.pct)} of ${d.starters} starters)${s.drop != null ? ` · lost ${s.drop} since the section above` : ""}\nstopped here ${s.stopped}${last ? " (finished)" : ""} · read ${s.read}${s.minutes ? ` · ~${s.minutes} min` : ""}`;
  return (
    <tr className={cx("border-b border-line last:border-0", s.highlight && "bg-bad/10")} title={tip}>
      <td className={cx("max-w-[420px] px-3 py-2 align-middle", s.lowSample && "opacity-50")}>
        <span className="flex items-baseline gap-2">
          <span className="w-6 shrink-0 text-right font-mono text-[11px] tabular-nums text-fg-4">{s.index + 1}</span>
          {s.label && s.label !== s.title && <span className="shrink-0 font-mono text-[11px] text-fg-3">{s.label}</span>}
          <Link href={`${d.href}#${s.id}`} target="_blank" className="group min-w-0 truncate text-fg hover:underline hover:underline-offset-4">
            {s.title}
            <ExternalLink aria-hidden className="ml-1 inline h-3 w-3 text-fg-4 opacity-0 group-hover:opacity-100" />
          </Link>
          {s.minutes ? <span className="shrink-0 font-mono text-[10px] text-fg-4">{s.minutes}m</span> : null}
        </span>
        <span className="relative ml-8 mt-1 block h-2 bg-surface-2">
          <span className="absolute inset-y-0 left-0 bg-signal/35" style={{ width: `${s.pct * 100}%` }} />
          <span className="absolute inset-y-0 left-0 bg-signal" style={{ width: `${read * 100}%` }} />
        </span>
        <span className="ml-8 mt-1 flex flex-wrap gap-x-3 font-mono text-[11px] tabular-nums text-fg-3 sm:hidden">
          <span className="text-fg">{fmtNum(s.reached)}</span>
          <span>{pc(s.pct)}</span>
          {s.dropShare != null && <span className={s.highlight ? "font-semibold text-bad-text" : ""}>{s.drop ? `−${pc(s.dropShare)}` : "0%"}</span>}
          <span>read {s.read}</span>
          {s.medianSec != null && <span>{fmtDuration(s.medianSec)}</span>}
        </span>
      </td>
      <td className={cx("hidden px-3 py-2 text-right sm:table-cell font-mono tabular-nums text-fg", s.lowSample && "opacity-50")}>{fmtNum(s.reached)}</td>
      <td className={cx("hidden px-3 py-2 text-right sm:table-cell font-mono tabular-nums text-fg-2", s.lowSample && "opacity-50")}>{pc(s.pct)}</td>
      <td className="hidden px-3 py-2 text-right sm:table-cell font-mono tabular-nums">
        {s.dropShare == null ? (
          <span className="text-fg-4">start</span>
        ) : (
          <span className={cx("inline-flex items-center justify-end gap-1.5", s.highlight ? "font-semibold text-bad-text" : s.lowSample ? "text-fg-4" : "text-fg-2")}>
            {s.highlight && <Badge tone="bad">big drop</Badge>}
            {s.drop ? `−${pc(s.dropShare)}` : "0%"}
            <span className="text-[11px] font-normal text-fg-4">{s.drop ? `(${s.drop})` : ""}</span>
          </span>
        )}
      </td>
      <td className={cx("hidden px-3 py-2 text-right sm:table-cell font-mono tabular-nums", s.lowSample ? "text-fg-4" : "text-fg-2")}>
        {s.stopped ? fmtNum(s.stopped) : <span className="text-fg-4">·</span>}
        {last && s.stopped > 0 && <span className="ml-1 text-[10px] text-fg-4">finished</span>}
      </td>
      <td className={cx("hidden px-3 py-2 text-right sm:table-cell font-mono tabular-nums", s.lowSample ? "text-fg-4" : "text-signal-text")}>{s.read ? fmtNum(s.read) : <span className="text-fg-4">·</span>}</td>
      <td className="hidden px-3 py-2 text-right sm:table-cell font-mono tabular-nums">
        {s.index === 0 ? (
          <span className="text-fg-4">0s</span>
        ) : s.medianSec == null ? (
          <span className="text-fg-4">–</span>
        ) : (
          <span className={s.timed < MIN_TIMED ? "text-fg-4" : "text-fg-2"} title={`median of ${s.timed} visit${s.timed === 1 ? "" : "s"} that started at the top`}>
            {fmtDuration(s.medianSec)} <span className="text-[10px] text-fg-4">n={s.timed}</span>
          </span>
        )}
      </td>
    </tr>
  );
}

// ------------------------------------------------------------------ summary

type SummaryTab = "completion" | "drop" | "few";

function SummaryCard({ data, onPick }: { data?: DropoffResponse; onPick: (k: string) => void }) {
  const [tab, setTab] = useState<SummaryTab>("completion");
  const min = data?.minReaders ?? 20;
  const opened = (data?.lessons ?? []).filter((l) => l.starters > 0);
  const judged = opened.filter((l) => l.starters >= min);
  const few = opened.filter((l) => l.starters < min);
  const rows = tab === "completion" ? judged : tab === "drop" ? judged.filter((l) => l.worst) : few;
  const initialSort = tab === "completion" ? ({ key: "completion", dir: "asc" } as const) : tab === "drop" ? ({ key: "worst", dir: "desc" } as const) : ({ key: "starters", dir: "desc" } as const);

  const cols: Column<DropoffLessonRow>[] = [
    {
      key: "lesson",
      header: "lesson",
      className: "max-w-[340px]",
      sort: (l) => l.order,
      render: (l) => (
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-[13px] text-fg">{l.title}</span>
          <span className="truncate font-mono text-[10px] text-fg-4">{l.tag}</span>
        </span>
      ),
    },
    { key: "starters", header: "starters", align: "right", sort: (l) => l.starters, render: (l) => <span className="font-mono tabular-nums text-fg">{fmtNum(l.starters)}</span> },
    {
      key: "completion",
      header: "reached end",
      align: "right",
      sort: (l) => l.completion,
      render: (l) => (
        <span className="font-mono tabular-nums">
          <span className={cx(l.starters >= min && l.completion < 0.3 ? "text-bad-text" : "text-fg")}>{pc(l.completion)}</span> <span className="text-[11px] text-fg-4">({l.finished})</span>
        </span>
      ),
    },
    {
      key: "completed",
      header: "completed",
      align: "right",
      hideOnPhone: true,
      sort: (l) => (l.starters ? l.completed / l.starters : 0),
      render: (l) => <span className="font-mono tabular-nums text-fg-2">{l.starters ? pc(l.completed / l.starters) : "–"}</span>,
    },
    {
      key: "worst",
      header: "worst single drop",
      className: "max-w-[300px]",
      sort: (l) => l.worst?.share ?? -1,
      render: (l) =>
        l.worst ? (
          <span className="flex min-w-0 flex-col">
            <span className="whitespace-nowrap font-mono text-xs text-fg">
              <span className={l.worst.share >= 0.3 ? "text-bad-text" : ""}>−{pc(l.worst.share)}</span>{" "}
              <span className="text-fg-3">
                into §{l.worst.index + 1} · {l.worst.lost} of {l.worst.from}
              </span>
            </span>
            <span className="truncate font-mono text-[10px] text-fg-4">{l.worst.title}</span>
          </span>
        ) : (
          <span className="font-mono text-[11px] text-fg-4">{l.starters < min ? "too few readers" : "–"}</span>
        ),
    },
    { key: "sections", header: "sections", align: "right", hideOnPhone: true, sort: (l) => l.sections, render: (l) => <span className="font-mono tabular-nums text-fg-3">{l.sections || "–"}</span> },
  ];

  return (
    <Card label="lessons" title="Where the course loses readers" pad={false}>
      <div className="px-4 pt-3">
        <Tabs<SummaryTab>
          label="Rank lessons"
          tabs={[
            { id: "completion", label: "lowest completion", count: data ? judged.length : null },
            { id: "drop", label: "worst single drop", count: data ? judged.filter((l) => l.worst).length : null },
            { id: "few", label: "too few readers", count: data ? few.length : null },
          ]}
          value={tab}
          onChange={setTab}
        />
        <p className="m-0 py-2 font-mono text-[11px] text-fg-3">
          {tab === "few" ? `Under ${min} starters in ${data?.days ?? 30} days: shown, not ranked.` : `Ranked only with ${min}+ starters in ${data?.days ?? 30} days. Click a lesson for its section funnel.`}
          {data?.orphanEvents ? ` ${data.orphanEvents} events are on lessons the course no longer has.` : ""}
        </p>
      </div>
      <Table<DropoffLessonRow>
        key={tab}
        columns={cols}
        rows={rows}
        rowKey={(l) => l.key}
        loading={!data}
        onRowClick={(l) => onPick(l.key)}
        initialSort={initialSort}
        minWidth={600}
        className="max-h-[560px] overflow-y-auto border-x-0 border-b-0"
        dense
        empty={
          <EmptyState
            className="m-4"
            title={tab === "few" ? "Every opened lesson has enough readers" : `No lesson has ${min} starters in this range yet`}
            hint={tab === "few" ? undefined : "Try 90 days, or look under “too few readers”."}
          />
        }
      />
    </Card>
  );
}
