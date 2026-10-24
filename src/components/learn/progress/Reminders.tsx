"use client";

/**
 * Progress page: opt-in streak reminders. At 7:30 PM (IST) on a day you haven't learned yet, with a
 * streak running, you get one nudge: a push notification on this device and/or an email. Signed-in
 * learners only (the reminder needs to know your streak). Server: src/lib/reminders/server.ts.
 */
import { useCallback, useEffect, useState } from "react";
import { track } from "@/lib/track";
import { userJson } from "./userFetch";

type Prefs = { emailOn: boolean; pushOn: boolean; pushDevices: number; tz: string };

const b64ToBytes = (b64: string) => {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};
const pushSupported = () => typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
const tz = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kolkata";
  } catch {
    return "Asia/Kolkata";
  }
};

export default function Reminders({ signedIn, onSignIn }: { signedIn: boolean; onSignIn: () => void }) {
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [key, setKey] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [busy, setBusy] = useState<"" | "push" | "email">("");
  const [note, setNote] = useState("");
  const [thisDevice, setThisDevice] = useState(false);
  const [canPush, setCanPush] = useState(false);

  useEffect(() => {
    if (!signedIn) return;
    let off = false;
    setCanPush(pushSupported());
    userJson<{ prefs: Prefs; vapidPublicKey: string | null; email: string | null }>("/api/learn/reminders")
      .then((d) => {
        if (off) return;
        setPrefs(d.prefs);
        setKey(d.vapidPublicKey);
        setEmail(d.email);
      })
      .catch(() => !off && setNote("Couldn't load your reminder settings."));
    if (pushSupported())
      navigator.serviceWorker.ready
        .then((r) => r.pushManager.getSubscription())
        .then((s) => !off && setThisDevice(!!s))
        .catch(() => {});
    return () => {
      off = true;
    };
  }, [signedIn]);

  const save = useCallback(async (body: Record<string, unknown>) => {
    const d = await userJson<{ prefs: Prefs }>("/api/learn/reminders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, tz: tz() }) });
    setPrefs(d.prefs);
    return d.prefs;
  }, []);

  const togglePush = async () => {
    if (!prefs || !key) return;
    setBusy("push");
    setNote("");
    try {
      const reg = await navigator.serviceWorker.ready;
      if (prefs.pushOn && thisDevice) {
        const sub = await reg.pushManager.getSubscription();
        if (sub) await sub.unsubscribe().catch(() => {});
        const p = await save({ removeEndpoint: sub?.endpoint, pushOn: (prefs.pushDevices || 1) > 1 });
        setThisDevice(false);
        track("reminders", { channel: "push", on: p.pushOn });
        return;
      }
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setNote("Notifications are blocked for this site. Allow them in your browser's site settings, then try again.");
        return;
      }
      const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(key) }));
      await save({ subscription: sub.toJSON(), pushOn: true });
      setThisDevice(true);
      track("reminders", { channel: "push", on: true });
    } catch {
      setNote("Couldn't switch push reminders on this device. Try again, or use email.");
    } finally {
      setBusy("");
    }
  };

  const toggleEmail = async () => {
    if (!prefs) return;
    setBusy("email");
    setNote("");
    try {
      const p = await save({ emailOn: !prefs.emailOn });
      track("reminders", { channel: "email", on: p.emailOn });
    } catch {
      setNote("Couldn't save that. Try again.");
    } finally {
      setBusy("");
    }
  };

  const row = "flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3";
  const btn = (on: boolean) =>
    `inline-flex min-h-11 items-center border px-3.5 font-mono text-xs ${on ? "border-signal bg-signal font-semibold text-on-signal" : "border-line-strong text-fg hover:border-fg-3"} disabled:opacity-50`;

  return (
    <section aria-labelledby="reminders-h" className="flex flex-col gap-3 border border-line bg-surface p-5 sm:p-6">
      <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">reminders</span>
      <h2 id="reminders-h" className="m-0 font-display text-[24px] font-bold tracking-[-0.02em] text-fg">
        Don&apos;t lose your streak
      </h2>
      <p className="m-0 max-w-[60ch] text-[15px] leading-relaxed text-fg-2">
        One nudge at 7:30 PM, only on a day you haven&apos;t learned yet while a streak is running. Never more than once a day; switch it off any time.
      </p>
      {!signedIn ? (
        <button type="button" onClick={onSignIn} className="self-start inline-flex min-h-11 items-center border border-line-strong px-3.5 font-mono text-xs text-fg hover:border-fg-3">
          sign in to turn on reminders →
        </button>
      ) : !prefs ? (
        <span className="font-mono text-xs text-fg-3">{note || "loading…"}</span>
      ) : (
        <>
          <div className={row}>
            <span className="flex flex-col gap-0.5">
              <span className="text-[15px] font-medium text-fg">Push notification on this device</span>
              <span className="font-mono text-xs text-fg-3">
                {!canPush ? "not supported in this browser (on iPhone, add the app to your Home Screen first)" : thisDevice ? "on for this device" : prefs.pushDevices ? `on for ${prefs.pushDevices} other device${prefs.pushDevices === 1 ? "" : "s"}` : "off"}
              </span>
            </span>
            {canPush && key && (
              <button type="button" disabled={busy === "push"} onClick={togglePush} className={btn(thisDevice)} aria-pressed={thisDevice}>
                {busy === "push" ? "…" : thisDevice ? "on · turn off" : "turn on"}
              </button>
            )}
          </div>
          <div className={row}>
            <span className="flex flex-col gap-0.5">
              <span className="text-[15px] font-medium text-fg">Email</span>
              <span className="font-mono text-xs text-fg-3">{email ? `to ${email}` : "to your sign-in email"}</span>
            </span>
            <button type="button" disabled={busy === "email"} onClick={toggleEmail} className={btn(prefs.emailOn)} aria-pressed={prefs.emailOn}>
              {busy === "email" ? "…" : prefs.emailOn ? "on · turn off" : "turn on"}
            </button>
          </div>
          {note && <p className="m-0 font-mono text-xs text-bad-text">{note}</p>}
        </>
      )}
    </section>
  );
}
