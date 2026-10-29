/**
 * Mock interviews inside the course chat ("Interview me on designing WhatsApp"): phased and timed like
 * /learn/mock, with the same interviewer and scorecard prompts (mockInterviewerSystem, mockFullScorecardSystem,
 * tuned per model the same way) and the same rubrics. Two kinds:
 *   mock:<slug>   one of the course's mock interviews (resources/mock-interviews): its phases, budgets,
 *                 interviewer, prompts, curveballs, levelled rubric and model answers;
 *   quest:<slug>  a side quest's design round, when no course mock fits the topic: requirements, the
 *                 high-level design and the quest's own interviewer follow-up drills as the deep dive, graded
 *                 against the drills' must-mention points.
 * Turns and the scorecard are metered as course-chat messages (the chat's quota), not the mock features'.
 * The weak areas the scorecard names become a learning path (the rubric's study links), ready to save.
 */
import type { MockPhase as PromptPhase } from "@/lib/ai/prompts";
import { lessonContext } from "@/lib/ai/retrieve";
import type { MockInterview, StudyRef } from "@/lib/learn/mock/types";
import type { QuestDrills } from "@/lib/learn/drills/parse";
import type { Doc } from "@/lib/search/smart/types";
import type { ChatState } from "./tools";
import type { ChatSource, MockCard, PathCard } from "./text";
import { nextRef } from "./text";

export type ChatMockPhase = { id: string; title: string; minutes: number; opener: string; prompt: PromptPhase; signals: { text: string; study: string[] }[] };
export type ChatMock = { key: string; title: string; company: string; interviewer: string; problem: string; href: string; phases: ChatMockPhase[] };

const plainHtml = (h: string) =>
  h
    .replace(/<(script|style)[\s\S]*?<\/\1>/g, " ")
    .replace(/<\/(p|li|h[1-6]|tr|div)>/g, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();

/** A course mock as the chat runs it (the same prompt inputs as /api/learn/ai/mock/turn and the scorecard). */
export function fromCourseMock(m: MockInterview): ChatMock {
  return {
    key: `mock:${m.slug}`,
    title: m.title,
    company: m.company.name,
    interviewer: `${m.interviewer.name}, ${m.interviewer.title}`,
    problem: `${m.problemText}\n\nInterviewer: ${m.interviewer.name}, ${m.interviewer.title}. Their style: ${m.interviewer.style}`,
    href: m.href,
    phases: m.phases.map((p) => ({
      id: p.id,
      title: p.title,
      minutes: p.minutes,
      opener: p.prompts[0]?.text || `Let's move to ${p.title}.`,
      prompt: {
        title: p.title,
        interviewer: p.prompts.map((x) => `- ${x.text}`).join("\n"),
        curveballs: p.curveballs.map((c) => `- ${c.title ? `${c.title}: ` : ""}${c.text}`).join("\n") || "(none)",
        rubric: p.rubric.map((r) => `- [${r.level}] ${r.text}${r.study.length ? ` (study: ${r.study.map((s) => s.code).join(", ")})` : ""}`).join("\n"),
        modelAnswer: plainHtml(p.answerHtml).slice(0, 5000),
      },
      signals: p.rubric.map((r) => ({ text: r.text, study: r.study.map((s: StudyRef) => s.href) })),
    })),
  };
}

/** A side quest's design round, from the quest itself and its interviewer follow-up drills. */
export function fromQuest(quest: Doc, md: string | null, drills: QuestDrills | null): ChatMock | null {
  const items = drills?.items ?? [];
  if (!items.length) return null;
  const product = quest.title.replace(/^Side quest\s*\d*\s*[:·-]\s*/i, "");
  const intro = md ? lessonContext(md, "requirements scale users numbers constraints mission", "", 2500) : quest.text.slice(0, 2500);
  const design = md ? lessonContext(md, "high level architecture components data flow request path storage", "", 3500) : quest.text.slice(0, 3500);
  const deep = items.slice(0, 6);
  return {
    key: `quest:${quest.id.split("/").pop()}`,
    title: `Design ${product}`,
    company: product,
    interviewer: "Your interviewer, a senior engineer",
    problem: `Design ${product}, as covered in the course's side quest "${quest.title}". The candidate should scope it, estimate the scale and design it end to end.`,
    href: quest.href,
    phases: [
      {
        id: "q1",
        title: "Requirements and scale",
        minutes: 8,
        opener: `Let's design ${product}. Before you draw anything: what would you clarify first, and what scale are we designing for?`,
        prompt: {
          title: "Requirements and scale",
          interviewer: "- What would you clarify first?\n- Which features are in scope for this round?\n- How many users and requests per second are we designing for?",
          curveballs: "(none)",
          rubric: "- [junior] Lists the core features to build.\n- [sde] Asks for scale: users, requests per second, data size, and sets numbers.\n- [sde] Pins down what is in and out of scope.\n- [senior] States the non-functional needs (latency, availability, consistency) and why they matter here.",
          modelAnswer: intro,
        },
        signals: [],
      },
      {
        id: "q2",
        title: "High-level design",
        minutes: 15,
        opener: "Walk me through your high-level design: the main components, and how one request flows through them.",
        prompt: {
          title: "High-level design",
          interviewer: "- Walk me through the main components.\n- Trace one request end to end.\n- Where does the data live, and why there?",
          curveballs: "(none)",
          rubric: "- [sde] Names the main services and data stores and how a request flows.\n- [sde] Picks storage that fits the access pattern, with a reason.\n- [senior] Finds the hot path and the bottleneck at the stated scale.\n- [senior] Says what happens when one component fails.",
          modelAnswer: design,
        },
        signals: [],
      },
      {
        id: "q3",
        title: "Deep dives and follow-ups",
        minutes: 15,
        opener: deep[0].q,
        prompt: {
          title: "Deep dives and follow-ups",
          interviewer: deep.map((d) => `- ${d.q}`).join("\n"),
          curveballs: deep.slice(1).map((d) => `- ${d.q}`).join("\n") || "(none)",
          rubric: deep.map((d) => `- [senior] ${d.q} Must mention: ${d.must.join("; ")}`).join("\n"),
          modelAnswer: deep.map((d) => `${d.q}\n${d.strong.join(" ")}`).join("\n\n").slice(0, 5000),
        },
        signals: deep.map((d) => ({ text: `${d.q} ${d.must.join(" ")}`, study: d.sectionId ? [`${quest.href}#${d.sectionId}`] : [quest.href] })),
      },
    ],
  };
}

export const mockCard = (m: ChatMock): MockCard => ({ key: m.key, title: m.title, company: m.company, interviewer: m.interviewer, href: m.href, phases: m.phases.map((p) => ({ id: p.id, title: p.title, minutes: p.minutes, opener: p.opener })) });

const words = (s: string) => new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3));

/**
 * The weak areas the scorecard names, as a path: for each phase, the rubric signals that share the most words
 * with its MISSED line, and their study links resolved against the index (so every step is a real page).
 */
export function weakAreasPath(st: ChatState, m: ChatMock, scorecard: string, fresh: Record<string, ChatSource>): PathCard | null {
  const byHref = new Map<string, Doc>();
  for (const d of st.engine.docs) if (!byHref.has(d.href)) byHref.set(d.href, d);
  const steps: { ref: string; why: string }[] = [];
  const seen = new Set<string>();
  m.phases.forEach((p, i) => {
    const sec = scorecard.split(/^###\s+/m).find((s) => new RegExp(`^P${i + 1}\\b`).test(s.trim()));
    const missed = sec?.match(/^MISSED:\s*(.*)$/m)?.[1] ?? "";
    if (!missed || /^none\b/i.test(missed.trim())) return;
    const mw = words(missed);
    const ranked = p.signals
      .map((s) => ({ s, n: [...words(s.text)].filter((w) => mw.has(w)).length }))
      .filter((x) => x.n >= 2 && x.s.study.length)
      .sort((a, b) => b.n - a.n)
      .slice(0, 2);
    for (const { s } of ranked)
      for (const href of s.study) {
        const d = byHref.get(href) ?? byHref.get(href.split("#")[0]);
        if (!d || seen.has(d.id) || !st.liveDoc(d.id)) continue;
        seen.add(d.id);
        steps.push({ ref: st.ref(d, fresh), why: `Missed in ${p.title.toLowerCase()}: ${s.text.replace(/\s+/g, " ").slice(0, 150)}` });
        if (steps.length >= 6) return;
      }
  });
  if (!steps.length) return null;
  const pref = nextRef([...st.paths.keys()], "p");
  const path: PathCard = { pref, title: `Close the gaps from your ${m.title} interview`, note: "From the rubric signals the scorecard marked as missed.", steps };
  st.paths.set(pref, path);
  return path;
}
