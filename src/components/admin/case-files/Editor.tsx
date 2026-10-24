"use client";

/**
 * /admin/case-files/[id]: the case file editor. Working copy autosaves (optimistic locking, one
 * revision per burst); the live preview re-renders through the public renderer and re-validates on
 * every pause; publish validates on the server and is blocked by any error.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Badge, ErrorState, LABEL, Skeleton, Tabs, timeAgo, useAdminClient, useNow, type AdminError } from "@/components/admin/ui";
import { CASE_TYPE_LABEL, parseDebrief, type Debrief } from "@/components/stories/case-types";
import type { CaseActivityData } from "@/components/stories/activities/data";
import { sameFields, slugify, type CaseFileDetail, type CaseFileFields, type CaseFileRow, type Problem, type RenderResult, type Validation } from "@/lib/case-files/types";
import { readMinutes, type CaseFile } from "@/components/stories/case-types";
import MarkdownField, { type MarkdownFieldHandle } from "./MarkdownField";
import DetailsForm from "./DetailsForm";
import DebriefForm from "./DebriefForm";
import ActivityBuilder from "./ActivityBuilder";
import ChecksPanel from "./ChecksPanel";
import PreviewPane from "./PreviewPane";
import HistoryDrawer from "./HistoryDrawer";
import type { FramePayload } from "./PreviewFrame";
import { BTN, BTN_PRIMARY, CaseFilesClient, Note, StatusBadge, cx, jsonInit, uploadCaseImage } from "./client";

type Tab = "story" | "details" | "debrief" | "activity" | "checks" | "preview";
type SaveState = "idle" | "saving" | "saved" | "error" | "conflict";

const AUTOSAVE_MS = 2500;
const RENDER_MS = 700;

function fieldsOf(r: CaseFileRow): CaseFileFields {
  return {
    slug: r.slug,
    title: r.title,
    excerpt: r.excerpt,
    type: r.type,
    tags: r.tags,
    date: r.date,
    coverUrl: r.coverUrl,
    coverAlt: r.coverAlt,
    motionCoverUrl: r.motionCoverUrl,
    bodyMd: r.bodyMd,
    debrief: r.debrief,
    activity: r.activity,
    seoTitle: r.seoTitle,
    seoDescription: r.seoDescription,
  };
}

const subscribeXl = (cb: () => void) => {
  const mq = window.matchMedia("(min-width: 1280px)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};
function useIsXl() {
  return useSyncExternalStore(
    subscribeXl,
    () => window.matchMedia("(min-width: 1280px)").matches,
    () => false
  );
}

export default function CaseFileEditor({ id }: { id: string }) {
  return (
    <CaseFilesClient>
      <EditorLoader id={id} />
    </CaseFilesClient>
  );
}

function EditorLoader({ id }: { id: string }) {
  const client = useAdminClient();
  const [state, setState] = useState<{ detail?: CaseFileDetail; error?: AdminError; nonce: number }>({ nonce: 0 });
  useEffect(() => {
    let off = false;
    client
      .json<CaseFileDetail>(`/api/admin/case-files/${encodeURIComponent(id)}`)
      .then((detail) => {
        if (!off) setState((s) => ({ ...s, detail, error: undefined }));
      })
      .catch((e: AdminError) => {
        if (off) return;
        if (e?.status === 401) client.onUnauthorized();
        setState((s) => ({ ...s, error: e }));
      });
    return () => {
      off = true;
    };
  }, [client, id, state.nonce]);
  if (state.error)
    return (
      <div className="flex flex-col gap-3">
        <Link href="/admin/case-files" className="font-mono text-xs text-fg-3 hover:text-fg">
          ← case files
        </Link>
        <ErrorState error={state.error} title={state.error.status === 404 ? "Case file not found" : "Couldn't open the case file"} onRetry={() => setState((s) => ({ ...s, nonce: s.nonce + 1 }))} />
      </div>
    );
  if (!state.detail)
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-[60vh] w-full" />
      </div>
    );
  return <Editor key={state.detail.row.id} initial={state.detail} />;
}

function Editor({ initial }: { initial: CaseFileDetail }) {
  const client = useAdminClient();
  const router = useRouter();
  const isXl = useIsXl();
  const now = useNow(15_000);

  const [row, setRow] = useState<CaseFileRow>(initial.row);
  const [caseId, setCaseId] = useState<string | null>(initial.caseId);
  const [f, setF] = useState<CaseFileFields>(() => fieldsOf(initial.row));
  const [saved, setSaved] = useState<CaseFileFields>(() => fieldsOf(initial.row));
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string>(initial.row.updatedAt);
  const [serverValidation, setServerValidation] = useState<Validation>(initial.validation);
  const [preview, setPreview] = useState<{ r: RenderResult & { meta: CaseFile; totalCases: number }; fields: CaseFileFields } | null>(null);
  const [renderState, setRenderState] = useState<{ loading: boolean; error: string | null }>({ loading: true, error: null });
  const [diagrams, setDiagrams] = useState<{ total: number; failed: number } | null>(null);
  const [tab, setTab] = useState<Tab>("story");
  const [history, setHistory] = useState(false);
  const [layout, setLayout] = useState<"split" | "write" | "preview">("split");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "neutral" | "warn" | "bad"; text: ReactNode } | null>(null);
  const [slugAuto, setSlugAuto] = useState(() => !initial.row.publishedAt && !initial.row.overridesFile && (initial.row.slug.startsWith("untitled-case-file") || initial.row.slug === slugify(initial.row.title)));
  const md = useRef<MarkdownFieldHandle>(null);

  const readOnly = row.status === "archived";
  const slugLocked = row.overridesFile ? "imported repo story" : row.publishedAt ? "published once" : null;
  const dirty = !sameFields(f, saved);
  const validation = preview && sameFields(preview.fields, f) ? preview.r.validation : (preview?.r.validation ?? serverValidation);
  const problems = validation?.problems ?? [];
  const errors = validation?.errors ?? 0;
  const liveChanges = row.status === "published" && !!row.live && !sameFields(row.live, f);

  const set = useCallback((patch: Partial<CaseFileFields>) => setF((cur) => ({ ...cur, ...patch })), []);

  /* ───────────── save (manual + autosave) ───────────── */
  const live = useRef({ f, saved, version: row.version, saving: false, again: false });
  useEffect(() => {
    live.current.f = f;
    live.current.saved = saved;
    live.current.version = row.version;
  }, [f, saved, row.version]);

  const save = useCallback(
    async (autosave: boolean): Promise<boolean> => {
      const L = live.current;
      if (L.saving) {
        L.again = true;
        return false;
      }
      const sending = L.f;
      if (sameFields(sending, L.saved) && autosave) return true;
      L.saving = true;
      setSaveState("saving");
      try {
        const d = await client.json<CaseFileDetail>(`/api/admin/case-files/${row.id}`, jsonInit("PATCH", { fields: sending, baseVersion: L.version, autosave }));
        L.version = d.row.version;
        L.saved = sending;
        setRow(d.row);
        setCaseId(d.caseId);
        setSaved(sending);
        setServerValidation(d.validation);
        setSavedAt(d.row.updatedAt);
        setSaveState("saved");
        setSaveError(null);
        // the server keeps a published slug: reflect it
        if (d.row.slug !== sending.slug) setF((cur) => ({ ...cur, slug: d.row.slug }));
        return true;
      } catch (e) {
        const err = e as AdminError & { status?: number };
        if (err.status === 409) {
          setSaveState("conflict");
          setSaveError(err.message);
        } else {
          setSaveState("error");
          setSaveError(err.message);
        }
        return false;
      } finally {
        L.saving = false;
        if (L.again) {
          L.again = false;
          window.setTimeout(() => void save(true), 200);
        }
      }
    },
    [client, row.id]
  );

  useEffect(() => {
    if (!dirty || readOnly || saveState === "conflict") return;
    const t = window.setTimeout(() => void save(true), AUTOSAVE_MS);
    return () => window.clearTimeout(t);
  }, [f, dirty, readOnly, save, saveState]);

  // ⌘S / Ctrl+S
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (!readOnly) void save(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [save, readOnly]);

  // don't lose unsaved work
  useEffect(() => {
    if (!dirty) return;
    const onLeave = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [dirty]);

  /* ───────────── live render + validation ───────────── */
  const seq = useRef(0);
  useEffect(() => {
    const n = ++seq.current;
    const t = window.setTimeout(async () => {
      setRenderState((s) => ({ ...s, loading: true }));
      try {
        const r = await client.json<RenderResult & { meta: CaseFile; totalCases: number }>("/api/admin/case-files/render", jsonInit("POST", { id: row.id, fields: f }));
        if (n !== seq.current) return;
        setPreview({ r, fields: f });
        setRenderState({ loading: false, error: null });
      } catch (e) {
        if (n !== seq.current) return;
        setRenderState({ loading: false, error: (e as Error).message });
      }
    }, RENDER_MS);
    return () => window.clearTimeout(t);
  }, [f, client, row.id]);

  const payload = useMemo<FramePayload | null>(() => {
    if (!preview) return null;
    const pf = preview.fields;
    const debrief: Debrief | null = parseDebrief(pf.debrief);
    const activity: CaseActivityData | null = pf.activity && pf.activity.steps.length ? pf.activity : null;
    return { meta: { ...preview.r.meta, caseId: caseId || preview.r.caseId }, html: preview.r.html, checkpoints: preview.r.checkpoints, debrief, activity, totalCases: preview.r.totalCases };
  }, [preview, caseId]);

  /* ───────────── actions ───────────── */
  const schedule = async (publishAt: string | null) => {
    setBusy("schedule");
    setNotice(null);
    try {
      if (dirty && !readOnly) {
        const ok = await save(false);
        if (!ok) throw new Error("Save failed: fix that first.");
      }
      const d = await client.json<CaseFileDetail>(`/api/admin/case-files/${row.id}/action`, jsonInit("POST", { action: "schedule", publishAt }));
      live.current.version = d.row.version;
      setRow(d.row);
      setServerValidation(d.validation);
      setNotice(
        d.row.publishAt
          ? { tone: "neutral", text: `Scheduled: publishes automatically on ${new Date(d.row.publishAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })} (checked hourly). Keep it free of errors until then.` }
          : { tone: "neutral", text: "Schedule cancelled: it stays a draft until you publish it." },
      );
    } catch (e) {
      setNotice({ tone: "bad", text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  };

  const act = async (action: "publish" | "unpublish" | "archive" | "restore") => {
    setBusy(action);
    setNotice(null);
    try {
      if (dirty && !readOnly) {
        const ok = await save(false);
        if (!ok) throw new Error("Save failed: fix that first.");
      }
      const d = await client.json<CaseFileDetail>(`/api/admin/case-files/${row.id}/action`, jsonInit("POST", { action }));
      live.current.version = d.row.version;
      setRow(d.row);
      setCaseId(d.caseId);
      setServerValidation(d.validation);
      setSavedAt(d.row.updatedAt);
      if (action === "publish")
        setNotice({
          tone: "neutral",
          text: (
            <>
              Published as <strong className="text-signal-text">{d.caseId}</strong>. The case files index, home teaser and this story&apos;s page are refreshing.{" "}
              <a href={`/stories/${d.row.slug}`} target="_blank" rel="noreferrer" className="text-signal-text underline">
                view /stories/{d.row.slug} ↗
              </a>
            </>
          ),
        });
      else if (action === "unpublish") setNotice({ tone: "warn", text: "Unpublished: /stories/" + d.row.slug + " now answers 404. The case number stays reserved." });
      else if (action === "archive") setNotice({ tone: "warn", text: "Archived: read-only and off the site. Restore it to edit again." });
      else setNotice({ tone: "neutral", text: "Restored as a draft." });
    } catch (e) {
      const err = e as AdminError & { validation?: Validation };
      if (err.validation) {
        setServerValidation(err.validation);
        setTab("checks");
      }
      setNotice({ tone: "bad", text: err.message });
    } finally {
      setBusy(null);
    }
  };

  const duplicate = async () => {
    setBusy("duplicate");
    try {
      if (dirty) await save(false);
      const { row: copy } = await client.json<{ row: CaseFileRow }>("/api/admin/case-files", jsonInit("POST", { from: "duplicate", sourceId: row.id }));
      router.push(`/admin/case-files/${copy.id}`);
    } catch (e) {
      setNotice({ tone: "bad", text: (e as Error).message });
      setBusy(null);
    }
  };

  const remove = async () => {
    setBusy("delete");
    try {
      await client.json(`/api/admin/case-files/${row.id}`, { method: "DELETE" });
      live.current.saved = live.current.f; // nothing left to protect
      setSaved(f);
      router.push("/admin/case-files");
    } catch (e) {
      setNotice({ tone: "bad", text: (e as Error).message });
      setBusy(null);
    }
  };

  const restoreRevision = async (revisionId: string) => {
    if (dirty) await save(false);
    const d = await client.json<CaseFileDetail>(`/api/admin/case-files/${row.id}/revisions`, jsonInit("POST", { revisionId, baseVersion: live.current.version }));
    const next = fieldsOf(d.row);
    live.current.version = d.row.version;
    live.current.saved = next;
    setRow(d.row);
    setSaved(next);
    setF(next);
    setServerValidation(d.validation);
    setSavedAt(d.row.updatedAt);
    setNotice({ tone: "neutral", text: `Restored into the working copy as v${d.row.version}. Publish to make it live.` });
  };

  const reload = () => window.location.reload();

  const reserve = async (n: number | null) => {
    const d = await client.json<CaseFileDetail>(`/api/admin/case-files/${row.id}/action`, jsonInit("POST", { action: "number", caseNumber: n }));
    setRow(d.row);
    setCaseId(d.caseId);
  };

  const upload = useCallback((file: File, kind: "cover" | "motion" | "image") => uploadCaseImage(client, file, f.slug || "unsorted", kind), [client, f.slug]);

  const jump = (p: Problem) => {
    if (p.area === "body") {
      setTab("story");
      if (p.line) window.setTimeout(() => md.current?.goToLine(p.line!), 60);
      return;
    }
    const t: Tab = p.area === "seo" ? "details" : (p.area as Tab);
    setTab(t);
    if (p.field)
      window.setTimeout(() => {
        const el = document.getElementById(`cf-${p.field}`) || document.querySelector<HTMLElement>(`[data-field-problems="${p.field}"]`);
        el?.scrollIntoView({ block: "center" });
        if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) el.focus({ preventScroll: true });
      }, 60);
  };

  const count = (area: Problem["area"] | Problem["area"][]) => {
    const as = Array.isArray(area) ? area : [area];
    const ps = problems.filter((p) => as.includes(p.area));
    const e = ps.filter((p) => p.level === "error").length;
    return e || null;
  };

  const words = validation?.stats.words ?? 0;
  const tabs: { id: Tab; label: string; count?: number | null }[] = [
    { id: "story", label: "story", count: count("body") },
    { id: "details", label: "details", count: count(["details", "seo"]) },
    { id: "debrief", label: "debrief", count: count("debrief") },
    { id: "activity", label: "activity", count: count("activity") },
    { id: "checks", label: errors ? "checks" : "checks ✓", count: errors || null },
    ...(!isXl ? [{ id: "preview" as Tab, label: "preview" }] : []),
  ];
  const activeTab = isXl && tab === "preview" ? "story" : tab;

  const saveLabel =
    saveState === "saving"
      ? "saving…"
      : saveState === "conflict"
        ? "conflict"
        : saveState === "error"
          ? "save failed"
          : dirty
            ? "unsaved changes"
            : `saved ${timeAgo(savedAt, now)}`;

  const previewPane = (
    <PreviewPane
      payload={payload}
      loading={renderState.loading}
      error={renderState.error}
      standaloneHref={`/admin/case-files/frame?id=${row.id}${client.preview ? "&preview=1" : ""}`}
      onDiagrams={setDiagrams}
      className={isXl ? "h-[calc(100dvh-var(--hk-header-h,57px)-140px)]" : "min-h-[75vh]"}
    />
  );

  return (
    <div className="flex flex-col gap-4">
      {/* header */}
      <div className="flex flex-col gap-3 border-b border-line pb-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link href="/admin/case-files" className="inline-flex min-h-10 items-center font-mono text-xs text-fg-3 hover:text-fg">
            ← case files
          </Link>
          <span className={cx("font-mono text-[11px]", saveState === "error" || saveState === "conflict" ? "text-bad-text" : dirty ? "text-signal-text" : "text-fg-3")} aria-live="polite">
            {saveLabel} · v{row.version}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 font-mono text-[11px]">
          <span className={cx("px-2 py-1 font-semibold", caseId && row.publishedAt ? "bg-signal text-on-signal" : "border border-dashed border-line-strong text-fg-3")} title={row.publishedAt ? undefined : "Assigned on first publish"}>
            {caseId ? (row.publishedAt || row.overridesFile ? caseId : `${caseId} reserved`) : `${preview?.r.caseId ?? "CASE-0··"} on publish`}
          </span>
          <StatusBadge status={row.status} />
          {liveChanges && <Badge tone="signal">live differs</Badge>}
          {row.overridesFile && <Badge tone="neutral" title={`Replaces content/stories/${row.slug}.md while published`}>imported</Badge>}
          <span className="border border-line-strong px-2 py-1 uppercase text-fg-2">{CASE_TYPE_LABEL[f.type]}</span>
          <span className="border border-line-strong px-2 py-1 text-fg-2">{readMinutes(words)} MIN</span>
        </div>
        <h1 className="m-0 break-words font-display text-[26px] font-extrabold leading-[1.05] tracking-tightest text-fg sm:text-[34px]">{f.title || "Untitled case file"}</h1>
        <div className="flex flex-wrap items-center gap-2">
          {!readOnly && (
            <button type="button" className={BTN} disabled={!dirty || saveState === "saving"} onClick={() => void save(false)}>
              save
            </button>
          )}
          <button type="button" className={BTN} onClick={() => setHistory(true)}>
            history
          </button>
          <button type="button" className={BTN} disabled={!!busy} onClick={duplicate}>
            {busy === "duplicate" ? "duplicating…" : "duplicate"}
          </button>
          {row.status === "published" && (
            <a className={BTN} href={`/stories/${row.slug}`} target="_blank" rel="noreferrer">
              view live ↗
            </a>
          )}
          <span className="grow" />
          {row.status === "published" && <Confirm label="unpublish" busy={busy === "unpublish"} onConfirm={() => act("unpublish")} danger />}
          {row.status !== "archived" ? <Confirm label="archive" busy={busy === "archive"} onConfirm={() => act("archive")} danger /> : <Confirm label="restore" busy={busy === "restore"} onConfirm={() => act("restore")} />}
          {row.status !== "published" && !row.publishedAt && <Confirm label="delete draft" busy={busy === "delete"} onConfirm={remove} danger />}
          {!readOnly && row.status === "draft" && errors === 0 && <ScheduleControl publishAt={row.publishAt} busy={busy === "schedule"} onSave={schedule} />}
          {!readOnly &&
            (errors > 0 ? (
              <button type="button" className={cx(BTN, "border-bad/60 text-bad-text")} onClick={() => setTab("checks")} title="Publishing is blocked until every error is fixed">
                ✗ fix {errors} error{errors === 1 ? "" : "s"} to publish
              </button>
            ) : (
              <Confirm
                primary
                label={row.status === "published" ? (liveChanges ? "update live" : "republish") : "publish"}
                busy={busy === "publish"}
                onConfirm={() => act("publish")}
                disabled={row.status === "published" && !liveChanges}
              />
            ))}
        </div>
      </div>

      {saveState === "conflict" && (
        <Note tone="bad" title="Edited somewhere else">
          {saveError} Your unsaved text is still in this tab: copy it if you need it, then{" "}
          <button type="button" className="underline" onClick={reload}>
            reload
          </button>
          .
        </Note>
      )}
      {saveState === "error" && saveError && (
        <Note tone="bad" title="Save failed">
          {saveError}
        </Note>
      )}
      {readOnly && <Note tone="warn" title="Archived">This case file is read-only and off the site. Restore it to edit or publish again.</Note>}
      {notice && (
        <Note tone={notice.tone} className="flex items-start justify-between gap-3">
          <span>{notice.text}</span>
          <button type="button" aria-label="Dismiss" className="shrink-0 px-1 text-fg-3 hover:text-fg" onClick={() => setNotice(null)}>
            ×
          </button>
        </Note>
      )}

      {isXl && (
        <div role="radiogroup" aria-label="Layout" className="-mt-1 inline-flex self-end border border-line-strong">
          {(["write", "split", "preview"] as const).map((l, i) => (
            <button
              key={l}
              type="button"
              role="radio"
              aria-checked={layout === l}
              onClick={() => setLayout(l)}
              className={cx("min-h-9 px-2.5 font-mono text-[11px]", i > 0 && "border-l border-line-strong", layout === l ? "bg-signal font-semibold text-on-signal" : "text-fg-2 hover:bg-surface-2")}
            >
              {l}
            </button>
          ))}
        </div>
      )}
      <div className={cx(isXl && layout === "split" && "grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-4")}>
        <div className={cx("flex min-w-0 flex-col gap-3", isXl && layout === "preview" && "hidden")}>
          <Tabs<Tab> label="Editor sections" value={activeTab} onChange={setTab} tabs={tabs} />
          {activeTab === "story" && (
            <MarkdownField ref={md} value={f.bodyMd} onChange={(v) => set({ bodyMd: v })} problems={problems.filter((p) => p.area === "body")} readOnly={readOnly} onUploadImage={(file) => upload(file, "image")} words={words} minutes={readMinutes(words)} />
          )}
          {activeTab === "details" && (
            <DetailsForm
              f={f}
              set={set}
              problems={problems.filter((p) => p.area === "details" || p.area === "seo")}
              slugLocked={slugLocked}
              readOnly={readOnly}
              onUpload={(file, kind) => upload(file, kind)}
              slugAuto={slugAuto}
              setSlugAuto={setSlugAuto}
              caseNumber={row.overridesFile ? undefined : { value: row.caseNumber, next: row.caseNumber ? null : (preview?.r.caseId ?? null), canReserve: !row.publishedAt, onReserve: reserve }}
            />
          )}
          {activeTab === "debrief" && <DebriefForm d={f.debrief} set={(d) => set({ debrief: d })} problems={problems.filter((p) => p.area === "debrief")} readOnly={readOnly} />}
          {activeTab === "activity" && <ActivityBuilder a={f.activity} set={(a) => set({ activity: a })} problems={problems.filter((p) => p.area === "activity")} readOnly={readOnly} />}
          {activeTab === "checks" && <ChecksPanel v={validation} onJump={jump} diagrams={diagrams} />}
          {activeTab === "preview" && previewPane}
          {activeTab !== "checks" && activeTab !== "preview" && (
            <button type="button" onClick={() => setTab("checks")} className={cx("flex min-h-10 items-center justify-between gap-3 border px-3 text-left font-mono text-[12px]", errors ? "border-bad/50 text-bad-text" : "border-line text-fg-3")}>
              <span>{errors ? `✗ ${errors} error${errors === 1 ? "" : "s"} · ${validation?.warnings ?? 0} warnings` : `✓ no errors · ${validation?.warnings ?? 0} warnings`}</span>
              <span className={LABEL}>checks →</span>
            </button>
          )}
        </div>
        {isXl && layout !== "write" && <div className="sticky top-[calc(var(--hk-header-h,57px)+16px)] self-start">{previewPane}</div>}
      </div>

      <HistoryDrawer id={row.id} open={history} onClose={() => setHistory(false)} onRestore={restoreRevision} currentVersion={row.version} readOnly={readOnly} />
    </div>
  );
}

/** Drafts: pick a date and time to publish automatically (the scheduler runs hourly), or cancel it. */
function ScheduleControl({ publishAt, busy, onSave }: { publishAt: string | null; busy: boolean; onSave: (iso: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const toLocal = (iso: string) => {
    const d = new Date(iso);
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  };
  const [value, setValue] = useState(() => (publishAt ? toLocal(publishAt) : ""));
  if (!open)
    return publishAt ? (
      <span className="inline-flex items-center gap-1.5">
        <span className="font-mono text-xs text-signal-text">⏱ {new Date(publishAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</span>
        <button type="button" className={BTN} onClick={() => setOpen(true)}>
          change
        </button>
        <button type="button" className={BTN} disabled={busy} onClick={() => onSave(null)}>
          {busy ? "…" : "cancel schedule"}
        </button>
      </span>
    ) : (
      <button type="button" className={BTN} onClick={() => setOpen(true)} title="Publish automatically at a date and time">
        schedule…
      </button>
    );
  return (
    <span className="inline-flex items-center gap-1.5">
      <label className="sr-only" htmlFor="cf-publish-at">
        Publish at
      </label>
      <input id="cf-publish-at" type="datetime-local" value={value} onChange={(e) => setValue(e.target.value)} className="min-h-10 border border-line-strong bg-bg px-2 font-mono text-xs text-fg" />
      <button
        type="button"
        className={BTN}
        disabled={busy || !value}
        onClick={() => {
          onSave(new Date(value).toISOString());
          setOpen(false);
        }}
      >
        {busy ? "saving…" : "save schedule"}
      </button>
      <button type="button" className={BTN} onClick={() => setOpen(false)}>
        close
      </button>
    </span>
  );
}

function Confirm({ label, onConfirm, busy, danger, primary, disabled }: { label: string; onConfirm: () => void; busy?: boolean; danger?: boolean; primary?: boolean; disabled?: boolean }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = window.setTimeout(() => setArmed(false), 5000);
    return () => window.clearTimeout(t);
  }, [armed]);
  if (busy) return <span className={cx(primary ? BTN_PRIMARY : BTN, "opacity-70")}>{label}…</span>;
  if (!armed)
    return (
      <button type="button" disabled={disabled} className={cx(primary ? BTN_PRIMARY : BTN, danger && "hover:border-bad hover:text-bad-text")} onClick={() => setArmed(true)}>
        {label}
      </button>
    );
  return (
    <span className="inline-flex animate-hk-in" role="group" aria-label={`Confirm ${label}`}>
      <button
        type="button"
        autoFocus
        className={cx("min-h-10 px-3 font-mono text-xs font-semibold", danger ? "bg-bad text-white" : "bg-signal text-on-signal")}
        onClick={() => {
          setArmed(false);
          onConfirm();
        }}
      >
        confirm {label}
      </button>
      <button type="button" className="min-h-10 border border-l-0 border-line-strong px-3 font-mono text-xs text-fg-3 hover:text-fg" onClick={() => setArmed(false)}>
        cancel
      </button>
    </span>
  );
}
