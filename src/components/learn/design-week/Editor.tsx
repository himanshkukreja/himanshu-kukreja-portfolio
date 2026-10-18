"use client";

/**
 * /learn/design-week/<slug>/edit: write a design in markdown with a live preview (same sanitizer +
 * renderer as the public page, Mermaid included), autosave to the server (and a local backup in
 * case the connection drops), submit, keep editing until submissions close, withdraw or delete.
 */
import "@/app/learn/course-content.css";
import "@/app/learn/course-blocks.css";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { useGame } from "@/game/GameProvider";
import { track } from "@/lib/track";
import { canSubmitIn, LIMITS, lintBody, XP } from "@/lib/design-week/core";
import type { ChallengeView, MySubmission } from "@/lib/design-week/views";
import MermaidHydrator from "@/components/diagrams/MermaidHydrator";
import OnlineOnly from "@/components/offline/OnlineOnly";
import { dowJson, useMe, type DowFetchError } from "./client";
import DevPersonaBar from "./DevPersonaBar";
import { BASE, BTN, BTN_GHOST, Countdown, fmtIst, LABEL, Note, PhaseBadge } from "./ui";

const STARTER = `## Requirements

- Functional:
- Non-functional:
- Out of scope:

## Estimates

| What | Number |
|---|---|
| Peak QPS | |
| Storage | |

## API and data model

## High-level design

\`\`\`mermaid
%% title: High-level design
flowchart TD
  U@{ icon: "sd:users", label: "Clients" } --> LB@{ icon: "sd:load-balancer", label: "Load balancer" }
  LB --> S["Your service"]:::core
  S --> DB@{ icon: "sd:database", label: "Primary store" }
  class U client
  class LB edge
  class DB store
\`\`\`

## Deep dive 1

## Deep dive 2

## Trade-offs
`;

const DIAGRAM = `
\`\`\`mermaid
%% title: Write path
flowchart LR
  A["Client"] --> B["Service"]:::core
  B --> C@{ icon: "tech:kafka", label: "Kafka" }
  class C queue
\`\`\`
`;

type Save = { state: "idle" | "saving" | "saved" | "error" | "conflict"; at?: number; msg?: string };
type Preview = { html: string; warnings: string[]; diagrams: number };

const backupKey = (slug: string, who: string) => `hk.dowDraft.${who}.${slug}`;

export default function Editor({ c, dev }: { c: ChallengeView; dev: boolean }) {
  const { viewer, me, loading, error, refresh } = useMe(c.slug);
  const { openAuthModal } = useAuthModal();
  return (
    <main className="mx-auto flex max-w-[1440px] flex-col gap-6 px-4 pb-28 pt-6 sm:px-6 sm:pt-10">
      {dev && <DevPersonaBar />}
      <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-x-2 font-mono text-[13px] text-fg-3">
        <Link href={BASE} className="inline-flex min-h-10 items-center hover:text-fg">
          design of the week
        </Link>
        <span aria-hidden>/</span>
        <Link href={`${BASE}/${c.slug}`} className="inline-flex min-h-10 items-center hover:text-fg">
          {c.title}
        </Link>
        <span aria-hidden>/</span>
        <span className="text-fg-2">your design</span>
      </nav>
      <OnlineOnly what="Writing a design" note="Your draft is kept on this device. It saves to your account when you're back online.">
        {!viewer.ready || (viewer.signedIn && loading) ? (
          <div className="h-64 animate-pulse border border-line bg-surface" />
        ) : !viewer.signedIn ? (
          <section className="flex flex-col gap-4 border border-line-strong bg-surface p-6">
            <h1 className="m-0 font-display text-[32px] font-bold tracking-[-0.03em] text-fg">Sign in to write your design</h1>
            <p className="m-0 max-w-[560px] text-[15px] text-fg-2">Your design autosaves to your account, stays private until voting opens, and can be edited until {fmtIst(c.submissionsCloseAt)}.</p>
            <button type="button" onClick={openAuthModal} className={`${BTN} self-start`}>
              sign in
            </button>
          </section>
        ) : error || !me ? (
          <Note tone="bad">
            Couldn&apos;t load your design: {error || "unknown error"}.{" "}
            <button type="button" onClick={refresh} className="underline">
              retry
            </button>
          </Note>
        ) : !canSubmitIn(me.phase) ? (
          <section className="flex flex-col gap-3">
            <Note>
              {me.phase === "upcoming" ? `Submissions open ${fmtIst(c.startsAt)}.` : "Submissions are closed for this challenge."}{" "}
              {me.submission?.status === "submitted" && (
                <Link href={`${BASE}/${c.slug}/${me.submission.id}`} className="font-semibold text-signal-text underline">
                  See your design →
                </Link>
              )}
            </Note>
          </section>
        ) : me.submission?.status === "removed" ? (
          <Note tone="bad">This design was removed by a moderator{me.submission.moderationNote ? `: ${me.submission.moderationNote}` : "."}</Note>
        ) : (
          <Writer c={c} initial={me.submission} who={viewer.key || "me"} />
        )}
      </OnlineOnly>
    </main>
  );
}

function Writer({ c, initial, who }: { c: ChallengeView; initial: MySubmission | null; who: string }) {
  const { awardOnce } = useGame();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [body, setBody] = useState(() => {
    if (initial) return initial.bodyMd;
    try {
      const raw = window.localStorage.getItem(backupKey(c.slug, who));
      const b = raw ? (JSON.parse(raw) as { body?: string }) : null;
      if (b?.body) return b.body;
    } catch {
      /* no backup */
    }
    return STARTER;
  });
  const [showAuthor, setShowAuthor] = useState(initial?.showAuthor ?? true);
  const [sub, setSub] = useState<MySubmission | null>(initial);
  const [save, setSave] = useState<Save>({ state: initial ? "saved" : "idle", at: initial ? Date.parse(initial.updatedAt) : undefined });
  const [preview, setPreview] = useState<Preview | null>(null);
  const [tab, setTab] = useState<"write" | "preview">("write");
  const [fieldErr, setFieldErr] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState<null | "first" | "again">(null);
  const dirty = useRef(false);
  const inflight = useRef(false);
  const ta = useRef<HTMLTextAreaElement>(null);
  const subRef = useRef(sub);
  useEffect(() => {
    subRef.current = sub;
  }, [sub]);
  const lint = useMemo(() => lintBody(body), [body]);

  // local backup on every change (survives a dropped connection or a closed tab)
  useEffect(() => {
    if (!dirty.current) return;
    try {
      window.localStorage.setItem(backupKey(c.slug, who), JSON.stringify({ title, body, at: Date.now() }));
    } catch {
      /* storage full or blocked */
    }
  }, [title, body, c.slug, who]);

  const send = useCallback(
    async (action: "save" | "submit" | "withdraw") => {
      if (inflight.current && action === "save") return;
      inflight.current = true;
      setSave((s) => ({ ...s, state: "saving" }));
      try {
        const r = await dowJson<{ submission: MySubmission; first: boolean }>(`/api/learn/design-week/${encodeURIComponent(c.slug)}/submission`, {
          method: "PUT",
          body: JSON.stringify({ title, bodyMd: body, showAuthor, action, baseUpdatedAt: subRef.current?.updatedAt ?? "" }),
        });
        dirty.current = false;
        setSub(r.submission);
        setFieldErr({});
        setSave({ state: "saved", at: Date.now() });
        if (action === "submit") {
          setSubmitted(r.first ? "first" : "again");
          track("dow_submit", { slug: c.slug, first: r.first, words: lint.words, diagrams: lint.mermaid });
          awardOnce(`dow:submit:${c.slug}`, XP.submit, `Design submitted · ${c.title}`);
        }
        try {
          window.localStorage.removeItem(backupKey(c.slug, who));
        } catch {
          /* ignore */
        }
      } catch (e) {
        const err = e as DowFetchError;
        if (err.fields) setFieldErr(err.fields);
        setSave({ state: err.code === "conflict" ? "conflict" : "error", msg: err.message });
      } finally {
        inflight.current = false;
      }
    },
    [title, body, showAuthor, c.slug, c.title, who, lint.words, lint.mermaid, awardOnce]
  );

  // autosave 1.5 s after the last keystroke
  useEffect(() => {
    if (!dirty.current) return;
    const id = window.setTimeout(() => void send("save"), 1500);
    return () => window.clearTimeout(id);
  }, [title, body, showAuthor, send]);

  // live preview 600 ms after the last keystroke
  useEffect(() => {
    let off = false;
    const id = window.setTimeout(() => {
      dowJson<Preview>("/api/learn/design-week/preview", { method: "POST", body: JSON.stringify({ bodyMd: body }) })
        .then((p) => {
          if (!off) setPreview(p);
        })
        .catch(() => {});
    }, 600);
    return () => {
      off = true;
      window.clearTimeout(id);
    };
  }, [body]);

  const edit = (fn: () => void) => {
    dirty.current = true;
    fn();
  };

  const insert = (text: string) => {
    const el = ta.current;
    const at = el ? el.selectionStart : body.length;
    edit(() => setBody(body.slice(0, at) + text + body.slice(at)));
    window.setTimeout(() => {
      el?.focus();
      el?.setSelectionRange(at + text.length, at + text.length);
    }, 0);
  };

  const remove = async () => {
    if (!window.confirm("Delete this design? This can't be undone.")) return;
    try {
      await dowJson(`/api/learn/design-week/${encodeURIComponent(c.slug)}/submission`, { method: "DELETE" });
      window.localStorage.removeItem(backupKey(c.slug, who));
      window.location.href = `${BASE}/${c.slug}`;
    } catch (e) {
      setSave({ state: "error", msg: (e as Error).message });
    }
  };

  const status = sub?.status ?? "draft";
  const saveText =
    save.state === "saving"
      ? "saving…"
      : save.state === "saved" && save.at
        ? `saved ${new Date(save.at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false })}`
        : save.state === "error"
          ? `not saved: ${save.msg}`
          : save.state === "conflict"
            ? save.msg
            : "not saved yet";

  if (submitted)
    return (
      <section className="flex flex-col gap-4 border border-signal bg-surface p-6 sm:p-8" role="status">
        <span className="font-mono text-[11px] uppercase tracking-label text-signal-text">{submitted === "first" ? `submitted · +${XP.submit} xp` : "submitted"}</span>
        <h1 className="m-0 font-display text-[clamp(30px,4.5vw,48px)] font-extrabold leading-none tracking-[-0.035em] text-fg">Your design is in.</h1>
        <p className="m-0 max-w-[620px] text-[16px] leading-relaxed text-fg-2">
          It stays private until voting opens {fmtIst(c.submissionsCloseAt)}. You can keep improving it until then. When the gallery opens, read the others and vote for the best three.
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setSubmitted(null)} className={BTN_GHOST}>
            keep editing
          </button>
          <Link href={`${BASE}/${c.slug}`} className={BTN}>
            back to the challenge →
          </Link>
        </div>
      </section>
    );

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <PhaseBadge phase={c.phase} />
            <span className={`px-2 py-1 font-mono text-[11px] uppercase tracking-label ${status === "submitted" ? "border border-ok text-fg" : "border border-line-strong text-fg-3"}`}>
              {status === "submitted" ? "submitted ✓" : status === "hidden" ? "under review" : "draft"}
            </span>
          </div>
          <h1 className="m-0 font-display text-[clamp(26px,3.6vw,40px)] font-bold leading-tight tracking-[-0.03em] text-fg">{c.title}</h1>
        </div>
        <Countdown at={c.submissionsCloseAt} label="submissions close in" />
      </header>

      {sub?.status === "hidden" && <Note tone="bad">A moderator is reviewing this design{sub.moderationNote ? `: ${sub.moderationNote}` : "."} You can still edit it.</Note>}

      <label className="flex flex-col gap-1.5">
        <span className={LABEL}>title</span>
        <input
          value={title}
          onChange={(e) => edit(() => setTitle(e.target.value.slice(0, LIMITS.titleMax)))}
          placeholder="e.g. Leased id ranges with edge-cached redirects"
          className={`min-h-12 w-full border bg-bg px-3 text-[17px] font-semibold text-fg outline-none focus:border-signal ${fieldErr.title ? "border-bad" : "border-line-strong"}`}
        />
        {fieldErr.title && <span className="text-sm text-bad-text">{fieldErr.title}</span>}
      </label>

      <div className="flex border-b border-line lg:hidden" role="tablist" aria-label="Editor view">
        {(["write", "preview"] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`-mb-px min-h-11 flex-1 border-b-2 font-mono text-[13px] ${tab === t ? "border-signal text-fg" : "border-transparent text-fg-3"}`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className={`flex min-w-0 flex-col gap-2 ${tab === "write" ? "" : "hidden lg:flex"}`}>
          <div className="flex flex-wrap items-center gap-2">
            <span className={LABEL}>markdown</span>
            <button type="button" onClick={() => insert(DIAGRAM)} className={`${BTN_GHOST} ml-auto min-h-9 px-2.5 text-[12px]`}>
              + mermaid diagram
            </button>
            <a href="https://mermaid.js.org/syntax/flowchart.html" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 items-center font-mono text-[12px] text-fg-3 underline decoration-line-strong underline-offset-4 hover:text-fg">
              mermaid syntax ↗
            </a>
          </div>
          <textarea
            ref={ta}
            value={body}
            onChange={(e) => edit(() => setBody(e.target.value))}
            spellCheck
            aria-label="Your design, in markdown"
            className={`min-h-[60vh] w-full resize-y border bg-bg p-3 font-mono text-[14px] leading-relaxed text-fg outline-none focus:border-signal ${fieldErr.bodyMd ? "border-bad" : "border-line-strong"}`}
          />
          <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-[11px] text-fg-3">
            <span className={lint.chars > LIMITS.bodyMax ? "text-bad-text" : ""}>
              {lint.words.toLocaleString("en-US")} words · {lint.chars.toLocaleString("en-US")}/{LIMITS.bodyMax.toLocaleString("en-US")} chars · {lint.mermaid}/{LIMITS.mermaidMax} diagrams
            </span>
            <span aria-live="polite" className={save.state === "error" || save.state === "conflict" ? "text-bad-text" : ""}>
              {saveText}
            </span>
          </div>
          {fieldErr.bodyMd && <span className="text-sm text-bad-text">{fieldErr.bodyMd}</span>}
        </div>

        <div className={`flex min-w-0 flex-col gap-2 ${tab === "preview" ? "" : "hidden lg:flex"}`}>
          <span className={LABEL}>preview · what voters see</span>
          <div className="min-h-[60vh] overflow-auto border border-line bg-surface p-4 sm:p-5">
            {preview?.html ? <div data-dow-preview className="course-content max-w-none" dangerouslySetInnerHTML={{ __html: preview.html }} /> : <p className="text-fg-3">{preview ? "Nothing to preview yet." : "Rendering…"}</p>}
            <MermaidHydrator rootSelector="[data-dow-preview]" />
          </div>
          {[...new Set([...(preview?.warnings || []), ...lint.warnings])].map((w) => (
            <p key={w} className="m-0 text-[13px] text-fg-3">
              ⚠ {w}
            </p>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-4 border-t border-line pt-4">
        <label className="flex items-start gap-3 text-[14px] text-fg-2">
          <input type="checkbox" checked={showAuthor} onChange={(e) => edit(() => setShowAuthor(e.target.checked))} className="mt-1 h-4 w-4 accent-[var(--c-signal)]" />
          <span>
            Show my public profile on this design. <span className="text-fg-3">Only if you share your progress (your name follows those settings); otherwise you&apos;re &ldquo;anonymous learner&rdquo; either way.</span>{" "}
            <Link href="/learn/dashboard" className="text-signal-text underline underline-offset-4">
              sharing settings
            </Link>
          </span>
        </label>
        {save.state === "conflict" && (
          <Note tone="bad">
            {save.msg}{" "}
            <button type="button" onClick={() => window.location.reload()} className="font-semibold underline">
              reload
            </button>
          </Note>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {status !== "submitted" && status !== "hidden" ? (
            <button type="button" onClick={() => void send("submit")} disabled={save.state === "saving"} className={`${BTN} min-h-12`}>
              submit design
            </button>
          ) : (
            <button type="button" onClick={() => void send("save")} disabled={save.state === "saving"} className={`${BTN} min-h-12`}>
              save changes
            </button>
          )}
          {status === "submitted" && (
            <button type="button" onClick={() => void send("withdraw")} className={`${BTN_GHOST} min-h-12`}>
              withdraw to draft
            </button>
          )}
          {sub && status !== "hidden" && (
            <button type="button" onClick={() => void remove()} className="inline-flex min-h-12 items-center px-3 font-mono text-[13px] text-bad-text hover:underline">
              delete
            </button>
          )}
          <span className="ml-auto text-[13px] text-fg-3">Edits are allowed until {fmtIst(c.submissionsCloseAt)}. Images aren&apos;t shown; draw diagrams in Mermaid.</span>
        </div>
      </div>
    </div>
  );
}
