import "server-only";
/**
 * Server: what the war-room AI features read (the run review and "Ask about this incident"). Everything comes from
 * the room's own file (the script, its calls and replies, the postmortem, the real incident) and the course: the
 * room's lesson and, for the review, a few lessons that match the night's topics. Nothing here trusts the browser
 * beyond which beat the learner has reached.
 */
import { getLearningResource } from "@/lib/github";
import { COURSE_ID, getCourseMap } from "@/lib/learn/course";
import { lessonContext } from "@/lib/ai/retrieve";
import type { Beat, WarRoom } from "./types";

type Decision = Extract<Beat, { kind: "decision" }>;

/** HTML (inline script markup, or the course renderer's output) → plain text, paragraphs kept. */
export function plain(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|h[1-6]|div|tr|pre|blockquote)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&rsquo;|&#x27;/g, "’")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*/g, "\n\n")
    .trim();
}

const who = (room: WarRoom, id: string) => room.cast.find((c) => c.id === id)?.name ?? id;
const cost = (o: { minutes: number; users: number }) => [o.minutes ? `+${o.minutes} min` : "", o.users ? `+${o.users.toLocaleString("en-IN")} users` : ""].filter(Boolean).join(", ") || "no cost";

/** The decisions in script order, with their beat index and 1-based number. */
export function decisions(room: WarRoom): { beat: number; n: number; d: Decision }[] {
  const out: { beat: number; n: number; d: Decision }[] = [];
  room.beats.forEach((b, beat) => {
    if (b.kind === "decision") out.push({ beat, n: out.length + 1, d: b });
  });
  return out;
}

/**
 * The channel as text, beats [0, upto). A decision before the last shown beat (or any, once the room is over) has been
 * played: it shows the right call and what was said. The last shown beat, when it's a decision and the room isn't over,
 * is the open call: its question only (no options), so a model can't say which one is right.
 */
export function channelText(room: WarRoom, upto: number, over: boolean): string {
  const end = Math.max(0, Math.min(room.beats.length, upto));
  let n = 0;
  const lines = room.beats.slice(0, end).map((b, i) => {
    if (b.kind === "msg") return `${b.at} ${b.who === "pager" ? "PAGE" : b.who === "status" ? "STATUS PAGE" : b.who === "note" ? "(note)" : who(room, b.who)}: ${plain(b.html)}`;
    if (b.kind === "chart") return `${b.at} [chart] ${b.title}: ${b.points.join(", ")}`;
    if (b.kind === "log") return `${b.at} [log] ${b.title}\n${b.lines.join("\n")}`;
    n++;
    const open = !over && i === end - 1;
    // the open call's question only: a model that never sees the options can't point at one
    if (open) return `[CALL ${n}, OPEN NOW, the learner is deciding] ${plain(b.question)}`;
    const best = b.options.find((o) => o.best)!;
    return `[CALL ${n}, played] ${plain(b.question)}\n  right call: ${plain(best.html)}\n  ${best.replies.map((r) => `${r.who || "narrator"}: ${plain(r.html)}`).join("\n  ")}`;
  });
  return lines.join("\n");
}

/** Every call with every option (right one marked, wrong ones with their cost) and what the channel said: the answer key. */
export function callsText(room: WarRoom): string {
  return decisions(room)
    .map(({ n, d }) =>
      [
        `CALL ${n}: ${plain(d.question)}`,
        ...d.options.map((o, k) => `  ${k + 1}. ${plain(o.html)} [${o.best ? "RIGHT CALL" : `wrong, ${cost(o)}`}]\n     ${o.replies.map((r) => `${r.who || "narrator"}: ${plain(r.html)}`).join(" ")}`),
      ].join("\n"),
    )
    .join("\n\n");
}

/** The room's lesson, the sections most relevant to `query` (empty when the room has none or it doesn't load). */
export async function lessonText(room: WarRoom, query: string, budget = 5000): Promise<string> {
  const [week, slug] = (room.lessonRef || "").split("/");
  if (!week || !slug) return "";
  const l = await getLearningResource(week, slug).catch(() => null);
  return l ? lessonContext(l.content, query, "", budget) : "";
}

export type LessonCandidate = { id: string; title: string; code: string; href: string };

const STOP = new Set(
  "about after again also because been before being between both could does doing down during each from have having here into itself just more most must only other over same should some such than that their them then there these they this those through under until very what when where which while with would your design designing system systems scale part week day days the and for are but not you all any can her was one our out cases edge advanced features basics introduction overview deep dive core flow patterns building real world right wrong call calls".split(
    " ",
  ),
);
const words = (t: string) => (t.toLowerCase().match(/[a-z][a-z-]{3,}/g) || []).filter((w) => !STOP.has(w));

/**
 * Lessons the review may send the learner to: the room's own lesson first, then up to `n` core-course lessons whose
 * titles are mostly words the night keeps using (its calls, postmortem and the real incident). Ids L1, L2, ... for the prompt.
 */
export async function revisitCandidates(room: WarRoom, n = 5): Promise<LessonCandidate[]> {
  const map = await getCourseMap(COURSE_ID).catch(() => null);
  if (!map) return room.lesson ? [{ id: "L1", ...room.lesson }] : [];
  const text = `${callsText(room)}\n${plain(room.postmortemHtml)}\n${plain(room.realHtml)}`;
  const freq = new Map<string, number>();
  for (const w of words(text)) freq.set(w, (freq.get(w) ?? 0) + 1);
  // the core course's lessons (side quests are company case studies: a shared company or product name isn't a reason)
  const pool = map.weeks.flatMap((w) => w.lessons.filter((l) => l.kind !== "week-preview"));
  const own = room.lesson?.href;
  const scored = pool
    .filter((l) => l.href !== own)
    .map((l) => {
      const ws = [...new Set(words(l.title))];
      const hit = ws.filter((w) => (freq.get(w) ?? 0) >= 2);
      const s = hit.reduce((a, w) => a + Math.log(1 + (freq.get(w) ?? 0)), 0) / Math.sqrt(Math.max(1, ws.length));
      // most of the title must be about this night ("Rate Limiting at Scale" for a flood, not one shared word)
      return { l, s: ws.length && hit.length / ws.length >= 0.5 ? s : 0 };
    })
    .filter((x) => x.s > 1)
    .sort((a, b) => b.s - a.s)
    .slice(0, n);
  const list = [...(room.lesson ? [room.lesson] : []), ...scored.map(({ l }) => ({ title: l.title, code: l.tag, href: l.href }))];
  return list.map((l, i) => ({ id: `L${i + 1}`, title: l.title, code: l.code, href: l.href }));
}
