"use client";

/**
 * The course chat's conversation on this device: messages, the sources tools returned (ref → index entry),
 * practice cards, paths, and the streaming answer. Kept in localStorage per signed-in user (try/catch: a
 * private window or blocked storage just means a reload starts fresh), so a reload or another page keeps
 * the chat; "New chat" starts over (and lets the tutor note the old one in its memory).
 *
 * One conversation is shared by the search page and the Ask panel on every Learn page (same storage key,
 * and a window event keeps open views in step).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { aiFetch } from "@/components/learn/ai/aiFetch";
import { track } from "@/lib/track";
import { citedRefs, type ChatEvent, type ChatQuota, type ChatRequest, type ChatSource, type ChatTurn, type MockCard, type PageContext, type PathCard, type QuizCard, type QuizResult } from "@/lib/ai/chat/text";
import { useChatPathSaver } from "./savePath";

export type ChatMsg = {
  id: string;
  role: "user" | "assistant";
  text: string;
  at: number;
  /** a user message that answers this practice question */
  answerTo?: string;
  /** cards this answer brought */
  quizzes?: string[];
  paths?: string[];
  /** refs the answer cites, in order */
  cites?: string[];
  error?: string;
  /** answered in fast mode (Haiku) */
  fast?: boolean;
  offTopic?: boolean;
  /** the metered call behind this answer (feedback goes to it) */
  callId?: number | null;
  /** an answer from the mock interviewer, or the mock's scorecard */
  mode?: "tutor" | "interviewer" | "scorecard";
  /** a candidate's line in a mock (with its phase) */
  mockPhase?: string;
};

/** A mock interview running in the chat: its phases, the one on now (and since when), and each phase's exchange. */
export type MockSession = MockCard & { phase: number; phaseAt: number; turns: Record<string, ChatTurn[]>; status: "live" | "scored" };
export type Rating = { rating: -1 | 0 | 1; wrong: boolean; note: string; sent?: boolean };

export type SavedState = "saved" | "updated" | "full" | "failed";
export type Conversation = {
  v: 1;
  chat: string;
  messages: ChatMsg[];
  sources: Record<string, ChatSource>;
  quizzes: Record<string, QuizCard & { result?: QuizResult }>;
  paths: Record<string, PathCard & { saved?: SavedState }>;
  /** learner messages already sent to the memory (so "New chat" only sends what's new) */
  memoryTurns: number;
  updatedAt: number;
  mock?: MockSession | null;
  /** callId → this learner's feedback on that answer */
  ratings?: Record<string, Rating>;
};

const MAX_KEPT = 80;
const SYNC_EVENT = "hk:course-chat-sync";
const keyFor = (uid: string) => `hk.chat.v1:${uid}`;
const rid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const fresh = (): Conversation => ({ v: 1, chat: rid(), messages: [], sources: {}, quizzes: {}, paths: {}, memoryTurns: 0, updatedAt: Date.now() });

function read(uid: string): Conversation {
  try {
    const raw = window.localStorage.getItem(keyFor(uid));
    const c = raw ? (JSON.parse(raw) as Conversation) : null;
    if (c && c.v === 1 && Array.isArray(c.messages) && typeof c.chat === "string") return { ...fresh(), ...c };
  } catch {
    /* storage blocked or corrupt: start fresh */
  }
  return fresh();
}
function write(uid: string, c: Conversation) {
  try {
    window.localStorage.setItem(keyFor(uid), JSON.stringify({ ...c, messages: c.messages.slice(-MAX_KEPT) }));
  } catch {
    /* full or blocked: the chat still works for this page view */
  }
}

export type ChatStatus = { kind: "idle" } | { kind: "working"; label: string } | { kind: "streaming" };

export function useCourseChat(uid: string | null, opts: { devHeaders?: Record<string, string>; page?: () => PageContext | null } = {}) {
  const [conv, setConv] = useState<Conversation>(fresh);
  const [status, setStatus] = useState<ChatStatus>({ kind: "idle" });
  const [draft, setDraft] = useState("");
  const [quota, setQuota] = useState<ChatQuota | null>(null);
  const [fallback, setFallback] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const convRef = useRef(conv);
  convRef.current = conv;
  const saver = useChatPathSaver();
  const devHeaders = opts.devHeaders;
  const pageOf = opts.page;

  // load this learner's conversation, and follow changes made in another view (panel ↔ page, another tab)
  useEffect(() => {
    if (!uid) return;
    setConv(read(uid));
    const sync = (e: Event) => {
      if (e instanceof StorageEvent && e.key !== keyFor(uid)) return;
      if (!abort.current) setConv(read(uid));
    };
    window.addEventListener(SYNC_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(SYNC_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [uid]);

  useEffect(() => () => abort.current?.abort(), []);

  const commit = useCallback(
    (next: Conversation | ((c: Conversation) => Conversation), broadcast = false) => {
      setConv((c) => {
        const n = typeof next === "function" ? next(c) : next;
        if (uid) write(uid, n);
        if (broadcast) queueMicrotask(() => window.dispatchEvent(new Event(SYNC_EVENT)));
        return n;
      });
    },
    [uid],
  );

  // the chat's quota line (and whether memory is on)
  const [memory, setMemory] = useState<{ available: boolean; paused: boolean; has: boolean } | null>(null);
  const [feedback, setFeedback] = useState(false);
  useEffect(() => {
    if (!uid) return;
    let off = false;
    aiFetch("/api/learn/ai/chat", { headers: devHeaders })
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => {
        if (off || !b) return;
        setQuota(b.quota ?? null);
        setMemory(b.memory ?? null);
        setFeedback(!!b.feedback);
      })
      .catch(() => {});
    return () => {
      off = true;
    };
    // devHeaders is stable per page
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  const savePath = useCallback(
    (pref: string) => {
      const c = convRef.current;
      const p = c.paths[pref];
      if (!p) return;
      const r = saver(p, c.sources);
      const saved: SavedState = r.ok ? (r.updated ? "updated" : "saved") : r.reason === "full" ? "full" : "failed";
      commit((x) => ({ ...x, paths: { ...x.paths, [pref]: { ...x.paths[pref], saved } } }), true);
      track("chat_path_save", { ok: r.ok, steps: p.steps.length });
    },
    [commit, saver],
  );

  const send = useCallback(
    async (text: string, extra: { answerTo?: string; mockEnd?: boolean } = {}) => {
      const t = text.trim();
      if (!t || abort.current || !uid) return false;
      const base = convRef.current;
      // a mock interview is on: the message goes to the interviewer (or ends the interview for its scorecard)
      const ms = base.mock?.status === "live" && !extra.answerTo ? base.mock : null;
      const phaseId = ms ? ms.phases[ms.phase]?.id : undefined;
      const user: ChatMsg = { id: rid(), role: "user", text: t.slice(0, 2000), at: Date.now(), ...(extra.answerTo ? { answerTo: extra.answerTo } : {}), ...(ms && !extra.mockEnd ? { mockPhase: phaseId } : {}) };
      const reply: ChatMsg = { id: rid(), role: "assistant", text: "", at: Date.now() };
      const withUser: Conversation = { ...base, messages: [...base.messages, user], updatedAt: Date.now() };
      commit({ ...withUser, messages: [...withUser.messages, reply] });
      setDraft("");
      setFallback(false);
      setStatus({ kind: "working", label: "thinking…" });
      const body: ChatRequest = {
        chat: base.chat,
        // earlier answers to practice questions say which question (the server adds it for the new message)
        messages: withUser.messages.filter((m) => !m.error && m.text).map((m) => ({ role: m.role, text: m.answerTo && m.id !== user.id ? `(my answer to ${m.answerTo}) ${m.text}` : m.text })),
        sources: Object.fromEntries(Object.entries(base.sources).map(([r, s]) => [r, s.id])),
        quizzes: Object.fromEntries(Object.entries(base.quizzes).map(([q, c]) => [q, c.item])),
        paths: Object.fromEntries(Object.entries(base.paths).map(([p, c]) => [p, { title: c.title, note: c.note, steps: c.steps }])),
        ...(extra.answerTo ? { answerTo: extra.answerTo } : {}),
        page: pageOf?.() ?? null,
        mock: ms && phaseId ? { key: ms.key, phase: phaseId, history: ms.turns[phaseId] ?? [], action: extra.mockEnd ? "end" : "turn", ...(extra.mockEnd ? { phases: ms.turns } : {}) } : null,
      };
      let started: MockCard | null = null;
      const ctrl = new AbortController();
      abort.current = ctrl;
      const patchReply = (f: (m: ChatMsg) => ChatMsg) => commit((c) => ({ ...c, messages: c.messages.map((m) => (m.id === reply.id ? f(m) : m)) }));
      const t0 = performance.now();
      let gotDone = false;
      let fast = false;
      try {
        const res = await aiFetch("/api/learn/ai/chat", { method: "POST", body: JSON.stringify(body), headers: devHeaders, signal: ctrl.signal });
        if (!res.ok || !res.body || !(res.headers.get("content-type") || "").includes("event-stream")) {
          const b = (await res.json().catch(() => ({}))) as { error?: string; quota?: ChatQuota | null };
          if (b.quota) setQuota(b.quota);
          patchReply((m) => ({ ...m, error: b.error || "The tutor didn't answer. The search results still work." }));
          setFallback(true);
          track("chat_message", { ok: false, status: res.status });
          return false;
        }
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = "";
        const on = (e: ChatEvent) => {
          switch (e.type) {
            case "start":
              fast = e.fast;
              patchReply((m) => ({ ...m, fast: e.fast }));
              break;
            case "status":
              setStatus({ kind: "working", label: e.label || "working…" });
              break;
            case "sources":
              commit((c) => ({ ...c, sources: { ...c.sources, ...e.sources } }));
              break;
            case "quiz":
              commit((c) => ({ ...c, quizzes: { ...c.quizzes, [e.quiz.qref]: e.quiz }, messages: c.messages.map((m) => (m.id === reply.id ? { ...m, quizzes: [...(m.quizzes ?? []), e.quiz.qref] } : m)) }));
              break;
            case "graded":
              commit((c) => (c.quizzes[e.result.qref] ? { ...c, quizzes: { ...c.quizzes, [e.result.qref]: { ...c.quizzes[e.result.qref], result: e.result } } } : c));
              break;
            case "path":
              commit((c) => ({ ...c, paths: { ...c.paths, [e.path.pref]: e.path }, messages: c.messages.map((m) => (m.id === reply.id ? { ...m, paths: [...(m.paths ?? []), e.path.pref] } : m)) }));
              break;
            case "mock":
              started = e.mock;
              break;
            case "save":
              // after this event's state lands
              queueMicrotask(() => savePath(e.pref));
              break;
            case "round":
              setDraft("");
              break;
            case "delta":
              setStatus({ kind: "streaming" });
              setDraft((d) => d + e.text);
              break;
            case "done":
              gotDone = true;
              patchReply((m) => ({ ...m, text: e.text, cites: citedRefs(e.text), offTopic: e.offTopic, callId: e.callId, mode: e.mode }));
              if (ms && phaseId && e.mode === "interviewer" && e.text)
                commit((c) => (c.mock ? { ...c, mock: { ...c.mock, turns: { ...c.mock.turns, [phaseId]: [...(c.mock.turns[phaseId] ?? []), { role: "user", text: t }, { role: "assistant", text: e.text }] } } } : c));
              if (ms && e.mode === "scorecard" && e.text) commit((c) => (c.mock ? { ...c, mock: { ...c.mock, status: "scored" } } : c));
              if (started) {
                const mc = started;
                const p0 = mc.phases[0];
                if (p0)
                  commit((c) => ({
                    ...c,
                    mock: { ...mc, phase: 0, phaseAt: Date.now(), turns: { [p0.id]: [{ role: "assistant", text: p0.opener }] }, status: "live" },
                    messages: [...c.messages, { id: rid(), role: "assistant", text: `**${p0.title}** · ${p0.minutes} min\n\n${p0.opener}`, at: Date.now(), mode: "interviewer" }],
                  }));
              }
              if (e.quota) setQuota(e.quota);
              setDraft("");
              track("chat_message", { ok: true, tools: e.tools, ms: Math.round(performance.now() - t0), fast });
              break;
            case "error":
              patchReply((m) => ({ ...m, error: e.message }));
              setFallback(true);
              break;
          }
        };
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let i: number;
          while ((i = buf.indexOf("\n\n")) >= 0) {
            const line = buf.slice(0, i).replace(/^data:\s?/, "");
            buf = buf.slice(i + 2);
            try {
              on(JSON.parse(line) as ChatEvent);
            } catch {
              /* a malformed line: skip */
            }
          }
        }
        if (!gotDone) patchReply((m) => (m.error ? m : { ...m, error: "The answer was cut off. Try asking again." }));
        return gotDone;
      } catch (e) {
        if ((e as Error).name !== "AbortError") {
          patchReply((m) => ({ ...m, error: "You seem to be offline, or the tutor didn't answer. The search results still work." }));
          setFallback(true);
        }
        return false;
      } finally {
        abort.current = null;
        setStatus({ kind: "idle" });
        setDraft("");
        window.dispatchEvent(new Event(SYNC_EVENT));
      }
    },
    [commit, devHeaders, pageOf, savePath, uid],
  );

  /** Start over. The finished chat goes to the tutor's memory first (when there is something new in it). */
  const reset = useCallback(() => {
    abort.current?.abort();
    const c = convRef.current;
    const userTurns = c.messages.filter((m) => m.role === "user").length;
    if (uid && memory?.available && !memory.paused && userTurns > c.memoryTurns && userTurns >= 2) {
      const body = { chat: c.chat, messages: c.messages.filter((m) => m.text && !m.error).map((m) => ({ role: m.role, text: m.text })) };
      aiFetch("/api/learn/ai/chat/memory", { method: "POST", body: JSON.stringify(body), headers: devHeaders, keepalive: true }).catch(() => {});
    }
    commit(fresh(), true);
    setFallback(false);
    track("chat_new", { turns: userTurns });
  }, [commit, devHeaders, memory, uid]);

  const stop = useCallback(() => abort.current?.abort(), []);

  /** Mock interview controls: the next phase (its opening question comes from the mock, no AI call), end and score, leave. */
  const nextPhase = useCallback(() => {
    commit((c) => {
      if (!c.mock || c.mock.status !== "live") return c;
      const i = c.mock.phase + 1;
      const p = c.mock.phases[i];
      if (!p) return c;
      return {
        ...c,
        mock: { ...c.mock, phase: i, phaseAt: Date.now(), turns: { ...c.mock.turns, [p.id]: [{ role: "assistant", text: p.opener }] } },
        messages: [...c.messages, { id: rid(), role: "assistant", text: `**${p.title}** · ${p.minutes} min\n\n${p.opener}`, at: Date.now(), mode: "interviewer" }],
      };
    }, true);
  }, [commit]);
  const leaveMock = useCallback(() => commit((c) => ({ ...c, mock: null }), true), [commit]);

  /** 👍 / 👎 / "this was wrong" on one answer (hidden until the feedback table exists). */
  const rate = useCallback(
    (callId: number, r: Omit<Rating, "sent">) => {
      commit((c) => ({ ...c, ratings: { ...(c.ratings ?? {}), [callId]: { ...r, sent: false } } }));
      aiFetch("/api/learn/ai/chat/feedback", { method: "POST", body: JSON.stringify({ callId, ...r }), headers: devHeaders })
        .then((res) => res.ok && commit((c) => ({ ...c, ratings: { ...(c.ratings ?? {}), [callId]: { ...r, sent: true } } })))
        .catch(() => {});
      track("chat_feedback", { rating: r.rating, wrong: r.wrong, note: !!r.note });
    },
    [commit, devHeaders],
  );

  /** A saved answer (a lesson's "questions learners ask"): shown in the chat for free, no AI call. */
  const addSaved = useCallback(
    (q: string, a: string) => {
      const now = Date.now();
      commit((c) => ({ ...c, messages: [...c.messages, { id: rid(), role: "user", text: q, at: now }, { id: rid(), role: "assistant", text: `${a}\n\n*Saved answer from this lesson's questions learners ask: no messages used.*`, at: now }], updatedAt: now }), true);
    },
    [commit],
  );

  return { conv, status, draft, quota, memory, feedback, fallback, send, reset, stop, savePath, addSaved, nextPhase, leaveMock, rate, busy: status.kind !== "idle" };
}
