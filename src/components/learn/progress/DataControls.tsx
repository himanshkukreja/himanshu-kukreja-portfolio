"use client";

import { useMemo, useState } from "react";
import type { CourseMap } from "@/lib/learn/types";
import { lessonKey } from "@/lib/learn/types";
import { localDate } from "@/lib/learn/review";
import { track } from "@/lib/track";
import { guestLessonsForImport, localSnapshot, resetLocal, setFlash } from "./localData";
import { PART_INFO, partsFor, scopeLabel, type PartKey, type ResetParts, type ResetScope } from "./scope";
import { userJson } from "./userFetch";
import { Label, SectionHead } from "./ui";

type Props = {
  map: CourseMap;
  signedIn: boolean;
  email: string | null;
  rows: { week: string; lesson_slug: string; status?: string | null; progress_percentage?: number | null }[];
  defaultLesson: { week: string; slug: string } | null;
  onImported: () => void;
  onReset?: (scope: ResetScope) => void;
};

type Kind = ResetScope["kind"];

const ONE: Record<string, string> = {
  "lesson records": "lesson record",
  checkpoints: "checkpoint",
  completions: "completion",
  "trial parts": "trial part",
  "boss runs": "boss run",
  "checklists & verdicts": "checklist or verdict",
  "quiz answer sets": "quiz answer set",
  "trial records": "trial record",
  "review cards": "review card",
  "interview marks": "interview mark",
  "quests & completions": "quest or completion",
};
const count = (k: string, v: number) => (k === "XP" ? `−${v} XP` : `${v} ${v === 1 ? ONE[k] || k : k}`);

const KINDS: { kind: Kind; label: string; hint: string }[] = [
  { kind: "lesson", label: "One lesson", hint: "a single lesson, boss or trial" },
  { kind: "week", label: "One week", hint: "every lesson, boss and trial of a week" },
  { kind: "course", label: "Whole course", hint: "all of System Design Mastery" },
  { kind: "all", label: "Everything", hint: "the course plus XP, quests and streaks" },
];

export default function DataControls(p: Props) {
  return (
    <section aria-labelledby="data-h" id="data" className="flex scroll-mt-28 flex-col gap-4">
      <SectionHead id="data-h" n="05" kicker="your data" title="Export, import, reset" />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          <ExportCard {...p} />
          {p.signedIn && <ImportCard {...p} />}
        </div>
        <ResetCard {...p} />
      </div>
    </section>
  );
}

function ExportCard({ map, signedIn, email }: Props) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const run = async () => {
    setBusy(true);
    setErr(null);
    try {
      const account = signedIn ? await userJson<Record<string, unknown>>("/api/learn/export") : null;
      const body = {
        format: "hk-learn-export/1",
        exportedAt: new Date().toISOString(),
        course: map.courseId,
        signedIn,
        account,
        browser: localSnapshot(),
      };
      const blob = new Blob([JSON.stringify(body, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `learn-progress-${localDate()}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch (e) {
      setErr((e as Error).message || "Export failed");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-col gap-3 border border-line bg-surface p-4 sm:p-5">
      <Label>export</Label>
      <p className="text-[14px] leading-relaxed text-fg-2">
        One JSON file with {signedIn ? `everything your account holds${email ? ` (${email})` : ""} — progress, streak days, quiz answers, notes, bookmarks — plus` : ""} this browser&apos;s copy: checkpoints, XP, trial runs and review cards.
      </p>
      {err && (
        <p role="alert" className="text-sm text-bad-text">
          {err}
        </p>
      )}
      <button type="button" onClick={() => void run()} disabled={busy} className="min-h-12 self-start border border-fg bg-fg px-5 text-sm font-semibold text-bg hover:opacity-90 disabled:opacity-50">
        {busy ? "Preparing…" : "Download my data (.json)"}
      </button>
    </div>
  );
}

function ImportCard({ map, rows, onImported }: Props) {
  const [state, setState] = useState<{ busy: boolean; msg: string | null; err: string | null }>({ busy: false, msg: null, err: null });
  const [local] = useState(() => guestLessonsForImport(map.courseId));
  const pending = useMemo(() => {
    const have = new Map(rows.map((r) => [lessonKey(r.week, r.lesson_slug), r]));
    return local.filter((l) => {
      const r = have.get(lessonKey(l.week, l.slug));
      if (!r) return true;
      if (r.status === "completed") return false;
      return l.completed || l.pct > (r.progress_percentage || 0);
    });
  }, [local, rows]);
  if (!pending.length && !state.msg) return null;
  const done = pending.filter((l) => l.completed).length;
  const run = async () => {
    setState({ busy: true, msg: null, err: null });
    try {
      const r = await userJson<{ imported: number; skipped: number }>("/api/learn/import", { method: "POST", body: JSON.stringify({ course: map.courseId, lessons: pending }) });
      setState({ busy: false, msg: `Imported ${r.imported} lesson${r.imported === 1 ? "" : "s"} into your account.`, err: null });
      onImported();
    } catch (e) {
      setState({ busy: false, msg: null, err: (e as Error).message || "Import failed" });
    }
  };
  return (
    <div className="flex flex-col gap-3 border border-signal bg-surface p-4 sm:p-5">
      <Label className="text-signal-text">guest progress found</Label>
      {state.msg ? (
        <p className="text-[14px] text-fg">{state.msg}</p>
      ) : (
        <>
          <p className="text-[14px] leading-relaxed text-fg-2">
            This browser has progress on {pending.length} lesson{pending.length === 1 ? "" : "s"}
            {done ? ` (${done} completed)` : ""} that your account doesn&apos;t have yet. Import it so it follows you to every device. Nothing in your account goes backwards.
          </p>
          {state.err && (
            <p role="alert" className="text-sm text-bad-text">
              {state.err}
            </p>
          )}
          <button type="button" onClick={() => void run()} disabled={state.busy} className="min-h-12 self-start bg-signal px-5 text-sm font-semibold text-on-signal hover:brightness-110 disabled:opacity-50">
            {state.busy ? "Importing…" : `Import ${pending.length} lesson${pending.length === 1 ? "" : "s"}`}
          </button>
        </>
      )}
    </div>
  );
}

function ResetCard({ map, signedIn, rows, defaultLesson, onReset }: Props) {
  const sideWeek = map.sideQuests[0]?.week ?? null;
  const [kind, setKind] = useState<Kind>("lesson");
  const [lesson, setLesson] = useState<string>(() => (defaultLesson ? `${defaultLesson.week}|${defaultLesson.slug}` : map.weeks[0]?.lessons[0] ? `${map.weeks[0].lessons[0].week}|${map.weeks[0].lessons[0].slug}` : ""));
  const [week, setWeek] = useState<string>(() => defaultLesson?.week || map.weeks[0]?.key || "");
  const [picked, setPicked] = useState<Record<PartKey, boolean>>({ progress: true, mcq: true, notes: false, bookmarks: false, streaks: false, game: false });
  const [typed, setTyped] = useState("");
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const scope: ResetScope | null = useMemo(() => {
    if (kind === "all") return { kind: "all" };
    if (kind === "course") return { kind: "course", course: map.courseId };
    if (kind === "week") return week ? { kind: "week", course: map.courseId, week } : null;
    const [w, s] = lesson.split("|");
    return w && s ? { kind: "lesson", course: map.courseId, week: w, lesson: s } : null;
  }, [kind, week, lesson, map.courseId]);

  const available = partsFor(kind);
  const accountOnly = (k: PartKey) => (k === "notes" || k === "bookmarks") && !signedIn;
  const parts: ResetParts = useMemo(() => {
    const o: ResetParts = {};
    available.forEach((k) => {
      if (picked[k] && !accountOnly(k)) o[k] = true;
    });
    return o;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picked, kind, signedIn]);
  const anyPart = Object.keys(parts).length > 0;

  const preview = useMemo(() => (scope && anyPart ? resetLocal(map, scope, parts, true) : {}), [map, scope, parts, anyPart]);
  const accountRows = useMemo(() => {
    if (!scope || !signedIn || !parts.progress) return 0;
    return rows.filter((r) => {
      if (scope.kind === "all" || scope.kind === "course") return true;
      if (r.week !== scope.week) return false;
      return scope.kind === "week" || r.lesson_slug === scope.lesson;
    }).length;
  }, [scope, signedIn, parts.progress, rows]);

  const weekCode = map.weeks.find((w) => w.key === week)?.code;
  const phrase = kind === "lesson" ? "" : kind === "week" ? (weekCode ? `W${weekCode}` : "SQ") : kind === "course" ? "reset course" : "reset everything";
  const typedOk = kind === "lesson" ? armed : typed.trim().toLowerCase() === phrase.toLowerCase();

  const choose = (k: Kind) => {
    setKind(k);
    setTyped("");
    setArmed(false);
    setErr(null);
  };

  const run = async () => {
    if (!scope || !anyPart || !typedOk) return;
    setBusy(true);
    setErr(null);
    try {
      let server: Record<string, number> = {};
      if (signedIn) {
        const r = await userJson<{ deleted: Record<string, number> }>("/api/learn/reset", { method: "POST", body: JSON.stringify({ scope, parts }) });
        server = r.deleted || {};
      }
      // Then this browser's copy: the lesson reader and the game would merge it straight back in.
      const local = resetLocal(map, scope, parts);
      onReset?.(scope);
      track("reset", { scope: scope.kind }); // flushed by the tracker's pagehide beacon on the reload below
      const n = Object.values(server).reduce((a, v) => a + (v || 0), 0) + Object.entries(local).reduce((a, [k, v]) => a + (k === "XP" ? 0 : v || 0), 0);
      setFlash(`Reset ${scopeLabel(scope, map)} · ${n} item${n === 1 ? "" : "s"} removed${local.XP ? ` · −${local.XP} XP` : ""}.`);
      // Reload so every in-memory copy (game engine, review cache, progress hooks) starts from the cleared state.
      window.location.reload();
    } catch (e) {
      setErr((e as Error).message || "Reset failed. Nothing in this browser was changed.");
      setBusy(false);
    }
  };

  const previewList = Object.entries(preview).filter(([, v]) => v > 0);

  return (
    <div className="flex min-w-0 flex-col gap-4 border border-bad/50 bg-surface p-4 sm:p-5">
      <div className="flex items-baseline justify-between gap-3">
        <Label className="text-bad-text">danger zone · reset</Label>
        <span className="font-mono text-[11px] text-fg-3">{signedIn ? "account + this browser" : "this browser"}</span>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 font-mono text-[11px] uppercase tracking-label text-fg-3">1 · what to reset</legend>
        <div className="grid grid-cols-2 gap-px border border-line-strong bg-line-strong sm:grid-cols-4">
          {KINDS.map((k) => (
            <button key={k.kind} type="button" aria-pressed={kind === k.kind} onClick={() => choose(k.kind)} className={`flex min-h-14 flex-col items-start justify-center gap-0.5 px-3 py-2 text-left ${kind === k.kind ? "bg-fg text-bg" : "bg-bg text-fg hover:bg-surface-2"}`}>
              <span className="text-sm font-semibold">{k.label}</span>
              <span className={`text-[11px] leading-tight ${kind === k.kind ? "text-bg/70" : "text-fg-3"}`}>{k.hint}</span>
            </button>
          ))}
        </div>
        {kind === "lesson" && (
          <select aria-label="Lesson" value={lesson} onChange={(e) => (setLesson(e.target.value), setArmed(false))} className="min-h-12 w-full min-w-0 border border-line-strong bg-bg px-3 text-[15px] text-fg">
            {map.weeks.map((w) => (
              <optgroup key={w.key} label={`Week ${w.code} · ${w.title}`}>
                {w.lessons.map((l) => (
                  <option key={l.slug} value={`${l.week}|${l.slug}`}>
                    {l.tag} · {l.title}
                  </option>
                ))}
                {w.boss && <option value={`${w.boss.week}|${w.boss.slug}`}>W{w.code} · BOSS · {w.boss.title}</option>}
                {w.trial && <option value={`${w.trial.week}|${w.trial.slug}`}>W{w.code} · TRIAL · all parts</option>}
              </optgroup>
            ))}
            {map.sideQuests.length > 0 && (
              <optgroup label="Side quests">
                {map.sideQuests.map((l) => (
                  <option key={l.slug} value={`${l.week}|${l.slug}`}>
                    {l.code} · {l.title}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        )}
        {kind === "week" && (
          <select aria-label="Week" value={week} onChange={(e) => (setWeek(e.target.value), setTyped(""))} className="min-h-12 w-full min-w-0 border border-line-strong bg-bg px-3 text-[15px] text-fg">
            {map.weeks.map((w) => (
              <option key={w.key} value={w.key}>
                Week {w.code} · {w.title}
              </option>
            ))}
            {sideWeek && <option value={sideWeek}>Side quests</option>}
          </select>
        )}
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 font-mono text-[11px] uppercase tracking-label text-fg-3">2 · which data</legend>
        <div className="flex flex-col gap-px border border-line bg-line">
          {available.filter((k) => !accountOnly(k)).map((k) => {
            const off = accountOnly(k);
            const on = !!picked[k] && !off;
            return (
              <label key={k} className={`flex min-h-14 cursor-pointer items-start gap-3 bg-bg px-3 py-2.5 ${off ? "cursor-not-allowed opacity-50" : "hover:bg-surface-2"}`}>
                <input type="checkbox" className="peer sr-only" checked={on} disabled={off} onChange={(e) => setPicked((x) => ({ ...x, [k]: e.target.checked }))} />
                <span aria-hidden className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center border font-mono text-[12px] peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-signal ${on ? "border-bad bg-bad text-white" : "border-line-strong"}`}>
                  {on ? "✓" : ""}
                </span>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-sm font-semibold text-fg">{PART_INFO[k].label}</span>
                  <span className="text-[12px] leading-snug text-fg-3">{off ? "Saved to accounts only — nothing in this browser." : PART_INFO[k].detail}</span>
                </span>
              </label>
            );
          })}
        </div>
        {!signedIn && <span className="text-[12px] text-fg-3">Notes, highlights and bookmarks live in accounts only, so there are none in this browser to reset.</span>}
      </fieldset>

      <div className="flex flex-col gap-2 border border-dashed border-line-strong p-3">
        <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">3 · this removes</span>
        {scope && anyPart ? (
          <>
            <span className="text-sm font-semibold text-fg">{scopeLabel(scope, map)}</span>
            {previewList.length || accountRows || parts.notes || parts.bookmarks || parts.mcq || parts.streaks ? (
              <ul className="flex flex-wrap gap-1.5">
                {accountRows > 0 && <li className="border border-line px-2 py-1 font-mono text-[11px] text-fg-2">{accountRows} account lesson row{accountRows === 1 ? "" : "s"}</li>}
                {previewList.map(([k, v]) => (
                  <li key={k} className="border border-line px-2 py-1 font-mono text-[11px] text-fg-2">
                    {count(k, v)}
                  </li>
                ))}
                {signedIn &&
                  (["mcq", "notes", "bookmarks", "streaks"] as const)
                    .filter((k) => parts[k])
                    .map((k) => (
                      <li key={k} className="border border-line px-2 py-1 font-mono text-[11px] text-fg-2">
                        account {PART_INFO[k].label.toLowerCase()}
                      </li>
                    ))}
              </ul>
            ) : (
              <span className="text-[13px] text-fg-3">Nothing saved for this yet — the reset would be a no-op.</span>
            )}
          </>
        ) : (
          <span className="text-[13px] text-fg-3">Pick at least one kind of data.</span>
        )}
      </div>

      {kind !== "lesson" ? (
        <div className="flex flex-col gap-2">
          <label htmlFor="reset-confirm" className="text-[13px] text-fg-2">
            Type <span className="bg-surface-2 px-1.5 py-0.5 font-mono text-fg">{phrase}</span> to confirm. This can&apos;t be undone{signedIn ? "" : " — and export first if you want a copy"}.
          </label>
          <input
            id="reset-confirm"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            className="min-h-12 w-full min-w-0 border border-line-strong bg-bg px-3 font-mono text-[15px] text-fg focus:border-bad"
          />
        </div>
      ) : armed ? (
        <p className="text-[13px] text-fg-2">Sure? This lesson&apos;s data is gone for good once you confirm.</p>
      ) : null}

      {err && (
        <p role="alert" className="text-sm text-bad-text">
          {err}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {kind === "lesson" && !armed ? (
          <button type="button" disabled={!scope || !anyPart} onClick={() => setArmed(true)} className="min-h-12 border border-bad px-5 text-sm font-semibold text-bad-text hover:bg-bad/10 disabled:opacity-40">
            Reset this lesson…
          </button>
        ) : (
          <>
            <button type="button" disabled={!scope || !anyPart || !typedOk || busy} onClick={() => void run()} className="min-h-12 bg-bad px-5 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-40">
              {busy ? "Resetting…" : kind === "lesson" ? "Yes, reset it" : kind === "all" ? "Reset everything" : kind === "course" ? "Reset the course" : `Reset ${phrase}`}
            </button>
            {kind === "lesson" && (
              <button type="button" disabled={busy} onClick={() => setArmed(false)} className="min-h-12 border border-line-strong px-4 text-sm text-fg hover:bg-surface-2">
                Cancel
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
