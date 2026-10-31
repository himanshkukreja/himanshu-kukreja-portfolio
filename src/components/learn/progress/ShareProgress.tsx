"use client";

/**
 * "Share my progress" (progress page): turn the public page on or off, pick the handle, choose
 * what visitors see, preview it, share it. Off by default; turning it off makes /u/<handle> a 404.
 * Guests are asked to sign in (their browser progress is imported afterwards, see DataControls).
 */
import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { track } from "@/lib/track";
import { HANDLE_MAX, HANDLE_MESSAGES, handleProblem, slugifyHandle } from "@/lib/share/handle";
import { DEFAULT_VISIBILITY, profilePath, type NameMode, type Visibility, type VisibilityKey } from "@/lib/share/model";
import { checkHandle, saveShare, useShare } from "@/components/share/useShare";
import ShareButton from "@/components/share/ShareButton";
import { Bar, Label, SectionHead } from "./ui";

const TOGGLES: { key: VisibilityKey; label: string; hint: string }[] = [
  { key: "progress", label: "Level & course progress", hint: "level, XP, course %, lessons, world map" },
  { key: "tree", label: "Skill tree", hint: "every world, boss and trial node" },
  { key: "streak", label: "Streak", hint: "current and best streak" },
  { key: "scores", label: "Arena scores", hint: "league, rank, weekly points, best daily, daily streak" },
  { key: "badges", label: "Badges", hint: "badges you've earned" },
  { key: "milestones", label: "Milestones", hint: "worlds cleared, bosses beaten, recent wins" },
];

const NAME_MODES: { v: NameMode; label: string }[] = [
  { v: "full", label: "Full name" },
  { v: "first", label: "First name + initial" },
  { v: "none", label: "Anonymous" },
];

type Draft = { handle: string; visibility: Visibility };

function firstLast(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.length ? `${parts[0]}${parts.length > 1 ? ` ${parts[parts.length - 1][0].toUpperCase()}.` : ""}` : "";
}

function Switch({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`relative h-8 w-[60px] shrink-0 border transition-colors disabled:opacity-50 ${on ? "border-signal bg-signal" : "border-line-strong bg-surface-2"}`}
    >
      <span aria-hidden className={`absolute top-[3px] h-6 w-6 transition-[left] ${on ? "left-[31px] bg-on-signal" : "left-[3px] bg-fg-3"}`} />
    </button>
  );
}

export default function ShareProgress() {
  const share = useShare();
  const { profile } = useAuth();
  const { openAuthModal } = useAuthModal();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [avail, setAvail] = useState<{ h: string; ok: boolean; message?: string } | null>(null);

  const settings = share.state?.settings ?? null;
  const live = !!settings?.enabled;
  const saved: Draft = useMemo(() => ({ handle: settings?.handle || share.state?.suggested || "", visibility: settings?.visibility || DEFAULT_VISIBILITY }), [settings, share.state?.suggested]);
  const cur = draft ?? saved;
  const dirty = !!draft && (draft.handle !== saved.handle || JSON.stringify(draft.visibility) !== JSON.stringify(saved.visibility));
  const problem = handleProblem(cur.handle);
  const handleChanged = cur.handle !== (settings?.handle || "");

  // availability of a changed handle (debounced); the server re-checks on save
  useEffect(() => {
    if (!share.signedIn || !share.state?.available || problem || !handleChanged) return;
    const h = cur.handle;
    const t = window.setTimeout(() => {
      checkHandle(h)
        .then((r) => setAvail({ h, ok: r.ok, message: r.message }))
        .catch(() => setAvail(null));
    }, 350);
    return () => window.clearTimeout(t);
  }, [cur.handle, problem, handleChanged, share.signedIn, share.state?.available]);
  const taken = avail && avail.h === cur.handle && !avail.ok ? avail.message : null;

  const edit = (fn: (d: Draft) => Draft) => {
    setMsg(null);
    setDraft(fn(cur));
  };
  const setVis = (patch: Partial<Visibility>) => edit((d) => ({ ...d, visibility: { ...d.visibility, ...patch } }));

  const save = async (enabled: boolean) => {
    if (problem) {
      setMsg({ ok: false, text: HANDLE_MESSAGES[problem] });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const s = await saveShare({ enabled, handle: cur.handle, visibility: cur.visibility });
      setDraft(null);
      if (enabled !== live) track(enabled ? "share_enable" : "share_disable", { from: "settings" });
      setMsg({ ok: true, text: enabled ? (live ? "Saved. Your page is updated." : `Your page is live at /u/${s.handle}.`) : "Your page is private again. The link now shows a 404." });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message || "Couldn't save" });
    } finally {
      setBusy(false);
    }
  };

  const fullName = (profile?.full_name || "").trim();
  const shownName = cur.visibility.name === "none" || !fullName ? `@${cur.handle || "handle"}` : cur.visibility.name === "full" ? fullName : firstLast(fullName);
  const sum = share.state?.summary ?? null;
  const origin = typeof window !== "undefined" ? window.location.host : "himanshukukreja.in";

  let body: ReactNode;
  if (!share.signedIn && !share.authLoading) {
    body = (
      <div className="flex flex-col gap-4 border border-dashed border-signal bg-surface p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="flex max-w-[620px] flex-col gap-2">
          <Label className="text-signal-text">your public page · sign in</Label>
          <p className="m-0 font-display text-[26px] font-extrabold leading-[1.05] tracking-[-0.03em] text-fg">Sign in to get your share link.</p>
          <p className="m-0 text-[14px] leading-relaxed text-fg-2">
            A page with your level, skill tree, streak and Arena scores that friends can open without an account — off until you turn it on. The progress in this browser comes with you: import it in{" "}
            <a href="#data" className="underline underline-offset-4">
              your data
            </a>{" "}
            once you&apos;re signed in.
          </p>
        </div>
        <button type="button" onClick={openAuthModal} className="min-h-12 shrink-0 bg-signal px-5 font-mono text-sm font-semibold text-on-signal hover:brightness-110">
          Sign in · it&apos;s free →
        </button>
      </div>
    );
  } else if (share.loading) {
    body = <div aria-busy="true" aria-label="Loading share settings" className="h-[260px] animate-pulse border border-line bg-surface" />;
  } else if (share.error || !share.state) {
    body = (
      <p role="alert" className="m-0 border border-bad/50 bg-surface px-4 py-3 text-sm text-fg-2">
        {share.error || "Couldn't load your share settings."}{" "}
        <button type="button" onClick={() => share.refresh()} className="font-semibold text-fg underline underline-offset-4">
          Retry
        </button>
      </p>
    );
  } else if (!share.state.available) {
    body = <p className="m-0 border border-line bg-surface px-4 py-3 text-sm text-fg-2">Public progress pages are switching on soon. Nothing about you is public.</p>;
  } else {
    body = (
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_420px] lg:gap-6">
        <div className="flex min-w-0 flex-col border border-line bg-surface">
          {/* on / off */}
          <div className="flex items-center justify-between gap-4 border-b border-line p-4 sm:p-5">
            <div className="flex min-w-0 flex-col gap-1">
              <span className="text-[16px] font-semibold text-fg">Public page</span>
              <span className="text-[13px] leading-snug text-fg-3">{live ? "On. Anyone with the link can see what you pick below." : "Off. Nobody can see your progress."}</span>
            </div>
            <Switch on={live} disabled={busy || (!live && !!(problem || taken))} onChange={(v) => void save(v)} label="Public page" />
          </div>

          {/* handle */}
          <div className="flex flex-col gap-2 border-b border-line p-4 sm:p-5">
            <label htmlFor="share-handle" className="text-[14px] font-semibold text-fg">
              Handle
            </label>
            <div className={`flex min-w-0 items-center border bg-bg ${problem || taken ? "border-bad" : "border-line-strong focus-within:border-signal"}`}>
              <span className="hidden shrink-0 pl-3 font-mono text-[13px] text-fg-3 sm:inline">{origin}/u/</span>
              <span className="shrink-0 pl-3 font-mono text-[13px] text-fg-3 sm:hidden">/u/</span>
              <input
                id="share-handle"
                value={cur.handle}
                maxLength={HANDLE_MAX}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                onChange={(e) => edit((d) => ({ ...d, handle: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") }))}
                onBlur={() => slugifyHandle(cur.handle) !== cur.handle && edit((d) => ({ ...d, handle: slugifyHandle(d.handle) }))}
                aria-describedby="share-handle-hint"
                className="min-h-12 min-w-0 flex-1 bg-transparent pr-3 font-mono text-[15px] text-fg outline-none"
              />
            </div>
            <span id="share-handle-hint" aria-live="polite" className={`text-[12px] ${problem || taken ? "text-bad-text" : "text-fg-3"}`}>
              {problem ? HANDLE_MESSAGES[problem] : taken ? taken : handleChanged && avail?.h === cur.handle && avail.ok ? "Available." : "3–24 lowercase letters, numbers or hyphens. Changing it breaks links you already shared."}
            </span>
          </div>

          {/* identity */}
          <fieldset className="flex flex-col gap-2.5 border-b border-line p-4 sm:p-5">
            <legend className="sr-only">Name on the page</legend>
            <span className="text-[14px] font-semibold text-fg">Name on the page</span>
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
              {NAME_MODES.map((m) => (
                <label key={m.v} className={`flex min-h-11 cursor-pointer items-center gap-2 border px-3 text-[13px] ${cur.visibility.name === m.v ? "border-signal bg-surface-2 text-fg" : "border-line text-fg-2 hover:border-line-strong"}`}>
                  <input type="radio" name="share-name" checked={cur.visibility.name === m.v} onChange={() => setVis({ name: m.v, ...(m.v === "none" ? { avatar: false } : {}) })} className="h-4 w-4 accent-[var(--c-signal)]" />
                  {m.label}
                </label>
              ))}
            </div>
            <label className={`flex min-h-10 items-center gap-2.5 text-[13px] ${cur.visibility.name === "none" || !profile?.avatar_url ? "text-fg-4" : "text-fg-2"}`}>
              <input
                type="checkbox"
                checked={cur.visibility.avatar}
                disabled={cur.visibility.name === "none" || !profile?.avatar_url}
                onChange={(e) => setVis({ avatar: e.target.checked })}
                className="h-4 w-4 accent-[var(--c-signal)]"
              />
              Show my avatar{!profile?.avatar_url ? " (no avatar set)" : cur.visibility.name === "none" ? " (not when anonymous)" : ""}
            </label>
          </fieldset>

          {/* what's visible */}
          <fieldset className="flex flex-col p-4 sm:p-5">
            <legend className="sr-only">What visitors see</legend>
            <span className="pb-1 text-[14px] font-semibold text-fg">What visitors see</span>
            {TOGGLES.map((t) => (
              <label key={t.key} className="flex min-h-12 cursor-pointer items-center justify-between gap-4 border-b border-line py-2 last:border-b-0">
                <span className="flex min-w-0 flex-col">
                  <span className="text-[14px] text-fg">{t.label}</span>
                  <span className="text-[12px] text-fg-3">{t.hint}</span>
                </span>
                <input type="checkbox" checked={cur.visibility[t.key]} onChange={(e) => setVis({ [t.key]: e.target.checked } as Partial<Visibility>)} className="h-5 w-5 shrink-0 accent-[var(--c-signal)]" data-vis={t.key} />
              </label>
            ))}
            <p className="m-0 pt-3 text-[12px] leading-relaxed text-fg-3">Never shown: your email, account id, notes, highlights, bookmarks or exact study times.</p>
          </fieldset>

          <div className="flex flex-wrap items-center gap-3 border-t border-line p-4 sm:p-5">
            {live ? (
              <button type="button" onClick={() => void save(true)} disabled={busy || !dirty || !!problem || !!taken} className="min-h-12 bg-signal px-5 font-mono text-sm font-semibold text-on-signal hover:brightness-110 disabled:opacity-40">
                {busy ? "Saving…" : dirty ? "Save changes" : "Saved"}
              </button>
            ) : (
              <button type="button" onClick={() => void save(true)} disabled={busy || !!problem || !!taken} className="min-h-12 bg-signal px-5 font-mono text-sm font-semibold text-on-signal hover:brightness-110 disabled:opacity-40">
                {busy ? "Publishing…" : "Publish my page"}
              </button>
            )}
            {dirty && (
              <button type="button" onClick={() => (setDraft(null), setMsg(null))} className="min-h-12 px-2 font-mono text-[13px] text-fg-3 underline underline-offset-4 hover:text-fg">
                discard
              </button>
            )}
            {msg && (
              <span role="status" className={`text-[13px] ${msg.ok ? "text-fg-2" : "text-bad-text"}`}>
                {msg.text}
              </span>
            )}
          </div>
        </div>

        {/* preview + share */}
        <div className="flex min-w-0 flex-col gap-3 self-start">
          <Label>{live ? "visitors see" : "preview · not public"}</Label>
          <div className={`flex flex-col gap-4 border bg-surface p-4 sm:p-5 ${live ? "border-signal" : "border-dashed border-line-strong"}`}>
            <div className="flex items-center gap-3">
              <span aria-hidden className="grid h-11 w-11 shrink-0 place-items-center bg-signal font-display text-lg font-extrabold text-on-signal">
                {(shownName.replace("@", "") || "?").slice(0, 1).toUpperCase()}
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="truncate font-display text-[22px] font-extrabold leading-tight tracking-[-0.03em] text-fg">{shownName}</span>
                <span className="truncate font-mono text-[11px] text-fg-3">/u/{cur.handle}</span>
              </span>
            </div>
            {cur.visibility.progress && sum ? (
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="bg-signal px-1.5 py-0.5 font-mono text-[11px] font-semibold text-on-signal">
                    {sum.levelCode} · {sum.levelName.toUpperCase()}
                  </span>
                  <span className="font-display text-[26px] font-extrabold leading-none tracking-[-0.04em] text-signal-text">
                    {sum.pct}
                    <span className="font-mono text-[12px] font-normal text-fg-3">%</span>
                  </span>
                </div>
                <Bar pct={sum.pct} />
              </div>
            ) : (
              <span className="font-mono text-[12px] text-fg-4">level & progress hidden</span>
            )}
            <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
              {TOGGLES.filter((t) => t.key !== "progress").map((t) => (
                <li key={t.key} className={`px-2 py-1 font-mono text-[11px] ${cur.visibility[t.key] ? "border border-line-strong text-fg-2" : "border border-dashed border-line text-fg-4 line-through"}`}>
                  {t.key === "streak" && sum && cur.visibility.streak ? `${sum.streak}-day streak` : t.key === "scores" && sum?.leagueCode && cur.visibility.scores ? `${sum.leagueCode} ${sum.leagueName} league` : t.label.toLowerCase()}
                </li>
              ))}
            </ul>
          </div>
          {live && settings ? (
            <div className="flex flex-wrap gap-2">
              <ShareButton kind="profile" variant="solid" label="Share my page" />
              <Link href={profilePath(settings.handle)} target="_blank" className="inline-flex min-h-11 items-center border border-line-strong px-4 font-mono text-[13px] text-fg hover:bg-surface-2">
                Open ↗
              </Link>
            </div>
          ) : (
            <span className="text-[13px] text-fg-3">Publish to get a link you can send on WhatsApp, LinkedIn or X — with a preview card of your run.</span>
          )}
        </div>
      </div>
    );
  }

  return (
    <section aria-labelledby="share-h" id="share" className="flex scroll-mt-28 flex-col gap-5">
      <SectionHead
        id="share-h"
        n="05"
        kicker="share"
        title="Share my progress"
        right={
          share.state?.available && share.signedIn ? (
            <span className={`font-mono text-[12px] ${live ? "text-signal-text" : "text-fg-3"}`}>{live ? `● public · /u/${settings?.handle}` : "○ private"}</span>
          ) : undefined
        }
      />
      {body}
    </section>
  );
}
