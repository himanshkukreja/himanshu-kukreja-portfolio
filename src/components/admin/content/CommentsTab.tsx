"use client";

/** Comment moderation (lesson_comments + story_comments): search, filter by kind, delete. Plain text only. */
import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge, Card, ConfirmButton, EmptyState, ErrorState, Skeleton, fmtDate, timeAgo, useAdminClient, useAdminData } from "../ui";
import type { AdminComment } from "../shell/types";
import { SearchInput, Segmented, type useFlash } from "./common";

type Say = ReturnType<typeof useFlash>["say"];
const jsonInit = (method: string, body: unknown): RequestInit => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export default function CommentsTab({ say }: { say: Say }) {
  const client = useAdminClient();
  const res = useAdminData<{ comments: AdminComment[]; errors: string[] }>("/api/admin/comments?limit=300");
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<"all" | "lesson" | "story">("all");

  const all = useMemo(() => res.data?.comments ?? [], [res.data]);
  const shown = useMemo(() => {
    const n = q.trim().toLowerCase();
    return all.filter((c) => (kind === "all" || c.kind === kind) && (!n || [c.text, c.name, c.where].some((v) => v?.toLowerCase().includes(n))));
  }, [all, q, kind]);

  const remove = async (c: AdminComment) => {
    try {
      await client.json("/api/admin/comments", jsonInit("DELETE", { kind: c.kind, id: c.id }));
      // replies cascade in the DB
      res.mutate((d) => (d ? { ...d, comments: d.comments.filter((x) => x.id !== c.id && x.parentId !== c.id) } : d));
      say("Comment deleted");
    } catch (e) {
      say(`Delete failed: ${(e as Error).message}`, "bad");
    }
  };

  if (res.error && !res.data) return <ErrorState error={res.error} onRetry={res.refresh} title="Couldn't load comments" />;

  return (
    <Card label="lesson_comments · story_comments" title="Comment moderation" pad={false}>
      <div className="flex flex-col gap-2 border-b border-line p-4 sm:flex-row sm:items-center">
        <SearchInput value={q} onChange={setQ} placeholder="text, author, lesson" className="sm:max-w-sm sm:flex-1" label="Search comments" />
        <Segmented
          label="Comment type"
          value={kind}
          onChange={setKind}
          options={[
            { id: "all", label: `all ${all.length}` },
            { id: "lesson", label: `lessons ${all.filter((c) => c.kind === "lesson").length}` },
            { id: "story", label: `stories ${all.filter((c) => c.kind === "story").length}` },
          ]}
        />
      </div>
      {res.data?.errors?.length ? <p className="border-b border-line px-4 py-2 font-mono text-[11px] text-bad-text">partial: {res.data.errors.join(" · ")}</p> : null}
      {res.loading && !res.data ? (
        <div className="flex flex-col gap-2 p-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : !shown.length ? (
        <div className="p-4">
          <EmptyState title={all.length ? "Nothing matches" : "No comments yet"} />
        </div>
      ) : (
        <ul className="divide-y divide-line">
          {shown.map((c) => (
            <li key={`${c.kind}-${c.id}`} className={`flex flex-col gap-2 py-3.5 pr-4 ${c.parentId ? "pl-8 sm:pl-10" : "pl-4"}`}>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                {c.parentId && <span className="font-mono text-xs text-fg-4">↳</span>}
                <span className="min-w-0 truncate text-sm font-semibold text-fg">{c.name || "Anonymous"}</span>
                <Badge tone={c.kind === "lesson" ? "signal" : "neutral"}>{c.kind}</Badge>
                <Link href={c.href} target="_blank" className="min-w-0 max-w-full truncate font-mono text-[11px] text-fg-3 underline-offset-4 hover:text-fg hover:underline">
                  {c.where} ↗
                </Link>
                <span className="ml-auto font-mono text-[11px] text-fg-3" title={fmtDate(c.createdAt, true)}>
                  {timeAgo(c.createdAt)}
                </span>
              </div>
              {/* comment bodies are user HTML upstream; the API sends plain text and we render it as text */}
              <p className="line-clamp-4 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-fg-2">{c.text || <span className="text-fg-4">(empty)</span>}</p>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-[11px] text-fg-4">▲ {c.upvotes}</span>
                <Link href={`/admin/learners/${encodeURIComponent(c.userId)}`} className="min-h-9 content-center px-1 font-mono text-[11px] text-fg-3 hover:text-fg">
                  author →
                </Link>
                <ConfirmButton size="sm" className="ml-auto" confirmLabel={c.parentId ? "delete reply?" : "delete + replies?"} onConfirm={() => remove(c)} aria-label="Delete comment">
                  delete
                </ConfirmButton>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
