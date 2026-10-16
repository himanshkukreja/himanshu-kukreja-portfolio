"use client";

/**
 * Audience: presets (all accounts, learners, subscribers), segments (active in N days, never started,
 * completed ≥ N lessons) and a pasted list. Live counts after unsubscribes, bounces and duplicates.
 */
import { useEffect, useState } from "react";
import { Card, Kpi, LABEL, fmtNum, useAdminClient } from "@/components/admin/ui";
import { Field, inputCls } from "@/components/admin/content/common";
import type { AudienceCount, AudienceKind, AudienceSpec } from "@/lib/campaigns/types";
import { Note, cx, jsonInit, textareaCls, useDebounced } from "./bits";

type Presets = Record<"all" | "learners" | "subscribers" | "subscribers_learners" | "never_started", number>;
export type AudienceReply = { count: AudienceCount; presets: Presets };

const OPTIONS: { kind: AudienceKind; label: string; hint: string }[] = [
  { kind: "subscribers_learners", label: "Subscribers + learners", hint: "newsletter subscribers and anyone with learn activity, deduped" },
  { kind: "learners", label: "Learners", hint: "accounts with any learn activity" },
  { kind: "all", label: "All accounts", hint: "everyone who signed up" },
  { kind: "subscribers", label: "Newsletter subscribers", hint: "active subscribers, with or without an account" },
  { kind: "active", label: "Active recently", hint: "lesson progress or streak in the last N days" },
  { kind: "never_started", label: "Never started", hint: "signed up, never opened a lesson" },
  { kind: "completed", label: "Completed ≥ N lessons", hint: "finished at least N lessons" },
  { kind: "custom", label: "Custom list", hint: "paste addresses" },
];

/** Live count for a spec (campaignId → only people not already in that campaign). */
export function useAudienceCount(spec: AudienceSpec, campaignId?: string | null, storySlug?: string | null) {
  const client = useAdminClient();
  const key = JSON.stringify({ spec, campaignId: campaignId || null, storySlug: storySlug || null });
  const dkey = useDebounced(key, 450);
  const [state, setState] = useState<{ key: string; data?: AudienceReply; error?: string }>({ key: "" });
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    let off = false;
    client
      .json<AudienceReply>("/api/admin/newsletter/audience", jsonInit("POST", { audience: JSON.parse(dkey).spec, campaignId: JSON.parse(dkey).campaignId, storySlug: JSON.parse(dkey).storySlug }))
      .then((data) => {
        if (!off) setState({ key: dkey, data });
      })
      .catch((e: Error) => {
        if (!off) setState((s) => ({ key: dkey, data: s.data, error: e.message }));
      });
    return () => {
      off = true;
    };
  }, [dkey, client, nonce]);
  return { data: state.data, error: state.key === dkey ? state.error : undefined, loading: state.key !== key, refresh: () => setNonce((n) => n + 1) };
}

export default function AudiencePicker({ spec, onChange, readOnly, campaignId, storySlug }: { spec: AudienceSpec; onChange: (s: AudienceSpec) => void; readOnly?: boolean; campaignId?: string | null; storySlug?: string | null }) {
  const live = useAudienceCount(spec, campaignId, storySlug);
  const c = live.data?.count;
  const presets = live.data?.presets;
  const presetN = (k: AudienceKind) => (presets && k in presets ? fmtNum(presets[k as keyof Presets]) : null);

  return (
    <div className="flex flex-col gap-4">
      <Card label="audience" title="Who gets it" bodyClassName="flex flex-col gap-4 p-3 sm:p-4">
        <div role="radiogroup" aria-label="Audience" className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {OPTIONS.map((o) => {
            const on = spec.kind === o.kind;
            const n = presetN(o.kind);
            return (
              <button
                key={o.kind}
                type="button"
                role="radio"
                aria-checked={on}
                disabled={readOnly}
                onClick={() => onChange({ kind: o.kind, days: o.kind === "active" ? spec.days || 30 : undefined, min: o.kind === "completed" ? spec.min || 3 : undefined, emails: o.kind === "custom" ? spec.emails || "" : undefined })}
                className={cx("flex min-h-[64px] flex-col items-start justify-center gap-0.5 border px-3 py-2 text-left disabled:cursor-default", on ? "border-signal bg-signal/10" : "border-line hover:border-line-strong")}
              >
                <span className="flex w-full items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-fg">{o.label}</span>
                  {n != null && <span className="font-mono text-xs text-fg-3">{n}</span>}
                </span>
                <span className="text-xs text-fg-3">{o.hint}</span>
              </button>
            );
          })}
        </div>
        {spec.kind === "active" && (
          <Field label="Active in the last N days">
            <input className={`${inputCls} max-w-[160px] font-mono`} type="number" min={1} max={3650} value={spec.days ?? 30} readOnly={readOnly} onChange={(e) => onChange({ ...spec, days: Number(e.target.value) || 1 })} />
          </Field>
        )}
        {spec.kind === "completed" && (
          <Field label="At least N completed lessons">
            <input className={`${inputCls} max-w-[160px] font-mono`} type="number" min={1} max={1000} value={spec.min ?? 3} readOnly={readOnly} onChange={(e) => onChange({ ...spec, min: Number(e.target.value) || 1 })} />
          </Field>
        )}
        {spec.kind === "custom" && (
          <Field label="Addresses (comma, space or one per line)" hint="Matched to accounts for names and progress; unknown addresses get empty merge data (fallbacks apply).">
            <textarea className={`${textareaCls} font-mono text-[13px]`} rows={6} value={spec.emails || ""} readOnly={readOnly} onChange={(e) => onChange({ ...spec, emails: e.target.value })} placeholder={"priya@example.com\nrohan@example.com"} />
          </Field>
        )}
      </Card>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label={campaignId ? "Will receive · new" : "Will receive"} value={fmtNum(c?.eligible)} loading={!c && !live.error} hint={live.loading && c ? "updating…" : "after exclusions"} />
        <Kpi label="Unsubscribed" value={fmtNum(c?.unsubscribed)} loading={!c && !live.error} hint="always excluded" />
        <Kpi label="Bounced · suppressed" value={fmtNum(c?.suppressed)} loading={!c && !live.error} hint="always excluded" />
        {storySlug ? (
          <Kpi label="Already got this story" value={fmtNum(c?.alreadyGotStory)} loading={!c && !live.error} hint="skipped automatically" />
        ) : (
          <Kpi label={spec.kind === "custom" ? "Invalid · duplicate" : campaignId ? "Already in campaign" : "Duplicates"} value={spec.kind === "custom" ? `${fmtNum(c?.invalid)} · ${fmtNum(c?.duplicates)}` : fmtNum(campaignId ? c?.alreadyQueued : c?.duplicates)} loading={!c && !live.error} hint="folded / skipped" />
        )}
      </div>
      {c && c.sample.length > 0 && (
        <p className="m-0 break-words font-mono text-xs text-fg-4">
          <span className={LABEL}>sample · </span>
          {c.sample.join(", ")}
          {c.eligible > c.sample.length ? ` + ${fmtNum(c.eligible - c.sample.length)} more` : ""}
        </p>
      )}
      {live.error && <Note tone="bad" title="count failed">{live.error}</Note>}
    </div>
  );
}
