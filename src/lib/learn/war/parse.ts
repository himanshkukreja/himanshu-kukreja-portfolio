/**
 * War stories files (resources/war-stories/{stories,war-room}/<slug>.md, format in that folder's
 * README) → front matter + the war-room script as beats. Pure: no Next or "@/" imports, so the Node
 * checker (scripts/check-war-stories.mjs) can run it. Markdown bodies (story text, postmortem, the real
 * incident) are returned raw for the course renderer; script text gets inline markdown only.
 */
import matter from "gray-matter";
import type { Beat, CastMember, DecisionOption, Reply, StorySource, StoryTheme } from "./types";
import { STORY_THEMES } from "./types";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** `code`, **bold**, *em* on escaped text. */
export function inlineMd(s: string): string {
  const parts = s.split(/(`[^`]+`)/g);
  return parts
    .map((p) =>
      p.startsWith("`") && p.endsWith("`") && p.length > 1
        ? `<code>${esc(p.slice(1, -1))}</code>`
        : esc(p)
            .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
            .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>"),
    )
    .join("");
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");
const words = (md: string) => md.replace(/```[\s\S]*?```/g, "").split(/\s+/).filter(Boolean).length;

export type StoryFile = {
  slug: string;
  title: string;
  hook: string;
  company: string;
  when: string;
  theme: StoryTheme;
  lesson: string | null;
  sources: StorySource[];
  minutes: number;
  body: string;
};

export function parseStory(raw: string, file: string): { story: StoryFile | null; errors: string[] } {
  const errors: string[] = [];
  const slug = file.replace(/\.md$/, "");
  const { data, content } = matter(raw);
  const title = str(data.title);
  const hook = str(data.hook);
  const theme = str(data.theme) as StoryTheme;
  if (!title) errors.push("missing title");
  if (!hook) errors.push("missing hook");
  else if (hook.length > 160) errors.push(`hook is ${hook.length} characters (max ~140)`);
  if (!STORY_THEMES.includes(theme)) errors.push(`theme "${theme}" is not one of ${STORY_THEMES.join(", ")}`);
  const sources: StorySource[] = (Array.isArray(data.sources) ? data.sources : [])
    .map((s: unknown) => (s && typeof s === "object" ? { label: str((s as Record<string, unknown>).label), url: str((s as Record<string, unknown>).url) } : { label: "", url: "" }))
    .filter((s: StorySource) => s.label || s.url);
  if (!sources.length) errors.push("needs at least one source");
  for (const s of sources) if (!/^https?:\/\/\S+$/.test(s.url) || !s.label) errors.push(`bad source: ${s.label || "(no label)"} ${s.url || "(no url)"}`);
  const body = content.trim();
  const n = words(body);
  if (n < 80) errors.push(`body is only ${n} words`);
  if (errors.length) return { story: null, errors };
  return {
    story: {
      slug,
      title,
      hook,
      company: str(data.company),
      when: str(data.when),
      theme,
      lesson: str(data.lesson) || null,
      sources,
      minutes: Math.max(1, Math.round(n / 200)),
      body,
    },
    errors,
  };
}

export type WarRoomSource = {
  slug: string;
  title: string;
  sev: string;
  company: string;
  product: string;
  starts: string;
  minutes: number;
  basedOn: string;
  basedOnUrl: string;
  lesson: string | null;
  cast: CastMember[];
  beats: Beat[];
  postmortem: string;
  real: string;
};

const SYSTEM_SPEAKERS = new Set(["pager", "status", "note"]);
const AT = /^@(\d{1,2}:\d{2})\s+(\S+)(?:\s+(.*))?$/;
const OPTION = /^-\s+\[( |x|X)\]\s+(.+)$/;
const REPLY = /^\s*>\s*(.+)$/;

/** "Kabir: text" / "Dev (DB): text" → speaker label + text; unknown shape → the narrator. */
function reply(line: string): Reply {
  const m = line.match(/^([^:]{1,40}):\s+(.+)$/);
  return m ? { who: m[1].trim(), html: inlineMd(m[2].trim()) } : { who: "", html: inlineMd(line.trim()) };
}

export function parseWarRoom(raw: string, file: string): { room: WarRoomSource | null; errors: string[] } {
  const errors: string[] = [];
  const slug = file.replace(/\.md$/, "");
  const { data, content } = matter(raw);
  const title = str(data.title);
  if (!title) errors.push("missing title");
  const basedOn = str(data.based_on);
  const basedOnUrl = str(data.based_on_url);
  if (!basedOn || !/^https?:\/\//.test(basedOnUrl)) errors.push("needs based_on and a based_on_url (the real postmortem)");
  const cast: CastMember[] = (Array.isArray(data.cast) ? data.cast : []).map((c: Record<string, unknown>) => ({ id: str(c?.id), name: str(c?.name), role: str(c?.role) }));
  if (!cast.some((c) => c.id === "you")) errors.push('cast needs an entry with id "you"');
  const ids = new Set(cast.map((c) => c.id));

  const pmAt = content.search(/^## Postmortem\s*$/m);
  const realAt = content.search(/^## The real incident\s*$/m);
  if (pmAt < 0) errors.push('missing "## Postmortem"');
  if (realAt < 0) errors.push('missing "## The real incident"');
  const script = pmAt >= 0 ? content.slice(0, pmAt) : content;
  const postmortem = pmAt >= 0 ? content.slice(pmAt, realAt > pmAt ? realAt : undefined).replace(/^## Postmortem\s*\n/, "") : "";
  const real = realAt >= 0 ? content.slice(realAt).replace(/^## The real incident\s*\n/, "") : "";

  const beats: Beat[] = [];
  const lines = script.split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    const at = line.match(AT);
    if (at) {
      const [, time, who, rest = ""] = at;
      const block: string[] = [];
      i++;
      while (i < lines.length && lines[i].trim() && !AT.test(lines[i]) && !lines[i].startsWith("? ")) block.push(lines[i++]);
      if (who === "chart") {
        const points = (block[0] || "").split(",").map((x) => Number(x.trim()));
        if (points.length < 2 || points.some((x) => !Number.isFinite(x))) errors.push(`@${time} chart: the line after it must be comma-separated numbers`);
        beats.push({ kind: "chart", at: time, title: rest.trim() || "Chart", points: points.filter((x) => Number.isFinite(x)) });
      } else if (who === "log") {
        if (!block.length) errors.push(`@${time} log: no lines`);
        beats.push({ kind: "log", at: time, title: rest.trim() || "Log", lines: block });
      } else {
        if (!SYSTEM_SPEAKERS.has(who) && !ids.has(who)) errors.push(`@${time} unknown speaker "${who}" (not in cast)`);
        const text = [rest, ...block].filter((x) => x.trim()).join("\n");
        if (!text.trim()) errors.push(`@${time} ${who}: empty message`);
        beats.push({ kind: "msg", at: time, who, html: text.split("\n").map((t) => inlineMd(t.trim())).join("<br/>") });
      }
      continue;
    }
    if (line.startsWith("? ")) {
      const question = line.slice(2).trim();
      const options: DecisionOption[] = [];
      i++;
      while (i < lines.length && !AT.test(lines[i]) && !lines[i].startsWith("? ")) {
        const l = lines[i++];
        const o = l.match(OPTION);
        if (o) {
          const [label, ...meta] = o[2].split("|").map((x) => x.trim());
          let minutes = 0;
          let users = 0;
          for (const m of meta) {
            const mm = m.match(/^\+?\s*([\d,]+)\s*min/i);
            const uu = m.match(/^\+?\s*([\d,]+)\s*users?/i);
            if (mm) minutes = Number(mm[1].replace(/,/g, ""));
            else if (uu) users = Number(uu[1].replace(/,/g, ""));
            else errors.push(`"${question}": unknown option tag "${m}" (use "+N min" or "+N users")`);
          }
          options.push({ html: inlineMd(label), best: o[1].toLowerCase() === "x", minutes, users, replies: [] });
          continue;
        }
        const r = l.match(REPLY);
        if (r && options.length) options[options.length - 1].replies.push(reply(r[1]));
      }
      const best = options.filter((o) => o.best).length;
      if (options.length < 2 || options.length > 4) errors.push(`"${question}": ${options.length} options (2–4)`);
      if (best !== 1) errors.push(`"${question}": ${best} best options marked [x] (exactly 1)`);
      for (const o of options) if (!o.replies.length) errors.push(`"${question}": an option has no "> reply" line`);
      beats.push({ kind: "decision", question: inlineMd(question), options });
      continue;
    }
    errors.push(`unexpected line: ${line.slice(0, 60)}`);
    i++;
  }
  const decisions = beats.filter((b) => b.kind === "decision").length;
  if (decisions < 3) errors.push(`${decisions} decisions (aim for 4–6)`);
  if (errors.length) return { room: null, errors };
  return {
    room: {
      slug,
      title,
      sev: str(data.sev) || "SEV-1",
      company: str(data.company),
      product: str(data.product),
      starts: str(data.starts),
      minutes: Number(data.minutes) || 10,
      basedOn,
      basedOnUrl,
      lesson: str(data.lesson) || null,
      cast,
      beats,
      postmortem: postmortem.trim(),
      real: real.trim(),
    },
    errors,
  };
}
