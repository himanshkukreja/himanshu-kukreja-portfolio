"use client";

/**
 * The coming-soon page's signup: the founding-member offer, an email form with optional interests, and the
 * offer terms as one quiet expandable line. POST /api/dsa/waitlist (userFetch attaches the session token, so
 * a signed-in learner's row is linked to their account); GET tells a signed-in learner they are already in.
 * Analytics: `dsa_waitlist` on success (track: first-party, mirrored to PostHog / GA4 when configured).
 */
import { useEffect, useId, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { userFetch } from "@/components/learn/progress/userFetch";
import { track } from "@/lib/track";
import { GOALS, LANGUAGES, checkEmail, type GoalId, type LanguageId, type WaitlistResult, type WaitlistStatus } from "@/lib/dsa/waitlist";

type Done = { founding: boolean; status: WaitlistResult["status"] | "known"; linked: boolean; email: string; message: string };

/** ?ref= handle remembered by RefCapture (components/share/RefCapture.tsx), if any. */
function storedRef(): string | undefined {
  try {
    const raw = window.localStorage.getItem("hk.ref.v1");
    const h = raw ? (JSON.parse(raw) as { h?: unknown }).h : undefined;
    return typeof h === "string" ? h : undefined;
  } catch {
    return undefined;
  }
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`min-h-9 border px-3 text-[13px] transition-colors ${on ? "border-signal bg-signal text-on-signal" : "border-line-strong bg-bg text-fg-2 hover:border-fg-3 hover:text-fg"}`}
    >
      {on && <span aria-hidden>✓ </span>}
      {children}
    </button>
  );
}

export default function WaitlistCard({ source = "dsa-soon" }: { source?: string }) {
  const { user, loading } = useAuth();
  const { openAuthModal } = useAuthModal();
  const ids = useId();
  const [email, setEmail] = useState("");
  const [edited, setEdited] = useState(false);
  const [goals, setGoals] = useState<GoalId[]>([]);
  const [languages, setLanguages] = useState<LanguageId[]>([]);
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);

  // signed in: offer the account's email, and say so if the account is already on the list
  const accountEmail = user?.email?.toLowerCase() || "";
  const shownEmail = edited ? email : email || accountEmail;
  useEffect(() => {
    if (!user) return;
    let off = false;
    userFetch("/api/dsa/waitlist")
      .then((r) => (r.ok ? (r.json() as Promise<WaitlistStatus>) : null))
      .then((s) => {
        if (!off && s?.joined) setDone({ founding: s.founding, status: "known", linked: true, email: accountEmail, message: "Your account is on the waitlist." });
      })
      .catch(() => {});
    return () => {
      off = true;
    };
  }, [user, accountEmail]);

  const toggle = <T extends string>(list: T[], set: (v: T[]) => void, id: T) => set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const checked = checkEmail(shownEmail);
    if (!checked.ok) {
      setError(checked.error);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await userFetch("/api/dsa/waitlist", {
        method: "POST",
        body: JSON.stringify({ email: checked.email, goals, languages, source, ref: storedRef(), website }),
      });
      const body = (await res.json().catch(() => ({}))) as Partial<WaitlistResult> & { error?: string };
      if (!res.ok || !body.ok) {
        setError(body.error || "We couldn't add you just now. Please try again in a minute.");
        return;
      }
      setDone({ founding: !!body.founding, status: body.status || "joined", linked: !!body.linked, email: checked.email, message: body.message || "You're on the list." });
      track("dsa_waitlist", { source, status: body.status || "joined", signed_in: !!user, founding: !!body.founding, goals: goals.join(","), languages: languages.join(",") });
    } catch {
      setError("You seem to be offline. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="join" aria-labelledby={`${ids}-h`} className="relative flex scroll-mt-28 flex-col gap-5 border border-line bg-surface p-5 sm:p-7">
      <div className="flex flex-col gap-2.5">
        <span className="font-mono text-[11px] uppercase tracking-label text-signal-text">Founding member offer</span>
        <h2 id={`${ids}-h`} className="m-0 font-display text-[28px] font-extrabold leading-[1] tracking-[-0.035em] text-fg sm:text-[32px]">
          Join before launch. Both courses stay free for you, for life<span className="text-signal-text">.</span>
        </h2>
        <p className="m-0 text-[15px] leading-relaxed text-fg-2">
          Everyone who joins while DSA Mastery is free keeps System Design Mastery and DSA Mastery free for life, with AI features on fair-use daily credits.
        </p>
      </div>

      {done ? (
        <div role="status" className="flex flex-col gap-3 border border-signal bg-bg p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span aria-hidden className="grid h-6 w-6 place-items-center bg-signal text-[13px] font-bold text-on-signal">
              ✓
            </span>
            <span className="font-display text-[20px] font-bold tracking-[-0.02em] text-fg">{done.status === "joined" ? "You're on the list." : "You're already on the list."}</span>
            {done.founding && <span className="border border-signal px-2 py-0.5 font-mono text-[11px] uppercase tracking-label text-signal-text">Founding member</span>}
          </div>
          <p className="m-0 text-[14px] leading-relaxed text-fg-2">
            {done.linked
              ? `${done.founding ? "Founding access is on your account. " : ""}We'll email ${done.email || "you"} when DSA Mastery opens.`
              : `We'll email ${done.email} when DSA Mastery opens.${done.founding ? ` Sign in with this email at any time to keep founding access on your account.` : ""}`}
          </p>
          {!user && !loading && (
            <button type="button" onClick={openAuthModal} className="min-h-11 self-start border border-line-strong px-4 text-[14px] font-semibold text-fg hover:border-signal">
              Create your free account
            </button>
          )}
        </div>
      ) : (
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label htmlFor={`${ids}-email`} className="text-[13px] font-semibold text-fg">
              Email
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                id={`${ids}-email`}
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={shownEmail}
                onChange={(e) => {
                  setEdited(true);
                  setEmail(e.target.value);
                  if (error) setError(null);
                }}
                aria-invalid={!!error}
                aria-describedby={error ? `${ids}-err` : undefined}
                className="min-h-12 w-full min-w-0 grow border border-line-strong bg-bg px-3.5 text-base text-fg focus:border-signal focus:outline-none"
              />
              <button type="submit" disabled={busy} className="min-h-12 shrink-0 bg-signal px-5 text-[15px] font-semibold text-on-signal hover:brightness-110 disabled:opacity-60">
                {busy ? "Joining…" : "Join the waitlist"}
              </button>
            </div>
            {/* honeypot: hidden from people and assistive tech; bots that fill every field get a quiet no-op */}
            <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
              <label>
                Website
                <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
              </label>
            </div>
            <div aria-live="polite" className="min-h-[1px]">
              {error && (
                <p id={`${ids}-err`} className="m-0 text-[13px] text-bad-text">
                  {error}
                </p>
              )}
            </div>
          </div>

          <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
            <legend className="mb-2 text-[13px] text-fg-3">
              Preparing for <span className="text-fg-4">(optional)</span>
            </legend>
            <div className="flex flex-wrap gap-1.5">
              {GOALS.map((g) => (
                <Chip key={g.id} on={goals.includes(g.id)} onClick={() => toggle(goals, setGoals, g.id)}>
                  {g.label}
                </Chip>
              ))}
            </div>
          </fieldset>
          <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
            <legend className="mb-2 text-[13px] text-fg-3">
              Languages <span className="text-fg-4">(optional)</span>
            </legend>
            <div className="flex flex-wrap gap-1.5">
              {LANGUAGES.map((l) => (
                <Chip key={l.id} on={languages.includes(l.id)} onClick={() => toggle(languages, setLanguages, l.id)}>
                  {l.label}
                </Chip>
              ))}
            </div>
          </fieldset>

          {!loading &&
            (user ? (
              <p className="m-0 font-mono text-xs text-fg-3">Signed in · this signup is linked to your account</p>
            ) : (
              <p className="m-0 text-[13px] leading-relaxed text-fg-3">
                Already learning System Design?{" "}
                <button type="button" onClick={openAuthModal} className="font-semibold text-signal-text underline decoration-line-strong underline-offset-4 hover:decoration-signal">
                  Sign in first
                </button>{" "}
                to link founding access to your account.
              </p>
            ))}
        </form>
      )}

      <details className="group text-[11px] leading-relaxed text-fg-4">
        <summary className="cursor-pointer list-none marker:hidden hover:text-fg-3 [&::-webkit-details-marker]:hidden">
          <span aria-hidden className="inline-block transition-transform group-open:rotate-90">›</span> Offer terms
        </summary>
        <p className="m-0 mt-1.5 text-fg-3">
          Founding access belongs to the account with the email you join with; sign in with that email to keep it. It covers every feature of both courses for as long as
          they run. AI features use daily fair-use credits, which may change with running costs. The free period ends on a date announced in advance, and everyone who joins
          before then is included. We use your email only for DSA Mastery and course updates.
        </p>
      </details>
    </section>
  );
}
