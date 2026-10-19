"use client";

/**
 * /learn/certificate: earning a certificate. The checklist (checked on the server from the
 * database: lessons, re-scored trial answers, bosses, mock scorecards) with what's left and where
 * to finish it → Claim → confirm the name + public page → "You're certified" with Add to LinkedIn,
 * Download PDF and Share. Below it, one certificate per world with its own claim.
 * Guests are asked to sign in: their progress lives in this browser and can be imported from the
 * Progress page.
 */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, ExternalLink, Linkedin, Lock, Share2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { useGame } from "@/game/GameProvider";
import { track } from "@/lib/track";
import { userFetch, userJson } from "@/components/learn/progress/userFetch";
import ShareSheet from "@/components/share/ShareSheet";
import { CertificateArt } from "@/components/certificates/CertificateArt";
import { PdfLink } from "@/components/certificates/CertClient";
import {
  CERT_TITLE,
  CERT_XP,
  DISCLAIMER,
  ISSUER,
  NAME_MAX,
  certDisplayUrl,
  certPath,
  certTitle,
  certXpKey,
  checkCertName,
  fmtCertDate,
  linkedinAddUrl,
  type CertificateView,
  type CertKind,
  type CertState,
  type Eligibility,
  type Requirement,
} from "@/lib/certificates/core";
import "@/components/certificates/certificate.css";

const LABEL = "font-mono text-[11px] uppercase tracking-label";
type Target = { kind: CertKind; world: string | null; title: string };
type WorldRow = CertState["worlds"][number];

/* ------------------------------------------------------------------ data */

function useCertState() {
  const { user, loading: authLoading } = useAuth();
  const userId = user?.id ?? null;
  const [res, setRes] = useState<{ uid: string; state: CertState | null; error: string | null } | null>(null);
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    if (!userId) return;
    let off = false;
    userJson<CertState>("/api/learn/certificates")
      .then((state) => !off && setRes({ uid: userId, state, error: null }))
      .catch((e: Error) => !off && setRes({ uid: userId, state: null, error: e.message || "Couldn't load your certificates." }));
    return () => {
      off = true;
    };
  }, [userId, nonce]);
  // keep what's loaded while auth re-checks the session (a token refresh must not unmount the flow)
  const mine = res && (res.uid === userId || (authLoading && !userId)) ? res : null;
  return {
    authLoading,
    signedIn: !!userId,
    loading: !!userId && !mine,
    state: mine?.state ?? null,
    error: mine?.error ?? null,
    refresh: useCallback(() => setNonce((n) => n + 1), []),
    patch: useCallback((fn: (s: CertState) => CertState) => setRes((r) => (r && r.state ? { ...r, state: fn(r.state) } : r)), []),
  };
}

function replaceCert(s: CertState, cert: CertificateView): CertState {
  if (cert.kind === "course") return { ...s, course: { ...s.course, certificate: cert } };
  return { ...s, worlds: s.worlds.map((w) => (w.key === cert.world?.key ? { ...w, certificate: cert } : w)) };
}

/* ------------------------------------------------------------------ page */

export default function CertificateFlow() {
  const d = useCertState();
  const { openAuthModal } = useAuthModal();
  const { awardOnce, hydrated } = useGame();
  const [target, setTarget] = useState<Target | null>(null);
  const [issued, setIssued] = useState<CertificateView | null>(null);
  const [share, setShare] = useState<CertificateView | null>(null);
  const topRef = useRef<HTMLDivElement>(null);

  // certificates issued on another device still pay their XP here (once)
  useEffect(() => {
    if (!hydrated || !d.state) return;
    const certs = [d.state.course.certificate, ...d.state.worlds.map((w) => w.certificate)].filter((c): c is CertificateView => !!c && c.status === "valid");
    certs.forEach((c) => awardOnce(certXpKey(c.kind, c.world?.key), CERT_XP[c.kind], c.kind === "course" ? "Certified · System Design Mastery" : `World ${c.world?.code} certificate`));
  }, [hydrated, d.state, awardOnce]);

  const toTop = () => window.requestAnimationFrame(() => topRef.current?.scrollIntoView({ block: "start" }));
  const startClaim = (t: Target) => {
    track("cert_claim", { kind: t.kind, world: t.world });
    setTarget(t);
    toTop();
  };

  let body: React.ReactNode;
  const loaded = !!d.state && (d.signedIn || d.authLoading);
  if (!loaded && (d.authLoading || d.loading)) {
    body = (
      <div className="flex flex-col gap-4" aria-busy="true" aria-label="Checking your progress">
        <div className="h-[120px] animate-pulse border border-line bg-surface" />
        <div className="h-[320px] animate-pulse border border-line bg-surface" />
      </div>
    );
  } else if (!loaded && !d.signedIn) {
    body = <SignedOut onSignIn={openAuthModal} />;
  } else if (!d.state) {
    body = (
      <p role="alert" className="m-0 border border-bad/50 bg-surface p-4 text-[15px] text-fg-2">
        {d.error || "Couldn't load your certificates."}{" "}
        <button type="button" onClick={d.refresh} className="font-semibold text-fg underline underline-offset-4">
          Retry
        </button>
      </p>
    );
  } else if (target) {
    body = (
      <Confirm
        target={target}
        state={d.state}
        onBack={() => {
          setTarget(null);
          toTop();
        }}
        onIssued={(cert, existing) => {
          d.patch((s) => replaceCert(s, cert));
          if (!existing) track("cert_issued", { kind: cert.kind, world: cert.world?.key ?? null });
          awardOnce(certXpKey(cert.kind, cert.world?.key), CERT_XP[cert.kind], cert.kind === "course" ? "Certified · System Design Mastery" : `World ${cert.world?.code} certificate`);
          setTarget(null);
          setIssued(cert);
          toTop();
        }}
        onStale={d.refresh}
      />
    );
  } else if (issued) {
    const fresh = (issued.kind === "course" ? d.state.course.certificate : d.state.worlds.find((w) => w.key === issued.world?.key)?.certificate) || issued;
    body = (
      <div className="flex flex-col gap-8">
        <Issued cert={fresh} justNow onShare={setShare} onChanged={(c) => d.patch((s) => replaceCert(s, c))} />
        <button
          type="button"
          onClick={() => {
            setIssued(null);
            toTop();
          }}
          className="self-start font-mono text-[13px] text-fg-3 underline underline-offset-4 hover:text-fg"
        >
          ← all certificates
        </button>
      </div>
    );
  } else {
    const s = d.state;
    body = (
      <div className="flex flex-col gap-14">
        {!s.available && (
          <p role="status" className="m-0 border border-dashed border-signal bg-surface p-4 text-[15px] leading-relaxed text-fg-2">
            <strong className="text-fg">Certificates are switching on soon.</strong> Your checklist below is live; claiming opens as soon as they&apos;re switched on.
          </p>
        )}
        {s.course.certificate ? (
          <Issued cert={s.course.certificate} onShare={setShare} onChanged={(c) => d.patch((x) => replaceCert(x, c))} />
        ) : (
          <Checklist e={s.course.eligibility} canClaim={s.available && s.signing} onClaim={() => startClaim({ kind: "course", world: null, title: certTitle("course") })} />
        )}
        <Worlds rows={s.worlds} canClaim={s.available && s.signing} onClaim={(w) => startClaim({ kind: "world", world: w.key, title: certTitle("world", w) })} onShare={setShare} />
        <FinePrint />
      </div>
    );
  }

  return (
    <main className="mx-auto flex max-w-[1100px] flex-col gap-8 px-4 pb-32 pt-6 sm:px-6 sm:pt-10 lg:pb-24">
      <div ref={topRef} className="scroll-mt-28">
        <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 font-mono text-xs text-fg-3">
          <Link href="/learn/dashboard" className="hover:text-fg">
            progress
          </Link>
          <span aria-hidden>›</span>
          <span className="text-signal-text">certificate</span>
        </nav>
      </div>
      {body}
      {share && (
        <ShareSheet
          target={{
            kind: "certificate",
            url: () => certPath(share.code),
            text: () =>
              share.kind === "course"
                ? `I earned the ${ISSUER} certificate of completion: ${share.stats?.worlds.total ?? 11} worlds, every trial, every interview boss and a mock interview. Verify it here:`
                : `I earned the World ${share.world?.code} certificate of ${ISSUER} (${share.world?.title}). Verify it here:`,
          }}
          onClose={() => setShare(null)}
        />
      )}
    </main>
  );
}

/* ------------------------------------------------------------------ signed out */

function SignedOut({ onSignIn }: { onSignIn: () => void }) {
  return (
    <section className="flex flex-col gap-5">
      <Head kicker={CERT_TITLE} title="Earn your certificate" sub="Clear every world, pass every trial, beat every boss and score Hire on a mock interview." />
      <div className="flex flex-col gap-3 border border-dashed border-signal bg-surface p-5">
        <span className={`${LABEL} flex items-center gap-1.5 text-signal-text`}>
          <Lock className="h-3.5 w-3.5" aria-hidden /> needs an account
        </span>
        <p className="m-0 text-[16px] leading-relaxed text-fg">
          <strong>Sign in to earn certificates;</strong> your progress in this browser can be imported from the Progress page.
        </p>
        <p className="m-0 text-[14px] leading-relaxed text-fg-3">Certificates are checked against your account&apos;s records on the server, so progress kept only in this browser can&apos;t count until it&apos;s in your account.</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onSignIn} className="inline-flex min-h-12 items-center bg-signal px-5 font-semibold text-on-signal hover:brightness-110">
            Sign in
          </button>
          <Link href="/learn/dashboard#data" className="inline-flex min-h-12 items-center border border-line-strong px-4 text-[15px] text-fg hover:bg-surface-2">
            Import from the Progress page
          </Link>
        </div>
      </div>
      <FinePrint />
    </section>
  );
}

function Head({ kicker, title, sub }: { kicker: string; title: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2.5">
      <span className={`${LABEL} text-signal-text`}>{kicker}</span>
      <h1 className="m-0 font-display text-[34px] font-extrabold leading-[1] tracking-[-0.03em] text-fg sm:text-[52px]">{title}</h1>
      {sub && <p className="m-0 max-w-[640px] text-[15px] leading-relaxed text-fg-2 sm:text-[17px]">{sub}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ checklist */

function headline(e: Eligibility) {
  const left = e.total - e.met;
  if (!left) return "Ready to claim";
  if (left === 1) return "One step left";
  return `${left} steps left`;
}

function ReqItem({ r }: { r: Requirement }) {
  const [open, setOpen] = useState(false);
  const shown = r.todo.slice(0, 6);
  return (
    <li className="bg-surface">
      <div className="flex items-start gap-3 p-3.5 sm:p-4">
        {r.done ? (
          <span className="grid h-[22px] w-[22px] shrink-0 place-items-center bg-signal text-on-signal" aria-hidden>
            <Check className="h-3.5 w-3.5" strokeWidth={3} />
          </span>
        ) : (
          <span className="h-[22px] w-[22px] shrink-0 border-[1.5px] border-dashed border-fg-4" aria-hidden />
        )}
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-[15px] font-semibold text-fg">
            {r.label}
            <span className="sr-only">{r.done ? " — done" : " — not yet"}</span>
          </span>
          <span className="font-mono text-[12px] text-fg-3">{r.detail}</span>
          {!r.done && r.need > 1 && (
            <span className="mt-1 block h-1 max-w-[260px] bg-surface-2" aria-hidden>
              <span className="block h-1 bg-signal/70" style={{ width: `${Math.round((r.have / Math.max(1, r.need)) * 100)}%` }} />
            </span>
          )}
        </span>
        {!r.done && (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="inline-flex min-h-10 shrink-0 items-center gap-1 px-1.5 font-mono text-[12px] text-fg-3 hover:text-fg"
          >
            how to finish <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
          </button>
        )}
      </div>
      {open && !r.done && (
        <div className="flex flex-col gap-2 border-t border-line px-3.5 pb-4 pt-3 sm:px-4 sm:pl-[52px]">
          {shown.length > 0 && (
            <ul className="m-0 flex list-none flex-col gap-1 p-0">
              {shown.map((t) => (
                <li key={t.href + t.label}>
                  <Link href={t.href} className="inline-flex min-h-9 flex-col justify-center text-[14px] text-fg-2 underline decoration-line-strong underline-offset-4 hover:text-fg hover:decoration-signal">
                    {t.label}
                    {t.note && <span className="font-mono text-[11px] text-signal-text no-underline">{t.note}</span>}
                  </Link>
                </li>
              ))}
              {r.todo.length > shown.length && <li className="font-mono text-[12px] text-fg-3">and {r.todo.length - shown.length} more</li>}
            </ul>
          )}
          <Link href={r.href} className="inline-flex min-h-10 items-center self-start border border-line-strong px-3 font-mono text-[13px] text-fg hover:border-signal">
            {r.hrefLabel} →
          </Link>
        </div>
      )}
    </li>
  );
}

function Checklist({ e, canClaim, onClaim }: { e: Eligibility; canClaim: boolean; onClaim: () => void }) {
  const pct = Math.round((e.met / Math.max(1, e.total)) * 100);
  const next = e.requirements.find((r) => !r.done);
  return (
    <section aria-labelledby="course-cert-h" className="flex flex-col gap-5">
      <div className="flex flex-col gap-2.5">
        <span className={`${LABEL} text-signal-text`}>{CERT_TITLE}</span>
        <h1 id="course-cert-h" className="m-0 font-display text-[34px] font-extrabold leading-[1] tracking-[-0.03em] text-fg sm:text-[52px]">
          {headline(e)}
          <span className="text-signal-text">.</span>
        </h1>
        <p className="m-0 max-w-[640px] text-[15px] leading-relaxed text-fg-2 sm:text-[17px]">Earned, not given: clear every world, pass every trial and score Hire on a mock interview.</p>
      </div>
      <div className="flex flex-col gap-2">
        <div className="h-2 bg-surface-2" role="progressbar" aria-valuemin={0} aria-valuemax={e.total} aria-valuenow={e.met} aria-label="Requirements met">
          <div className="h-2 bg-signal transition-[width]" style={{ width: `${pct}%` }} />
        </div>
        <span className="font-mono text-[13px] text-fg-3">
          {e.met} of {e.total} requirements met
        </span>
      </div>
      <ul className="m-0 flex list-none flex-col gap-px border border-line bg-line p-0">
        {e.requirements.map((r) => (
          <ReqItem key={r.id} r={r} />
        ))}
      </ul>
      {e.eligible ? (
        <button type="button" onClick={onClaim} disabled={!canClaim} className="min-h-[52px] bg-signal px-6 text-[16px] font-semibold text-on-signal hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 sm:self-start">
          Claim my certificate
        </button>
      ) : (
        next && (
          <Link href={next.href} className="inline-flex min-h-[52px] items-center justify-center gap-2 border border-line-strong px-6 text-[16px] text-fg hover:bg-surface-2 sm:self-start">
            Next: {next.hrefLabel.toLowerCase()} →
          </Link>
        )
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ confirm */

function Confirm({ target, state, onBack, onIssued, onStale }: { target: Target; state: CertState; onBack: () => void; onIssued: (c: CertificateView, existing: boolean) => void; onStale: () => void }) {
  const [name, setName] = useState(state.suggestedName);
  const [isPublic, setIsPublic] = useState(true);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const check = useMemo(() => checkCertName(name), [name]);
  const showErr = (touched || name.length > 0) && !check.ok;

  const issue = async () => {
    setTouched(true);
    if (!check.ok) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await userFetch("/api/learn/certificates/claim", { method: "POST", body: JSON.stringify({ kind: target.kind, world: target.world, name: check.name, isPublic }) });
      const body = (await res.json().catch(() => ({}))) as { certificate?: CertificateView; existing?: boolean; error?: string; code?: string };
      if (res.ok && body.certificate) return onIssued(body.certificate, !!body.existing);
      if (res.status === 409) onStale();
      setErr(body.error || `Couldn't issue it (HTTP ${res.status}).`);
    } catch {
      setErr("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="confirm-h" className="flex max-w-[640px] flex-col gap-4">
      <span className={`${LABEL} text-signal-text`}>One last step · {target.kind === "course" ? CERT_TITLE : target.title.replace(`${ISSUER} · `, "")}</span>
      <h1 id="confirm-h" className="m-0 font-display text-[32px] font-extrabold leading-[1.02] tracking-[-0.03em] text-fg sm:text-[44px]">
        The name on your certificate
      </h1>
      <p className="m-0 text-[15px] leading-relaxed text-fg-2">This appears on the certificate and its public verification page. You can hide the page later.</p>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void issue();
        }}
      >
        <div className="flex flex-col gap-1.5">
          <label htmlFor="cert-name" className={`${LABEL} text-fg-3`}>
            Full name
          </label>
          <input
            id="cert-name"
            type="text"
            value={name}
            maxLength={NAME_MAX + 20}
            autoComplete="name"
            onChange={(e) => setName(e.target.value)}
            onBlur={() => setTouched(true)}
            aria-invalid={showErr}
            aria-describedby="cert-name-hint"
            className={`min-h-12 border bg-surface px-3.5 text-[17px] text-fg outline-none focus:border-signal ${showErr ? "border-bad" : "border-line-strong"}`}
          />
          <span id="cert-name-hint" className={`text-[13px] ${showErr ? "text-bad-text" : "text-fg-3"}`}>
            {showErr && !check.ok ? check.error : "Check the spelling: the name is signed into the certificate and can't be changed after it's issued."}
          </span>
        </div>
        <label className="flex cursor-pointer items-start gap-3 border border-line bg-surface p-3.5 text-[14px] leading-snug text-fg-2">
          <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} className="mt-0.5 h-[18px] w-[18px] shrink-0 accent-[#FF6B2B]" />
          <span>
            <span className="block font-semibold text-fg">Publish a public page so recruiters can verify it</span>
            Shows your name, the certificate and how it was earned at {certDisplayUrl("…")}. Never your email.
          </span>
        </label>
        {err && (
          <p role="alert" className="m-0 border border-bad/50 bg-surface p-3 text-[14px] text-bad-text">
            {err}
          </p>
        )}
        <div className="flex flex-col gap-2 sm:flex-row">
          <button type="submit" disabled={busy} className="min-h-[52px] bg-signal px-6 text-[16px] font-semibold text-on-signal hover:brightness-110 disabled:opacity-60">
            {busy ? "Checking your progress…" : "Issue my certificate"}
          </button>
          <button type="button" onClick={onBack} disabled={busy} className="min-h-11 px-4 text-[14px] text-fg-3 hover:text-fg">
            Back
          </button>
        </div>
      </form>
    </section>
  );
}

/* ------------------------------------------------------------------ issued */

function Issued({ cert, justNow = false, onShare, onChanged }: { cert: CertificateView; justNow?: boolean; onShare: (c: CertificateView) => void; onChanged: (c: CertificateView) => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const revoked = cert.status === "revoked";
  const course = cert.kind === "course";
  const xp = CERT_XP[cert.kind];

  const setPublic = async (v: boolean) => {
    setBusy(true);
    setErr(null);
    try {
      const r = await userJson<{ certificate: CertificateView }>(`/api/learn/certificates/${cert.code}`, { method: "PATCH", body: JSON.stringify({ isPublic: v }) });
      onChanged({ ...cert, isPublic: r.certificate.isPublic });
    } catch (e) {
      setErr((e as Error).message || "Couldn't change it.");
    } finally {
      setBusy(false);
    }
  };

  const linkedin = () => {
    track("cert_linkedin", { kind: cert.kind, world: cert.world?.key ?? null });
    void userFetch(`/api/learn/certificates/${cert.code}/linkedin`, { method: "POST" }).catch(() => undefined);
  };

  return (
    <section aria-labelledby={`issued-${cert.code}`} className="flex flex-col gap-5">
      <span className={`self-start border-[1.5px] px-2.5 py-1.5 font-mono text-[12px] uppercase tracking-[0.14em] ${revoked ? "border-bad text-bad-text" : "border-signal text-signal-text"}`}>
        {revoked ? "Revoked" : justNow ? `Unlocked · +${xp} XP` : `Certified · ${fmtCertDate(cert.issuedAt)}`}
      </span>
      <h1 id={`issued-${cert.code}`} className="m-0 font-display text-[40px] font-extrabold leading-[0.98] tracking-[-0.035em] text-fg sm:text-[56px]">
        {revoked ? "This certificate was revoked" : course ? "You're certified" : `World ${cert.world?.code} certified`}
        <span className="text-signal-text">.</span>
      </h1>
      {revoked ? (
        <p className="m-0 max-w-[640px] text-[15px] leading-relaxed text-fg-2">
          It was revoked{cert.revokedAt ? ` on ${fmtCertDate(cert.revokedAt)}` : ""} and no longer certifies completion; its verification page says so. If you think this is a mistake, get in touch through{" "}
          <Link href="/#contact" className="font-semibold text-signal-text underline underline-offset-4">
            the contact form
          </Link>
          .
        </p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:items-start">
          <div className="border border-line">
            <CertificateArt cert={cert} theme="paper" />
          </div>
          <div className="flex flex-col gap-3">
            {cert.isPublic ? (
              <a
                href={linkedinAddUrl({ code: cert.code, kind: cert.kind, issuedAt: cert.issuedAt, world: cert.world })}
                target="_blank"
                rel="noopener noreferrer"
                onClick={linkedin}
                className="inline-flex min-h-[52px] items-center justify-center gap-2 bg-[#0A66C2] px-5 text-[16px] font-semibold text-white hover:brightness-110"
              >
                <Linkedin className="h-[18px] w-[18px]" aria-hidden /> Add to LinkedIn profile
              </a>
            ) : (
              <span className="inline-flex min-h-[52px] items-center justify-center gap-2 border border-dashed border-line-strong px-5 text-center text-[14px] text-fg-3">Turn the public page on to add it to LinkedIn</span>
            )}
            <div className="grid grid-cols-2 gap-2.5">
              <PdfLink code={cert.code} kind={cert.kind} from="earn" className="inline-flex min-h-12 items-center justify-center gap-2 border border-line-strong px-3 text-[15px] text-fg hover:bg-surface-2">
                Download PDF
              </PdfLink>
              <button
                type="button"
                disabled={!cert.isPublic}
                onClick={() => {
                  track("cert_share", { kind: cert.kind, world: cert.world?.key ?? null });
                  onShare(cert);
                }}
                className="inline-flex min-h-12 items-center justify-center gap-2 border border-line-strong px-3 text-[15px] text-fg hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Share2 className="h-4 w-4" aria-hidden /> Share link
              </button>
            </div>
            <span className="font-mono text-[12px] text-fg-3">
              Verify:{" "}
              {cert.isPublic ? (
                <a href={certPath(cert.code)} target="_blank" rel="noopener noreferrer" className="text-fg-2 underline underline-offset-4 hover:text-fg">
                  {certDisplayUrl(cert.code)} <ExternalLink className="inline h-3 w-3" aria-hidden />
                </a>
              ) : (
                <span className="line-through">{certDisplayUrl(cert.code)}</span>
              )}
            </span>
            <div className="mt-2 flex items-center justify-between gap-3 border border-line bg-surface p-3.5">
              <span className="min-w-0">
                <span className="block text-[14px] font-semibold text-fg">Public verification page</span>
                <span className="block text-[13px] leading-snug text-fg-3">{cert.isPublic ? "Anyone with the ID or the QR code can check it." : "Hidden: links and the QR code show a 404 until you turn it back on."}</span>
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={cert.isPublic}
                aria-label="Public verification page"
                disabled={busy}
                onClick={() => void setPublic(!cert.isPublic)}
                className={`relative h-8 w-[60px] shrink-0 border transition-colors disabled:opacity-50 ${cert.isPublic ? "border-signal bg-signal" : "border-line-strong bg-surface-2"}`}
              >
                <span aria-hidden className={`absolute top-[3px] h-6 w-6 transition-[left] ${cert.isPublic ? "left-[31px] bg-on-signal" : "left-[3px] bg-fg-3"}`} />
              </button>
            </div>
            {err && (
              <p role="alert" className="m-0 text-[13px] text-bad-text">
                {err}
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ worlds */

function Worlds({ rows, canClaim, onClaim, onShare }: { rows: WorldRow[]; canClaim: boolean; onClaim: (w: WorldRow) => void; onShare: (c: CertificateView) => void }) {
  const issued = rows.filter((w) => w.certificate).length;
  return (
    <section aria-labelledby="worlds-h" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1 border-b border-line pb-3">
        <h2 id="worlds-h" className="m-0 flex flex-col gap-1">
          <span className={`${LABEL} text-signal-text`}>world certificates</span>
          <span className="font-display text-[28px] font-bold leading-none tracking-[-0.02em] text-fg sm:text-[34px]">One for every world</span>
        </h2>
        <span className="font-mono text-[13px] text-fg-3">
          {issued}/{rows.length} issued
        </span>
      </div>
      <p className="m-0 max-w-[680px] text-[14px] leading-relaxed text-fg-3">Each world has its own certificate in the blueprint style: every lesson of the world, its trial parts at 80%+ and its boss.</p>
      <ul className="m-0 grid list-none gap-3 p-0 [grid-template-columns:repeat(auto-fill,minmax(min(320px,100%),1fr))]">
        {rows.map((w) => (
          <WorldCard key={w.key} w={w} canClaim={canClaim} onClaim={() => onClaim(w)} onShare={onShare} />
        ))}
      </ul>
    </section>
  );
}

function WorldCard({ w, canClaim, onClaim, onShare }: { w: WorldRow; canClaim: boolean; onClaim: () => void; onShare: (c: CertificateView) => void }) {
  const [open, setOpen] = useState(false);
  const c = w.certificate;
  const e = w.eligibility;
  const state = c ? (c.status === "revoked" ? "revoked" : "issued") : e.eligible ? "ready" : "todo";
  const todo = e.requirements.filter((r) => !r.done);
  return (
    <li className={`flex min-w-0 flex-col gap-3 border bg-surface p-4 ${state === "ready" ? "border-signal" : "border-line"}`}>
      <div className="flex items-start gap-3">
        <span aria-hidden className={`grid h-12 w-12 shrink-0 place-items-center font-mono text-[15px] font-semibold ${state === "issued" ? "bg-[#123A63] text-white" : state === "ready" ? "bg-signal text-on-signal" : "border border-line-strong text-fg-3"}`}>
          {w.code}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-[15px] font-semibold text-fg">{w.title}</span>
          <span className={`font-mono text-[12px] ${state === "revoked" ? "text-bad-text" : state === "issued" ? "text-ok" : state === "ready" ? "text-signal-text" : "text-fg-3"}`}>
            {state === "issued" ? `issued · ${c!.code}` : state === "revoked" ? `revoked · ${c!.code}` : state === "ready" ? "ready to claim" : `${e.met}/${e.total} requirements met`}
          </span>
        </span>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 font-mono text-[11px] text-fg-3">
        {e.requirements.map((r) => (
          <span key={r.id} className={r.done ? "text-fg-2" : undefined}>
            {r.done ? "✓" : "·"} {r.detail}
          </span>
        ))}
      </div>
      <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-line pt-3">
        {state === "issued" && (
          <>
            {c!.isPublic && (
              <a href={certPath(c!.code)} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center border border-line-strong px-3 font-mono text-[12px] text-fg hover:bg-surface-2">
                view
              </a>
            )}
            <PdfLink code={c!.code} kind="world" from="earn-world" className="inline-flex min-h-10 items-center border border-line-strong px-3 font-mono text-[12px] text-fg hover:bg-surface-2">
              PDF
            </PdfLink>
            {c!.isPublic && (
              <>
                <a
                  href={linkedinAddUrl({ code: c!.code, kind: "world", issuedAt: c!.issuedAt, world: c!.world })}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => {
                    track("cert_linkedin", { kind: "world", world: w.key });
                    void userFetch(`/api/learn/certificates/${c!.code}/linkedin`, { method: "POST" }).catch(() => undefined);
                  }}
                  className="inline-flex min-h-10 items-center gap-1.5 border border-line-strong px-3 font-mono text-[12px] text-fg hover:bg-surface-2"
                >
                  <Linkedin className="h-3.5 w-3.5" aria-hidden /> LinkedIn
                </a>
                <button
                  type="button"
                  onClick={() => {
                    track("cert_share", { kind: "world", world: w.key });
                    onShare(c!);
                  }}
                  className="inline-flex min-h-10 items-center gap-1.5 border border-line-strong px-3 font-mono text-[12px] text-fg hover:bg-surface-2"
                >
                  <Share2 className="h-3.5 w-3.5" aria-hidden /> share
                </button>
              </>
            )}
          </>
        )}
        {state === "ready" && (
          <button type="button" onClick={onClaim} disabled={!canClaim} className="inline-flex min-h-11 items-center bg-signal px-4 text-[14px] font-semibold text-on-signal hover:brightness-110 disabled:opacity-50">
            Claim World {w.code} certificate
          </button>
        )}
        {state === "todo" && (
          <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="inline-flex min-h-10 items-center gap-1 font-mono text-[12px] text-fg-3 hover:text-fg">
            what&apos;s left <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
          </button>
        )}
      </div>
      {open && state === "todo" && (
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {todo.flatMap((r) => r.todo.slice(0, 4).map((t) => ({ ...t, id: r.id }))).map((t) => (
            <li key={t.id + t.href + t.label}>
              <Link href={t.href} className="inline-flex min-h-9 flex-col justify-center text-[13px] text-fg-2 underline decoration-line-strong underline-offset-4 hover:text-fg">
                {t.label}
                {t.note && <span className="font-mono text-[11px] text-signal-text">{t.note}</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

/* ------------------------------------------------------------------ fine print */

function FinePrint() {
  return (
    <div className="flex flex-col gap-2 border-t border-line pt-5 text-[13px] leading-relaxed text-fg-3">
      <p className="m-0">{DISCLAIMER}</p>
      <p className="m-0">
        Every requirement is checked on the server from your account&apos;s records when you claim. Each certificate gets an ID, a signature and a verification page; it can be revoked if it was earned dishonestly.{" "}
        <Link href="/learn/guide#certificates" className="font-semibold text-signal-text underline underline-offset-4">
          How certificates work →
        </Link>
      </p>
    </div>
  );
}
