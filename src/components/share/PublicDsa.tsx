/**
 * The DSA Mastery section of a public profile (/u/<handle>), in DSA's teal: problems solved by level (rings against the
 * released bank), languages, concept lessons, the Academy campus and the building the learner is in, the DSA daily
 * streak and the certificate. Only recorded data (src/lib/dsa/profile.ts); hidden when the learner turns it off.
 */
import Link from "next/link";
import type { ReactNode } from "react";
import { withRef, type DsaProfile } from "@/lib/share/model";
import { DsaMark } from "@/components/dsa/DsaMark";

const LABEL = "font-mono text-[11px] uppercase tracking-label text-fg-3";

function Ring({ value, of, label }: { value: number; of: number; label: string }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const pct = of ? Math.min(1, value / of) : 0;
  return (
    <div className="flex items-center gap-3">
      <svg width="64" height="64" viewBox="0 0 64 64" aria-hidden className="shrink-0 -rotate-90">
        <circle cx="32" cy="32" r={r} fill="none" stroke="var(--c-surface-2)" strokeWidth="7" />
        <circle cx="32" cy="32" r={r} fill="none" stroke="var(--c-signal)" strokeWidth="7" strokeDasharray={`${pct * c} ${c}`} />
      </svg>
      <span className="flex flex-col gap-0.5">
        <span className="font-display text-[26px] font-extrabold leading-none tracking-[-0.03em] text-fg">
          {value}
          <span className="ml-0.5 font-mono text-[12px] font-normal tracking-normal text-fg-3">/{of}</span>
        </span>
        <span className={LABEL}>{label}</span>
      </span>
    </div>
  );
}

function Cell({ label, children, sub }: { label: string; children: ReactNode; sub?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 bg-bg p-4 sm:p-5">
      <span className={LABEL}>{label}</span>
      <span className="font-display text-[28px] font-extrabold leading-none tracking-[-0.04em] text-fg sm:text-[32px]">{children}</span>
      {sub && <span className="text-[12px] leading-snug text-fg-3">{sub}</span>}
    </div>
  );
}

export default function PublicDsa({ d, handle, who, n }: { d: DsaProfile; handle: string; who: string; n: string }) {
  return (
    <section aria-labelledby="dsa-h" className="dsa-theme flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-col gap-1.5">
          <span className={LABEL}>
            <span className="text-signal-text">{n}</span> · dsa mastery
          </span>
          <h2 id="dsa-h" className="flex items-center gap-3 font-display text-[28px] font-extrabold leading-none tracking-[-0.035em] text-fg sm:text-[36px]">
            <DsaMark className="h-8 w-8 sm:h-9 sm:w-9" />
            Problems &amp; patterns
          </h2>
        </div>
        <span className="font-mono text-[12px] text-fg-3">
          {d.solved.total} solved{d.languages.length ? ` · ${d.languages.join(", ")}` : ""}
        </span>
      </div>

      <div className="grid gap-px border border-line bg-line lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-4 bg-bg p-4 sm:p-5">
          <span className={LABEL}>problems solved</span>
          <div className="flex flex-wrap gap-x-8 gap-y-4">
            <Ring value={d.solved.easy} of={d.bank.easy} label="easy" />
            <Ring value={d.solved.medium} of={d.bank.medium} label="medium" />
            <Ring value={d.solved.hard} of={d.bank.hard} label="hard" />
          </div>
          {d.languages.length ? (
            <ul aria-label="Languages" className="m-0 flex list-none flex-wrap gap-1.5 p-0">
              {d.languages.map((l) => (
                <li key={l} className="border border-signal px-2 py-0.5 font-mono text-[12px] text-signal-text">
                  {l}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <div className="grid grid-cols-2 gap-px bg-line">
          <Cell label="concepts" sub="lessons completed">
            {d.concepts.done}
            <span className="ml-0.5 font-mono text-[13px] font-normal tracking-normal text-fg-3">/{d.concepts.total}</span>
          </Cell>
          <Cell label="daily streak" sub={`best ${d.daily.best} · ${d.daily.days} daily problem${d.daily.days === 1 ? "" : "s"}`}>
            {d.daily.current}
            <span className="ml-0.5 font-mono text-[13px] font-normal tracking-normal text-fg-3">{d.daily.current === 1 ? "day" : "days"}</span>
          </Cell>
          <div className="col-span-2 flex flex-col gap-2 bg-bg p-4 sm:p-5">
            <span className={LABEL}>world · {d.world.title}</span>
            <span className="text-[15px] text-fg">{d.world.building ? `In ${d.world.building}` : d.world.done && d.world.done === d.world.total ? "Every stop done" : "Starting out"}</span>
            <div aria-hidden className="h-2 bg-surface-2">
              <div className="h-2 bg-signal" style={{ width: `${d.world.pct}%` }} />
            </div>
            <span className="font-mono text-[11px] text-fg-3">
              {d.world.done} of {d.world.total} Academy steps · {d.world.pct}%
            </span>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {d.certificate ? (
          <Link href={`/dsa/cert/${d.certificate.code}`} className="flex min-h-[52px] items-center justify-between gap-3 border border-signal bg-surface px-5 hover:bg-surface-2">
            <span className="text-[15px] font-semibold text-fg">Certificate · DSA Mastery Foundations</span>
            <span aria-hidden className="font-mono text-signal-text">
              verify →
            </span>
          </Link>
        ) : null}
        <Link href={withRef("/dsa/daily", handle)} className="flex min-h-[52px] items-center justify-between gap-3 border border-line-strong px-5 hover:bg-surface-2">
          <span className="text-[15px] text-fg">Can you keep up with {who}? Today&apos;s DSA problem</span>
          <span aria-hidden className="font-mono text-signal-text">
            →
          </span>
        </Link>
      </div>
    </section>
  );
}
