import Link from "next/link";
import { Smartphone } from "lucide-react";

export type ArticleShort = { id: string; title: string; poster: string; seconds: number };

/**
 * End of a lesson / side quest / problem: its vertical shorts, as poster cards. Each opens the shorts feed
 * with only this article's shorts (?of=<lecture id>), starting at the one picked.
 */
export default function ArticleShorts({ of, shorts }: { of: string; shorts: ArticleShort[] }) {
  if (!shorts.length) return null;
  const href = (id?: string) => `/learn/shorts?of=${encodeURIComponent(of)}${id ? `&v=${encodeURIComponent(id)}` : ""}`;
  return (
    <section aria-labelledby="article-shorts-h" className="mt-10 flex flex-col gap-3 border-t border-line pt-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="article-shorts-h" className="m-0 flex items-center gap-2 font-mono text-xs uppercase tracking-label text-signal-text">
          <Smartphone className="h-3.5 w-3.5" aria-hidden /> this lesson in shorts · {shorts.length}
        </h2>
        <Link href={href()} className="font-mono text-xs text-fg-3 underline decoration-line-strong underline-offset-4 hover:text-fg">
          play them all →
        </Link>
      </div>
      <p className="m-0 text-[14px] text-fg-3">One idea from this article in about a minute each, made for your phone.</p>
      <ul className="m-0 flex list-none gap-3 overflow-x-auto p-0 pb-1 [scrollbar-width:thin]">
        {shorts.map((s) => (
          <li key={s.id} className="w-[132px] shrink-0 sm:w-[150px]">
            <Link href={href(s.id)} className="group flex flex-col gap-1.5">
              <span className="relative block aspect-[9/16] overflow-hidden border border-line-strong bg-[#0b0b0c] group-hover:border-signal">
                {/* eslint-disable-next-line @next/next/no-img-element -- the short's own poster frame on the media host */}
                <img src={s.poster} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                <span className="absolute bottom-1 right-1 bg-black/75 px-1 font-mono text-[10px] text-[#f3f2ee]">
                  {Math.floor(s.seconds / 60)}:{String(s.seconds % 60).padStart(2, "0")}
                </span>
              </span>
              <span className="line-clamp-2 text-[13px] leading-snug text-fg-2 group-hover:text-fg">{s.title}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
