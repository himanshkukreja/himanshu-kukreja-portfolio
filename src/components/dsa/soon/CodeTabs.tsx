"use client";

/** The sliding-window template in the four course languages (the Shape beat's "template in 4 tabs"). */
import { useState } from "react";

const TABS: { id: string; label: string; comment: string; code: string }[] = [
  {
    id: "python",
    label: "Python",
    comment: "#",
    code: `def busiest_stretch(plays: list[int], k: int) -> int:
    total = sum(plays[:k])
    best = total
    for r in range(k, len(plays)):
        total += plays[r] - plays[r - k]  # one joins, one leaves
        best = max(best, total)
    return best`,
  },
  {
    id: "java",
    label: "Java",
    comment: "//",
    code: `long busiestStretch(int[] plays, int k) {
    long total = 0;
    for (int i = 0; i < k; i++) total += plays[i];
    long best = total;
    for (int r = k; r < plays.length; r++) {
        total += plays[r] - plays[r - k]; // one joins, one leaves
        best = Math.max(best, total);
    }
    return best;
}`,
  },
  {
    id: "cpp",
    label: "C++",
    comment: "//",
    code: `long long busiestStretch(const vector<int>& plays, int k) {
    long long total = accumulate(plays.begin(), plays.begin() + k, 0LL);
    long long best = total;
    for (int r = k; r < (int)plays.size(); r++) {
        total += plays[r] - plays[r - k]; // one joins, one leaves
        best = max(best, total);
    }
    return best;
}`,
  },
  {
    id: "javascript",
    label: "JavaScript",
    comment: "//",
    code: `function busiestStretch(plays, k) {
  let total = 0;
  for (let i = 0; i < k; i++) total += plays[i];
  let best = total;
  for (let r = k; r < plays.length; r++) {
    total += plays[r] - plays[r - k]; // one joins, one leaves
    best = Math.max(best, total);
  }
  return best;
}`,
  },
];

export default function CodeTabs() {
  const [active, setActive] = useState(TABS[0].id);
  const tab = TABS.find((t) => t.id === active) || TABS[0];
  return (
    <div className="flex min-w-0 flex-col border border-line bg-surface">
      <div role="tablist" aria-label="Language" className="flex overflow-x-auto border-b border-line">
        {TABS.map((t) => (
          <button
            key={t.id}
            id={`dsa-tab-${t.id}`}
            role="tab"
            type="button"
            aria-selected={t.id === active}
            aria-controls="dsa-tab-panel"
            onClick={() => setActive(t.id)}
            className={`min-h-11 shrink-0 border-r border-line px-4 font-mono text-[13px] ${t.id === active ? "bg-bg font-semibold text-signal-text shadow-[inset_0_-2px_0_var(--c-signal)]" : "text-fg-3 hover:text-fg"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <pre id="dsa-tab-panel" role="tabpanel" aria-labelledby={`dsa-tab-${tab.id}`} className="m-0 overflow-x-auto bg-bg p-4 font-mono text-[12.5px] leading-[1.7] text-fg-2 sm:text-[13px]">
        <code>
          {tab.code.split("\n").map((line, i) => {
            const at = line.indexOf(` ${tab.comment} `);
            return (
              <span key={i} className="block">
                {at < 0 ? (
                  line || " "
                ) : (
                  <>
                    {line.slice(0, at)}
                    <span className="text-signal-text">{line.slice(at)}</span>
                  </>
                )}
              </span>
            );
          })}
        </code>
      </pre>
    </div>
  );
}
