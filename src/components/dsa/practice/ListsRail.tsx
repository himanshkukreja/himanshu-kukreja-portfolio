"use client";

import { LISTS, GROUP_LABEL, type ListDef, type ListGroup, type ListId } from "@/lib/dsa/lists";
import type { MyList } from "@/lib/dsa/my-lists";

/**
 * Practice's lists: a left rail on desktop, a horizontal chip scroller on phones. Every list is a real link
 * (/dsa/practice?list=<id>), so it can be shared and opened in a new tab; a plain click switches in place.
 */

const ORDER: ListGroup[] = ["library", "curated", "soon", "mine"];

type Props = { active: ListId; counts: Partial<Record<ListId, number | null>>; hrefOf: (id: ListId) => string; onPick: (id: ListId) => void; /** the learner's own lists: "My lists" expands to them */ mine?: MyList[] };

function Count({ def, n }: { def: ListDef; n: number | null | undefined }) {
  if (!def.ready) return <span className="font-mono text-[11px] text-fg-3">soon</span>;
  return (
    <span className="font-mono text-[12px] tabular-nums text-fg-3" aria-label={n == null ? undefined : def.id === "my-lists" ? `${n} lists` : `${n} problems`}>
      {n == null ? "" : n}
    </span>
  );
}

export default function ListsRail({ active, counts, hrefOf, onPick, mine = [] }: Props) {
  const click = (id: ListId) => (e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    onPick(id);
  };
  return (
    <>
      {/* phone and tablet: one scrolling row of chips */}
      <nav aria-label="Problem lists" className="-mx-4 overflow-x-auto px-4 pb-1 [scrollbar-width:thin] lg:hidden">
        <ul className="m-0 flex w-max list-none gap-2 p-0">
          {LISTS.map((l) => {
            const on = l.id === active;
            return (
              <li key={l.id}>
                <a
                  href={hrefOf(l.id)}
                  onClick={click(l.id)}
                  aria-current={on ? "page" : undefined}
                  className={`inline-flex min-h-11 items-center gap-2 whitespace-nowrap border px-3 text-[14px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal-text rounded-[10px] ${on ? "border-signal bg-signal font-semibold text-on-signal" : "border-line-strong bg-surface text-fg"}`}
                >
                  {l.label}
                  {!l.ready ? <span className={`font-mono text-[11px] ${on ? "text-on-signal" : "text-fg-3"}`}>soon</span> : null}
                </a>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* desktop: grouped rail */}
      <nav aria-label="Problem lists" className="hidden lg:sticky lg:top-20 lg:block lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto">
        {ORDER.map((g) => {
          const items = LISTS.filter((l) => l.group === g);
          if (!items.length) return null;
          return (
            <div key={g} className="mb-4">
              <p className="m-0 mb-1 px-3 font-mono text-[11px] uppercase tracking-label text-fg-3">{GROUP_LABEL[g]}</p>
              <ul className="m-0 flex list-none flex-col p-0">
                {items.map((l) => {
                  const on = l.id === active;
                  return (
                    <li key={l.id}>
                      <a
                        href={hrefOf(l.id)}
                        onClick={click(l.id)}
                        aria-current={on ? "page" : undefined}
                        className={`flex min-h-10 items-center justify-between gap-2 border-l-[3px] px-3 text-[14px] hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-signal-text ${on ? "border-signal bg-surface-2 font-semibold text-fg" : "border-transparent text-fg-2"}`}
                      >
                        <span className="min-w-0 leading-snug">{l.label}</span>
                        <Count def={l} n={counts[l.id]} />
                      </a>
                      {l.id === "my-lists" && mine.length ? (
                        <ul aria-label="Your lists" className="m-0 mb-1 flex list-none flex-col p-0">
                          {mine.map((m) => (
                            <li key={m.id}>
                              <a href={`/dsa/lists/${m.id}`} className="flex min-h-9 items-center justify-between gap-2 border-l-[3px] border-transparent py-1 pl-6 pr-3 text-[13.5px] text-fg-2 hover:bg-surface-2 hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-signal-text">
                                <span className="min-w-0 truncate">{m.name}</span>
                                <span className="font-mono text-[11.5px] tabular-nums text-fg-3" aria-label={`${m.ids.length} problems`}>{m.ids.length}</span>
                              </a>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>
    </>
  );
}
