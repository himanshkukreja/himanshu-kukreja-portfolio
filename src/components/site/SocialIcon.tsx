/**
 * Monochrome brand glyphs for the socials rows (hero + footer). Inline SVG in currentColor, so
 * they follow the link colour (and its hover) in light and dark. Brand marks are the official
 * shapes (Simple Icons, CC0); email / markdrop / resume are drawn on the same 24px grid with
 * square, 1.75px strokes to match the Level Up line work.
 */
import type { SocialIconName } from "@/lib/socials";

const FILLED: Partial<Record<SocialIconName, string>> = {
  github:
    "M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12",
  linkedin:
    "M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 1 1 0-4.125 2.062 2.062 0 0 1 0 4.125zM7.119 20.452H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z",
  x: "M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z",
};

function Stroked({ name }: { name: SocialIconName }) {
  switch (name) {
    case "instagram":
      return (
        <>
          <rect x="3" y="3" width="18" height="18" rx="5" />
          <circle cx="12" cy="12" r="4.2" />
          <circle cx="17.4" cy="6.6" r="1.1" fill="currentColor" stroke="none" />
        </>
      );
    case "email":
      return (
        <>
          <rect x="2.75" y="5" width="18.5" height="14" />
          <path d="m3 6 9 7 9-7" />
        </>
      );
    case "markdrop":
      // the Markdown mark: "M" + down arrow in a frame
      return (
        <>
          <rect x="1.75" y="5" width="20.5" height="14" />
          <path d="M5.5 15.5v-7l3 3.25 3-3.25v7" />
          <path d="M17 8.5v7M14.5 13l2.5 2.5 2.5-2.5" />
        </>
      );
    case "resume":
      return (
        <>
          <path d="M5 2.75h9.5L19 7.25V21.25H5Z" />
          <path d="M14.25 2.75v4.75H19M8.5 12h7M8.5 15.5h7M8.5 9h3" />
        </>
      );
    default:
      return null;
  }
}

export default function SocialIcon({ name, className = "h-4 w-4" }: { name: SocialIconName; className?: string }) {
  const d = FILLED[name];
  if (d) {
    return (
      <svg aria-hidden viewBox="0 0 24 24" fill="currentColor" className={`shrink-0 ${className}`}>
        <path d={d} />
      </svg>
    );
  }
  return (
    <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="square" strokeLinejoin="miter" className={`shrink-0 ${className}`}>
      <Stroked name={name} />
    </svg>
  );
}
