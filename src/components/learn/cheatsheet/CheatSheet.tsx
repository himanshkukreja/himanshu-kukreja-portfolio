import type { DeckWeek } from "@/lib/learn/revision/load";
import type { RevCard, RevIdea, RevMistakes, RevNumbers, RevTradeoff } from "@/lib/learn/revision/parse";
import { inline } from "@/lib/learn/revision/parse";

/** Cards render with their own plain marks (no site tokens: the sheet is always paper). */
function T({ text }: { text: string }) {
  return (
    <>
      {inline(text).map((p, i) => (p.c ? <code key={i}>{p.t}</code> : p.b ? <strong key={i}>{p.t}</strong> : <span key={i}>{p.t}</span>))}
    </>
  );
}

const of = <K extends RevCard["kind"]>(cards: RevCard[], k: K) => cards.filter((c) => c.kind === k) as Extract<RevCard, { kind: K }>[];

/**
 * The printable sheet: every lesson of the world with its key ideas, numbers, trade-off table and
 * classic mistakes ("if the interviewer asks" cards stay in the deck: the sheet is for scanning).
 */
export default function CheatSheet({ id, week, url, site }: { id?: string; week: DeckWeek; url: string; site: string }) {
  return (
    <article id={id} className="cs-paper" aria-label={`World ${week.code} cheat sheet`}>
      <header className="cs-head">
        <div>
          <div className="cs-kicker">
            System Design Mastery · World {week.code} cheat sheet
          </div>
          <h1 className="cs-title">{week.title}</h1>
        </div>
        <div className="cs-brand">
          <span className="cs-mark" aria-label="~/himanshu">
            <span style={{ color: "var(--signal)" }}>~</span>/himanshu<i aria-hidden />
          </span>
          <span>free course · {site}/learn</span>
        </div>
      </header>
      <div className="cs-legend" aria-hidden data-drop="1">
        <span>{week.lessons.length} lessons</span>
        <span>key ideas</span>
        <span style={{ color: "var(--signal-ink)" }}>numbers to remember</span>
        <span>trade-offs</span>
        <span style={{ color: "var(--bad-ink)" }}>✕ classic mistakes</span>
      </div>
      <div className="cs-cols">
        {week.lessons.map((l) => {
          const ideas = of(l.cards, "idea") as RevIdea[];
          const nums = of(l.cards, "numbers") as RevNumbers[];
          const trades = of(l.cards, "tradeoff") as RevTradeoff[];
          const mistakes = of(l.cards, "mistakes") as RevMistakes[];
          return (
            <section key={l.slug} className="cs-lesson">
              <h2 className="cs-lesson-head">
                <b>{l.short}</b>
                <span>{l.title}</span>
              </h2>
              {ideas.map((c, i) => (
                <p key={c.id} className="cs-idea" data-drop={i >= 4 ? "2" : undefined}>
                  <strong>
                    <T text={c.title} />
                    {/[.?!:]$/.test(c.title) ? "" : "."}
                  </strong>{" "}
                  <T text={c.text} />
                </p>
              ))}
              {nums.map((c) => (
                <div key={c.id} className="cs-nums">
                  {c.items.map((n, i) => (
                    <div key={i} style={{ display: "contents" }}>
                      <span className="cs-num-v">
                        <T text={n.value} />
                      </span>
                      <span>
                        <T text={n.label} />
                      </span>
                    </div>
                  ))}
                </div>
              ))}
              {trades.map((c) => (
                <div key={c.id}>
                  <span className="cs-sub">
                    Trade-off · <span className="cs-trade-title">{<T text={c.title} />}</span>
                  </span>
                  <table className="cs-trade">
                    <thead>
                      <tr>
                        {c.head.map((h, i) => (
                          <th key={i} scope="col">
                            <T text={h} />
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {c.rows.map((r, i) => (
                        <tr key={i}>
                          {r.map((cell, k) =>
                            k === 0 ? (
                              <th key={k} scope="row">
                                <T text={cell} />
                              </th>
                            ) : (
                              <td key={k}>
                                <T text={cell} />
                              </td>
                            )
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
              {mistakes.map((c) => (
                <ul key={c.id} className="cs-mistakes" aria-label="Classic mistakes">
                  {c.items.map((m, i) => (
                    <li key={i} data-drop={i >= 2 ? "1" : undefined}>
                      <span>
                        <T text={m} />
                      </span>
                    </li>
                  ))}
                </ul>
              ))}
            </section>
          );
        })}
      </div>
      <footer className="cs-foot">
        <span>
          <b>Free course:</b> {site}/learn · 11 worlds · interview bosses · 5-minute revision decks
        </span>
        <span>
          <em>{url}</em>
        </span>
      </footer>
    </article>
  );
}
