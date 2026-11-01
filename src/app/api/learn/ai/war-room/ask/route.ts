import { NextResponse } from "next/server";
import { requireLearner } from "@/app/api/learn/_lib/auth";
import { getWarRoom } from "@/lib/learn/war/load";
import { channelText, decisions, lessonText, plain } from "@/lib/learn/war/ai";
import { callClaude, OFF_TOPIC_MESSAGE, ownKey, saveTranscript } from "@/lib/ai/client";
import { isAdminEmail } from "@/lib/ai/access";
import { warRoomAskSystem } from "@/lib/ai/prompts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const QUESTION_MAX = 500;

/** What the learner sees when the question isn't about the incident or the course (the model answered OFF_TOPIC). */
const ASK_OFF_TOPIC = "I can only answer questions about this incident and the course. Try asking what a log line means, why something broke, or what the lesson says about it.";

type AskSource = { label: string; href?: string };

/**
 * POST /api/learn/ai/war-room/ask { slug, at, over, question } → { text, sources: [{ label, href? }], creditsLeft }
 * "Ask about this incident" (Haiku 5.5, feature war-room-ask). `at` is how many beats of the script the learner has
 * seen; `over` that the room is finished. While it isn't, the model gets only the channel up to `at` (the open call
 * without its marks) and the lesson, never the postmortem, the real incident or later beats, and is told not to spoil
 * the open call. Once over, it gets the whole room. The answer ends with the sources it used, returned as links.
 */
export async function POST(request: Request) {
  const me = await requireLearner(request);
  if (me instanceof NextResponse) return me;
  const b = (await request.json().catch(() => ({}))) as { slug?: unknown; at?: unknown; over?: unknown; question?: unknown };
  const room = await getWarRoom(String(b.slug || ""));
  if (!room) return NextResponse.json({ error: "Unknown war room" }, { status: 404 });
  const question =
    typeof b.question === "string"
      ? b.question
          .replace(/[\u0000-\u001f\u007f]+/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, QUESTION_MAX)
      : "";
  if (question.length < 3) return NextResponse.json({ error: "Ask a question" }, { status: 400 });

  const over = b.over === true;
  const at = over ? room.beats.length : Math.max(1, Math.min(room.beats.length, Math.floor(Number(b.at) || 0)));
  const calls = decisions(room);
  // the call the learner is at: the open one, or the next one coming
  const call = over ? calls.length : Math.min(calls.length, calls.filter((c) => c.beat < at).length + (room.beats[at - 1]?.kind === "decision" ? 0 : 1));
  const lesson = room.lesson ? { title: room.lesson.title, text: await lessonText(room, question, 4000) } : null;

  const r = await callClaude({
    feature: "war-room-ask",
    userId: me.id,
    adminPreview: await isAdminEmail(me.email),
    userKey: ownKey(request),
    system: warRoomAskSystem({
      title: room.title,
      company: room.company,
      cast: room.cast.map((c) => `${c.name}: ${c.role}`).join("\n"),
      channel: channelText(room, at, over).slice(-14000),
      over,
      call,
      calls: calls.length,
      postmortem: over ? plain(room.postmortemHtml) : "",
      real: over ? plain(room.realHtml) : "",
      basedOn: over ? room.basedOn : "",
      lesson: lesson?.text ? lesson : null,
    }),
    messages: [{ role: "user", content: question }],
    meta: { room: room.slug, at, over, call },
  });
  if (!r.ok && r.status === "off_topic" && r.message === OFF_TOPIC_MESSAGE) return NextResponse.json({ error: ASK_OFF_TOPIC, status: "off_topic", declined: true, creditsLeft: r.creditsLeft }, { status: 429 });
  if (!r.ok) return NextResponse.json({ error: r.message, status: r.status, creditsLeft: r.creditsLeft }, { status: r.status === "error" ? 502 : 429 });
  await saveTranscript(r.callId, me.id, "war-room-ask", `[${room.slug} · beat ${at}${over ? " · over" : ""}] ${question}`, r.text);

  const t = r.text.replace(/\r\n?/g, "\n").trim();
  const sm = t.match(/\n?\s*\**SOURCES:?\**\s*(.*)\s*$/i);
  let text = (sm ? t.slice(0, sm.index) : t).trim();
  // the spoiler line belongs only to a refusal (which opens with it); drop it wherever it sits in an answer we were allowed to give
  if (!/^\W*I won['’]t spoil this call/i.test(text)) text = text.replace(/[ \t]*\**I won['’]t spoil[^.\n]*\.\**[ \t]*/gi, "").replace(/\n{3,}/g, "\n\n").trim() || text;
  const named = new Set((sm?.[1] || "").toLowerCase().split(/[,;|]/).map((x) => x.trim()));
  const sources: AskSource[] = [];
  if ([...named].some((x) => x.includes("channel"))) sources.push({ label: over ? "the channel" : "the channel so far" });
  if (over && [...named].some((x) => x.includes("postmortem"))) sources.push({ label: "the postmortem", href: "#war-postmortem" });
  if (over && [...named].some((x) => x.includes("real"))) sources.push({ label: room.basedOn, href: room.basedOnUrl });
  // mid-room the lesson stays unnamed: its title alone can give the night away ("Deployment Strategies")
  if (room.lesson && [...named].some((x) => x.includes("lesson"))) sources.push(over ? { label: room.lesson.title, href: room.lesson.href } : { label: "the lesson behind this room" });
  return NextResponse.json({ text, sources, creditsLeft: r.creditsLeft });
}
