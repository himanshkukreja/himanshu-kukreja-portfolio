import "server-only";
/**
 * The optional AI prose on top of the plans (FEATURES "plan-coach", "concept-recap"; prompts in lib/ai/prompts.ts). The
 * cache is the call's own transcript (ai_transcripts, kept 30 days), as for the readiness reading: no new table. Its input
 * holds a key line first ("why:<plan>:<week>", "company:<slug>:<week>") and then numbers, labels and course titles only.
 */
import { supabase } from "@/lib/supabase";
import { lessonKey, type CourseMap } from "@/lib/learn/types";
import type { NamedStruggle } from "./planning-model";

/** The newest transcript output of `feature` for this learner whose input starts with `key` (within `days`). */
export async function cachedOutput(userId: string, feature: string, key: string, days = 7): Promise<{ text: string; at: string } | null> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const { data, error } = await supabase
    .from("ai_transcripts")
    .select("input, output, created_at")
    .eq("user_id", userId)
    .eq("feature", feature)
    .gte("created_at", since)
    .like("input", `${key.replace(/[%_\\]/g, (m) => `\\${m}`)}\n%`)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error || !data?.length) return null;
  const r = data[0] as { output: string | null; created_at: string };
  return r.output ? { text: r.output, at: r.created_at } : null;
}

const ID_RE = /^(?:lesson|boss|trial|mock|sidequest|recap|dsa|revision|mock-lever)[:\w./#@-]{0,200}$/;

/** A plan entry id as its course title ("lesson:week-04-caching/day-01-caching-patterns" → "Caching patterns"). */
export function entryTitle(id: string, map: CourseMap | null, struggles: NamedStruggle[], dsaTitle: (id: string) => string | null): string | null {
  if (!ID_RE.test(id)) return null;
  if (id.startsWith("revision")) return "Revision day";
  if (id.startsWith("recap:")) {
    const s = struggles.find((x) => `recap:${x.key}` === id);
    return s ? `Recap: ${s.label}` : null;
  }
  if (id.startsWith("dsa:c:") || id.startsWith("dsa:p:")) {
    const t = dsaTitle(id.slice(6));
    return t ? `DSA ${id.startsWith("dsa:c:") ? "lesson" : "problem"}: ${t}` : null;
  }
  if (!map) return null;
  const all = [...map.weeks.flatMap((w) => [...w.lessons, ...(w.boss ? [w.boss] : [])]), ...map.sideQuests, ...(map.problems ?? []), ...(map.lld ?? [])];
  if (id.startsWith("lesson:") || id.startsWith("sidequest:")) {
    const k = id.slice(id.indexOf(":") + 1);
    const l = all.find((x) => lessonKey(x.week, x.slug) === k || x.slug === k);
    return l ? l.title : null;
  }
  if (id.startsWith("boss:")) {
    const w = map.weeks.find((x) => x.key === id.slice(5));
    return w?.boss ? `Boss: ${w.boss.title}` : null;
  }
  if (id.startsWith("trial:")) {
    const m = id.match(/^trial:(.+)\/part-(\d+)$/);
    const w = m ? map.weeks.find((x) => x.key === m[1] || x.trial?.week === m[1]) : null;
    const p = w?.trial?.parts.find((x) => x.n === Number(m![2]));
    return p ? `Trial W${w!.code} part ${p.n}: ${p.title}` : null;
  }
  if (id.startsWith("mock:")) {
    const m = (map.mocks ?? []).find((x) => x.id === id.slice(5) || x.slug === id.slice(5));
    return m ? `Mock interview: ${m.title}` : null;
  }
  return null;
}

/** One paragraph, plain: no markdown headings or lists, at most `max` characters, cut at a sentence. */
export function plainParagraph(text: string, max = 700): string {
  const t = text
    .replace(/^#+\s.*$/gm, "")
    .replace(/^\s*[-*•]\s+/gm, "")
    .replace(/\*\*/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const end = cut.lastIndexOf(". ");
  return end > max * 0.5 ? cut.slice(0, end + 1) : `${cut.trimEnd()}…`;
}
