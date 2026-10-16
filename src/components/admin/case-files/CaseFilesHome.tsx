"use client";

/** /admin/case-files: every case file (CMS rows + repo stories) with status filters, search and actions. */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Badge, EmptyState, ErrorState, LABEL, PageHead, Skeleton, Table, Tabs, fmtCompact, timeAgo, useAdminClient, useAdminData, type AdminError, type Column } from "@/components/admin/ui";
import { CASE_TYPE_LABEL } from "@/components/stories/case-types";
import type { CaseFileListItem, CaseFilesList, CaseFileRow } from "@/lib/case-files/types";
import { BTN, BTN_PRIMARY, CaseFilesClient, INPUT, Note, StatusBadge, cx, jsonInit } from "./client";

type Filter = "all" | "draft" | "published" | "archived" | "repo";

export default function CaseFilesHome() {
  return (
    <CaseFilesClient>
      <Home />
    </CaseFilesClient>
  );
}

function Home() {
  const client = useAdminClient();
  const router = useRouter();
  const { data, error, loading, refresh } = useAdminData<CaseFilesList>("/api/admin/case-files");
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const items = useMemo(() => data?.items ?? [], [data]);
  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: items.length, draft: 0, published: 0, archived: 0, repo: 0 };
    for (const it of items) c[it.status as Filter]++;
    return c;
  }, [items]);
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return items
      .filter((it) => filter === "all" || it.status === filter)
      .filter((it) => !needle || `${it.title} ${it.slug} ${it.caseId ?? ""}`.toLowerCase().includes(needle))
      .sort((a, b) => (b.updatedAt || b.date || "").localeCompare(a.updatedAt || a.date || ""));
  }, [items, filter, q]);

  const ready = !!data?.setup.ready;

  const create = async (from: "template" | "blank" | "duplicate" | "import", sourceId?: string) => {
    setBusy(sourceId || from);
    setActionError(null);
    try {
      const { row } = await client.json<{ row: CaseFileRow }>("/api/admin/case-files", jsonInit("POST", { from, sourceId }));
      router.push(`/admin/case-files/${row.id}`);
    } catch (e) {
      const err = e as AdminError & { id?: string };
      setActionError(err.message);
      setBusy(null);
    }
  };

  const act = async (it: CaseFileListItem, action: "publish" | "unpublish" | "archive" | "restore" | "delete") => {
    setBusy(it.id);
    setActionError(null);
    try {
      if (action === "delete") await client.json(`/api/admin/case-files/${it.id}`, { method: "DELETE" });
      else await client.json(`/api/admin/case-files/${it.id}/action`, jsonInit("POST", { action }));
      refresh();
    } catch (e) {
      setActionError(`${it.title}: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  const columns: Column<CaseFileListItem>[] = [
    {
      key: "case",
      header: "Case",
      sort: (r) => r.caseId || "~",
      render: (r) => <CaseCell r={r} />,
    },
    {
      key: "title",
      header: "Title",
      sort: (r) => r.title.toLowerCase(),
      className: "min-w-[280px]",
      render: (r) => (
        <div className="flex min-w-0 flex-col gap-0.5">
          {r.origin === "db" ? (
            <Link href={`/admin/case-files/${r.id}`} className="line-clamp-2 font-semibold text-fg hover:text-signal-text">
              {r.title}
            </Link>
          ) : (
            <span className="line-clamp-2 font-semibold text-fg">{r.title}</span>
          )}
          <span className="truncate font-mono text-[11px] text-fg-4">/stories/{r.slug}</span>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      sort: (r) => r.status,
      render: (r) => <StatusCell r={r} />,
    },
    { key: "type", header: "Type", hideOnPhone: true, sort: (r) => r.type, render: (r) => <span className={cx("font-mono text-[11px] uppercase", r.type === "incident" ? "text-bad-text" : "text-fg-2")}>{CASE_TYPE_LABEL[r.type]}</span> },
    {
      key: "updated",
      header: "Updated",
      sort: (r) => r.updatedAt || r.date || "",
      render: (r) => (
        <span className="whitespace-nowrap font-mono text-[11px] text-fg-3" title={r.updatedAt || r.date || ""}>
          {r.updatedAt ? timeAgo(r.updatedAt) : r.date ? `opened ${r.date}` : "—"}
          {r.updatedBy && <span className="block text-fg-4">{r.updatedBy.split("@")[0]}</span>}
        </span>
      ),
    },
    {
      key: "views",
      header: "Reads",
      align: "right",
      sort: (r) => r.uniqueViews ?? -1,
      render: (r) => (
        <span className="font-mono text-xs text-fg-2" title={r.views != null ? `${r.views} views · ${r.uniqueViews} unique` : "no views yet"}>
          {r.uniqueViews != null ? fmtCompact(r.uniqueViews) : "—"}
        </span>
      ),
    },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      align: "right",
      render: (r) => <RowActions r={r} busy={busy === r.id || busy === `file:${r.slug}`} ready={ready} onCreate={create} onAct={act} />,
    },
  ];

  return (
    <div>
      <PageHead
        path="~/admin/case-files"
        title="Case files"
        sub="Write, preview and publish case files from here. Drafts and archived files never reach the site; repo stories stay in content/stories until you import one."
        actions={
          <>
            <button type="button" className={BTN} disabled={!ready || !!busy} onClick={() => create("blank")}>
              blank
            </button>
            <button type="button" className={BTN_PRIMARY} disabled={!ready || !!busy} onClick={() => create("template")}>
              {busy === "template" ? "creating…" : "+ new case file"}
            </button>
          </>
        }
      />

      {data && !data.setup.ready && (
        <Note tone="warn" title="Migration not applied" className="mb-4">
          Apply <code className="font-mono text-[12px]">supabase/migrations/20261016_case_files_cms.sql</code> (tables + the <code className="font-mono text-[12px]">case-files</code> storage bucket) to start writing case
          files here. Until then the site keeps serving the repo stories below.
        </Note>
      )}
      {data?.setup.store === "file" && (
        <Note title="Dev store" className="mb-4">
          Using the local JSON store (CASE_FILES_STORE=file). Uploads go to public/case-files/_cms. Nothing here touches Supabase.
        </Note>
      )}
      {actionError && (
        <Note tone="bad" title="That didn't work" className="mb-4">
          {actionError}
        </Note>
      )}

      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <Tabs<Filter>
          label="Status"
          value={filter}
          onChange={setFilter}
          className="min-w-0 flex-1"
          tabs={[
            { id: "all", label: "all", count: counts.all },
            { id: "draft", label: "drafts", count: counts.draft },
            { id: "published", label: "published", count: counts.published },
            { id: "archived", label: "archived", count: counts.archived },
            { id: "repo", label: "repo", count: counts.repo },
          ]}
        />
        <label className="relative w-full sm:w-64">
          <span className="sr-only">Search case files</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="search title, slug, CASE-0…" className={INPUT} type="search" />
        </label>
      </div>

      {error && !data ? (
        <ErrorState error={error} title="Couldn't load case files" onRetry={refresh} />
      ) : loading && !data ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : !rows.length ? (
        <EmptyState
          title={q ? `Nothing matches "${q}"` : filter === "all" ? "No case files yet" : `No ${filter} case files`}
          hint={filter === "draft" || filter === "all" ? "Start one from the template: it has the chapters, diagrams, debrief and activity every case file needs." : undefined}
          action={
            ready && (filter === "draft" || filter === "all") ? (
              <button type="button" className={BTN_PRIMARY} onClick={() => create("template")}>
                + new case file
              </button>
            ) : undefined
          }
        />
      ) : (
        <>
          <div className="hidden md:block">
            <Table columns={columns} rows={rows} rowKey={(r) => r.id} minWidth={860} />
          </div>
          <ul className="m-0 flex list-none flex-col gap-2 p-0 md:hidden">
            {rows.map((r) => (
              <li key={r.id} className="flex flex-col gap-2 border border-line bg-surface p-3">
                <div className="flex items-center justify-between gap-2">
                  <CaseCell r={r} />
                  <StatusCell r={r} />
                </div>
                {r.origin === "db" ? (
                  <Link href={`/admin/case-files/${r.id}`} className="font-semibold leading-snug text-fg">
                    {r.title}
                  </Link>
                ) : (
                  <span className="font-semibold leading-snug text-fg">{r.title}</span>
                )}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-fg-3">
                  <span className={r.type === "incident" ? "text-bad-text" : ""}>{CASE_TYPE_LABEL[r.type].toUpperCase()}</span>
                  <span>{r.updatedAt ? `updated ${timeAgo(r.updatedAt)}` : r.date ? `opened ${r.date}` : ""}</span>
                  {r.uniqueViews != null && <span>{fmtCompact(r.uniqueViews)} reads</span>}
                </div>
                <div className="border-t border-line pt-2">
                  <RowActions r={r} busy={busy === r.id || busy === `file:${r.slug}`} ready={ready} onCreate={create} onAct={act} wide />
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {data && (
        <p className={`${LABEL} mt-4 normal-case tracking-normal`}>
          Next case number on publish: <span className="text-signal-text">{data.nextCaseId}</span> · repo stories keep CASE-001…{String(counts.repo).padStart(3, "0")}
        </p>
      )}
    </div>
  );
}

function CaseCell({ r }: { r: CaseFileListItem }) {
  const reserved = r.origin === "db" && !r.everPublished && !!r.caseId;
  return (
    <span className={cx("whitespace-nowrap font-mono text-xs", r.caseId && !reserved ? "font-semibold text-signal-text" : "text-fg-3")} title={reserved ? "Reserved: assigned when it is first published" : undefined}>
      {r.caseId || "CASE-···"}
      {reserved && <span className="block text-[10px] text-fg-4">reserved</span>}
    </span>
  );
}

function StatusCell({ r }: { r: CaseFileListItem }) {
  return (
    <span className="flex flex-wrap items-center gap-1">
      <StatusBadge status={r.status} />
      {r.unpublishedChanges && <Badge tone="signal">changes</Badge>}
      {r.overrides && <Badge tone="neutral" title="Imported from content/stories: while published it replaces the repo file">import</Badge>}
      {r.overriddenBy && <Badge tone="muted" title="Imported into the CMS">in cms</Badge>}
      {r.errors ? (
        <Badge tone="bad" title="Validator errors (blocks publishing)">
          {r.errors} err
        </Badge>
      ) : null}
    </span>
  );
}

type MenuItem = { key: string; label: string; href?: string; external?: boolean; run?: () => void; danger?: boolean; confirm?: boolean; disabled?: boolean; title?: string };

function RowActions({
  r,
  busy,
  ready,
  onCreate,
  onAct,
  wide,
}: {
  r: CaseFileListItem;
  busy: boolean;
  ready: boolean;
  onCreate: (from: "duplicate" | "import", sourceId: string) => void;
  onAct: (r: CaseFileListItem, a: "publish" | "unpublish" | "archive" | "restore" | "delete") => void;
  wide?: boolean;
}) {
  const client = useAdminClient();
  const link = cx("inline-flex min-h-9 items-center whitespace-nowrap border border-line-strong px-2.5 font-mono text-[11px] text-fg-2 hover:bg-surface-2 hover:text-fg", wide && "min-h-10");
  const items: MenuItem[] = [];
  if (r.origin === "file") {
    items.push({ key: "view", label: "view on site ↗", href: `/stories/${r.slug}`, external: true });
    if (!r.overriddenBy) {
      items.push({ key: "import", label: "import to edit here", run: () => onCreate("import", r.id), disabled: !ready, title: "Copy this repo story into the CMS; once published, the CMS version replaces the repo file" });
      items.push({ key: "dup", label: "duplicate as a new case file", run: () => onCreate("duplicate", r.id), disabled: !ready });
    }
  } else {
    items.push({ key: "preview", label: "preview ↗", href: `/admin/case-files/frame?id=${r.id}${client.preview ? "&preview=1" : ""}`, external: true });
    if (r.status === "published") items.push({ key: "view", label: "view on site ↗", href: `/stories/${r.slug}`, external: true });
    items.push({ key: "dup", label: "duplicate", run: () => onCreate("duplicate", r.id), disabled: !ready });
    if (r.status === "draft") items.push({ key: "publish", label: r.errors ? `publish (fix ${r.errors} errors first)` : "publish", run: () => onAct(r, "publish"), confirm: true, disabled: !ready || !!r.errors });
    if (r.status === "published") items.push({ key: "unpublish", label: "unpublish", run: () => onAct(r, "unpublish"), confirm: true, danger: true });
    if (r.status !== "archived") items.push({ key: "archive", label: "archive", run: () => onAct(r, "archive"), confirm: true, danger: true });
    else items.push({ key: "restore", label: "restore as draft", run: () => onAct(r, "restore"), confirm: true });
    if (r.status !== "published" && !r.everPublished) items.push({ key: "delete", label: "delete draft", run: () => onAct(r, "delete"), confirm: true, danger: true });
  }
  return (
    <span className={cx("flex items-center gap-1", !wide && "justify-end")}>
      {r.origin === "db" ? (
        <Link href={`/admin/case-files/${r.id}`} className={link}>
          edit
        </Link>
      ) : r.overriddenBy ? (
        <Link href={`/admin/case-files/${r.overriddenBy}`} className={link}>
          edit in cms
        </Link>
      ) : null}
      <RowMenu items={items} busy={busy} label={`Actions for ${r.title}`} className={link} />
    </span>
  );
}

function RowMenu({ items, busy, label, className }: { items: MenuItem[]; busy: boolean; label: string; className: string }) {
  const [open, setOpen] = useState<{ top: number; right: number } | null>(null);
  const [armed, setArmed] = useState<string | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = () => {
      setOpen(null);
      setArmed(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        close();
        btn.current?.focus();
      }
    };
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);
  const toggle = () => {
    if (open) return setOpen(null);
    const r = btn.current!.getBoundingClientRect();
    setOpen({ top: r.bottom + 4, right: Math.max(8, window.innerWidth - r.right) });
  };
  return (
    <>
      <button ref={btn} type="button" aria-haspopup="menu" aria-expanded={!!open} aria-label={label} disabled={busy} className={cx(className, "disabled:opacity-50")} onClick={toggle}>
        {busy ? "…" : "⋯"}
      </button>
      {open &&
        createPortal(
          <div className="fixed inset-0 z-[95]" onClick={() => (setOpen(null), setArmed(null))}>
            <div
              role="menu"
              aria-label={label}
              className="absolute min-w-[220px] animate-hk-in border border-line-strong bg-surface py-1 shadow-[0_12px_32px_rgba(0,0,0,0.35)]"
              style={{ top: open.top, right: open.right }}
              onClick={(e) => e.stopPropagation()}
            >
              {items.map((it) =>
                it.href ? (
                  <a key={it.key} role="menuitem" href={it.href} target={it.external ? "_blank" : undefined} rel="noreferrer" className="flex min-h-10 items-center px-3 font-mono text-[12px] text-fg-2 hover:bg-surface-2 hover:text-fg" onClick={() => setOpen(null)}>
                    {it.label}
                  </a>
                ) : (
                  <button
                    key={it.key}
                    role="menuitem"
                    type="button"
                    title={it.title}
                    disabled={it.disabled}
                    className={cx(
                      "flex min-h-10 w-full items-center px-3 text-left font-mono text-[12px] disabled:cursor-not-allowed disabled:opacity-40",
                      armed === it.key ? (it.danger ? "bg-bad font-semibold text-white" : "bg-signal font-semibold text-on-signal") : it.danger ? "text-fg-2 hover:bg-surface-2 hover:text-bad-text" : "text-fg-2 hover:bg-surface-2 hover:text-fg"
                    )}
                    onClick={() => {
                      if (it.confirm && armed !== it.key) return setArmed(it.key);
                      setOpen(null);
                      setArmed(null);
                      it.run?.();
                    }}
                  >
                    {armed === it.key ? `confirm ${it.label}?` : it.label}
                  </button>
                )
              )}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
