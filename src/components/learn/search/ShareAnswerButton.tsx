"use client";

/**
 * "Share" for the smart-search answer: makes a public read-only link (/learn/answer/<id>) holding only the
 * question, the answer and its course sources. Hidden unless answer sharing is switched on (GET
 * /api/learn/share/answer says so once the shared_answers table exists) and the learner is signed in.
 */
import { useEffect, useState } from "react";
import { Check, Link2, Share2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { userFetch } from "@/components/learn/progress/userFetch";
import type { AnswerPart, Hit } from "@/lib/search/smart/types";

let enabledProbe: Promise<boolean> | null = null;
const sharingEnabled = () =>
  (enabledProbe ??= fetch("/api/learn/share/answer")
    .then((r) => (r.ok ? r.json() : { enabled: false }))
    .then((b: { enabled?: boolean }) => b.enabled === true)
    .catch(() => false));

type State = { s: "idle" } | { s: "busy" } | { s: "done"; url: string; copied: boolean } | { s: "error"; message: string };

export default function ShareAnswerButton({ question, answer, cites }: { question: string; answer: AnswerPart[]; cites: Hit[] }) {
  const { user } = useAuth();
  const [enabled, setEnabled] = useState(false);
  const [st, setSt] = useState<State>({ s: "idle" });
  const key = `${question}|${answer.length}|${cites.map((c) => c.id).join(",")}`;

  useEffect(() => {
    let off = false;
    sharingEnabled().then((on) => !off && setEnabled(on));
    return () => {
      off = true;
    };
  }, []);
  // a new answer: back to "Share"
  useEffect(() => setSt({ s: "idle" }), [key]);

  if (!enabled || !user || !answer.length || !cites.length) return null;

  const share = async () => {
    setSt({ s: "busy" });
    try {
      const res = await userFetch("/api/learn/share/answer", {
        method: "POST",
        // only what the page shows: the question, the answer runs and the sources (title, kind, place, link)
        body: JSON.stringify({ question, answerParts: answer, cites: cites.map((c) => ({ kind: c.kind, title: c.title, sub: c.sub, href: c.href })) }),
      });
      const body = (await res.json().catch(() => ({}))) as { enabled?: boolean; url?: string; error?: string };
      if (body.enabled === false) {
        setEnabled(false);
        return;
      }
      if (!res.ok || !body.url) throw new Error(body.error || "Couldn't make a link. Try again.");
      const url = body.url;
      if (typeof navigator.share === "function" && window.matchMedia("(pointer: coarse)").matches) {
        await navigator.share({ title: question, url }).catch(() => {});
        setSt({ s: "done", url, copied: false });
        return;
      }
      const copied = await navigator.clipboard?.writeText(url).then(
        () => true,
        () => false,
      );
      setSt({ s: "done", url, copied: !!copied });
    } catch (e) {
      setSt({ s: "error", message: e instanceof Error ? e.message : "Couldn't make a link. Try again." });
    }
  };

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      {st.s === "done" ? (
        <a href={st.url} target="_blank" rel="noopener" className="inline-flex min-h-10 items-center gap-2 border border-line-strong px-3 text-[14px] text-fg hover:border-fg-3">
          {st.copied ? <Check className="h-4 w-4 text-signal-text" aria-hidden /> : <Link2 className="h-4 w-4 text-signal-text" aria-hidden />}
          {st.copied ? "Link copied · open it" : "Open the shared answer"}
        </a>
      ) : (
        <button type="button" onClick={share} disabled={st.s === "busy"} className="inline-flex min-h-10 items-center gap-2 border border-line-strong px-3 text-[14px] font-semibold text-fg hover:border-fg-3 disabled:opacity-60">
          <Share2 className="h-4 w-4" aria-hidden />
          {st.s === "busy" ? "Making a link…" : "Share this answer"}
        </button>
      )}
      {st.s === "error" && (
        <span className="text-[13px] text-fg-3" role="status">
          {st.message}
        </span>
      )}
    </div>
  );
}
