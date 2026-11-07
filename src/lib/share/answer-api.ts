import { COURSE_ORIGIN } from "@/lib/site/hosts";
import "server-only";
/**
 * The share-an-answer endpoint, shared by POST /api/learn/share (the documented path) and
 * POST /api/learn/share/answer. GET /api/learn/share/answer is the button's "is sharing on?" probe.
 */
import { NextResponse } from "next/server";
import { ANSWER_PAGES_INDEXABLE, validateShare } from "./answer-model";
import { answersEnabled, createShare, ShareLimitError } from "./answers";
import { shareLearner } from "./store";
import { isProductionDeploy } from "@/lib/platform";

const noStore = { "Cache-Control": "private, no-store" };

// shared answers live on the course host
const siteOrigin = (request: Request) => (isProductionDeploy() ? COURSE_ORIGIN : new URL(request.url).origin).replace(/\/$/, "");

/** GET → { enabled }: no session needed, cached at the CDN for 5 minutes. */
export async function shareAnswerStatus(): Promise<NextResponse> {
  const enabled = await answersEnabled().catch(() => false);
  return NextResponse.json({ enabled, indexable: ANSWER_PAGES_INDEXABLE }, { headers: { "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=600" } });
}

/**
 * POST { question, answerParts, cites } → { enabled: true, id, url }. Before the table exists: { enabled: false }.
 * Signed-in learners only, 20 shares per rolling day (the same answer again reuses its link).
 */
export async function shareAnswer(request: Request): Promise<NextResponse> {
  if (!(await answersEnabled().catch(() => false))) return NextResponse.json({ enabled: false }, { headers: noStore });
  const me = await shareLearner(request);
  if (!me) return NextResponse.json({ enabled: true, error: "Sign in to share an answer" }, { status: 401, headers: noStore });
  const body = await request.json().catch(() => null);
  const v = validateShare(body);
  if (!v.ok) return NextResponse.json({ enabled: true, error: v.error, problem: v.problem }, { status: 422, headers: noStore });
  try {
    const { id, reused } = await createShare(me.id, v.value);
    const path = `/answer/${id}`;
    return NextResponse.json({ enabled: true, id, path, url: `${siteOrigin(request)}${path}`, reused }, { headers: noStore });
  } catch (e) {
    if (e instanceof ShareLimitError) return NextResponse.json({ enabled: true, error: e.message }, { status: 429, headers: noStore });
    console.error("[share-answer] POST", e instanceof Error ? e.message : e);
    return NextResponse.json({ enabled: true, error: "Couldn't make a link. Try again." }, { status: 500, headers: noStore });
  }
}
