import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CERT_TITLE, DISCLAIMER, ISSUER, LEVEL_TEXT, SIGNER, VERDICT_TEXT, certPath, fmtCertDate, normalizeCode, worldsPhrase, type CertificateView } from "@/lib/certificates/core";
import { publicCertificate, type PublicCert } from "@/lib/certificates/service";
import { CertificateArt } from "@/components/certificates/CertificateArt";
import { PdfLink, ViewBeacon } from "@/components/certificates/CertClient";
import "@/components/certificates/certificate.css";

export const runtime = "nodejs";
// Rendered once and served from the cache (on-demand ISR); issuing, revoking, restoring or hiding a
// certificate calls revalidatePath("/cert/<code>", "layout"), so its status changes show at once.
export const revalidate = 3600;
export const dynamicParams = true;
/** None at build: each certificate renders on its first visit, then is cached. */
export function generateStaticParams() {
  return [];
}

type Props = { params: Promise<{ code: string }> };

/** Unknown, private and malformed codes are the same 404 (the middleware already answered it). */
/**
 * Unknown, private and malformed codes are the same 404 (the middleware already answered it). A
 * database error throws, so ISR never caches it (error.tsx says "couldn't check right now").
 */
async function load(raw: string): Promise<PublicCert | null> {
  const code = normalizeCode(raw);
  if (!code) return null;
  return publicCertificate(code);
}

const what = (v: CertificateView) => (v.kind === "course" ? CERT_TITLE : `World ${v.world?.code ?? ""} · ${v.world?.title ?? ""}`);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  // a database error falls back to plain metadata; the page then throws into error.tsx (never cached)
  const c = await load((await params).code).catch(() => "error" as const);
  if (c === "error") return { title: `Certificate · ${ISSUER}`, robots: { index: false, follow: false } };
  if (!c) notFound();
  const v = c.view;
  const title = `${v.name} · ${what(v)} · ${ISSUER}`;
  const description =
    v.status === "revoked"
      ? `Certificate ${v.code} was revoked.`
      : `Verify ${v.name}'s ${ISSUER} ${v.kind === "course" ? "certificate of completion" : `World ${v.world?.code} certificate`}: ID ${v.code}, issued ${fmtCertDate(v.issuedAt)}.`;
  return {
    title,
    description,
    alternates: { canonical: certPath(v.code) },
    robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
    openGraph: { title, description, url: certPath(v.code), type: "website" },
    twitter: { card: "summary_large_image", title, description },
  };
}

function StatusBadge({ c }: { c: PublicCert }) {
  const { view: v, signature } = c;
  if (v.status === "revoked")
    return (
      <span className="inline-flex min-h-11 items-center gap-2.5 border border-bad bg-bad/10 px-3.5 font-mono text-[14px] uppercase tracking-label text-bad-text">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden>
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
        Revoked certificate
      </span>
    );
  if (signature === "bad")
    return (
      <span className="inline-flex min-h-11 items-center gap-2.5 border border-bad bg-bad/10 px-3.5 font-mono text-[14px] uppercase tracking-label text-bad-text">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden>
          <path d="M12 7v6M12 16.5v.5" />
        </svg>
        Can&apos;t be verified
      </span>
    );
  return (
    <span className="inline-flex min-h-11 items-center gap-2.5 border border-ok/70 bg-ok/10 px-3.5 font-mono text-[14px] uppercase tracking-label text-ok">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden>
        <path d="M5 12.5l4.5 4.5L19 7" />
      </svg>
      Valid certificate
    </span>
  );
}

function Stat({ value, label, accent = false }: { value: string; label: string; accent?: boolean }) {
  return (
    <div className="flex flex-col gap-1.5 bg-surface p-5">
      <span className={`font-mono text-[28px] font-semibold leading-none sm:text-[32px] ${accent ? "text-signal-text" : "text-fg"}`}>{value}</span>
      <span className="text-[15px] leading-snug text-fg-3">{label}</span>
    </div>
  );
}

export default async function CertificatePage({ params }: Props) {
  const c = await load((await params).code);
  if (!c) notFound();
  const v = c.view;
  const s = v.stats;
  const revoked = v.status === "revoked";
  const bad = !revoked && c.signature === "bad";
  const first = v.name.split(/\s+/)[0];
  const worldsTotal = (v.kind === "course" ? s?.worlds.total : v.world?.of) ?? 11;
  const mock = s?.mock ? `${VERDICT_TEXT[s.mock.verdict] || s.mock.verdict}` : null;

  const stats: { value: string; label: string; accent?: boolean }[] = !s
    ? []
    : v.kind === "course"
      ? [
          { value: `${s.worlds.cleared}/${s.worlds.total}`, label: `worlds cleared, ${s.lessons.done} core lessons read` },
          { value: `${s.trialParts.passed}/${s.trialParts.total}`, label: "trial parts passed at 80% or more" },
          { value: `${s.bosses.beaten}/${s.bosses.total}`, label: "interview bosses beaten" },
          { value: mock ? mock.toUpperCase() : "—", label: s.mock ? `mock interview, ${LEVEL_TEXT[s.mock.level] || s.mock.level} level` : "mock interview", accent: true },
        ]
      : [
          { value: `W${v.world?.code ?? ""}`, label: v.world?.title ?? "world", accent: true },
          { value: `${s.lessons.done}/${s.lessons.total}`, label: "lessons of the world read" },
          { value: `${s.trialParts.passed}/${s.trialParts.total}`, label: "trial parts passed at 80% or more" },
          { value: s.bosses.total ? (s.bosses.beaten ? "BEATEN" : "—") : "N/A", label: s.bosses.total ? "the world's interview boss" : "no boss in this world" },
        ];

  const how =
    v.kind === "course"
      ? [
          "Every core lesson completed, tracked by real reading time",
          "Every trial part passed at 80%+ (options shuffled, answers re-checked on the server)",
          `All ${s?.bosses.total ?? 10} interview bosses beaten in timed boss mode`,
          "A timed mock interview, self-scored against a levelled rubric, at Hire or better",
        ]
      : [
          "Every lesson of the world completed, tracked by real reading time",
          "Every trial part of the world passed at 80%+ (answers re-checked on the server)",
          ...(s?.bosses.total ? ["The world's interview boss beaten in timed boss mode"] : []),
        ];

  return (
    <main className="mx-auto flex max-w-[1240px] flex-col gap-10 px-4 pb-24 pt-8 sm:px-6 sm:pt-12">
      <ViewBeacon code={v.code} kind={v.kind} status={revoked ? "revoked" : bad ? "unverified" : "valid"} />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <StatusBadge c={c} />
        <span className="font-mono text-[13px] text-fg-3 sm:text-[14px]">
          ID {v.code} · {revoked ? `revoked ${v.revokedAt ? fmtCertDate(v.revokedAt) : ""}` : bad ? "record failed its integrity check" : c.signature === "ok" ? "signature checked" : "signature not checked here"} · issued {fmtCertDate(v.issuedAt)}
        </span>
      </div>

      {(revoked || bad) && (
        <div role="alert" className="border border-bad/60 bg-surface p-4 text-[15px] leading-relaxed text-fg-2 sm:p-5">
          {revoked ? (
            <>
              <strong className="text-fg">This certificate was revoked{v.revokedAt ? ` on ${fmtCertDate(v.revokedAt)}` : ""}</strong> and no longer certifies completion. The record is kept so links to it keep explaining what happened.
            </>
          ) : (
            <>
              <strong className="text-fg">This record didn&apos;t pass its integrity check.</strong> It may have been changed after it was issued, so it can&apos;t be relied on. Contact the issuer through{" "}
              <Link href="/" className="font-semibold text-signal-text underline underline-offset-4">
                himanshukukreja.in
              </Link>
              .
            </>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-start gap-10">
        <section aria-labelledby="cert-h" className="flex min-w-0 flex-[999_1_560px] flex-col gap-6">
          <span className="font-mono text-[13px] uppercase tracking-[0.16em] text-signal-text sm:text-[14px]">
            {ISSUER} · {what(v)}
          </span>
          <h1 id="cert-h" className={`m-0 break-words font-display text-[clamp(44px,7vw,88px)] font-extrabold leading-[0.95] tracking-[-0.04em] ${revoked ? "text-fg-3 line-through decoration-bad decoration-[3px]" : "text-fg"}`}>
            {v.name}
            {!/[.!?]$/.test(v.name) && <span className="text-signal">.</span>}
          </h1>
          <p className="m-0 max-w-[640px] text-[17px] leading-relaxed text-fg-2 sm:text-[19px]">
            {v.kind === "course" ? (
              <>
                Completed every world of {ISSUER}, {worldsPhrase(worldsTotal)} on designing systems at scale, and passed its trials, interview bosses and a timed mock interview.
              </>
            ) : (
              <>
                Completed World {v.world?.code} of {ISSUER}, <b className="text-fg">{v.world?.title}</b>: every lesson, every trial part{s?.bosses.total ? " and its interview boss" : ""}.
              </>
            )}
          </p>

          {stats.length > 0 && (
            <div className="grid max-w-[680px] grid-cols-2 gap-px border border-line bg-line">
              {stats.map((x) => (
                <Stat key={x.label} {...x} />
              ))}
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            {!revoked && !bad && (
              <PdfLink code={v.code} kind={v.kind} from="verify" className="inline-flex min-h-12 items-center gap-2 bg-signal px-5 text-[16px] font-semibold text-on-signal hover:brightness-110" />
            )}
            {c.profileHandle && (
              <Link href={`/u/${c.profileHandle}`} className="inline-flex min-h-12 items-center border border-line-strong px-5 text-[16px] text-fg hover:bg-surface-2">
                View {first}&apos;s public progress →
              </Link>
            )}
          </div>
        </section>

        <aside className="flex min-w-0 flex-[1_1_320px] flex-col gap-4">
          <div className="flex flex-col gap-3.5 border border-line bg-surface p-5 sm:p-6">
            <span className="font-mono text-[12px] uppercase tracking-[0.14em] text-fg-3">Issued by</span>
            <span className="font-display text-[28px] font-bold leading-none text-fg">{SIGNER}</span>
            <span className="text-[15px] leading-relaxed text-fg-2">
              Creator and instructor of {ISSUER}. Senior software engineer leading engineering at Senseloaf AI; previously founding engineer at NativeBridge and AutoFlow.
            </span>
            <Link href="/" className="self-start text-[15px] font-semibold text-signal-text underline underline-offset-4">
              himanshukukreja.in →
            </Link>
          </div>
          <div className="flex flex-col gap-3 border border-line p-5 sm:p-6">
            <span className="font-mono text-[12px] uppercase tracking-[0.14em] text-fg-3">How it was earned</span>
            <ul className="m-0 flex flex-col gap-2 pl-[18px] text-[15px] leading-snug text-fg-2 [list-style:square]">
              {how.map((h) => (
                <li key={h}>{h}</li>
              ))}
            </ul>
          </div>
          <p className="m-0 text-[13px] leading-relaxed text-fg-3">
            {DISCLAIMER} Certificates can be revoked if earned dishonestly; this page always shows the current status.
          </p>
        </aside>
      </div>

      <figure className="m-0 flex flex-col gap-3">
        <figcaption className="font-mono text-[12px] uppercase tracking-[0.14em] text-fg-3">The certificate</figcaption>
        <div className={`border border-line ${revoked ? "opacity-50 grayscale" : ""}`}>
          <CertificateArt cert={v} theme="dark" />
        </div>
      </figure>

      <div className="flex flex-col items-start gap-3 border-t border-line pt-8 sm:flex-row sm:items-center sm:justify-between">
        <p className="m-0 max-w-[560px] text-[15px] text-fg-2">
          {ISSUER} is {worldsPhrase(worldsTotal)} with trials, interview bosses and mock interviews. Certificates are earned, not given.
        </p>
        <Link href="/learn" className="inline-flex min-h-12 items-center gap-3 border border-line-strong px-5 font-mono text-[14px] text-fg hover:bg-surface-2">
          Start the course <span aria-hidden>→</span>
        </Link>
      </div>
    </main>
  );
}
