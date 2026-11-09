import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DISCLAIMER } from "@/lib/certificates/core";
import { DSA_FULL } from "@/lib/dsa/flags";
import { DSA_LANG_LABEL, type DsaLang } from "@/lib/dsa/types";
import { DSA_CERT_NAME, dsaCertPath, isDsaCode, type DsaCertView } from "@/lib/dsa/cert/rules";
import { publicDsaCert } from "@/lib/dsa/cert/service";
import DsaCertFace from "@/components/dsa/cert/DsaCertFace";
import DsaCrumbs from "@/components/dsa/DsaCrumbs";

// /dsa/cert/<code>: the public verification page of a DSA Mastery certificate (DSA-XXXX-XXXX; /cert/<code> redirects
// here). Unknown, private and malformed codes are the same 404. Rendered on first visit and cached for an hour.

export const runtime = "nodejs";
export const revalidate = 3600;
export const dynamicParams = true;
export function generateStaticParams() {
  return [];
}

type Props = { params: Promise<{ code: string }> };

async function load(raw: string): Promise<DsaCertView | null> {
  if (!DSA_FULL) return null;
  const code = decodeURIComponent(raw).trim().toUpperCase();
  return isDsaCode(code) ? publicDsaCert(code) : null;
}

const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const c = await load((await params).code);
  if (!c) notFound();
  const title = `${c.name} · ${DSA_CERT_NAME}`;
  const description = c.status === "revoked" ? `Certificate ${c.code} was revoked.` : `Verify ${c.name}'s ${DSA_CERT_NAME} certificate: ID ${c.code}, issued ${fmt(c.issuedAt)}.`;
  return {
    title,
    description,
    alternates: { canonical: dsaCertPath(c.code) },
    robots: { index: false, follow: false, nocache: true },
    openGraph: { title, description, url: dsaCertPath(c.code), type: "website" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function DsaCertPage({ params }: Props) {
  const c = await load((await params).code);
  if (!c) notFound();
  const ev = c.evidence;
  const ok = c.status === "valid" && c.signature !== "bad";
  const facts = [
    ev.lessons ? `${ev.lessons} concept lessons` : null,
    ev.problems ? `${ev.problems} practice problems` : null,
    ev.checkpoints ? `${ev.checkpoints} checkpoints` : null,
    ev.reviews ? `${ev.reviews} building reviews` : null,
  ].filter((x): x is string => !!x);
  const langs = (ev.languages || []).map((l) => DSA_LANG_LABEL[l as DsaLang] || l);
  return (
    <div className="dsa-theme">
      <main className="mx-auto flex max-w-[1100px] flex-col gap-8 px-4 pb-24 pt-8 sm:px-6">
        <header className="flex flex-col gap-3">
          <DsaCrumbs items={[{ href: "/dsa", label: "DSA Mastery" }, { label: `Certificate ${c.code}` }]} />
          <span
            className={`inline-flex min-h-11 items-center gap-2.5 self-start border px-3.5 font-mono text-[14px] uppercase tracking-label ${ok ? "border-ok/70 bg-surface text-ok-text" : "border-bad bg-bad/10 text-bad-text"}`}
          >
            {c.status === "revoked" ? "✕ Revoked certificate" : c.signature === "bad" ? "! Can't be verified" : "✓ Valid certificate"}
          </span>
          <h1 className="m-0 font-display text-[32px] font-extrabold leading-[1.02] tracking-[-0.03em] text-fg sm:text-[44px]">
            {c.name} completed {DSA_CERT_NAME}
            <span className="text-signal-text">.</span>
          </h1>
          <p className="m-0 font-mono text-[13px] text-fg-3">
            ID {c.code} · issued {fmt(c.issuedAt)} by System Design Mastery
          </p>
        </header>
        <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <DsaCertFace name={c.name} code={c.code} issuedAt={c.issuedAt} />
          <section aria-label="What was completed" className="flex flex-col gap-4">
            <dl className="m-0 grid grid-cols-2 gap-px border border-line bg-line">
              {[
                ["Concept lessons", ev.lessons],
                ["Practice problems", ev.problems],
                ["Checkpoints", ev.checkpoints],
                ["Building reviews", ev.reviews],
              ].map(([k, v]) => (
                <div key={String(k)} className="flex flex-col gap-1 bg-surface p-4">
                  <dt className="font-mono text-[11px] uppercase tracking-label text-fg-3">{k}</dt>
                  <dd className="m-0 font-display text-[26px] font-extrabold leading-none text-fg">{typeof v === "number" ? v : "–"}</dd>
                </div>
              ))}
            </dl>
            {ev.solvedByLevel ? (
              <p className="m-0 text-[14px] text-fg-2">
                Problems solved: {ev.solvedByLevel.easy} Easy, {ev.solvedByLevel.medium} Medium, {ev.solvedByLevel.hard} Hard{langs.length ? `, in ${langs.join(" and ")}` : ""}.
              </p>
            ) : null}
            <p className="m-0 text-[14px] leading-relaxed text-fg-2">
              Foundations is the Kestrel Academy world: {facts.length ? facts.join(", ") : "every concept, problem and checkpoint"}, and the timed Launch week final, all recorded on the learner&apos;s account and checked when the certificate was issued.
            </p>
            <Link href="/dsa" className="inline-flex min-h-11 items-center self-start border border-line-strong px-4 font-mono text-[13px] text-fg hover:border-signal">
              Start DSA Mastery →
            </Link>
            <details className="text-[13px] text-fg-3">
              <summary className="cursor-pointer font-mono text-[12px]">About this certificate</summary>
              <p className="m-0 mt-2 leading-relaxed">
                The record is signed when issued{c.signature === "ok" ? " and the signature checks out" : ""}. {DISCLAIMER}
              </p>
            </details>
          </section>
        </div>
      </main>
    </div>
  );
}
