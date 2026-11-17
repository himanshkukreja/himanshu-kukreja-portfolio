"use client";

/**
 * The Practice search box's smart layer, in the browser: ask /api/dsa/smart-search for a sentence, keep the answer per
 * learner in localStorage (identical normalised questions never call again), and hand back the answer the learner can
 * edit (chips come off; nothing is asked again). Guests never call; a failure leaves the instant results alone.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { userJson } from "@/components/learn/progress/userFetch";
import { smartKey, type SmartAnswer, type SmartResponse } from "@/lib/dsa/search/smart";

export type SmartState = {
  /** the normalised question this answer is for */
  key: string;
  answer: SmartAnswer;
  learn?: SmartResponse["learn"];
};

const STORE = "hk.dsa.smart.v1";
const KEEP = 40;
const DAY = 24 * 3600_000;
type Saved = Record<string, { at: number; a: SmartResponse }>;

const read = (uid: string): Saved => {
  try {
    const all = JSON.parse(window.localStorage.getItem(`${STORE}.${uid}`) || "{}") as Saved;
    return all && typeof all === "object" ? all : {};
  } catch {
    return {};
  }
};
const write = (uid: string, s: Saved) => {
  try {
    const keep = Object.entries(s).sort((a, b) => b[1].at - a[1].at).slice(0, KEEP);
    window.localStorage.setItem(`${STORE}.${uid}`, JSON.stringify(Object.fromEntries(keep)));
  } catch {}
};

export function useSmartSearch() {
  const { user, loading } = useAuth();
  const uid = user?.id || "";
  const [state, setState] = useState<SmartState | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const run = useRef(0);

  /** answer for q: from this browser's cache, else the server. Resolves true when there is an answer. */
  const ask = useCallback(
    async (q: string): Promise<boolean> => {
      const key = smartKey(q);
      if (!uid || key.length < 3) return false;
      const mine = ++run.current;
      setMessage("");
      const cached = read(uid)[key];
      if (cached && Date.now() - cached.at < DAY) {
        setState({ key, answer: { filters: cached.a.filters, keywords: cached.a.keywords, learnFirst: cached.a.learnFirst, note: cached.a.note }, learn: cached.a.learn });
        return true;
      }
      setBusy(true);
      try {
        const r = await userJson<SmartResponse>("/api/dsa/smart-search", { method: "POST", body: JSON.stringify({ q }) });
        if (mine !== run.current) return false;
        const s = read(uid);
        s[key] = { at: Date.now(), a: r };
        write(uid, s);
        setState({ key, answer: { filters: r.filters, keywords: r.keywords, learnFirst: r.learnFirst, note: r.note }, learn: r.learn });
        return true;
      } catch (e) {
        if (mine === run.current) setMessage((e as Error).message || "Smart search is resting for a moment. The instant results are complete.");
        return false;
      } finally {
        if (mine === run.current) setBusy(false);
      }
    },
    [uid],
  );

  const clear = useCallback(() => {
    run.current++;
    setState(null);
    setBusy(false);
    setMessage("");
  }, []);
  const edit = useCallback((fn: (a: SmartAnswer) => SmartAnswer) => setState((s) => (s ? { ...s, answer: fn(s.answer) } : s)), []);

  // signing out forgets the answer on screen
  useEffect(() => {
    if (!loading && !uid) clear();
  }, [loading, uid, clear]);

  return { signedIn: !!uid, authLoading: loading, state, busy, message, ask, clear, edit };
}
