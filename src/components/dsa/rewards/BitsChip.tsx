"use client";

/**
 * DSA Mastery's spot in the shared header (in place of SD Mastery's level chip on /dsa pages): the belt and the Bits,
 * linking to Belt & badges (/dsa/progress). Teal outline like the rest of DSA; a short bump when Bits land (none with
 * reduced motion). Phones show the belt and a short count ("1.2k"); wider screens the full count and the belt's name.
 * Also mounts DsaRewardsHost (badges, streak milestones, the board summary) and, outside the header, the Bits toasts.
 */
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useState } from "react";
import { bitsLabel } from "@/lib/dsa/rewards";
import { useDsaBits } from "./useDsaBits";
import { onBits } from "./award";
import { BeltSwatch } from "./BeltSwatch";
// loaded on DSA pages only, after the page: the header ships on every page of the site
const DsaRewardsHost = dynamic(() => import("./DsaRewardsHost"), { ssr: false });

export const DSA_PROGRESS_HREF = "/dsa/progress";

const short = (n: number) => (n < 1000 ? String(n) : n < 10_000 ? `${(Math.floor(n / 100) / 10).toFixed(1).replace(/\.0$/, "")}k` : `${Math.floor(n / 1000)}k`);

export function BitsChip({ on }: { on: boolean }) {
  const { ready, bits, belt } = useDsaBits();
  const [bump, setBump] = useState(0);
  useEffect(() => onBits(() => setBump((n) => n + 1)), []);
  const n = ready ? bits : 0;
  const label = `${belt.belt.name} belt, ${bitsLabel(n)}${belt.next ? `, ${belt.toNext.toLocaleString("en-US")} to ${belt.next.name}` : ""}. Open belt and badges`;
  return (
    <>
      <Link
        href={DSA_PROGRESS_HREF}
        aria-label={label}
        aria-current={on ? "page" : undefined}
        title={belt.next ? `${bitsLabel(n)} · ${belt.toNext.toLocaleString("en-US")} to ${belt.next.name} belt` : `${bitsLabel(n)} · Black belt`}
        className={`inline-flex min-h-10 shrink-0 items-center gap-1 whitespace-nowrap border px-1.5 font-mono text-xs text-signal-text min-[400px]:gap-1.5 min-[400px]:px-2 ${on ? "border-signal bg-[var(--c-dsa-hl)]" : "border-signal hover:bg-[var(--c-dsa-hl)]"}`}
      >
        <BeltSwatch belt={belt.belt} size={16} />
        <span key={bump} className={bump ? "dsa-bits-bump tabular-nums" : "tabular-nums"}>
          <span className="sm:hidden">{short(n)}</span>
          <span className="hidden sm:inline">{n.toLocaleString("en-US")}</span>
        </span>
        <span className="hidden sm:inline">Bits</span>
        <span data-wco-compact className="hidden text-fg-3 xl:inline">
          · {belt.belt.name.toLowerCase()}
        </span>
      </Link>
      <DsaRewardsHost />
    </>
  );
}

/** The belt's progress as the header's thin bar on phones (where SD Mastery shows its level bar). */
export function BitsBar() {
  const { belt } = useDsaBits();
  return (
    <div className="h-[3px] bg-surface-2 sm:hidden">
      <div className="h-[3px] bg-signal" style={{ width: `${belt.pct}%` }} />
    </div>
  );
}
