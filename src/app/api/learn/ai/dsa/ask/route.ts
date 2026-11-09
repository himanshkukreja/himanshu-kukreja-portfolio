import { NextResponse } from "next/server";
import { requireLearner } from "@/app/api/learn/_lib/auth";
import { isAdminEmail } from "@/lib/ai/access";
import { ownKey } from "@/lib/ai/client";
import { readRequest } from "@/lib/ai/chat/core";
import { chatLimits, chatToday, quotaFor } from "@/lib/ai/chat/quota";
import { nextRef, type ChatSource } from "@/lib/ai/chat/text";
import { actionOf, messageLines, styleLine } from "@/lib/ai/answerStyle";
import { DSA_FULL } from "@/lib/dsa/flags";
import { courseOutline, pageItem, searchDsa, type DsaHit } from "@/lib/dsa/ai/search";
import { unlocksFor } from "@/lib/dsa/ai/unlock";
import { dsaAskSystem } from "@/lib/dsa/ai/prompts";
import { historyMessages, streamDsa } from "@/lib/dsa/ai/run";
import { tokens } from "@/lib/dsa/ai/text";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const noStore = { "Cache-Control": "private, no-store" };
const notFound = () => NextResponse.json({ error: "Not found" }, { status: 404 });
/** a ref this chat handed out earlier: its id is one of our chunk keys */
const KEY_RE = /^[clpe]:[a-z0-9-]+:\d{1,4}$/;

/**
 * GET /api/learn/ai/dsa/ask → { quota, memory, feedback } for the header line (signed in), the course chat's shape.
 *
 * POST /api/learn/ai/dsa/ask (ChatRequest, the course chat's body) → server-sent events (lib/ai/chat/text.ts ChatEvent):
 * DSA Mastery's tutor (/dsa/ask and the Ask panel on DSA pages; feature "dsa-chat", its own daily messages). The route
 * searches DSA content for the message (lib/dsa/ai/search.ts: lessons, lectures, problem statements, and editorials only
 * for problems this learner unlocked, read from their own rows), sends the passages as refs, and streams one answer
 * that cites them. Signed-in learners only; 404 until DSA Mastery is on (NEXT_PUBLIC_DSA_MODE=full).
 */
export async function GET(request: Request) {
  if (!DSA_FULL) return notFound();
  const me = await requireLearner(request);
  if (me instanceof NextResponse) return me;
  const [{ perDay }, t] = await Promise.all([chatLimits("dsa-chat"), chatToday(me.id, "dsa-chat")]);
  return NextResponse.json({ quota: quotaFor(perDay, t.total, !!ownKey(request)), memory: { available: false, paused: false, has: false }, feedback: false }, { headers: noStore });
}

const KIND_LABEL: Record<DsaHit["kind"], string> = { lesson: "lesson", lecture: "lecture narration", problem: "problem statement", editorial: "editorial (unlocked)" };

export async function POST(request: Request) {
  if (!DSA_FULL) return notFound();
  const me = await requireLearner(request);
  if (me instanceof NextResponse) return me;
  const parsed = readRequest(await request.json().catch(() => null));
  if (typeof parsed === "string") return NextResponse.json({ error: parsed }, { status: 400, headers: noStore });
  const req = parsed;
  const admin = await isAdminEmail(me.email);
  const latest = req.messages[req.messages.length - 1].text;

  return streamDsa({
    request,
    me,
    admin,
    userKey: ownKey(request),
    feature: "dsa-chat",
    req,
    titled: true,
    lookup: { tool: "search_course", label: "Searching DSA Mastery…" },
    prepare: async () => {
      // a short follow-up ("why?", "Explain that more simply.") searches with the learner's previous question too
      const prevUser = [...req.messages.slice(0, -1)].reverse().find((m) => m.role === "user")?.text ?? "";
      const short = tokens(latest).length < 5 || !!actionOf(latest);
      const page = pageItem(req.page?.path);
      // the page counts only on a concept, lecture or problem page (a list page's headings are noise)
      const query = [latest, short ? prevUser : "", page ? (req.page?.selection ?? "") : "", page ? `${req.page?.title ?? ""} ${req.page?.heading ?? ""}` : ""].filter(Boolean).join("\n");
      const [unlocks, outline] = await Promise.all([unlocksFor(me.id), courseOutline()]);
      const found = await searchDsa({ query, unlocked: unlocks.unlocked, page });

      // refs: the same passage keeps the ref it had earlier in this chat; new ones continue the numbering
      const earlier = req.sources ?? {};
      const byKey = new Map(Object.entries(earlier).map(([r, id]) => [id, r]));
      const keys = Object.keys(earlier);
      const sources: Record<string, ChatSource> = {};
      const blocks: string[] = [];
      for (const h of found.hits) {
        let ref = byKey.get(h.key);
        if (!ref) {
          ref = nextRef([...keys, ...Object.keys(sources)], "s");
          byKey.set(h.key, ref);
        }
        sources[ref] = { id: h.key, kind: h.kind === "editorial" ? "problem" : h.kind, title: h.title, sub: h.sub, href: h.href, at: 0 };
        blocks.push(`[${ref}] ${KIND_LABEL[h.kind]} · ${h.title}\n${h.text}`);
      }
      // the problems this question is about whose editorial stays locked: the model is told so by name
      const locked = found.problems.filter((p) => !unlocks.unlocked.has(p.id)).slice(0, 3).map((p) => p.title);
      const pageLine = page && req.page?.path
        ? `<page>The learner is on ${req.page.title ? `"${req.page.title}"` : req.page.path}${req.page.heading ? `, at "${req.page.heading}"` : ""}.${req.page.selection ? ` They selected: "${req.page.selection.slice(0, 600)}"` : ""}</page>`
        : "";
      const context = [
        pageLine,
        blocks.length ? `<dsa_sources>\n${blocks.join("\n\n")}\n</dsa_sources>` : "<dsa_sources>(nothing in the course matched this message)</dsa_sources>",
        locked.length ? `<locked_editorials>${locked.join("; ")}: not unlocked by this learner. No full solution or full approach for these.</locked_editorials>` : "",
      ]
        .filter(Boolean)
        .join("\n\n");
      // the answer style beside the box; DSA's interview is a coding round
      const style = styleLine(req.style).replace("a system design round", "a coding interview");
      const content = [latest, style, ...messageLines(latest, req.style), context].filter(Boolean).join("\n\n");
      return {
        system: dsaAskSystem(outline),
        messages: historyMessages(req, content),
        sources,
        earlierRefs: Object.keys(earlier).filter((r) => KEY_RE.test(earlier[r])),
        think: false,
        cap: null,
        ask: latest,
        followups: true,
        meta: {
          hits: found.hits.length,
          editorials: found.hits.filter((h) => h.kind === "editorial").length,
          searchMs: found.ms,
          page: page ? `${page.kind}:${page.id}` : null,
          known: Object.keys(earlier).filter((r) => KEY_RE.test(earlier[r])).length,
          ...(req.style ? { style: req.style } : {}),
        },
      };
    },
  });
}
