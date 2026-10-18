import type { RevCard } from "@/lib/learn/revision/parse";
import Inline from "./Inline";
import styles from "./revise.module.css";

export const KIND_LABEL: Record<RevCard["kind"], string> = {
  idea: "Key idea",
  numbers: "Numbers to remember",
  tradeoff: "Trade-off",
  mistakes: "Classic mistakes",
  ask: "If the interviewer asks",
};

/** Glyph colour per card kind (square corners, one signal colour, the "bad" red for mistakes). */
export const KIND_DOT: Record<RevCard["kind"], string> = {
  idea: "bg-fg",
  numbers: "bg-signal",
  tradeoff: "border border-fg bg-transparent",
  mistakes: "bg-bad",
  ask: "bg-signal",
};

/** One revision card's content, sized for a phone first. */
export default function CardFace({ card, revealed, onReveal }: { card: RevCard; revealed: boolean; onReveal: () => void }) {
  switch (card.kind) {
    case "idea":
      return (
        <div className="flex flex-col gap-4">
          <h2 className="font-display text-[28px] font-bold leading-[1.05] tracking-[-0.025em] text-fg sm:text-[36px]">
            <Inline text={card.title} />
          </h2>
          <p className="text-[18px] leading-[1.55] text-fg-2 sm:text-[21px]">
            <Inline text={card.text} codeClass="text-fg" />
          </p>
        </div>
      );
    case "numbers":
      return (
        <div className="flex flex-col gap-4">
          {card.title !== "Numbers to remember" && (
            <h2 className="font-display text-[24px] font-bold leading-[1.1] tracking-[-0.02em] text-fg sm:text-[28px]">
              <Inline text={card.title} />
            </h2>
          )}
          <ul className="flex flex-col">
            {card.items.map((n, i) => (
              <li key={i} className="flex flex-col gap-1 border-t border-line py-3 first:border-t-0 first:pt-0 sm:flex-row sm:items-baseline sm:gap-5">
                <span className="shrink-0 font-mono text-[24px] font-semibold leading-none tracking-[-0.02em] text-signal-text sm:w-[200px] sm:text-[28px]">
                  <Inline text={n.value} />
                </span>
                <span className="text-[16px] leading-snug text-fg-2 sm:text-[18px]">
                  <Inline text={n.label} codeClass="text-fg" />
                </span>
              </li>
            ))}
          </ul>
        </div>
      );
    case "tradeoff":
      return (
        <div className="flex flex-col gap-4">
          <h2 className="font-display text-[24px] font-bold leading-[1.1] tracking-[-0.02em] text-fg sm:text-[30px]">
            <Inline text={card.title} />
          </h2>
          <div className="-mx-1 overflow-x-auto px-1">
            <table className="w-full border-collapse text-left text-[14px] leading-snug sm:text-[16px]">
              <thead>
                <tr>
                  {card.head.map((h, i) => (
                    <th key={i} scope="col" className={`border-b-2 border-fg px-2 pb-2 align-bottom font-mono text-[11px] font-semibold uppercase tracking-label ${i === 0 ? "pl-0 text-fg-3" : "text-fg"}`}>
                      <Inline text={h} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {card.rows.map((r, i) => (
                  <tr key={i} className="border-b border-line">
                    {r.map((c, k) =>
                      k === 0 ? (
                        <th key={k} scope="row" className="py-2.5 pl-0 pr-2 align-top font-mono text-[12px] font-normal uppercase tracking-[0.04em] text-fg-3">
                          <Inline text={c} />
                        </th>
                      ) : (
                        <td key={k} className="px-2 py-2.5 align-top text-fg-2">
                          <Inline text={c} codeClass="text-fg" />
                        </td>
                      )
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {card.note && (
            <p className="text-[15px] leading-snug text-fg-3">
              <Inline text={card.note} />
            </p>
          )}
        </div>
      );
    case "mistakes":
      return (
        <div className="flex flex-col gap-4">
          {card.title !== "Classic mistakes" && (
            <h2 className="font-display text-[24px] font-bold leading-[1.1] tracking-[-0.02em] text-fg sm:text-[28px]">
              <Inline text={card.title} />
            </h2>
          )}
          <ul className="flex flex-col gap-3.5">
            {card.items.map((m, i) => (
              <li key={i} className="flex gap-3 text-[17px] leading-[1.45] text-fg-2 sm:text-[19px]">
                <span aria-hidden className="mt-[3px] font-mono text-[15px] font-semibold text-bad-text">
                  ✕
                </span>
                <span>
                  <Inline text={m} codeClass="text-fg" />
                </span>
              </li>
            ))}
          </ul>
        </div>
      );
    case "ask":
      return (
        <div className="flex flex-col gap-5">
          <h2 className="font-display text-[26px] font-bold leading-[1.08] tracking-[-0.025em] text-fg sm:text-[32px]">
            “<Inline text={card.title} />”
          </h2>
          {revealed ? (
            <div className={`flex flex-col gap-2 border-l-2 border-signal pl-4 ${styles.reveal}`}>
              <span className="font-mono text-[11px] uppercase tracking-label text-signal-text">Say</span>
              <p className="text-[18px] leading-[1.55] text-fg-2 sm:text-[20px]">
                <Inline text={card.text} codeClass="text-fg" />
              </p>
            </div>
          ) : (
            <button
              type="button"
              onClick={onReveal}
              className="flex min-h-[64px] w-full items-center justify-between gap-3 border border-dashed border-line-strong px-4 text-left text-[15px] text-fg-2 hover:border-fg-3 hover:text-fg"
            >
              <span>Answer it out loud first, then show the strong answer.</span>
              <span className="shrink-0 font-mono text-xs text-signal-text">show ▸</span>
            </button>
          )}
        </div>
      );
  }
}
