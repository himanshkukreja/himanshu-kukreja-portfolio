"use client";

/**
 * /admin/design-week/<id>: phase + status controls, schedule, content, participation, winners
 * (top votes pre-selected, admin confirms), moderation of every submission, reports.
 */
import "@/app/learn/course-content.css";
import "@/app/learn/course-blocks.css";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Card, ConfirmButton, Drawer, ErrorState, Kpi, LABEL, PageHead, Skeleton, Table, fmtNum, timeAgo, useAdminClient, useAdminData, type Column } from "@/components/admin/ui";
import MermaidHydrator from "@/components/diagrams/MermaidHydrator";
import type { ChallengeStatus } from "@/lib/design-week/core";
import { LIMITS } from "@/lib/design-week/core";
import type { AdminDetail, AdminSubmission, AdminSubmissionDetail } from "@/lib/design-week/views";
import { Reports } from "./DesignWeekList";
import { BTN, BTN_PRIMARY, DesignWeekClient, fmtIst, fromIstInput, INPUT, jsonInit, PhasePill, SubStatus, toIstInput } from "./shared";

export default function ChallengeAdmin({ id }: { id: string }) {
  return (
    <DesignWeekClient>
      <Inner id={id} />
    </DesignWeekClient>
  );
}

type Form = {
  title: string;
  slug: string;
  summary: string;
  briefMd: string;
  constraints: string;
  rubric: string;
  relatedLessons: string;
  startsAt: string;
  submissionsCloseAt: string;
  endsAt: string;
  maxVotesPerUser: number;
  showLiveCounts: boolean;
};

const formOf = (d: AdminDetail): Form => ({
  title: d.challenge.title,
  slug: d.challenge.slug,
  summary: d.challenge.summary,
  briefMd: d.challenge.briefMd,
  constraints: d.challenge.constraints.join("\n"),
  rubric: d.challenge.rubric.join("\n"),
  relatedLessons: d.challenge.relatedLessons.join("\n"),
  startsAt: toIstInput(d.challenge.startsAt),
  submissionsCloseAt: toIstInput(d.challenge.submissionsCloseAt),
  endsAt: toIstInput(d.challenge.endsAt),
  maxVotesPerUser: d.challenge.maxVotesPerUser,
  showLiveCounts: d.challenge.showLiveCounts,
});

function Inner({ id }: { id: string }) {
  const client = useAdminClient();
  const router = useRouter();
  const { data, error, loading, refresh } = useAdminData<AdminDetail>(`/api/admin/design-week/${id}`);
  const [edit, setEdit] = useState<{ v: string; f: Form } | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [picked, setPicked] = useState<string[] | null>(null);
  const [view, setView] = useState<string | null>(null);
  // the form follows the server copy until edited; a save (new updatedAt) resets it
  const version = data?.challenge.updatedAt ?? "";
  const form = data ? (edit && edit.v === version ? edit.f : formOf(data)) : null;

  if (error) return <ErrorState error={error} onRetry={refresh} title="Challenge unavailable" />;
  if (loading && !data) return <Skeleton className="h-96 w-full" />;
  if (!data || !form) return null;
  const c = data.challenge;
  const st = c.stats;
  const winners = picked ?? data.preselected;

  const call = async (fn: () => Promise<unknown>, ok: string) => {
    setMsg(null);
    try {
      await fn();
      setMsg({ ok: true, text: ok });
      refresh();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    }
  };
  const patch = (body: Record<string, unknown>, ok: string) => call(() => client.json(`/api/admin/design-week/${id}`, jsonInit("PATCH", body)), ok);
  const setStatus = (status: ChallengeStatus, ok: string, force = false) => patch({ status, ...(force ? { force: true } : {}) }, ok);
  const saveForm = () =>
    patch(
      {
        title: form.title,
        slug: form.slug,
        summary: form.summary,
        briefMd: form.briefMd,
        constraints: form.constraints,
        rubric: form.rubric,
        relatedLessons: form.relatedLessons,
        startsAt: fromIstInput(form.startsAt),
        submissionsCloseAt: fromIstInput(form.submissionsCloseAt),
        endsAt: fromIstInput(form.endsAt),
        maxVotesPerUser: Number(form.maxVotesPerUser),
        showLiveCounts: form.showLiveCounts,
      },
      "Saved."
    );
  const moderate = (sid: string, action: "hide" | "remove" | "restore") => call(() => client.json(`/api/admin/design-week/submissions/${sid}`, jsonInit("POST", { action })), `Design ${action === "restore" ? "restored" : action === "hide" ? "hidden" : "removed"}.`);
  const confirm = () => call(() => client.json(`/api/admin/design-week/${id}/winners`, jsonInit("POST", { ids: winners })), "Winners confirmed. The challenge is closed and the winners are featured.");

  const visible = data.submissions.filter((s) => s.status === "submitted");
  const canPick = ["voting", "judging", "closed"].includes(c.phase);
  const toggle = (sid: string) => setPicked(winners.includes(sid) ? winners.filter((x) => x !== sid) : winners.length >= LIMITS.featuredMax ? winners : [...winners, sid]);
  const move = (sid: string, d: -1 | 1) => {
    const i = winners.indexOf(sid);
    const j = i + d;
    if (i < 0 || j < 0 || j >= winners.length) return;
    const next = [...winners];
    [next[i], next[j]] = [next[j], next[i]];
    setPicked(next);
  };

  const cols: Column<AdminSubmission>[] = [
    {
      key: "title",
      header: "Design",
      render: (s) => (
        <button type="button" onClick={() => setView(s.id)} className="flex min-h-11 flex-col items-start justify-center text-left hover:text-signal-text">
          <span className="font-semibold text-fg">{s.title}</span>
          <span className="line-clamp-1 text-xs text-fg-3">{s.excerpt}</span>
        </button>
      ),
      sort: (s) => s.title,
    },
    {
      key: "author",
      header: "Author",
      render: (s) => (
        <span className="flex flex-col">
          <span className="text-sm text-fg">{s.author.anonymous ? "not shared" : s.author.name || `@${s.author.handle}`}</span>
          <Link href={`/admin/learners/${encodeURIComponent(s.userId)}`} className="font-mono text-[11px] text-fg-3 hover:text-fg">
            {s.userRef}
            {!s.showAuthor && " · hidden"}
          </Link>
        </span>
      ),
      hideOnPhone: true,
    },
    { key: "status", header: "Status", render: (s) => <SubStatus status={s.status} />, sort: (s) => s.status },
    { key: "votes", header: "Votes", align: "right", render: (s) => <span className="font-mono">{s.voteCount}</span>, sort: (s) => s.voteCount },
    { key: "reports", header: "Rep.", align: "right", render: (s) => <span className={`font-mono ${s.reportCount ? "text-signal-text" : "text-fg-4"}`}>{s.reportCount}</span>, sort: (s) => s.reportCount },
    {
      key: "act",
      header: "",
      align: "right",
      render: (s) => (
        <span className="flex justify-end gap-1">
          {s.status === "submitted" && (
            <button type="button" onClick={() => moderate(s.id, "hide")} className="min-h-9 border border-line-strong px-2 font-mono text-[12px] hover:bg-surface-2">
              hide
            </button>
          )}
          {(s.status === "hidden" || s.status === "removed") && (
            <button type="button" onClick={() => moderate(s.id, "restore")} className="min-h-9 border border-line-strong px-2 font-mono text-[12px] hover:bg-surface-2">
              restore
            </button>
          )}
          {s.status !== "removed" && (
            <ConfirmButton size="sm" onConfirm={() => moderate(s.id, "remove")} confirmLabel="remove?">
              remove
            </ConfirmButton>
          )}
        </span>
      ),
    },
  ];

  const field = (_k: keyof Form, label: string, el: React.ReactNode, hint?: string) => (
    <label className="flex min-w-0 flex-col gap-1">
      <span className={LABEL}>{label}</span>
      {el}
      {hint ? <span className="text-xs text-fg-3">{hint}</span> : null}
    </label>
  );
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setEdit({ v: version, f: { ...form, [k]: v } });

  return (
    <div>
      <PageHead
        path={`sudo ~/admin/design-week/${c.slug}`}
        title={c.title}
        sub={
          <span className="inline-flex flex-wrap items-center gap-2">
            <PhasePill phase={c.phase} /> status <b className="font-mono text-fg-2">{c.status}</b> · {fmtIst(c.startsAt)} → {fmtIst(c.endsAt)}
          </span>
        }
        actions={
          <>
            <Link href="/admin/design-week" className={BTN}>
              ← all
            </Link>
            {c.status !== "draft" && (
              <Link href={data.publicHref} target="_blank" className={BTN}>
                public page ↗
              </Link>
            )}
          </>
        }
      />
      {msg && (
        <div role="status" className={`mb-4 border px-4 py-2.5 text-sm ${msg.ok ? "border-line-strong text-fg" : "border-bad text-bad-text"}`}>
          {msg.text}
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi label="Designs" value={fmtNum(st.submitted)} hint={`${st.drafts} drafts`} />
        <Kpi label="Participants" value={fmtNum(st.participants)} />
        <Kpi label="Votes" value={fmtNum(st.votes)} hint={`${fmtNum(st.voters)} voters`} />
        <Kpi label="Hidden · removed" value={`${st.hidden} · ${st.removed}`} />
        <Kpi label="Open reports" value={fmtNum(st.openReports)} />
      </div>

      <Card label="lifecycle" title="Status" className="mb-6">
        <div className="flex flex-col gap-3">
          <p className="m-0 text-[13px] leading-relaxed text-fg-3">
            <b className="text-fg-2">scheduled</b> follows the clock (upcoming → open → voting → judging). <b className="text-fg-2">open</b> / <b className="text-fg-2">voting</b> force that phase now. <b className="text-fg-2">closed</b> is set by confirming winners.
          </p>
          <div className="flex flex-wrap gap-2">
            {c.status === "draft" ? (
              <ConfirmButton primary tone="signal" onConfirm={() => setStatus("scheduled", "Published. Phases now follow the schedule.")} confirmLabel="publish?">
                publish (scheduled)
              </ConfirmButton>
            ) : (
              <>
                {c.status !== "scheduled" && (
                  <button type="button" className={BTN} onClick={() => setStatus("scheduled", "Back on the schedule.")}>
                    follow schedule
                  </button>
                )}
                {c.status !== "open" && (
                  <button type="button" className={BTN} onClick={() => setStatus("open", "Submissions forced open.")}>
                    force open
                  </button>
                )}
                {c.status !== "voting" && (
                  <button type="button" className={BTN} onClick={() => setStatus("voting", "Voting forced open.")}>
                    force voting
                  </button>
                )}
                {c.status !== "closed" && (
                  <ConfirmButton onConfirm={() => setStatus("closed", "Closed without winners.", true)} confirmLabel="close with no winners?">
                    close without winners
                  </ConfirmButton>
                )}
                <ConfirmButton onConfirm={() => setStatus("draft", "Unpublished.")} confirmLabel="hide from learners?">
                  back to draft
                </ConfirmButton>
              </>
            )}
            {c.status === "draft" && st.submitted + st.hidden + st.removed === 0 && (
              <ConfirmButton
                onConfirm={() =>
                  call(async () => {
                    await client.json(`/api/admin/design-week/${id}`, { method: "DELETE" });
                    router.push("/admin/design-week");
                  }, "Deleted.")
                }
                confirmLabel="delete for good?"
              >
                delete
              </ConfirmButton>
            )}
          </div>
        </div>
      </Card>

      <Card label="winners" title="Pick the winners" className="mb-6" action={<span className="font-mono text-[11px] text-fg-3">top votes pre-selected · first = design of the week</span>}>
        {!canPick ? (
          <p className="m-0 text-sm text-fg-3">Winners can be picked once voting has started ({fmtIst(c.submissionsCloseAt)}).</p>
        ) : !visible.length ? (
          <p className="m-0 text-sm text-fg-3">No visible designs.</p>
        ) : (
          <div className="flex flex-col gap-3">
            <ol className="m-0 flex list-none flex-col gap-1 p-0">
              {winners.map((sid, i) => {
                const s = data.submissions.find((x) => x.id === sid);
                if (!s) return null;
                return (
                  <li key={sid} className={`flex flex-wrap items-center gap-3 border px-3 py-2 ${i === 0 ? "border-signal" : "border-line"}`}>
                    <span className="w-24 font-mono text-[11px] uppercase tracking-label text-signal-text">{i === 0 ? "★ winner" : `featured ${i + 1}`}</span>
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-fg">{s.title}</span>
                    <span className="font-mono text-xs text-fg-3">{s.voteCount} votes</span>
                    <button type="button" aria-label="Move up" onClick={() => move(sid, -1)} className="h-9 w-9 border border-line-strong font-mono text-xs hover:bg-surface-2">
                      ↑
                    </button>
                    <button type="button" aria-label="Move down" onClick={() => move(sid, 1)} className="h-9 w-9 border border-line-strong font-mono text-xs hover:bg-surface-2">
                      ↓
                    </button>
                  </li>
                );
              })}
            </ol>
            <div className="flex flex-wrap gap-1.5">
              {visible.map((s) => (
                <label key={s.id} className={`flex min-h-9 cursor-pointer items-center gap-2 border px-2 text-[13px] ${winners.includes(s.id) ? "border-signal text-fg" : "border-line text-fg-3"}`}>
                  <input type="checkbox" checked={winners.includes(s.id)} onChange={() => toggle(s.id)} className="accent-[var(--c-signal)]" />
                  {s.title} <span className="font-mono text-[11px]">({s.voteCount})</span>
                </label>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <ConfirmButton primary tone="signal" disabled={!winners.length} onConfirm={confirm} confirmLabel="confirm and close?">
                {c.status === "closed" ? "update winners" : "confirm winners"}
              </ConfirmButton>
              {c.winnersAnnouncedAt && <span className="font-mono text-xs text-fg-3">announced {timeAgo(c.winnersAnnouncedAt)}</span>}
            </div>
          </div>
        )}
      </Card>

      <Card label="moderation" title={`Submissions · ${data.submissions.length}`} pad={false} className="mb-6">
        <Table columns={cols} rows={data.submissions} rowKey={(s) => s.id} minWidth={720} empty={<div className="p-4 text-sm text-fg-3">No submissions yet.</div>} />
      </Card>

      <Card label="moderation" title="Reports" pad={false} className="mb-6">
        <Reports reports={data.reports} onChange={refresh} />
      </Card>

      <Card label="content" title="Brief, rules and schedule" action={<button type="button" onClick={saveForm} className={BTN_PRIMARY}>save</button>}>
        <div className="grid gap-4 lg:grid-cols-2">
          {field("title", "title", <input className={INPUT} value={form.title} onChange={(e) => set("title", e.target.value)} />)}
          {field("slug", "slug", <input className={INPUT} value={form.slug} disabled={c.status !== "draft"} onChange={(e) => set("slug", e.target.value)} />, c.status !== "draft" ? "Fixed after publishing." : undefined)}
          <div className="lg:col-span-2">{field("summary", "summary (cards)", <input className={INPUT} value={form.summary} onChange={(e) => set("summary", e.target.value)} />)}</div>
          {field("startsAt", "submissions open (IST)", <input type="datetime-local" className={INPUT} value={form.startsAt} onChange={(e) => set("startsAt", e.target.value)} />)}
          {field("submissionsCloseAt", "submissions close · voting opens (IST)", <input type="datetime-local" className={INPUT} value={form.submissionsCloseAt} onChange={(e) => set("submissionsCloseAt", e.target.value)} />)}
          {field("endsAt", "voting closes (IST)", <input type="datetime-local" className={INPUT} value={form.endsAt} onChange={(e) => set("endsAt", e.target.value)} />)}
          <div className="grid grid-cols-2 gap-4">
            {field("maxVotesPerUser", "votes per learner", <input type="number" min={1} max={20} className={INPUT} value={form.maxVotesPerUser} onChange={(e) => set("maxVotesPerUser", Number(e.target.value))} />)}
            <label className="flex items-end gap-2 pb-2 text-sm text-fg-2">
              <input type="checkbox" checked={form.showLiveCounts} onChange={(e) => set("showLiveCounts", e.target.checked)} className="h-4 w-4 accent-[var(--c-signal)]" />
              live counts during voting
            </label>
          </div>
          <div className="lg:col-span-2">{field("briefMd", "brief (markdown + mermaid)", <textarea rows={14} className={`${INPUT} py-2 font-mono text-[13px]`} value={form.briefMd} onChange={(e) => set("briefMd", e.target.value)} />)}</div>
          {field("constraints", "constraints (one per line)", <textarea rows={6} className={`${INPUT} py-2`} value={form.constraints} onChange={(e) => set("constraints", e.target.value)} />)}
          {field("rubric", "rubric (one per line)", <textarea rows={6} className={`${INPUT} py-2`} value={form.rubric} onChange={(e) => set("rubric", e.target.value)} />)}
          <div className="lg:col-span-2">
            {field("relatedLessons", "related lessons (week-folder/lesson-slug per line)", <textarea rows={5} className={`${INPUT} py-2 font-mono text-[12px]`} value={form.relatedLessons} onChange={(e) => set("relatedLessons", e.target.value)} />, "Unknown lessons are skipped on the public page.")}
          </div>
        </div>
      </Card>

      <SubmissionDrawer id={view} onClose={() => setView(null)} onModerate={(sid, a) => moderate(sid, a)} />
    </div>
  );
}

function SubmissionDrawer({ id, onClose, onModerate }: { id: string | null; onClose: () => void; onModerate: (id: string, a: "hide" | "remove" | "restore") => void }) {
  const { data, error, loading } = useAdminData<AdminSubmissionDetail>(id ? `/api/admin/design-week/submissions/${id}` : null);
  return (
    <Drawer open={!!id} onClose={onClose} label="submission" title={data?.title || "…"} width={760}>
      {error ? (
        <ErrorState error={error} />
      ) : loading || !data ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <SubStatus status={data.status} />
            <span className="font-mono text-xs text-fg-3">
              {data.voteCount} votes · {data.reportCount} reports · {data.words} words · {data.editCount} saves · user {data.userRef}
            </span>
          </div>
          {data.moderationNote && <p className="m-0 border border-dashed border-line-strong px-3 py-2 text-sm text-fg-2">{data.moderationNote}</p>}
          <div className="flex flex-wrap gap-2">
            {data.status === "submitted" && (
              <button type="button" className={BTN} onClick={() => onModerate(data.id, "hide")}>
                hide
              </button>
            )}
            {(data.status === "hidden" || data.status === "removed") && (
              <button type="button" className={BTN} onClick={() => onModerate(data.id, "restore")}>
                restore
              </button>
            )}
            {data.href && (
              <Link href={data.href} target="_blank" className={BTN}>
                public page ↗
              </Link>
            )}
          </div>
          <div data-dow-admin-view className="course-content max-w-none border-t border-line pt-4" dangerouslySetInnerHTML={{ __html: data.html }} />
          <MermaidHydrator rootSelector="[data-dow-admin-view]" />
        </div>
      )}
    </Drawer>
  );
}
