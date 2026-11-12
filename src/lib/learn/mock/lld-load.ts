/**
 * Server: a low-level design case study (resources/low-level-design/lld-NN-*.md) → a machine-coding MockInterview
 * (kind "lld") for /mock/lld-NN-*. The round, rubric and change come from lld.ts (pure); this file reads the lesson,
 * renders the HTML pieces with the same renderers as the system design mocks and picks the interviewer.
 */
import { createHash } from "crypto";
import { fetchMarkdownContent } from "@/lib/github";
import { renderBlockHtml } from "@/lib/course/block-html";
import { caseBySlug } from "@/lib/learn/lld/meta";
import { STEP_BY_KEY, type StepKey } from "@/lib/learn/lld/steps";
import { mdToHtml, plainText } from "./load";
import { buildLldRubric, changeCandidates, openingFor, changeText, isLldMockSlug, lldPhasePlan, mdPlain, parseLldCase, stepAnchor, type LldCase, type LldPhaseKey } from "./lld";
import { mockHref, type CourseMock, type MockInterview, type MockLevel, type MockLld, type MockMessage, type MockPerson, type MockCompany, type MockPhase } from "./types";

export const LLD_DIR = "resources/low-level-design";

/** Fictional interviewers and companies, one per case by its number (the system design mocks have their own). */
const CAST: { interviewer: MockPerson; company: MockCompany }[] = [
  {
    interviewer: { name: "Ananya Rao", title: "Staff engineer, platform", style: "Quiet and patient. Lets you drive, then asks what happens when two calls land at the same moment." },
    company: { name: "Kirana Cloud", tagline: "Stock, billing and payments for neighbourhood stores", location: "Bengaluru", about: "A fictional company. Its machine-coding round is 60–75 minutes, one problem, and working code at the end." },
  },
  {
    interviewer: { name: "Vikram Iyer", title: "Senior engineer, payments", style: "Brisk. Wants the scope pinned in five minutes and code that runs. Pushes on every edge case you skip." },
    company: { name: "Paisa Rail", tagline: "Payment rails for small businesses", location: "Mumbai", about: "A fictional company. The machine-coding round is scored on requirements, modelling, working code and extensibility." },
  },
  {
    interviewer: { name: "Meera Joshi", title: "Engineering manager, core services", style: "Friendly, curious about your reasons. Asks why a class exists and what changes when the business does." },
    company: { name: "Dabba Logistics", tagline: "Same-day delivery for a dozen cities", location: "Pune", about: "A fictional company. Its machine-coding round asks for a clean model first and running code second." },
  },
  {
    interviewer: { name: "Arjun Mehta", title: "Principal engineer", style: "Precise. Asks for the trade-off behind every pattern you name and checks your locking line by line." },
    company: { name: "Chai Stack", tagline: "Developer tools for Indian startups", location: "Hyderabad", about: "A fictional company. The machine-coding round is one problem, your language, working code." },
  },
  {
    interviewer: { name: "Farah Siddiqui", title: "Senior engineer, marketplace", style: "Practical. Cares that the demo proves the rules, and brings a product change halfway through." },
    company: { name: "Tiffin Tech", tagline: "Meal subscriptions and kitchen software", location: "Gurugram", about: "A fictional company. Expect a requirement change while you code: it's part of the round." },
  },
  {
    interviewer: { name: "Rohan Das", title: "Senior engineer, mobility", style: "Calm and methodical. Wants to hear the plan before the code and the race before the lock." },
    company: { name: "Gali Rides", tagline: "Rides and rentals for tier-2 cities", location: "Kochi", about: "A fictional company. The machine-coding round grades how small your change is when the requirements move." },
  },
];
const castFor = (n: number) => CAST[(Math.max(1, n) - 1) % CAST.length];

const LEVEL_FOR: Record<string, MockLevel> = { Medium: "sde", Hard: "sde", Expert: "senior" };

const LEVELS: Partial<Record<MockLevel, string>> = {
  junior: "A working core with sensible classes, but the scope was guessed, what varies isn't behind interfaces, and concurrency needed prompting.",
  sde: "Pins the scope in minutes, models the nouns with one job each, puts what changes behind interfaces, writes code that runs with a main, finds the race and puts one lock in the right place.",
  senior: "All of SDE, plus the trade-off behind every pattern said out loud, the requirement change absorbed as a small local edit, and a clear answer for higher throughput (finer locks, their order).",
  staff: "Shapes the problem: what to leave out and why, seams ready for the next two changes, and a precise account of the concurrency model and its failure cases.",
};

/** Lines the interviewer says per phase (at its start, on its clock, or when the candidate first presses Done). */
function scriptFor(key: LldPhaseKey, c: LldCase, minutes: number): { trigger: MockMessage["trigger"]; md: string }[] {
  const at = (share: number) => ({ kind: "at" as const, sec: Math.round(minutes * 60 * share) });
  switch (key) {
    case "clarify":
      return [
        { trigger: { kind: "start" }, md: `${c.opening || `${c.title}.`}\n\nAsk me anything before you model it.` },
        { trigger: at(0.6), md: "Before you draw a class: say back to me what's in scope and what's out." },
        { trigger: { kind: "submit" }, md: "Which of those answers changes your code the most?" },
      ];
    case "design":
      return [
        { trigger: { kind: "start" }, md: "Walk me through your entities: the nouns of the problem, each class's one job, and how they connect. Sketch the class diagram on the whiteboard if it helps." },
        { trigger: at(0.55), md: "Which behaviours will the business change after launch, and where do they sit in your diagram?" },
        { trigger: { kind: "submit" }, md: "Which class owns the state that two callers could change at once?" },
      ];
    case "patterns":
      return [
        { trigger: { kind: "start" }, md: "Name the patterns you're using, where they sit, and what each one costs you." },
        { trigger: { kind: "submit" }, md: "Which pattern did you consider and leave out, and why?" },
      ];
    case "code":
      return [
        { trigger: { kind: "start" }, md: "Let's code it. Build it bottom-up and finish with a small `main` that proves the rules. Keep time a parameter, not a clock read inside the class." },
        { trigger: at(0.25), md: "Talk me through what your `main` prints for its first two calls." },
        { trigger: { kind: "submit" }, md: "Which line of your code would you test first, and with what input?" },
      ];
    case "concurrency":
      return [
        { trigger: { kind: "start" }, md: "Now two callers hit this at the same moment. Where can they collide, and where does your lock go?" },
        { trigger: at(0.5), md: "List the edge cases you handle, out loud: bad input, duplicates, full, time." },
        { trigger: { kind: "submit" }, md: "If I push on throughput, what's your next step after one lock?" },
      ];
  }
}

function hintsFor(key: LldPhaseKey, c: LldCase): string[] {
  const step = (k: StepKey) => STEP_BY_KEY[k].ask;
  switch (key) {
    case "clarify":
      return [step("requirements"), c.qa[0] ? `A good first question here: "${c.qa[0].ask}"` : "Ask what varies: types, rules, how many callers at once."];
    case "design":
      return [step("entities"), step("diagram")];
    case "patterns":
      return [step("patterns"), "Look at what you said the business will change: each of those is a seam, and a seam has a name."];
    case "code":
      return [step("code"), "Order: enums and plain data first, then the interfaces and one implementation each, then the one class that changes state, then main."];
    case "concurrency":
      return [step("concurrency"), "Find every place your code reads something, decides, then writes: that gap is where two callers collide."];
  }
}

/** A requirements block for the AI: the table's asks and answers, then the agreed scope. */
function requirementsText(c: LldCase): string {
  const qa = c.qa.map((q) => `- Q: ${mdPlain(q.ask)}\n  A: ${mdPlain(q.answer)}`).join("\n");
  const scope = [c.inScope.length ? `In scope:\n${c.inScope.map((s) => `- ${mdPlain(s)}`).join("\n")}` : "", c.outScope.length ? `Out of scope (for now):\n${c.outScope.map((s) => `- ${mdPlain(s)}`).join("\n")}` : ""]
    .filter(Boolean)
    .join("\n");
  return [qa, scope].filter(Boolean).join("\n\n");
}

export async function buildLldMock(slug: string): Promise<MockInterview | null> {
  if (!isLldMockSlug(slug)) return null;
  const meta = caseBySlug(slug);
  if (!meta) return null;
  let md: string;
  try {
    md = await fetchMarkdownContent(`${LLD_DIR}/${slug}.md`);
  } catch {
    return null;
  }
  const plan = lldPhasePlan(meta.roundMinutes);
  const parsed = parseLldCase(md);
  if (!parsed.qa.length && !parsed.checklist.length) return null;
  const c = { ...parsed, opening: openingFor(parsed.opening, plan.minutes) };
  const rubric = buildLldRubric(c.checklist, plan.phases);
  const caseHref = `/low-level-design/${slug}`;
  const cast = castFor(meta.n);
  const code = `LLD-${String(meta.n).padStart(2, "0")}`;
  const codePhase = plan.phases.find((p) => p.key === "code")!;
  const designPhase = plan.phases.find((p) => p.key === "design")!;

  const pool = changeCandidates(c.followups);
  const changes: MockLld["changes"] = await Promise.all(
    pool.map(async (f) => {
      const k = c.followups.indexOf(f);
      const text = changeText(f);
      return { id: `${codePhase.id}.chg${k + 1}`, followup: k, trigger: { kind: "at" as const, sec: plan.changeAtSec }, html: await mdToHtml(text), text: plainText(text), title: "Requirement change" };
    }),
  );

  const answerMd: Record<LldPhaseKey, string> = {
    clarify: c.requirementsMd,
    design: c.classesMd,
    patterns: c.patternsMd,
    code: [c.codeMd, c.followupsMd ? `## The follow-ups the interviewer can bring\n\n${c.followupsMd}` : ""].filter(Boolean).join("\n\n"),
    concurrency: c.concurrencyMd,
  };

  const phases: MockPhase[] = await Promise.all(
    plan.phases.map(async (p) => {
      const lines = scriptFor(p.key, c, p.minutes);
      const prompts: MockMessage[] = await Promise.all(lines.map(async (l, i) => ({ id: `${p.id}.m${i + 1}`, trigger: l.trigger, html: await mdToHtml(l.md), text: plainText(l.md) })));
      return {
        id: p.id,
        n: p.n,
        title: p.title,
        minutes: p.minutes,
        prompts,
        // the code phase's change is set per attempt (withChange); the default keeps a built mock complete
        curveballs: p.key === "code" && changes[0] ? [changes[0]] : [],
        hints: await Promise.all(hintsFor(p.key, c).map(async (h) => ({ html: await mdToHtml(h), text: plainText(h) }))),
        answerHtml: answerMd[p.key] ? await renderBlockHtml(answerMd[p.key]) : "",
        rubric: await Promise.all(
          rubric
            .filter((s) => s.phase === p.key)
            .map(async (s) => {
              const anchor = stepAnchor(s);
              const step = Object.values(STEP_BY_KEY).find((x) => x.id === anchor);
              return {
                id: s.id,
                level: s.level,
                html: await mdToHtml(s.text),
                text: plainText(s.text),
                study: [{ code: `${code} · ${step ? `Step ${step.n}` : "Lesson"}`, title: `${meta.name}: ${step?.label ?? "the case study"}`, href: `${caseHref}#${anchor}` }],
              };
            }),
        ),
      };
    }),
  );

  const brief = `Hi! Your next round is a **machine-coding round** with ${cast.interviewer.name}: ${plan.minutes} minutes, one problem, working code at the end.

You'll clarify the requirements, model the classes, name your patterns and their trade-offs, write the code in the editor in the language you're most comfortable with, then talk through concurrency and edge cases. Expect the requirements to change once while you code: that's part of the round.

${cast.interviewer.name.split(" ")[0]} answers clarifying questions, so ask before you model. The reference design, the rubric (the case study's own interview checklist) and your scorecard wait for the debrief.`;
  const problem = [c.deck ? `*${c.deck}*` : "", c.mission ? `:::mission[${c.mission.title}]\n${c.mission.body}\n:::` : "", c.opening ? `**${cast.interviewer.name.split(" ")[0]}**: "${c.opening}"` : ""].filter(Boolean).join("\n\n");
  const designAi = [c.classNames.length ? `Classes in the reference design: ${c.classNames.join(", ")}.` : "", mdPlain(c.classesMd)].filter(Boolean).join("\n").slice(0, 3500);

  return {
    kind: "lld",
    lld: {
      caseSlug: slug,
      n: meta.n,
      name: meta.name,
      difficulty: meta.difficulty,
      caseHref,
      codePhase: codePhase.id,
      designPhase: designPhase.id,
      followups: c.followups,
      changes,
      defaultChange: changes[0]?.id ?? "",
      checklist: c.checklist,
      ai: {
        requirements: requirementsText(c).slice(0, 5000),
        design: designAi,
        patterns: mdPlain(c.patternsMd).slice(0, 2500),
        concurrency: mdPlain(c.concurrencyMd).slice(0, 3000),
      },
    },
    id: slug,
    slug,
    n: meta.n,
    code,
    title: c.title || `Design ${meta.name}`,
    heading: c.title,
    after: "",
    afterCode: "LLD",
    covers: [],
    coversLabel: "Low-level design",
    level: LEVEL_FOR[meta.difficulty] ?? "sde",
    badge: `${code} machine-coding round cleared`,
    company: cast.company,
    role: "Software engineer · machine coding",
    interviewer: cast.interviewer,
    minutes: plan.minutes,
    briefHtml: await renderBlockHtml(brief),
    problemHtml: await renderBlockHtml(problem),
    problemText: [c.title, c.opening, c.mission ? mdPlain(c.mission.body) : ""].filter(Boolean).join("\n\n"),
    phases,
    levels: LEVELS,
    closing: "Thanks, that's time. Let's go through your code together.",
    version: createHash("sha1").update(`lld-mock-v1\n${md}`).digest("hex").slice(0, 12),
    href: mockHref(slug),
  };
}

/** The machine-coding mocks for the /mock lobby's LLD tab: one per case study in the catalogue, from metadata only. */
export function lldCourseMocks(rows: { slug: string; n: number; name: string; difficulty: string; roundMinutes: number; blurb: string; title: string }[]): (CourseMock & { name: string; blurb: string; difficulty: string })[] {
  return rows.map((r) => {
    const cast = castFor(r.n);
    const plan = lldPhasePlan(r.roundMinutes);
    const code = `LLD-${String(r.n).padStart(2, "0")}`;
    return {
      id: r.slug,
      slug: r.slug,
      n: r.n,
      code: `L${r.n}`,
      title: r.title,
      company: cast.company.name,
      interviewer: cast.interviewer.name,
      role: "Software engineer · machine coding",
      after: "lld",
      afterCode: "LLD",
      coversLabel: "Low-level design",
      level: LEVEL_FOR[r.difficulty] ?? "sde",
      badge: `${code} machine-coding round cleared`,
      minutes: plan.minutes,
      phases: plan.phases.length,
      curveballs: 1,
      signals: 0,
      href: mockHref(r.slug),
      name: r.name,
      blurb: r.blurb,
      difficulty: r.difficulty,
    };
  });
}
