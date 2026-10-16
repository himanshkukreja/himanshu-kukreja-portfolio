/**
 * Data-driven end-of-file activities: the JSON shape a CMS case file stores (case_files.activity) and
 * renders through <DataActivity/> with the same ActivityShell + kit steps as the hand-written TSX
 * activities. Client-safe (no server imports); the admin builder and the validator use it too.
 */

export type DataChoiceStep = {
  id: string;
  type: "choice";
  label: string;
  prompt: string;
  sub?: string;
  options: string[];
  /** index into options */
  answer: number;
  explain: string;
  /** optional feedback per option ("decide" scenarios: what happens if you pick it) */
  outcomes?: string[];
};

export type DataOrderStep = {
  id: string;
  type: "order";
  label: string;
  prompt: string;
  sub?: string;
  /** authored in the CORRECT order; the reader gets a deterministic shuffle */
  items: { id: string; text: string; note?: string }[];
  /** shown after the reader checks their order */
  explain?: string;
};

export type DataSpotStep = {
  id: string;
  type: "spot";
  label: string;
  prompt: string;
  sub?: string;
  /** file name shown in the code card header */
  file: string;
  lines: { code: string; faulty?: boolean; note?: string }[];
  /** shown after the reader checks their flags */
  explain?: string;
};

export type DataDecideStep = {
  id: string;
  type: "decide";
  label: string;
  prompt: string;
  sub?: string;
  buckets: { id: string; label: string; hint?: string }[];
  items: { label: string; text: string; bucket: string; explain: string }[];
};

export type DataStep = DataChoiceStep | DataOrderStep | DataSpotStep | DataDecideStep;
export type DataStepType = DataStep["type"];

export type CaseActivityData = {
  /** Format chip: "quiz", "timeline", "spot the bug", "decide", "drill"… */
  kind: string;
  title: string;
  blurb: string;
  minutes: number;
  steps: DataStep[];
};

export const STEP_TYPES: { id: DataStepType; label: string; hint: string }[] = [
  { id: "choice", label: "Question", hint: "multiple choice, one right answer" },
  { id: "order", label: "Order the timeline", hint: "put the steps in order" },
  { id: "spot", label: "Spot the bug", hint: "flag the faulty lines" },
  { id: "decide", label: "Decide", hint: "sort scenarios into buckets" },
];

export const ACTIVITY_KINDS = ["quiz", "timeline", "spot the bug", "decide", "drill", "simulation"] as const;

/** Points a step is worth (same rules as the kit components score by). */
export function stepMax(s: DataStep): number {
  switch (s.type) {
    case "choice":
      return 1;
    case "order":
      return s.items.length;
    case "spot":
      return s.lines.filter((l) => l.faulty).length;
    case "decide":
      return s.items.length;
  }
}

const str = (v: unknown, max = 2000) => (typeof v === "string" ? v.slice(0, max) : "");
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const rec = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** Coerce stored/posted JSON into a CaseActivityData (null when there is nothing usable). Never throws. */
export function parseActivityData(raw: unknown): CaseActivityData | null {
  const r = rec(raw);
  const steps: DataStep[] = [];
  arr(r.steps)
    .slice(0, 12)
    .forEach((x, i) => {
      const s = rec(x);
      const id = str(s.id, 60) || `step-${i + 1}`;
      const base = { id, label: str(s.label, 80), prompt: str(s.prompt, 600), sub: str(s.sub, 400) || undefined };
      if (s.type === "choice") {
        const options = arr(s.options).map((o) => str(o, 400)).slice(0, 6);
        const answer = Number(s.answer);
        const outcomes = Array.isArray(s.outcomes) ? arr(s.outcomes).map((o) => str(o, 800)).slice(0, options.length) : undefined;
        steps.push({ ...base, type: "choice", options, answer: Number.isInteger(answer) ? answer : 0, explain: str(s.explain, 1200), ...(outcomes && outcomes.some(Boolean) ? { outcomes } : {}) });
      } else if (s.type === "order") {
        const items = arr(s.items)
          .slice(0, 10)
          .map((y, k) => {
            const it = rec(y);
            return { id: str(it.id, 60) || `i${k + 1}`, text: str(it.text, 300), note: str(it.note, 200) || undefined };
          });
        steps.push({ ...base, type: "order", items, ...(str(s.explain, 1200) ? { explain: str(s.explain, 1200) } : {}) });
      } else if (s.type === "spot") {
        const lines = arr(s.lines)
          .slice(0, 40)
          .map((y) => {
            const l = rec(y);
            return { code: str(l.code, 300), faulty: l.faulty === true || undefined, note: str(l.note, 300) || undefined };
          });
        steps.push({ ...base, type: "spot", file: str(s.file, 80) || "snippet", lines, ...(str(s.explain, 1200) ? { explain: str(s.explain, 1200) } : {}) });
      } else if (s.type === "decide") {
        const buckets = arr(s.buckets)
          .slice(0, 4)
          .map((y, k) => {
            const b = rec(y);
            return { id: str(b.id, 40) || `b${k + 1}`, label: str(b.label, 60), hint: str(b.hint, 80) || undefined };
          });
        const items = arr(s.items)
          .slice(0, 10)
          .map((y, k) => {
            const it = rec(y);
            return { label: str(it.label, 40) || `item-${k + 1}`, text: str(it.text, 300), bucket: str(it.bucket, 40), explain: str(it.explain, 800) };
          });
        steps.push({ ...base, type: "decide", buckets, items });
      }
    });
  const title = str(r.title, 120);
  if (!steps.length && !title) return null;
  const minutes = Number(r.minutes);
  return {
    kind: str(r.kind, 30) || "quiz",
    title,
    blurb: str(r.blurb, 600),
    minutes: Number.isFinite(minutes) && minutes > 0 ? Math.min(30, Math.round(minutes)) : 2,
    steps,
  };
}

export type ActivityIssue = { level: "error" | "warning"; step?: number; message: string };

/** Authoring rules for a data activity (the validator blocks publish on errors). */
export function checkActivity(a: CaseActivityData): ActivityIssue[] {
  const out: ActivityIssue[] = [];
  const err = (message: string, step?: number) => out.push({ level: "error", step, message });
  const warn = (message: string, step?: number) => out.push({ level: "warning", step, message });
  if (!a.title.trim()) err("Activity needs a title.");
  if (!a.blurb.trim()) err("Activity needs a one-line blurb (shown before the reader starts).");
  if (!a.steps.length) err("Activity has no steps.");
  if (a.steps.length > 8) warn("More than 8 steps: the existing activities use 3 to 5.");
  const ids = new Set<string>();
  a.steps.forEach((s, i) => {
    const n = i + 1;
    if (ids.has(s.id)) err(`Step ${n}: duplicate id "${s.id}".`, n);
    ids.add(s.id);
    if (!s.label.trim()) err(`Step ${n}: needs a short label for the progress rail.`, n);
    if (!s.prompt.trim()) err(`Step ${n}: needs a prompt.`, n);
    if (s.type === "choice") {
      const opts = s.options.filter((o) => o.trim());
      if (opts.length < 2 || opts.length !== s.options.length) err(`Step ${n}: every option needs text, and at least 2 options.`, n);
      const filled = s.options.map((o) => o.trim().toLowerCase()).filter(Boolean);
      if (new Set(filled).size !== filled.length) err(`Step ${n}: two options are identical.`, n);
      if (!(s.answer >= 0 && s.answer < s.options.length)) err(`Step ${n}: pick the right answer.`, n);
      if (!s.explain.trim() && !s.outcomes?.[s.answer]?.trim()) err(`Step ${n}: explain why the answer is right (readers see it after answering).`, n);
      if (s.outcomes && s.outcomes.length !== s.options.length) warn(`Step ${n}: ${s.outcomes.length} outcomes for ${s.options.length} options.`, n);
    } else if (s.type === "order") {
      if (s.items.length < 3) err(`Step ${n}: an order step needs at least 3 items.`, n);
      if (s.items.some((it) => !it.text.trim())) err(`Step ${n}: every item needs text.`, n);
      if (new Set(s.items.map((it) => it.id)).size !== s.items.length) err(`Step ${n}: item ids must be unique.`, n);
    } else if (s.type === "spot") {
      if (s.lines.length < 4) err(`Step ${n}: a spot-the-bug snippet needs at least 4 lines.`, n);
      const faulty = s.lines.filter((l) => l.faulty);
      if (!faulty.length) err(`Step ${n}: mark at least one faulty line.`, n);
      if (faulty.length > s.lines.length / 2) warn(`Step ${n}: more than half the lines are faulty, so "flag everything" scores well.`, n);
      if (!s.explain?.trim() && faulty.some((l) => !l.note?.trim())) warn(`Step ${n}: add a note to each faulty line (shown after checking).`, n);
    } else if (s.type === "decide") {
      if (s.buckets.length < 2) err(`Step ${n}: needs at least 2 buckets.`, n);
      if (s.buckets.some((b) => !b.label.trim())) err(`Step ${n}: every bucket needs a label.`, n);
      if (s.items.length < 3) err(`Step ${n}: needs at least 3 scenarios.`, n);
      const bucketIds = new Set(s.buckets.map((b) => b.id));
      s.items.forEach((it, k) => {
        if (!it.text.trim()) err(`Step ${n}, scenario ${k + 1}: needs text.`, n);
        if (!bucketIds.has(it.bucket)) err(`Step ${n}, scenario ${k + 1}: pick its bucket.`, n);
        if (!it.explain.trim()) warn(`Step ${n}, scenario ${k + 1}: add an explanation.`, n);
      });
      const used = new Set(s.items.map((it) => it.bucket));
      if (s.items.length >= 3 && used.size < 2) warn(`Step ${n}: every scenario is in the same bucket, so "always pick it" wins.`, n);
      if (new Set(s.items.map((it) => it.label)).size !== s.items.length) err(`Step ${n}: scenario labels must be unique.`, n);
    }
  });
  const choices = a.steps.filter((s): s is DataChoiceStep => s.type === "choice");
  const max = a.steps.reduce((t, s) => t + stepMax(s), 0);
  if (a.steps.length && max < 3) warn("The whole activity is worth fewer than 3 points: one lucky guess solves it.");
  if (choices.length >= 3 && choices.every((c) => c.options.length === 2)) warn("Every question has 2 options: guessing passes too often. Add a third option.");
  return out;
}

export function blankStep(type: DataStepType, n: number): DataStep {
  const id = `step-${n}-${Math.random().toString(36).slice(2, 6)}`;
  switch (type) {
    case "choice":
      return { id, type, label: "Make the call", prompt: "", options: ["", "", ""], answer: 0, explain: "" };
    case "order":
      return { id, type, label: "Put it in order", prompt: "Put these steps in order.", items: [1, 2, 3, 4].map((k) => ({ id: `i${k}`, text: "" })) };
    case "spot":
      return { id, type, label: "Spot the bug", prompt: "Which lines cause the incident?", file: "config.yaml", lines: [1, 2, 3, 4, 5].map(() => ({ code: "" })) };
    case "decide":
      return {
        id,
        type,
        label: "Decide",
        prompt: "",
        buckets: [
          { id: "a", label: "" },
          { id: "b", label: "" },
        ],
        items: [1, 2, 3].map((k) => ({ label: `s${k}`, text: "", bucket: "a", explain: "" })),
      };
  }
}

/* ─────────────────────────────── neutral bundle format ─────────────────────────────── */

/**
 * The writers' neutral activity.json ({ kind: quiz|timeline|spot|decide, title, blurb, minutes,
 * steps }) → CaseActivityData. quiz {question, options[], correct, explanation} and decide
 * {situation, options[{label, outcome, good}]} become choice steps (decide keeps one outcome per
 * option), timeline {items[] in order, prompt, explanation} an order step, spot {lines[], bad[],
 * language, explanation} a spot-the-bug step. Pure, no imports (scripts/case-files runs it in Node).
 */
export function fromNeutralActivity(raw: unknown): CaseActivityData | null {
  const r = rec(raw);
  const kind = str(r.kind, 20);
  const KIND: Record<string, string> = { quiz: "quiz", timeline: "timeline", spot: "spot the bug", decide: "decide" };
  const steps: unknown[] = arr(r.steps).map((x, i) => {
    const s = rec(x);
    const id = str(s.id, 60) || `step-${i + 1}`;
    const t = str(s.type, 20) || str(s.kind, 20) || kind;
    const label = str(s.label, 80);
    if (t === "decide" || (Array.isArray(s.options) && s.options.some((o) => o && typeof o === "object"))) {
      const opts = arr(s.options).map(rec);
      const good = opts.findIndex((o) => o.good === true);
      return {
        id,
        type: "choice",
        label: label || `Call ${i + 1}`,
        prompt: str(s.situation, 600) || str(s.prompt, 600) || str(s.question, 600),
        options: opts.map((o) => str(o.label, 400)),
        answer: good >= 0 ? good : 0,
        explain: good >= 0 ? str(opts[good].outcome, 1200) : str(s.explanation, 1200),
        outcomes: opts.map((o) => str(o.outcome, 800)),
      };
    }
    if (t === "quiz" || Array.isArray(s.options)) {
      return {
        id,
        type: "choice",
        label: label || `Question ${i + 1}`,
        prompt: str(s.question, 600) || str(s.prompt, 600),
        options: arr(s.options).map((o) => str(o, 400)),
        answer: Number(s.correct ?? s.answer) || 0,
        explain: str(s.explanation, 1200) || str(s.explain, 1200),
      };
    }
    if (t === "timeline" || t === "order") {
      return {
        id,
        type: "order",
        label: label || `Order ${i + 1}`,
        prompt: str(s.prompt, 600) || "Put these in order.",
        items: arr(s.items).map((it, k) => (typeof it === "string" ? { id: `i${k + 1}`, text: it } : { id: str(rec(it).id, 60) || `i${k + 1}`, text: str(rec(it).text, 300), note: str(rec(it).note, 200) || undefined })),
        explain: str(s.explanation, 1200) || str(s.explain, 1200) || undefined,
      };
    }
    // spot
    const bad = new Set(arr(s.bad).map((b) => Number(b)));
    const lang = str(s.language, 20);
    return {
      id,
      type: "spot",
      label: label || `Spot ${i + 1}`,
      prompt: str(s.prompt, 600) || "Which lines are wrong?",
      file: str(s.file, 80) || (lang ? `snippet.${lang === "python" ? "py" : lang === "javascript" ? "js" : lang === "typescript" ? "ts" : lang}` : "snippet"),
      lines: arr(s.lines).map((l, k) => (typeof l === "string" ? { code: l, faulty: bad.has(k) || undefined } : { code: str(rec(l).code, 300), faulty: rec(l).faulty === true || bad.has(k) || undefined, note: str(rec(l).note, 300) || undefined })),
      explain: str(s.explanation, 1200) || str(s.explain, 1200) || undefined,
    };
  });
  return parseActivityData({ kind: KIND[kind] || kind || "quiz", title: r.title, blurb: r.blurb, minutes: r.minutes, steps });
}
