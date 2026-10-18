"use client";

/** Vote button + report dialog. Signed-in only; the server checks every rule again. */
import { useState } from "react";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { track } from "@/lib/track";
import { REPORT_REASONS, type ReportReason } from "@/lib/design-week/core";
import type { MeState } from "@/lib/design-week/views";
import Overlay from "@/components/learn/hub/Overlay";
import { dowJson, type DowFetchError, type Viewer } from "./client";
import { BTN, BTN_GHOST, LABEL } from "./ui";

export type VoteCtx = {
  viewer: Viewer;
  me: MeState | null;
  slug: string;
  canVote: boolean;
  patch: (fn: (m: MeState) => MeState) => void;
  mine: string | null;
};

export function VoteButton({ id, ctx, size = "sm" }: { id: string; ctx: VoteCtx; size?: "sm" | "lg" }) {
  const { openAuthModal } = useAuthModal();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!ctx.canVote) return null;
  const h = size === "lg" ? "min-h-12 px-5 text-sm" : "min-h-10 px-3 text-[13px]";
  if (ctx.mine === id) return <span className={`inline-flex ${h} items-center border border-dashed border-line-strong font-mono text-fg-3`}>your design</span>;
  if (!ctx.viewer.signedIn)
    return (
      <button type="button" onClick={openAuthModal} className={`${BTN_GHOST} ${h}`}>
        sign in to vote
      </button>
    );
  const me = ctx.me;
  const voted = !!me?.votes.includes(id);
  const blocked = !!me && !voted && (!me.eligibility.ok || me.remaining <= 0);
  const title = !me ? "Loading…" : !me.eligibility.ok ? me.eligibility.message : !voted && me.remaining <= 0 ? "No votes left. Take one back to move it." : voted ? "Take your vote back" : `Vote (${me.remaining} left)`;
  const run = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await dowJson<{ voted: boolean; votes: string[]; remaining: number }>("/api/learn/design-week/vote", { method: "POST", body: JSON.stringify({ submissionId: id, on: !voted }) });
      ctx.patch((m) => ({ ...m, votes: r.votes, remaining: r.remaining }));
      track("dow_vote", { slug: ctx.slug, on: r.voted });
    } catch (e) {
      setErr((e as DowFetchError).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={run}
        disabled={busy || !me || blocked}
        aria-pressed={voted}
        title={title}
        className={`inline-flex ${h} items-center justify-center gap-2 font-mono font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${
          voted ? "bg-signal text-on-signal hover:brightness-110" : "border border-signal text-signal-text hover:bg-signal/10"
        }`}
      >
        <span aria-hidden>{voted ? "▲" : "△"}</span>
        {voted ? "voted" : "vote"}
      </button>
      {err && (
        <span role="alert" className="max-w-[220px] text-right text-xs text-bad-text">
          {err}
        </span>
      )}
    </span>
  );
}

export function ReportButton({ id, viewer, own }: { id: string; viewer: Viewer; own: boolean }) {
  const { openAuthModal } = useAuthModal();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason | "">("");
  const [note, setNote] = useState("");
  const [state, setState] = useState<{ busy?: boolean; err?: string; done?: string }>({});
  if (own) return null;
  const send = async () => {
    setState({ busy: true });
    try {
      const r = await dowJson<{ already: boolean }>("/api/learn/design-week/report", { method: "POST", body: JSON.stringify({ submissionId: id, reason, note }) });
      setState({ done: r.already ? "You've already reported this design. A moderator will look at it." : "Thanks. A moderator will look at it." });
    } catch (e) {
      setState({ err: (e as DowFetchError).message });
    }
  };
  return (
    <>
      <button
        type="button"
        onClick={() => (viewer.signedIn ? setOpen(true) : openAuthModal())}
        className="inline-flex min-h-10 items-center gap-1.5 font-mono text-[13px] text-fg-3 underline decoration-line-strong underline-offset-4 hover:text-fg"
      >
        report
      </button>
      {open && (
        <Overlay labelledBy="dow-report-h" onClose={() => setOpen(false)} className="w-full max-w-[480px] border border-line-strong bg-surface p-5 sm:p-6">
          <div className="flex flex-col gap-4">
            <span className={LABEL}>report a design</span>
            <h2 id="dow-report-h" className="m-0 font-display text-[26px] font-bold leading-tight tracking-[-0.02em] text-fg">
              What&apos;s wrong with it?
            </h2>
            {state.done ? (
              <p className="m-0 text-[15px] text-fg-2" role="status">
                {state.done}
              </p>
            ) : (
              <>
                <fieldset className="flex flex-col gap-1.5">
                  <legend className="sr-only">Reason</legend>
                  {REPORT_REASONS.map((r) => (
                    <label key={r.id} className={`flex min-h-11 cursor-pointer items-center gap-3 border px-3 text-[15px] ${reason === r.id ? "border-signal bg-signal/10 text-fg" : "border-line text-fg-2 hover:border-line-strong"}`}>
                      <input type="radio" name="dow-reason" value={r.id} checked={reason === r.id} onChange={() => setReason(r.id)} className="accent-[var(--c-signal)]" />
                      {r.label}
                    </label>
                  ))}
                </fieldset>
                <label className="flex flex-col gap-1.5">
                  <span className={LABEL}>details (optional)</span>
                  <textarea value={note} onChange={(e) => setNote(e.target.value.slice(0, 500))} rows={3} className="w-full border border-line-strong bg-bg p-3 text-[15px] text-fg outline-none focus:border-signal" />
                </label>
                {state.err && (
                  <p role="alert" className="m-0 text-sm text-bad-text">
                    {state.err}
                  </p>
                )}
              </>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)} className={BTN_GHOST}>
                {state.done ? "close" : "cancel"}
              </button>
              {!state.done && (
                <button type="button" onClick={send} disabled={!reason || state.busy} className={BTN}>
                  send report
                </button>
              )}
            </div>
          </div>
        </Overlay>
      )}
    </>
  );
}
