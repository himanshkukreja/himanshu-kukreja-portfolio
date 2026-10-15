// Shared presentational pieces for the showcase concepts (server- and client-safe).
import { BRANCHES, PROOF_LABEL, SKILL_BY_ID, SKILLS, type BranchId, type Era } from "./data";

export const label = "font-mono text-[11px] uppercase tracking-label text-fg-3";

export function Chip({ children, tone = "line" }: { children: React.ReactNode; tone?: "line" | "signal" | "solid" }) {
  const cls =
    tone === "signal"
      ? "border-signal text-signal-text"
      : tone === "solid"
        ? "border-signal bg-signal text-on-signal"
        : "border-line-strong text-fg-2";
  return <span className={`inline-flex items-center border px-2 py-1 font-mono text-xs leading-none ${cls}`}>{children}</span>;
}

/** Proof counts per branch: the "build" stats, derived only from receipts on file. */
export function branchStats(): { id: BranchId; name: string; short: string; n: number }[] {
  return BRANCHES.map((b) => ({
    id: b.id,
    name: b.name,
    short: b.short,
    n: SKILLS.filter((s) => s.branch === b.id).reduce((sum, s) => sum + s.proof.length, 0),
  }));
}

/** Body copy for one career chapter: points, wins, skills. */
export function EraBody({ era, compact = false }: { era: Era; compact?: boolean }) {
  return (
    <div className="flex flex-col gap-3.5">
      <ul className={`m-0 flex list-none flex-col gap-2 p-0 text-fg-2 ${compact ? "text-sm" : "text-[15px] leading-normal"}`}>
        {era.points.map((p) => (
          <li key={p} className="flex gap-2.5">
            <span aria-hidden className="mt-[0.55em] h-1.5 w-1.5 shrink-0 bg-signal" />
            <span>{p}</span>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-1.5">
        {era.wins.map((w) => (
          <Chip key={w} tone="signal">
            {w}
          </Chip>
        ))}
      </div>
      {era.skills.length > 0 && (
        <p className="m-0 font-mono text-xs leading-relaxed text-fg-3">
          <span className="text-fg-4">uses: </span>
          {era.skills.map((s) => SKILL_BY_ID[s].name).join(" · ")}
        </p>
      )}
    </div>
  );
}

export function proofWhere(era: keyof typeof PROOF_LABEL) {
  return PROOF_LABEL[era];
}
