import { NextResponse } from "next/server";
import { noStore, requireLearner } from "../../_lib/auth";
import { buildDigest, digestHtml, digestParagraph } from "@/lib/learner/weekly-digest";
import { didTotal } from "@/lib/learner/weekly-digest-model";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** GET → { html, counts }: this learner's own weekly email as it would be written now (nothing is sent). */
export async function GET(req: Request) {
  const me = await requireLearner(req);
  if (me instanceof NextResponse) return me;
  try {
    const facts = await buildDigest(me.id);
    const para = await digestParagraph(me.id, facts);
    return NextResponse.json({ html: digestHtml(facts, para, null), counts: { ...facts.did, total: didTotal(facts.did), stuck: facts.stuck.length, slipped: facts.slipped.length, next: facts.next.length }, paragraph: para }, { headers: noStore });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500, headers: noStore });
  }
}
