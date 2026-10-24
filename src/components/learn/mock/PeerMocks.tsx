"use client";

/**
 * /learn/mock/peers: post a slot or pair up with another learner for a live mock interview. One
 * interviews from the mock's page (phases, curveballs, rubric), the other designs, then swap.
 * Server: src/lib/peers/server.ts (names and emails are shared only between the two who paired).
 */
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { userFetch } from "@/components/learn/progress/userFetch";
import { track } from "@/lib/track";

type Mock = { slug: string; title: string; company: string };
type Slot = {
  id: string;
  startsAt: string;
  durationMin: number;
  mock: { slug: string; title: string; company: string; href: string } | null;
  role: "candidate" | "interviewer" | "either";
  note: string;
  status: "open" | "paired" | "cancelled";
  host: string;
  mine: boolean;
  joined: boolean;
  partner?: { name: string; email: string | null } | null;
  room?: string | null;
};

const ROLE: Record<Slot["role"], string> = { candidate: "wants to be the candidate", interviewer: "wants to interview", either: "either role" };
const fmt = (iso: string) => new Date(iso).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const BTN = "inline-flex min-h-11 items-center justify-center border border-line-strong px-3.5 font-mono text-xs text-fg hover:border-fg-3 disabled:opacity-50";
const PRIMARY = "inline-flex min-h-11 items-center justify-center bg-signal px-4 font-mono text-xs font-semibold text-on-signal hover:brightness-110 disabled:opacity-50";
const INPUT = "min-h-11 w-full border border-line-strong bg-bg px-3 text-[15px] text-fg";

export default function PeerMocks({ mocks }: { mocks: Mock[] }) {
  const { user } = useAuth();
  const { openAuthModal } = useAuthModal();
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [form, setForm] = useState({ startsAt: "", mockSlug: mocks[0]?.slug || "", role: "either", durationMin: 60, note: "" });

  const load = useCallback(async () => {
    try {
      const r = await (user ? userFetch("/api/learn/peers") : fetch("/api/learn/peers"));
      const d = await r.json();
      setSlots(d.slots || []);
    } catch {
      setError("Couldn't load the slots. Try again in a moment.");
    }
  }, [user]);
  useEffect(() => {
    void load();
  }, [load]);

  const act = async (body: Record<string, unknown>, label: string) => {
    if (!user) return openAuthModal();
    setBusy(label);
    setError("");
    try {
      const r = await userFetch("/api/learn/peers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Something went wrong");
      setSlots(d.slots || []);
      track("peer_mock", { action: String(body.action) });
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy("");
    }
  };

  const mine = (slots || []).filter((s) => s.mine || s.joined);
  const open = (slots || []).filter((s) => s.status === "open" && !s.mine);

  return (
    <main className="mx-auto flex w-full max-w-[960px] flex-col gap-8 px-4 pb-16 pt-8 sm:px-6 sm:pt-12">
      <header className="flex flex-col gap-3">
        <Link href="/learn/mock" className="font-mono text-xs uppercase tracking-label text-fg-3 hover:text-fg">
          ← mock interviews
        </Link>
        <h1 className="font-display text-[40px] font-extrabold leading-[0.98] tracking-[-0.04em] text-fg sm:text-[56px]">Practise with a real person.</h1>
        <p className="m-0 max-w-[640px] text-[17px] leading-relaxed text-fg-2">
          Pick a time and one of the course&apos;s mock interviews. When another learner pairs up, you both get an email with a free video room. The interviewer runs it from the mock&apos;s page (phases, curveballs, the levelled rubric), then you swap.
        </p>
        <p className="m-0 font-mono text-xs text-fg-3">When you pair, your first name and email are shared with your partner only. Times show in your own time zone.</p>
      </header>

      {mine.length > 0 && (
        <section aria-labelledby="mine-h" className="flex flex-col gap-3">
          <h2 id="mine-h" className="m-0 font-display text-2xl font-bold text-fg">
            Your sessions
          </h2>
          {mine.map((s) => (
            <div key={s.id} className={`flex flex-wrap items-center justify-between gap-3 border p-4 ${s.status === "paired" ? "border-signal" : "border-line-strong"}`}>
              <div className="flex min-w-0 flex-col gap-1">
                <span className="font-mono text-xs uppercase tracking-label text-signal-text">{s.status === "paired" ? "paired" : "waiting for a partner"}</span>
                <span className="text-[15px] font-semibold text-fg">
                  {fmt(s.startsAt)} · {s.durationMin} min · {s.mock?.title || "mock interview"}
                </span>
                {s.status === "paired" && s.partner && (
                  <span className="text-sm text-fg-2">
                    With {s.partner.name}
                    {s.partner.email ? (
                      <>
                        {" "}
                        · <a href={`mailto:${s.partner.email}`} className="text-signal-text underline">{s.partner.email}</a>
                      </>
                    ) : null}
                  </span>
                )}
              </div>
              <span className="flex flex-wrap gap-2">
                {s.status === "paired" && s.room && (
                  <a href={s.room} target="_blank" rel="noreferrer" className={PRIMARY}>
                    join video room ↗
                  </a>
                )}
                {s.mock && (
                  <Link href={s.mock.href} className={BTN}>
                    rubric →
                  </Link>
                )}
                <button type="button" disabled={busy === `c:${s.id}`} onClick={() => act({ action: "cancel", id: s.id }, `c:${s.id}`)} className={BTN}>
                  {s.mine ? "cancel slot" : "leave"}
                </button>
              </span>
            </div>
          ))}
        </section>
      )}

      <section aria-labelledby="open-h" className="flex flex-col gap-3">
        <h2 id="open-h" className="m-0 font-display text-2xl font-bold text-fg">
          Open slots
        </h2>
        {slots === null ? (
          <span className="font-mono text-xs text-fg-3">loading…</span>
        ) : open.length === 0 ? (
          <p className="m-0 text-[15px] text-fg-2">No open slots right now. Post one below and the next learner who comes by can pair with you.</p>
        ) : (
          open.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center justify-between gap-3 border border-line-strong p-4">
              <div className="flex min-w-0 flex-col gap-1">
                <span className="text-[15px] font-semibold text-fg">
                  {fmt(s.startsAt)} · {s.durationMin} min
                </span>
                <span className="text-sm text-fg-2">
                  {s.host} · {ROLE[s.role]} · {s.mock ? `${s.mock.title} (${s.mock.company})` : "mock interview"}
                </span>
                {s.note && <span className="text-sm text-fg-3">“{s.note}”</span>}
              </div>
              <button type="button" disabled={busy === `j:${s.id}`} onClick={() => act({ action: "join", id: s.id }, `j:${s.id}`)} className={PRIMARY}>
                {busy === `j:${s.id}` ? "pairing…" : "pair up"}
              </button>
            </div>
          ))
        )}
      </section>

      <section aria-labelledby="post-h" className="flex flex-col gap-4 border border-line bg-surface p-5 sm:p-6">
        <h2 id="post-h" className="m-0 font-display text-2xl font-bold text-fg">
          Post a slot
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-sm text-fg-2">
            When (your time)
            <input type="datetime-local" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} className={INPUT} />
          </label>
          <label className="flex flex-col gap-1.5 text-sm text-fg-2">
            Mock interview
            <select value={form.mockSlug} onChange={(e) => setForm({ ...form, mockSlug: e.target.value })} className={INPUT}>
              {mocks.map((m) => (
                <option key={m.slug} value={m.slug}>
                  {m.title} ({m.company})
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm text-fg-2">
            You&apos;d like to
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className={INPUT}>
              <option value="either">either (swap halfway)</option>
              <option value="candidate">be the candidate</option>
              <option value="interviewer">interview</option>
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm text-fg-2">
            Length
            <select value={form.durationMin} onChange={(e) => setForm({ ...form, durationMin: Number(e.target.value) })} className={INPUT}>
              <option value={45}>45 minutes</option>
              <option value={60}>60 minutes</option>
              <option value={90}>90 minutes (both roles)</option>
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm text-fg-2 sm:col-span-2">
            Note (optional)
            <input type="text" maxLength={280} value={form.note} placeholder="e.g. preparing for SDE-2 loops, happy to give detailed feedback" onChange={(e) => setForm({ ...form, note: e.target.value })} className={INPUT} />
          </label>
        </div>
        <button
          type="button"
          disabled={!form.startsAt || busy === "create"}
          onClick={async () => {
            const ok = await act({ action: "create", ...form, startsAt: new Date(form.startsAt).toISOString() }, "create");
            if (ok) setForm({ ...form, startsAt: "", note: "" });
          }}
          className={`${PRIMARY} self-start`}
        >
          {!user ? "sign in to post a slot" : busy === "create" ? "posting…" : "post slot"}
        </button>
        {error && <p className="m-0 font-mono text-xs text-bad-text">{error}</p>}
      </section>
    </main>
  );
}
