"use client";

/**
 * /dsa/certificate: DSA Mastery · Foundations. The requirements with the learner's progress (the same rules the claim
 * runs on the server, src/lib/dsa/cert/rules.ts, over the Academy spec), a preview of the certificate, and the claim
 * once everything is done. Signed-in learners get the server's check (GET /api/dsa/certificate) and their issued
 * certificate; guests see the progress in this browser.
 */
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useGame } from "@/game/GameProvider";
import { userFetch } from "@/components/learn/progress/userFetch";
import { DISCLAIMER } from "@/lib/certificates/core";
import { DSA_CERT_NAME, dsaCertPath, foundationsEligibility, signalsFromGame, type DsaCertView, type DsaEligibility } from "@/lib/dsa/cert/rules";
import type { WorldSpec } from "@/lib/dsa/types";
import DsaCrumbs from "../DsaCrumbs";
import { useDsaProgress } from "../progress/useDsaProgress";
import DsaCertFace from "./DsaCertFace";

type Server = { available: boolean; eligibility: DsaEligibility; certificate: DsaCertView | null };

function Bar({ done, total }: { done: number; total: number }) {
  return (
    <div aria-hidden className="h-1.5 bg-surface-2">
      <div className="h-1.5 bg-signal" style={{ width: `${total ? Math.round((done / total) * 100) : 0}%` }} />
    </div>
  );
}

function Claim({ onDone }: { onDone: (v: DsaCertView) => void }) {
  const { profile } = useAuth();
  const [name, setName] = useState(profile?.full_name || "");
  const [pub, setPub] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const r = await userFetch("/api/dsa/certificate", { method: "POST", body: JSON.stringify({ name, isPublic: pub }) }).catch(() => null);
    const j = r ? ((await r.json().catch(() => ({}))) as { certificate?: DsaCertView; error?: string }) : {};
    setBusy(false);
    if (r?.ok && j.certificate) onDone(j.certificate);
    else setErr(j.error || "Couldn't issue the certificate. Please try again.");
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-3 border-2 border-signal bg-surface p-5">
      <span className="font-display text-[20px] font-bold text-fg">You&apos;ve earned it. Claim your certificate.</span>
      <label className="flex flex-col gap-1.5 text-[14px] text-fg-2">
        The name to print
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required className="min-h-11 border border-line-strong bg-bg px-3 text-[16px] text-fg" />
      </label>
      <label className="flex items-center gap-2 text-[14px] text-fg-2">
        <input type="checkbox" checked={pub} onChange={(e) => setPub(e.target.checked)} className="h-5 w-5 accent-[var(--c-signal)]" />
        Anyone with the link can verify it
      </label>
      {err ? <p className="m-0 text-[14px] text-bad-text">{err}</p> : null}
      <button type="submit" disabled={busy} className="inline-flex min-h-11 items-center self-start bg-signal px-4 font-mono text-[14px] font-semibold text-on-signal disabled:opacity-60">
        {busy ? "Issuing…" : "Claim the certificate"}
      </button>
    </form>
  );
}

export default function DsaCertificate({ spec }: { spec: WorldSpec }) {
  const { user, loading } = useAuth();
  const { done, hydrated } = useGame();
  const progress = useDsaProgress();
  const [server, setServer] = useState<Server | null>(null);
  const [issued, setIssued] = useState<DsaCertView | null>(null);

  useEffect(() => {
    if (loading || !user) return;
    let off = false;
    void userFetch("/api/dsa/certificate")
      .then((r) => (r.ok ? (r.json() as Promise<Server>) : null))
      .then((s) => {
        if (!off && s) setServer(s);
      })
      .catch(() => {});
    return () => {
      off = true;
    };
  }, [user, loading]);

  const local = useMemo(() => {
    const g = signalsFromGame(done);
    return foundationsEligibility(spec, { solved: progress.solved, concepts: progress.concepts, checkpoints: progress.checkpoints, labs: progress.labs, milestones: g.milestones });
  }, [spec, done, progress.solved, progress.concepts, progress.checkpoints]);
  const e = server?.eligibility || local;
  const cert = issued || server?.certificate || null;
  const ready = hydrated && progress.ready;
  const soon = e.requirements.filter((r) => r.comingSoon);
  const unreleased = e.requirements.reduce((a, r) => a + r.total - r.built, 0);

  return (
    <div className="dsa-theme">
      <main className="mx-auto flex max-w-[1180px] flex-col gap-8 px-4 pb-24 pt-8 sm:px-6">
        <header className="flex flex-col gap-2">
          <DsaCrumbs items={[{ href: "/dsa", label: "DSA Mastery" }, { label: "Certificate" }]} />
          <span className="font-mono text-xs uppercase tracking-label text-signal-text">Certificate · {DSA_CERT_NAME}</span>
          <h1 className="m-0 font-display text-[36px] font-extrabold leading-none tracking-[-0.03em] text-fg sm:text-[48px]">
            Finish the Academy, earn the certificate<span className="text-signal-text">.</span>
          </h1>
          <p className="m-0 max-w-[720px] text-[16px] leading-relaxed text-fg-2">
            {DSA_CERT_NAME} is awarded for the whole Kestrel Academy world: every lesson, practice problem and checkpoint quiz, each module&apos;s review, and the Launch week final. It&apos;s checked on the server from your recorded progress and comes with a public verification page.
          </p>
        </header>

        <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
          <div className="flex flex-col gap-3 lg:sticky lg:top-[calc(var(--hk-header-h,61px)+16px)]">
            <DsaCertFace name={cert?.name || null} code={cert?.code || null} issuedAt={cert?.issuedAt || null} preview={!cert} />
            {cert ? (
              <div className="flex flex-wrap gap-2">
                <Link href={dsaCertPath(cert.code)} className="inline-flex min-h-11 items-center bg-signal px-4 font-mono text-[13.5px] font-semibold text-on-signal">
                  Open the verification page →
                </Link>
              </div>
            ) : null}
          </div>

          <section aria-labelledby="req-h" className="flex flex-col gap-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="req-h" className="m-0 font-display text-[24px] font-bold tracking-[-0.02em] text-fg">
                What it takes
              </h2>
              <span className="font-mono text-[12px] text-fg-3">{ready ? `${e.pct}% · ${e.done} of ${e.total} done` : " "}</span>
            </div>
            <Bar done={ready ? e.done : 0} total={e.total} />
            <ol className="m-0 flex list-none flex-col gap-px border border-line bg-line p-0">
              {e.requirements.map((r) => (
                <li key={r.id} className="flex flex-col gap-2.5 bg-surface p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="flex items-center gap-2 text-[16px] font-semibold text-fg">
                      <span aria-hidden className={`grid h-5 w-5 place-items-center border text-[11px] ${r.complete ? "border-ok bg-ok text-bg" : "border-line-strong text-transparent"}`}>
                        ✓
                      </span>
                      {r.label}
                      <span className="sr-only">{r.complete ? "(complete)" : "(not complete)"}</span>
                    </span>
                    <span className="font-mono text-[12px] text-fg-2">
                      {ready ? r.done : 0} / {r.total}
                    </span>
                  </div>
                  <Bar done={ready ? r.done : 0} total={r.total} />
                  <span className="text-[13.5px] text-fg-3">
                    {r.detail}
                    {r.comingSoon ? (
                      <span className="text-fg-2">
                        {" "}
                        {r.built ? `${r.total - r.built} of ${r.total} still being written.` : "Coming soon: not released yet."}
                      </span>
                    ) : null}
                  </span>
                  {ready && r.todo.length ? (
                    <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
                      {r.todo.map((t, i) =>
                        t.href ? (
                          <li key={`${i}-${t.label}`}>
                            <Link href={t.href} className="inline-flex min-h-9 items-center border border-line-strong px-2.5 font-mono text-[12px] text-fg-2 hover:border-signal hover:text-fg">
                              {t.label} →
                            </Link>
                          </li>
                        ) : null,
                      )}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ol>

            {cert ? null : e.eligible && user ? (
              <Claim onDone={setIssued} />
            ) : (
              <p className="m-0 border-l-2 border-signal pl-3 text-[14px] leading-relaxed text-fg-2">
                {soon.length
                  ? `Not claimable yet: ${unreleased} parts of the Academy, the module reviews and the Launch week final among them, are still being written. Your progress counts as you go, and the claim opens once the whole world is out and done.`
                  : "Finish every item above and the claim opens here."}
                {!loading && !user ? " Sign in to keep your progress on your account: certificates are issued to signed-in learners." : ""}
              </p>
            )}

            <details className="text-[13px] text-fg-3">
              <summary className="cursor-pointer font-mono text-[12px]">About this certificate</summary>
              <p className="m-0 mt-2 leading-relaxed">
                Issued by System Design Mastery with a public verification page at /dsa/cert/&lt;code&gt;. Only server-recorded progress counts. {DISCLAIMER}
              </p>
            </details>
          </section>
        </div>
      </main>
    </div>
  );
}
