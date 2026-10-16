/**
 * The "New case file" template + the editor's insert snippets. Client-safe.
 *
 * The template mirrors the shape every case file on the site follows (see content/stories, Tatkal is
 * the reference): a hook that opens on one person at one moment, the numbers, the anatomy of the
 * system, the crisis minute by minute, the core insight, the fix as a diagram, the war stories, the
 * lessons, a summary that lands the opening, sources. `{{…}}` marks text to replace (the validator
 * blocks publishing while any is left); `<!-- guide: … -->` comments are writing notes that never render.
 */
import type { CaseActivityData } from "@/components/stories/activities/data";
import type { CaseFileFields } from "./types";
import { EMPTY_FIELDS } from "./types";

export const TEMPLATE_BODY = `## Understanding the Problem: {{The moment it all starts, in one line}}

<!-- guide: Open on ONE person at ONE moment (Ananya at 9:59 AM, the on-call engineer at 2 AM). Concrete names, times, stakes. No definitions yet. 3-5 short paragraphs. -->

{{Who is this, where are they, what are they trying to do, and what is about to go wrong? Make the reader feel the clock.}}

{{Zoom out: how many other people / requests / dollars are in the same situation at the same second?}}

:::stats[The numbers that make this hard]
- **{{2,000,000}}** — {{people trying at once}}
- **{{500}}** — {{seats, slots or rows they all want}}
- **{{10 s}}** — {{how long the window lasts}}
- **{{99.9%}}** — {{who must be told "no", instantly}}
:::

{{One paragraph that promises the story: what system stands in the way, and what it learned the hard way.}}

![{{Alt text: describe what the blueprint shows, with its labels and numbers}}]({{/case-files/your-image.png}})

---

## The Anatomy of {{the system}}

<!-- guide: Explain the system as it is on a normal day before it breaks. Plain words first, then one diagram. Keep paragraphs under ~120 words. -->

{{How does this work when nothing is on fire? Who calls whom, what is stored where, what is the normal load?}}

\`\`\`mermaid
%% title: {{How it works on a normal day}}
flowchart TD
  U(["{{Users / clients}}"]):::client --> E["{{Load balancer / gateway}}"]:::edge
  E --> C["{{The service this story is about}}"]:::core
  C --> D[("{{Primary database}}")]:::store
  C -.->|"{{async}}"| Q[["{{Queue / stream}}"]]:::queue
\`\`\`

| | {{Normal day}} | {{Peak / incident}} |
|---|---|---|
| {{Requests per second}} | {{~2,000}} | {{~400,000}} |
| {{p99 latency}} | {{40 ms}} | {{12 s}} |

---

## Crisis Scenario: {{The minutes that decide everything}}

<!-- guide: Slow time down. A timeline of what happened, then what the people involved saw on their screens. Real numbers only; say where they come from. -->

:::timeline[{{The day it broke, in IST}}]
- **{{09:59:58}}** — {{everything looks normal}}
- **{{10:00:00}}** — {{the trigger}}
- **{{10:00:05}}** — {{the first symptom}}
- **{{10:04:00}}** — {{someone notices}}
:::

{{What did it feel like from the user's side? From the on-call engineer's side?}}

:::callout[{{The counter-intuitive part}}]{type="key"}
{{One sentence the reader will remember: what this problem is NOT about, and what it really is.}}
:::

---

## Why This Is Harder Than It Looks: {{the core insight}}

<!-- guide: An everyday analogy first (the bouncer, the microphone), then the engineering name for it. One diagram that shows the insight. -->

{{The analogy, in plain words.}}

{{Now the real name for it, and why the obvious fix makes it worse.}}

::::compare[{{The obvious fix vs. what actually works}}]
:::col[{{The obvious fix}}]{tone="bad"}
- {{What most teams try first}}
- {{Why it falls over at scale}}
:::
:::col[{{What actually works}}]{tone="ok"}
- {{The idea that fixes it}}
- {{What it costs}}
:::
::::

---

## The Fix: {{the architecture that survives it}}

<!-- guide: The design, step by step. One diagram of the whole thing, then the pieces. Name every component in the diagram the same way as in the text. -->

{{How the fixed system works, end to end.}}

\`\`\`mermaid
%% title: {{The architecture that survives the rush}}
flowchart TD
  U(["{{Users}}"]):::client --> W["{{Front door: waiting room / rate limiter}}"]:::edge
  W --> G{"{{Admission check}}"}:::hot
  G -->|"{{yes}}"| S["{{Core service}}"]:::core
  G -->|"{{no · instantly}}"| N(["{{Told no, honestly}}"]):::bad
  S --> D[("{{Database}}")]:::store
  S --> K[["{{Queue}}"]]:::queue
  K --> P["{{Worker}}"]:::service
  P -.->|"{{webhook}}"| X["{{Third party}}"]:::external
\`\`\`

:::steps[{{What happens to one request}}]
1. **{{Step one}}** — {{what it does}}
2. **{{Step two}}** — {{what it does}}
3. **{{Step three}}** — {{what it does}}
:::

:::calc[{{Back of the envelope}}]
- {{Peak writes}}: {{2M users × 1 attempt}} = **{{2M requests in 10 s}}**
- {{Per second}}: {{2M ÷ 10}} = **{{200,000 req/s}}**
- {{Admitted}}: {{500 seats × 1}} = **{{500 writes}}**
:::

---

## When It All Goes Wrong: Real War Stories

<!-- guide: Real incidents with dates and sources (postmortems, news, status pages). What broke, and the one lesson each teaches. -->

**{{Month Year}}**, {{what happened, in two or three sentences, with a link to the source}}.

**{{Month Year}}**, {{the second story}}.

{{The pattern behind both.}}

---

## Lessons for Any Engineer

<!-- guide: 4-6 bullets that apply beyond this system. Bold the lesson, then one sentence of why. -->

- **{{Lesson one.}}** {{Why it matters outside this story.}}
- **{{Lesson two.}}** {{Why.}}
- **{{Lesson three.}}** {{Why.}}
- **{{Lesson four.}}** {{Why.}}

---

## Summary: {{The line that lands the opening}}

<!-- guide: Come back to the person from the opening. What happened to them? End on the system quietly doing its job. -->

{{Back to the opening moment: how it ends for them.}}

{{The one idea to take away.}}

:::panel[Sources]{tone="note"}
- [{{Source title}}]({{https://example.com/postmortem}})
- [{{Source title}}]({{https://example.com/numbers}})
:::

---

*{{A closing question to the reader, in italics.}}*
`;

export const TEMPLATE_ACTIVITY: CaseActivityData = {
  kind: "quiz",
  title: "",
  blurb: "",
  minutes: 2,
  steps: [
    { id: "call", type: "choice", label: "Make the call", prompt: "", options: ["", "", "", ""], answer: 0, explain: "" },
    {
      id: "order",
      type: "order",
      label: "The response, in order",
      prompt: "Put the response in order.",
      items: [
        { id: "detect", text: "" },
        { id: "contain", text: "" },
        { id: "fix", text: "" },
        { id: "prevent", text: "" },
      ],
    },
  ],
};

export function newCaseFileFields(blank = false): CaseFileFields {
  return {
    ...EMPTY_FIELDS,
    date: new Date().toISOString().slice(0, 10),
    bodyMd: blank ? "## Understanding the Problem: \n\n" : TEMPLATE_BODY,
    debrief: { question: "", options: ["", "", "", ""], answer: 0, explain: "" },
    activity: blank ? null : JSON.parse(JSON.stringify(TEMPLATE_ACTIVITY)),
  };
}

/* ─────────────────────────────── editor snippets ─────────────────────────────── */

export type Snippet = { id: string; label: string; group: "text" | "blocks" | "diagram" | "media"; text: string; hint?: string; block?: boolean };

export const SNIPPETS: Snippet[] = [
  { id: "h2", label: "Chapter", group: "text", block: true, text: "## {{Chapter title}}: {{the subtitle}}\n\n{{Text}}\n", hint: "## heading = a checkpoint" },
  { id: "h4", label: "Sub-head", group: "text", block: true, text: "#### {{Sub-heading}}\n" },
  { id: "hr", label: "Divider", group: "text", block: true, text: "---\n" },
  { id: "table", label: "Table", group: "text", block: true, text: "| | {{Column A}} | {{Column B}} |\n|---|---|---|\n| {{Row}} | {{a}} | {{b}} |\n" },
  { id: "code", label: "Code", group: "text", block: true, text: "```python\n{{code}}\n```\n" },
  { id: "panel", label: "Panel", group: "blocks", block: true, text: ':::panel[{{Title}}]{tone="core"}\n#### {{Sub-heading}}\n- **{{Item}}** — {{note}}\n:::\n', hint: "tone: core · info · ok · bad · warn · note" },
  {
    id: "compare",
    label: "Compare",
    group: "blocks",
    block: true,
    text: '::::compare[{{Title}}]\n:::col[{{Wrong}}]{tone="bad"}\n- {{point}}\n:::\n:::col[{{Right}}]{tone="ok"}\n- {{point}}\n:::\n::::\n',
    hint: "2–4 columns; outer fence has 4 colons",
  },
  { id: "steps", label: "Steps", group: "blocks", block: true, text: ":::steps[{{Title}}]\n1. **{{First}}** — {{what happens}}\n2. **{{Second}}** — {{what happens}}\n3. **{{Third}}** — {{what happens}}\n:::\n", hint: 'one numbered list; {dir="right"} for ≤5 short steps' },
  { id: "tree", label: "Tree", group: "blocks", block: true, text: ":::tree[{{Title}}]\n- `{{root}}` — {{note}}\n  - `{{child}}` — {{note}}\n:::\n" },
  { id: "callout", label: "Callout", group: "blocks", block: true, text: ':::callout[{{Rule of thumb}}]{type="tip"}\n{{One highlighted point.}}\n:::\n', hint: "type: tip · key · warn · bad · ok · info" },
  { id: "stats", label: "Stats", group: "blocks", block: true, text: ":::stats[{{Scale at peak}}]\n- **{{10K QPS}}** — {{label}}\n- **{{2M}}** — {{label}}\n- **{{p99 < 50 ms}}** — {{label}}\n:::\n", hint: "3–8 bold figures" },
  { id: "calc", label: "Calc", group: "blocks", block: true, text: ":::calc[{{Estimate}}]\n- {{Label}}: {{a × b}} = **{{result}}**\n- {{Label}}: {{c ÷ d}} = **{{answer}}**\n:::\n", hint: "last bold result is the answer" },
  { id: "timeline", label: "Timeline", group: "blocks", block: true, text: ":::timeline[{{When}}]\n- **{{09:59}}** — {{event}}\n- **{{10:00}}** — {{event}}\n:::\n" },
  {
    id: "flowchart",
    label: "Flowchart",
    group: "diagram",
    block: true,
    text: '```mermaid\n%% title: {{Diagram title}}\nflowchart TD\n  A(["{{Users}}"]):::client --> B["{{Gateway}}"]:::edge\n  B --> C["{{Service}}"]:::core\n  C --> D[("{{Database}}")]:::store\n```\n',
    hint: "classes: core hot client edge service store cache queue external ok bad note",
  },
  {
    id: "sequence",
    label: "Sequence",
    group: "diagram",
    block: true,
    text: "```mermaid\n%% title: {{Diagram title}}\nsequenceDiagram\n  autonumber\n  participant C as {{Client}}\n  participant S as {{Service}}\n  C->>S: {{request}}\n  S-->>C: {{response}}\n```\n",
  },
  {
    id: "state",
    label: "State",
    group: "diagram",
    block: true,
    text: "```mermaid\n%% title: {{Diagram title}}\nstateDiagram-v2\n  A: {{State A}}\n  B: {{State B}}\n  [*] --> A\n  A --> B: {{event}}\n  B --> [*]\n  class A core\n  class B ok\n```\n",
  },
  { id: "sources", label: "Sources", group: "text", block: true, text: ':::panel[Sources]{tone="note"}\n- [{{Source title}}]({{https://…}})\n:::\n' },
];
