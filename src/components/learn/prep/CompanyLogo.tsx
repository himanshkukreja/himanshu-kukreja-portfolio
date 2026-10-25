/**
 * A company's mark on a square tile, in the theme's ink (never brand colours), from Simple Icons via
 * scripts/build-company-logos.mjs; companies without one get their initials. Decorative: the name is
 * always written next to it. Marks are their owners' trademarks, shown only to identify the company.
 */
import LOGOS from "@/lib/learn/prep/logos.json";

const MARKS = LOGOS as Record<string, { body: string; viewBox: string }>;

function initials(name: string) {
  const words = name.replace(/[^A-Za-z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words.slice(0, 2).map((w) => w[0]) : [words[0]?.[0] ?? "?"]).join("").toUpperCase();
}

export default function CompanyLogo({ slug, name, size = 40 }: { slug: string; name: string; size?: number }) {
  const mark = MARKS[slug];
  return (
    <span
      aria-hidden
      className="inline-grid shrink-0 place-items-center border border-line-strong bg-surface-2 text-fg"
      style={{ width: size, height: size }}
    >
      {mark ? (
        <svg viewBox={mark.viewBox} width={Math.round(size * 0.55)} height={Math.round(size * 0.55)} dangerouslySetInnerHTML={{ __html: mark.body }} />
      ) : (
        <span className="font-display font-extrabold leading-none tracking-[-0.03em]" style={{ fontSize: Math.round(size * (initials(name).length > 1 ? 0.36 : 0.46)) }}>
          {initials(name)}
        </span>
      )}
    </span>
  );
}

export const LOGO_NOTE = "Company names and logos are trademarks of their owners, shown only to identify each company. This course isn't affiliated with or endorsed by any of them.";
