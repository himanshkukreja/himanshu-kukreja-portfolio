/**
 * One DSA tutor answer from a prepared turn (./turn.ts): the model call and the clean-up, shared by the routes (run.ts,
 * which streams it to the page and meters it) and the eval (scripts/ai-eval/dsa.ts), so both get exactly the same
 * request (model, token cap, thinking, cached system blocks) and the same answer (follow-ups split off, refs checked,
 * code capped while the editorial is locked). No database here.
 */
import { answerTokens, FEATURES } from "@/lib/ai/features";
import { runLoop, type ApiMessage, type LoopResult } from "@/lib/ai/chat/loop";
import { cleanAnswer, followupFilter, OFF_TOPIC_MARK, splitFollowups, type ChatSource } from "@/lib/ai/chat/text";
import { checkCitations, type CiteStats } from "@/lib/ai/chat/citations";
import { capCode, codeCapStream } from "./text";

export type DsaFeature = "dsa-chat" | "dsa-tutor";

export type Prepared = {
  system: { text: string; cache?: boolean }[];
  messages: ApiMessage[];
  /** refs the answer may cite (sent to the page before the model runs) */
  sources: Record<string, ChatSource>;
  /** refs from earlier in the chat that stay citable (the page still has their cards) */
  earlierRefs?: string[];
  /** ref → the passage the model was shown for it (the citation check's evidence; earlier refs have none: kept) */
  evidence?: Record<string, string>;
  /** think first (Haiku 5.5 adaptive, low effort) */
  think: boolean;
  /** code blocks capped at this many lines (the no-spoiler guard), or null */
  cap: number | null;
  /** what goes in the transcript as the learner's turn */
  ask: string;
  /** for the metering row (counts and ids only, never learner text) */
  meta: Record<string, string | number | boolean | null>;
  /** offer follow-up cards and the answer-style actions under the answer */
  followups: boolean;
};

export type DsaAnswer = {
  loop: LoopResult;
  /** the model's text as written (before the clean-up): the eval checks the model, not only the guards */
  raw: string;
  /** what the learner sees */
  text: string;
  /** the citation check's counts (lib/ai/chat/citations.ts); null: nothing cited */
  cites: CiteStats | null;
  offTopic: boolean;
  followups: string[];
};

export async function answerDsa(o: {
  feature: DsaFeature;
  model: string;
  apiKey: string;
  p: Prepared;
  /** the learner's latest words (a follow-up equal to them is dropped) */
  latest: string;
  deadline: number;
  signal?: AbortSignal;
  /** the answer as it streams (follow-ups line held back, code already capped) */
  onDelta?: (d: string) => void;
}): Promise<DsaAnswer> {
  const { p, model, feature } = o;
  const emit = o.onDelta ?? (() => {});
  const capped = p.cap !== null ? codeCapStream(p.cap, emit) : null;
  const deltas = followupFilter((d) => (capped ? capped.push(d) : emit(d)));
  const h55 = /haiku-5-5/.test(model);
  const thinks = p.think && h55;
  const loop = await runLoop({
    apiKey: o.apiKey,
    model,
    system: p.system.map((b) => ({ type: "text" as const, text: b.text, ...(b.cache ? { cache_control: { type: "ephemeral" as const } } : {}) })),
    tools: [],
    messages: p.messages,
    maxTokens: answerTokens(feature, model) + (thinks ? 2000 : 0),
    thinking: thinks ? { type: "adaptive" } : /haiku/.test(model) ? { type: "disabled" } : /sonnet-5/.test(model) ? { type: "between_tools" } : null,
    ...(thinks ? { effort: FEATURES[feature].effort ?? ("low" as const) } : {}),
    maxToolRounds: 0,
    deadline: o.deadline,
    signal: o.signal,
    runTool: async () => "",
    onText: (d) => deltas.push(d),
  });
  deltas.flush();
  capped?.flush();
  const offTopic = OFF_TOPIC_MARK.test(loop.text);
  const split = splitFollowups(loop.text, o.latest);
  const known = (r: string) => !!p.sources[r] || !!p.earlierRefs?.includes(r);
  let text = cleanAnswer(split.text, known);
  // every [[sN]] must point at a passage that supports its sentence: swapped for the one that does, or dropped
  let cites: CiteStats | null = null;
  if (text && !offTopic && Object.keys(p.sources).length) {
    const checked = checkCitations(text, p.evidence ?? {}, known);
    text = checked.text;
    cites = checked.stats.total ? checked.stats : null;
  }
  if (p.cap !== null) text = capCode(text, p.cap);
  return { loop, raw: loop.text, text, offTopic, followups: split.followups, cites };
}
