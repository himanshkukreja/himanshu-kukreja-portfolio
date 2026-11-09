"use client";

/**
 * "Explain it back" on DSA Mastery lessons: the course's ExplainBack, plus Bits for a good explanation (once per
 * lesson: partly there earns BITS_TABLE.explainPartial, solid earns BITS_TABLE.explainSolid, and a later solid tops a
 * partial up to the full amount). Never SD Mastery XP.
 */
import { useCallback } from "react";
import ExplainBack from "@/components/learn/ai/ExplainBack";
import { awardKeys, BITS_TABLE } from "@/lib/dsa/rewards";
import { useDsaAward } from "./useDsaBits";

export default function DsaExplainBack({ conceptId, term }: { conceptId: string; term: string }) {
  const { grant } = useDsaAward();
  const onVerdict = useCallback(
    (v: string | null) => {
      const bits = v === "solid" ? BITS_TABLE.explainSolid : v === "partial" ? BITS_TABLE.explainPartial : 0;
      if (bits) grant(awardKeys.explain(conceptId), bits, `Explained ${term} in your own words`, { upgrade: true });
    },
    [grant, conceptId, term],
  );
  return <ExplainBack conceptId={conceptId} term={term} course="dsa" onVerdict={onVerdict} />;
}
