/**
 * One feature of the guide: its header, its video (or, until the video is published, a real
 * screenshot), "How to use it" in numbered steps beside it on wide screens (below it on phones),
 * Tips, "Where the AI helps", "Try it now", then the in-depth reference for that feature.
 */
import Link from "next/link";
import type { ReactNode } from "react";
import { Sparkles } from "lucide-react";
import { guideVideo, type GuideVideoId } from "@/lib/learn/guide/videos";
import InlineVideo from "./videos/InlineVideo";
import Shot from "./Shot";
import AiFreeNote from "@/components/learn/ai/AiFreeNote";
import { LABEL } from "./ui";

export type Feature = {
  /** the section's anchor: /guide#<id> */
  id: string;
  /** older anchors that should still land here */
  aliases?: string[];
  video: GuideVideoId;
  n: string;
  /** TOC label */
  short: string;
  title: string;
  /** one line under the title (also the features index) */
  line: string;
  /** shown in place of the video until it's published */
  shot?: string;
  steps: ReactNode[];
  tips: ReactNode[];
  ai?: ReactNode;
  try: { href: string; label: string };
  details?: ReactNode;
};

const SCROLL = "scroll-mt-[calc(var(--hk-header-h,61px)+64px)] lg:scroll-mt-[calc(var(--hk-header-h,61px)+24px)]";

export default function FeatureSection({ f }: { f: Feature }) {
  const video = guideVideo(f.video);
  // the video stays in view beside a long list of steps on wide screens
  const media = video ? (
    <div className="min-w-0 xl:sticky xl:top-[calc(var(--hk-header-h,61px)+24px)]">
      <InlineVideo id={f.video} />
    </div>
  ) : f.shot ? (
    <Shot id={f.shot} />
  ) : null;
  const h = `${f.id}-h`;

  return (
    <section id={f.id} aria-labelledby={h} className={`flex flex-col gap-8 border-t border-line pt-10 ${SCROLL}`}>
      <header className="relative flex flex-col gap-3">
        {f.aliases?.map((a) => (
          <span key={a} id={a} aria-hidden className={`absolute left-0 top-0 h-px w-px ${SCROLL}`} />
        ))}
        <span className={LABEL}>
          <span className="text-signal-text">{f.n}</span> · feature {Number(f.n)} of 12
        </span>
        <h2 id={h} className="m-0 font-display text-[34px] font-extrabold leading-[0.98] tracking-[-0.035em] text-fg sm:text-[48px]">
          {f.title}
          <span className="text-signal-text">.</span>
        </h2>
        <p className="m-0 max-w-[60ch] text-[17px] leading-relaxed text-fg-2 sm:text-[19px]">{f.line}</p>
      </header>

      <div className={media ? "grid grid-cols-[minmax(0,1fr)] items-start gap-8 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] xl:gap-10" : ""}>
        {media}
        <div className="flex min-w-0 flex-col gap-4">
          <h3 className="m-0 font-mono text-[12px] font-semibold uppercase tracking-label text-fg">How to use it</h3>
          <ol className="m-0 flex max-w-[66ch] list-none flex-col border-t border-line p-0">
            {f.steps.map((s, i) => (
              <li key={i} className="flex gap-3.5 border-b border-line py-3 text-[15px] leading-relaxed text-fg-2 [&_strong]:font-semibold [&_strong]:text-fg">
                <span aria-hidden className="w-6 shrink-0 pt-px font-mono text-[13px] font-semibold text-signal-text">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="min-w-0">{s}</span>
              </li>
            ))}
          </ol>
          <Link
            href={f.try.href}
            className="inline-flex min-h-12 items-center gap-2 self-start bg-signal px-5 text-[15px] font-semibold text-on-signal hover:brightness-110"
          >
            Try it now: {f.try.label} <span aria-hidden>→</span>
          </Link>
        </div>
      </div>

      <div className={`grid grid-cols-[minmax(0,1fr)] gap-4 ${f.ai ? "md:grid-cols-2" : ""}`}>
        <div className="flex flex-col gap-3 border border-line-strong bg-surface p-4 sm:p-5">
          <h3 className={`m-0 ${LABEL} text-fg`}>Tips</h3>
          <ul className={`m-0 grid list-none gap-2.5 p-0 ${f.ai ? "" : "lg:grid-cols-2 lg:gap-x-8"}`}>
            {f.tips.map((t, i) => (
              <li key={i} className="flex gap-2.5 text-[14.5px] leading-relaxed text-fg-2 [&_strong]:font-semibold [&_strong]:text-fg">
                <span aria-hidden className="mt-[9px] h-1.5 w-1.5 shrink-0 bg-signal" />
                <span className="min-w-0">{t}</span>
              </li>
            ))}
          </ul>
        </div>
        {f.ai && (
          <div className="flex flex-col gap-3 border border-signal bg-surface p-4 sm:p-5">
            <h3 className={`m-0 flex items-center gap-2 ${LABEL} text-signal-text`}>
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
              Where the AI helps
            </h3>
            <div className="text-[14.5px] leading-relaxed text-fg-2 [&_strong]:font-semibold [&_strong]:text-fg">{f.ai}</div>
            <AiFreeNote className="mt-auto pt-1" />
          </div>
        )}
      </div>

      {f.details && (
        <div className="flex flex-col gap-7">
          <div className="flex items-center gap-3" aria-hidden>
            <span className={LABEL}>{f.short} · in depth</span>
            <span className="h-px flex-1 bg-line" />
          </div>
          {f.details}
        </div>
      )}
    </section>
  );
}
