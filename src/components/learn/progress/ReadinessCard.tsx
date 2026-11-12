"use client";

/**
 * The interview-readiness estimate (AI audit O12, 12 Nov 2026) on the progress page (/dashboard: system design, LLD and,
 * once the learner has started it or it is live, DSA) and on the LLD home (the LLD track). A band, never a percentage,
 * with every input beside it and what would raise it (links the server chose); deterministic code
 * (lib/learner/readiness-model.ts). On demand, a one-paragraph AI reading (Haiku 5.5, FEATURES "readiness-reading",
 * cached a day per track) that may link only to those same links. Signed-in learners only; guests see nothing.
 */
import Link from "next/link";
import { Fragment, useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { userFetch } from "@/components/learn/progress/userFetch";
import { useAiStatus } from "@/components/learn/ai/useAiStatus";
import { track as trackEvent } from "@/lib/track";
import { DSA_FULL } from "@/lib/dsa/flags";
import { BANDS, TRACK_LABEL, type Link as LeverLink, type Readiness, type Track } from "@/lib/learner/readiness-model";

type Reading = { text: string; links: LeverLink[]; day: string };
type Data = { tracks: Readiness[]; readings: Partial<Record<Track, Reading>> };

/** The reading's text with its [L1] markers as links. */
function ReadingText({ r }: { r: Reading }) {
  const parts = r.text.split(/(\[L\d+\])/g);
  return (
    <p className="m-0 text-[15px] leading-relaxed text-fg-2">
      {parts.map((p, i) => {
        const m = p.match(/^\[L(\d+)\]$/);
        const l = m ? r.links[Number(m[1]) - 1] : null;
        if (m && !l) return null;
        return l ? (
          <Link key={i} href={l.href} aria-label={`Open ${l.label}`} title={l.label} className="whitespace-nowrap font-mono text-[12.5px] text-signal-text underline decoration-line-strong underline-offset-2 hover:text-fg">
            open ›
          </Link>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        );
      })}
    </p>
  );
}

export default function ReadinessCard({ tracks, id = "readiness" }: { tracks: Track[]; id?: string }) {
  const { user, loading } = useAuth();
  const ai = useAiStatus();
  const [data, setData] = useState<Data | null>(null);
  const [failed, setFailed] = useState(false);
  const [tab, setTab] = useState<Track>(tracks[0]);
  const [asking, setAsking] = useState(false);
  const [askErr, setAskErr] = useState("");
  const key = tracks.join(",");

  useEffect(() => {
    if (!user) return;
    let off = false;
    userFetch(`/api/learn/readiness?tracks=${key}`)
      .then(async (r) => {
        if (!r.ok) throw new Error();
        const d = (await r.json()) as Data;
        if (!off) setData(d);
      })
      .catch(() => !off && setFailed(true));
    return () => {
      off = true;
    };
  }, [user, key]);

  if (loading || !user || failed) return null;
  // DSA shows once it is live, or for a learner who has already started it
  const shown = (data?.tracks ?? []).filter((t) => t.track !== "dsa" || DSA_FULL || t.band !== "not-started");
  const r = shown.find((t) => t.track === tab) ?? shown[0];
  const reading = r ? data?.readings[r.track] : undefined;
  const aiOn = !!ai?.signedIn && !!ai.features["readiness-reading"];

  const ask = async () => {
    if (!r) return;
    setAsking(true);
    setAskErr("");
    const res = await userFetch("/api/learn/readiness", { method: "POST", body: JSON.stringify({ track: r.track }) }).catch(() => null);
    const b = (await res?.json().catch(() => null)) as { reading?: Reading; error?: string } | null;
    setAsking(false);
    if (res?.ok && b?.reading) {
      trackEvent("readiness_reading", { track: r.track, band: r.band });
      setData((d) => (d ? { ...d, readings: { ...d.readings, [r.track]: b.reading! } } : d));
    } else setAskErr(b?.error || "The reading didn't come through. Try again in a moment.");
  };

  return (
    <section id={id} aria-labelledby={`${id}-h`} className="flex scroll-mt-28 flex-col gap-4 border border-line-strong bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex items-baseline gap-2.5">
          <h2 id={`${id}-h`} className="m-0 font-display text-[22px] font-bold tracking-[-0.02em] text-fg">
            Interview readiness
          </h2>
          <span className="border border-line-strong px-1.5 py-px font-mono text-[10.5px] uppercase tracking-label text-fg-3">estimate</span>
        </div>
        {shown.length > 1 && (
          <div role="tablist" aria-label="Track" className="flex flex-wrap gap-1">
            {shown.map((t) => (
              <button
                key={t.track}
                role="tab"
                type="button"
                aria-selected={t.track === r?.track}
                onClick={() => setTab(t.track)}
                className={`min-h-9 px-3 font-mono text-[12px] ${t.track === r?.track ? "bg-fg text-bg" : "border border-line-strong text-fg-2 hover:text-fg"}`}
              >
                {TRACK_LABEL[t.track]}
              </button>
            ))}
          </div>
        )}
      </div>

      {!data ? (
        <div aria-busy="true" className="h-[140px] animate-pulse bg-bg" />
      ) : !r ? null : (
        <div role={shown.length > 1 ? "tabpanel" : undefined} className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-8">
          <div className="flex min-w-0 flex-col gap-3">
            {shown.length === 1 && <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">{TRACK_LABEL[r.track]}</span>}
            <p className="m-0 font-display text-[clamp(26px,4vw,34px)] font-extrabold leading-[1.05] tracking-[-0.03em] text-fg">{r.bandLabel}</p>
            <div className="flex gap-1" role="img" aria-label={`Step ${r.step} of ${BANDS.length - 1}: ${r.bandLabel}`}>
              {BANDS.slice(1).map((b, i) => (
                <span key={b.id} className={`h-2 flex-1 ${i < r.step ? "bg-signal" : "bg-line"}`} title={b.label} />
              ))}
            </div>
            <div className="flex justify-between font-mono text-[10.5px] text-fg-4">
              <span>early days</span>
              <span>interview-ready</span>
            </div>
            {r.capped && <p className="m-0 text-[13px] text-fg-3">Held at this band: {r.capped}</p>}
            {r.levers.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">what would raise it</span>
                <ul className="m-0 flex list-none flex-col gap-1 p-0">
                  {r.levers.map((l) => (
                    <li key={l.id} className="text-[14px] text-fg-2">
                      {l.link ? (
                        <Link href={l.link.href} className="text-fg underline decoration-line-strong underline-offset-2 hover:decoration-fg">
                          {l.link.label}
                        </Link>
                      ) : (
                        <span className="text-fg">{l.label}</span>
                      )}
                      <span className="text-fg-3"> · {l.why}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="flex min-w-0 flex-col gap-3">
            <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">from your records · {r.evidence.have} of {r.evidence.of} inputs have data</span>
            <dl className="m-0 grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-[14px]">
              {r.inputs.map((i) => (
                <Fragment key={i.id}>
                  <dt className="text-fg-3">{i.label}</dt>
                  <dd className={`m-0 ${i.none ? "text-fg-4" : "text-fg-2"}`}>{i.value}</dd>
                </Fragment>
              ))}
            </dl>
            {reading ? (
              <div className="flex flex-col gap-1.5 border-l-2 border-signal pl-3">
                <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">ai reading · {reading.day === new Date().toISOString().slice(0, 10) ? "today" : reading.day}</span>
                <ReadingText r={reading} />
              </div>
            ) : aiOn && r.band !== "not-started" ? (
              <div className="flex flex-wrap items-center gap-3">
                <button type="button" disabled={asking} onClick={ask} className="inline-flex min-h-10 items-center gap-2 border border-line-strong px-3.5 font-mono text-[12.5px] text-fg hover:border-fg disabled:opacity-60">
                  <Sparkles className="h-3.5 w-3.5 text-signal-text" aria-hidden />
                  {asking ? "Reading…" : "Read my estimate"}
                </button>
                {askErr && (
                  <span role="status" className="text-[13px] text-fg-3">
                    {askErr}
                  </span>
                )}
              </div>
            ) : null}
          </div>
        </div>
      )}

      <details className="group text-[11.5px] leading-snug text-fg-4">
        <summary className="cursor-pointer list-none py-1 font-mono text-[11px] hover:text-fg-3 [&::-webkit-details-marker]:hidden [@media(pointer:coarse)]:py-3">
          an estimate from your own records, not a prediction · <span className="underline decoration-line-strong underline-offset-2 group-open:text-fg-3">how it&apos;s worked out</span>
        </summary>
        <p className="m-0 mt-1.5 max-w-[75ch]">
          Plain arithmetic, no AI in the band: coverage of lessons and case studies, trial and quick-check pass rates, mock levels (the latest round counts most), labs passed and, for DSA, patterns and problems
          solved. The top bands need interview evidence (a mock at SDE level or better; for DSA, 50+ solves across half the patterns). The optional reading is written by Anthropic&apos;s Claude from these
          numbers only, once a day per track.
        </p>
      </details>
    </section>
  );
}
