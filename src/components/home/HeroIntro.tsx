import { Dot } from "./ui";

const SOCIALS = [
  { href: "https://github.com/himanshkukreja", label: "github", extra: "★ 99" },
  { href: "https://www.linkedin.com/in/himanshukukreja/", label: "linkedin" },
  { href: "https://x.com/hi_kukreja", label: "x.com" },
  { href: "https://markdrop.in", label: "markdrop.in" },
];

/** Left column of the hero: terminal intro, name, copy, CTAs and social links. */
export default function HeroIntro() {
  return (
    <div className="flex min-w-0 flex-[1_1_500px] flex-col gap-6 pt-0 lg:pt-3">
      <div className="border border-line bg-raised font-mono text-xs leading-[1.7] sm:text-sm sm:leading-[1.8]">
        <div className="hidden items-center gap-1.5 border-b border-line px-3 py-2 text-xs text-fg-3 sm:flex">
          <span aria-hidden className="h-2.5 w-2.5 border border-line-strong" />
          <span aria-hidden className="h-2.5 w-2.5 border border-line-strong" />
          <span aria-hidden className="h-2.5 w-2.5 border border-line-strong" />
          <span className="ml-2">zsh — himanshu@bengaluru</span>
        </div>
        <div className="px-3 py-2.5 text-fg-2 sm:px-4 sm:py-3.5">
          <div>
            <span className="text-signal-text">❯</span> whoami
          </div>
          <div className="text-fg">
            <span className="sm:hidden">senior swe · eng lead @ senseloaf.ai</span>
            <span className="hidden sm:inline">senior software engineer · full-stack, eng lead @ senseloaf.ai</span>
          </div>
          <div>
            <span className="text-signal-text">❯</span> cat now.md
          </div>
          <div className="text-fg sm:hidden">building SIA + MCP · markdrop at night</div>
          <div className="hidden animate-hk-type overflow-hidden whitespace-nowrap text-fg sm:block">
            building SIA + its MCP server · shipping markdrop at night
          </div>
          <div className="hidden sm:block">
            <span className="text-signal-text">❯</span>{" "}
            <span aria-hidden className="inline-block h-[15px] w-2 animate-hk-blink bg-fg align-[-2px]" />
          </div>
        </div>
      </div>

      <h1 className="m-0 font-display text-[clamp(60px,8.6vw,128px)] font-extrabold leading-[0.84] tracking-tightest text-fg">
        Himanshu
        <br />
        Kukreja
        <Dot />
      </h1>

      <p className="m-0 max-w-[580px] text-base leading-normal text-fg-2 [text-wrap:pretty] sm:text-xl">
        <span className="sm:hidden">I ship product end to end, from research and UI to backend and infra. Plus open source.</span>
        <span className="hidden sm:inline">
          I ship product end to end, from research and UI to backend and infra. Right now that&apos;s an agentic hiring
          platform. Before that, real phones streamed to browsers in under 100ms. On the side, I open-source the tools I
          wish existed. I also write case files and teach system design.
        </span>
      </p>

      <div className="flex flex-wrap gap-2.5">
        <a
          href="#rush"
          className="inline-flex min-h-[52px] animate-hk-pulse items-center gap-2.5 bg-signal px-[22px] text-base font-semibold text-on-signal no-underline hover:brightness-110"
        >
          Play Tatkal Rush
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
            <path d="M7 4l12 8-12 8z" />
          </svg>
        </a>
        <a
          href="/resume.pdf"
          target="_blank"
          rel="noopener"
          className="inline-flex min-h-[52px] items-center border border-line-strong px-5 font-mono text-[15px] text-fg no-underline hover:bg-surface-2"
        >
          cat resume.pdf
        </a>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {SOCIALS.map((s) => (
          <a
            key={s.label}
            href={s.href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center gap-2 border border-line px-3 font-mono text-[13px] text-fg-2 no-underline hover:border-line-strong hover:text-fg"
          >
            {s.label}
            {s.extra && <span className="text-signal-text">{s.extra}</span>}
          </a>
        ))}
      </div>
    </div>
  );
}
