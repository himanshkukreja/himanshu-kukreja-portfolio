"use client";

/**
 * Admin overview card: offline reading. Who saved the course (or parts of it) for offline reading,
 * what they saved and how much, installs of the app, opens of saved copies and reading done with no
 * connection, and the latest offline readers (→ their journey).
 * Data: GET /api/admin/posthog/offline?days=… (PostHog HogQL, see src/lib/analytics/offlineServer.ts).
 */
import Link from "next/link";
import { BarList, Card, EmptyState, LABEL, Skeleton, TrendChart, fmtNum, timeAgo, useAdminData, type Range } from "@/components/admin/ui";
import { PhErrorState, countryFlag, personHref } from "@/components/admin/journeys/bits";
import type { NotConfigured, OfflineRes } from "@/lib/analytics/journeys";

const DAYS: Record<Range, number> = { "24h": 1, "7d": 7, "30d": 30, "90d": 90, "12m": 365 };

const SCOPE: Record<string, string> = { article: "one article", world: "a whole world", collection: "side quests · mocks · case files", course: "the entire course" };
const KIND: Record<string, string> = { lesson: "lesson", boss: "boss", side_quest: "side quest", preview: "preview", trial: "trial", mock: "mock", case_file: "case file", course_map: "course map", plan: "plan" };
const MODE: Record<string, string> = { browser: "browser tab", standalone: "installed app", "window-controls-overlay": "installed app · title bar in page", "minimal-ui": "minimal UI", fullscreen: "fullscreen" };

export function fmtBytes(n: number | null | undefined): string {
  const v = n ?? 0;
  if (v >= 1024 ** 3) return `${(v / 1024 ** 3).toFixed(1)} GB`;
  if (v >= 1024 ** 2) return `${(v / 1024 ** 2).toFixed(v >= 100 * 1024 ** 2 ? 0 : 1)} MB`;
  if (v >= 1024) return `${Math.round(v / 1024)} KB`;
  return `${Math.round(v)} B`;
}

const plural = (n: number, one: string, many = `${one}s`) => `${fmtNum(n)} ${n === 1 ? one : many}`;

const xFormat = (days: number) => (t: string | number) => {
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return String(t);
  if (days <= 1) return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false });
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
};

function Stat({ k, v, hint }: { k: string; v: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 bg-bg px-3 py-3">
      <span className={LABEL}>{k}</span>
      <span className="font-display text-[24px] font-extrabold leading-none tracking-[-0.03em] text-fg">{v}</span>
      {hint && <span className="truncate font-mono text-[11px] text-fg-3">{hint}</span>}
    </div>
  );
}

export default function OfflineCard({ range }: { range: Range }) {
  const days = DAYS[range] ?? 30;
  const res = useAdminData<OfflineRes | NotConfigured>(`/api/admin/posthog/offline?days=${days}`);
  const d = res.data && res.data.configured ? res.data : null;
  const notConfigured = res.data && !res.data.configured;
  const err = (k: string) => d?.errors?.[k];

  return (
    <Card label="offline" title={`Offline reading · ${range}`} className="mb-6" pad={false} action={<Link href="/admin/journeys" className="font-mono text-[11px] text-fg-3 hover:text-fg">journeys →</Link>}>
      {res.error ? (
        <div className="p-4">
          <PhErrorState error={res.error} onRetry={res.refresh} title="Offline reading unavailable" />
        </div>
      ) : notConfigured ? (
        <div className="p-4">
          <EmptyState title="PostHog isn't connected on the server" hint={<>Offline reading comes from PostHog. Set it up under <Link href="/admin/journeys" className="underline underline-offset-4">Journeys</Link>.</>} />
        </div>
      ) : !d ? (
        <div className="flex flex-col gap-2 p-4">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : (
        <div className="flex flex-col gap-px bg-line">
          <div className="grid grid-cols-2 gap-px lg:grid-cols-4">
            <Stat k="people who saved" v={fmtNum(d.savers.all)} hint={`all time · ${fmtNum(d.savers.d7)} in 7 days · ${fmtNum(d.savers.d30)} in 30`} />
            <Stat k={`saved · ${range}`} v={fmtBytes(d.totals.bytes)} hint={`${fmtNum(d.totals.saves)} saves · ${fmtNum(d.totals.updates)} updates · ${fmtBytes(d.savers.bytesAll)} all time`} />
            <Stat k="on devices now" v={d.stored ? fmtNum(d.stored.people) : "—"} hint={d.stored ? `people · ${fmtBytes(d.stored.bytes)} kept` : err("stored") ? "person query failed" : undefined} />
            <Stat k={`installs · ${range}`} v={fmtNum(d.totals.installs)} hint={`${fmtNum(d.totals.offlinePeople)} read offline · ${fmtNum(d.totals.removes)} removals`} />
          </div>

          <div className="grid gap-px xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
            <div className="min-w-0 bg-surface p-4">
              <div className={`${LABEL} mb-2`}>with no connection</div>
              {err("series") ? (
                <PhErrorState error={err("series")} />
              ) : (
                <TrendChart
                  data={d.series}
                  height={200}
                  series={[
                    { key: "opens", label: "Saved copies opened offline" },
                    { key: "reads", label: "Learning events offline" },
                    { key: "saves", label: "Saves" },
                  ]}
                  formatX={xFormat(days)}
                  ariaLabel="Offline opens, offline learning events and saves over time"
                  empty="Nothing read offline in this range"
                />
              )}
              <p className="mt-2 text-xs text-fg-3">
                {fmtNum(d.totals.opens)} opens of saved copies · {fmtNum(d.totals.reads)} stage clears, quiz answers and lesson events sent from offline (they arrive when the reader is back online, at the time they happened).
              </p>
            </div>
            <div className="flex min-w-0 flex-col gap-4 bg-surface p-4">
              <div>
                <div className={`${LABEL} mb-2`}>what people save</div>
                <BarList
                  valueLabel="saves"
                  items={d.byScope.map((s) => ({ key: s.scope, label: SCOPE[s.scope] ?? s.scope, value: s.saves, hint: `${fmtNum(s.people)} people · ${fmtBytes(s.bytes)}` }))}
                  empty="No saves in this range"
                />
              </div>
              <div>
                <div className={`${LABEL} mb-2`}>installed app</div>
                {d.installs.length || d.modes.length || d.prompts.length ? (
                  <div className="flex flex-col gap-2 text-[13px]">
                    {d.installs.length > 0 && (
                      <span className="text-fg-2">
                        {d.installs.map((i) => `${i.platform} ${fmtNum(i.people)}${i.via === "first_launch" ? " (home screen)" : ""}`).join(" · ")}
                      </span>
                    )}
                    {d.prompts.length > 0 && <span className="font-mono text-[11px] text-fg-3">install prompt: {d.prompts.map((p) => `${p.outcome} ${fmtNum(p.n)}`).join(" · ")}</span>}
                    {d.modes.length > 0 && (
                      <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
                        {d.modes.map((m) => (
                          <li key={m.mode} className="border border-line px-2 py-1 font-mono text-[11px] text-fg-2">
                            {MODE[m.mode] ?? m.mode} · <span className="text-fg">{fmtNum(m.people)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ) : (
                  <p className="m-0 text-sm text-fg-3">No installs in this range.</p>
                )}
              </div>
            </div>
          </div>

          <div className="grid gap-px lg:grid-cols-3">
            <div className="min-w-0 bg-surface p-4">
              <div className={`${LABEL} mb-2`}>top saved articles</div>
              <BarList
                valueLabel="people"
                limit={6}
                items={d.topArticles.map((a) => ({ key: a.slug, label: a.title || a.slug, value: a.people, hint: [a.kind ? (KIND[a.kind] ?? a.kind) : null, a.week, `${fmtNum(a.saves)} saves`].filter(Boolean).join(" · ") }))}
                empty="No single articles saved in this range"
              />
            </div>
            <div className="min-w-0 bg-surface p-4">
              <div className={`${LABEL} mb-2`}>top saved worlds</div>
              <BarList
                valueLabel="people"
                limit={6}
                items={d.topWorlds.map((w) => ({ key: w.group, label: w.title || w.group, value: w.people, hint: `${fmtNum(w.saves)} saves` }))}
                empty="No worlds saved in this range"
              />
            </div>
            <div className="min-w-0 bg-surface">
              <div className={`${LABEL} px-4 pb-1 pt-4`}>latest offline readers</div>
              {d.recent.length ? (
                <ul className="m-0 list-none divide-y divide-line p-0">
                  {d.recent.slice(0, 6).map((p) => (
                    <li key={p.personId}>
                      <Link href={personHref(p.personId)} className="flex min-h-12 items-center gap-3 px-4 py-2 hover:bg-surface-2">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-fg">
                            {countryFlag(p.country)} {p.who}
                          </span>
                          <span className="block truncate font-mono text-[11px] text-fg-3">
                            {[p.opens ? plural(p.opens, "open") : null, p.reads ? plural(p.reads, "offline event") : null, p.saves ? plural(p.saves, "save") : null, p.mode ? (MODE[p.mode] ?? p.mode) : null, p.device].filter(Boolean).join(" · ")}
                          </span>
                        </span>
                        <span className="shrink-0 font-mono text-[11px] text-fg-3">{timeAgo(p.lastAt)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="m-0 px-4 pb-4 text-sm text-fg-3">No one has saved or read offline in this range yet.</p>
              )}
            </div>
          </div>
          {Object.keys(d.errors).length > 0 && (
            <p className="m-0 bg-surface px-4 py-2 font-mono text-[11px] text-fg-3">
              some parts didn&apos;t load: {Object.entries(d.errors).map(([k, v]) => `${k} (${v.slice(0, 80)})`).join(" · ")}
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
