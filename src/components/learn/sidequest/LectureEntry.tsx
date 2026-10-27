import Link from "next/link";

/** "Watch it first": the lesson's, side quest's or case file's interactive lecture, at the top of the page. */
export default function LectureEntry({ lecture, quest = true, what, className = "mb-8" }: { lecture: { href: string; minutes: number; checkpoints: number; chapters: number }; quest?: boolean; what?: string; className?: string }) {
  return (
    <Link
      href={lecture.href}
      className={`group ${className} flex items-center gap-4 border border-line-strong bg-[#0b0b0c] p-4 transition-colors hover:border-signal sm:gap-5 sm:p-5`}
    >
      <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-signal text-on-signal shadow-[0_0_28px_rgba(255,107,43,0.45)] transition-transform group-hover:scale-105">
        <svg viewBox="0 0 24 24" className="h-6 w-6 translate-x-[2px]" fill="currentColor" aria-hidden>
          <path d="M7 4l13 8-13 8z" />
        </svg>
      </span>
      <span className="flex min-w-0 flex-col gap-1">
        <span className="font-mono text-[11px] uppercase tracking-label text-signal-text">watch it first · new</span>
        <span className="font-display text-[19px] font-extrabold leading-tight tracking-[-0.02em] text-[#f3f2ee] sm:text-[21px]">{what ?? (quest ? "The whole design" : "The whole lesson")} in a {lecture.minutes}-minute animated lecture</span>
        <span className="text-[13px] leading-snug text-[#a3a3a8]">
          {lecture.checkpoints ? `${lecture.checkpoints} quiz checkpoint${lecture.checkpoints === 1 ? "" : "s"} · ` : ""}ask the AI about any moment · captions, chapters and speed
        </span>
      </span>
    </Link>
  );
}
