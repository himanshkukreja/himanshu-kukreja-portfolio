"use client";

/**
 * Opt-in weekly progress email (off by default): one row with a switch, used on the Progress page's reminders card and
 * on the memory page. Server: /api/learn/reminders (weeklyOn), lib/learner/weekly-digest*.ts.
 */
import { useEffect, useState } from "react";
import { Mail } from "lucide-react";
import { track } from "@/lib/track";
import { userJson } from "./userFetch";

type Prefs = { weeklyOn: boolean };

export default function WeeklyEmail({ signedIn, className = "" }: { signedIn: boolean; className?: string }) {
  const [on, setOn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  useEffect(() => {
    if (!signedIn) return;
    let off = false;
    userJson<{ prefs: Prefs }>("/api/learn/reminders")
      .then((d) => !off && setOn(!!d.prefs.weeklyOn))
      .catch(() => !off && setOn(false));
    return () => {
      off = true;
    };
  }, [signedIn]);
  if (!signedIn || on === null) return null;
  const flip = async () => {
    setBusy(true);
    setNote("");
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kolkata";
      const d = await userJson<{ prefs: Prefs }>("/api/learn/reminders", { method: "POST", body: JSON.stringify({ weeklyOn: !on, tz }) });
      setOn(!!d.prefs.weeklyOn);
      track("reminders", { channel: "weekly", on: !!d.prefs.weeklyOn });
    } catch (e) {
      setNote((e as Error).message || "Couldn't save that. Try again.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 ${className}`}>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="flex items-center gap-2 text-[15px] font-medium text-fg">
          <Mail className="h-4 w-4 shrink-0 text-signal-text" aria-hidden /> Weekly progress email
        </span>
        <span className="font-mono text-xs text-fg-3">Sundays: what you did, what stuck, what slipped (topics only) and 3 next steps. Unsubscribe in every email.</span>
        {note && <span className="font-mono text-xs text-bad-text">{note}</span>}
      </span>
      <button
        type="button"
        disabled={busy}
        onClick={flip}
        aria-pressed={on}
        className={`inline-flex min-h-11 items-center border px-3.5 font-mono text-xs ${on ? "border-signal bg-signal font-semibold text-on-signal" : "border-line-strong text-fg hover:border-fg-3"} disabled:opacity-50`}
      >
        {busy ? "…" : on ? "on · turn off" : "turn on"}
      </button>
    </div>
  );
}
