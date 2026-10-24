"use client";

import { useState } from "react";
import { useGame } from "@/game/GameProvider";
import { Dot, container } from "./ui";

const TYPES = ["hiring", "freelance backend", "design review", "markdrop", "chukta", "just saying hi"] as const;
type HireType = (typeof TYPES)[number];

type Field = "name" | "email" | "message";

/** What I take on outside my full-time role (the "work with me" cards above the form). */
const OFFERS: { type: HireType; kicker: string; title: string; body: string; points: string[] }[] = [
  {
    type: "freelance backend",
    kicker: "freelance",
    title: "Backend work",
    body: "APIs, data models and real-time systems that have to hold up under load: Python/FastAPI, Go, Postgres, Redis, queues, WebSockets and WebRTC.",
    points: ["new services or a rescue of a slow one", "real-time and device-streaming features", "scoped, async, clear milestones"],
  },
  {
    type: "design review",
    kicker: "review",
    title: "System design reviews",
    body: "A second pair of eyes on an architecture before you build it, or after it starts to creak: bottlenecks, failure modes, cost and the trade-offs you're making.",
    points: ["a written review with concrete fixes", "capacity and failure-mode checks", "one or two calls to walk through it"],
  },
];

type Res =
  | { kind: "idle" }
  | { kind: "pending" }
  | { kind: "done"; ok: boolean; statusText: string; body: string; latency: string };

const HTTP_TEXT: Record<number, string> = {
  400: "Bad Request",
  404: "Not Found",
  405: "Method Not Allowed",
  413: "Payload Too Large",
  429: "Too Many Requests",
  500: "Internal Server Error",
  502: "Bad Gateway",
  503: "Service Unavailable",
  504: "Gateway Timeout",
};

const inputClass =
  "min-h-11 min-w-0 border border-line-strong bg-surface px-2.5 font-mono text-base text-fg placeholder:text-fg-4 aria-[invalid=true]:border-bad sm:text-sm";

const rowBase = "flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:gap-1.5 sm:pl-5";
const rowClass = `${rowBase} sm:items-center`;

export default function HireApi() {
  const { award } = useGame();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [type, setType] = useState<HireType>("hiring");
  const [msg, setMsg] = useState("");
  const [errs, setErrs] = useState<Field[]>([]);
  const [res, setRes] = useState<Res>({ kind: "idle" });
  const sending = res.kind === "pending";

  const send = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (sending) return;
    const t0 = performance.now();

    const failing: Field[] = [];
    if (name.trim().length < 2) failing.push("name");
    if (!/.+@.+\..+/.test(email.trim())) failing.push("email");
    if (msg.trim().length < 10) failing.push("message");
    setErrs(failing);

    if (failing.length) {
      const ms = performance.now() - t0;
      setRes({
        kind: "done",
        ok: false,
        statusText: "422 Unprocessable",
        latency: `${ms.toFixed(1)} ms · local`,
        body: JSON.stringify(
          { error: "validation_failed", fields: failing, hint: "name, a real email, and a message of 10+ chars" },
          null,
          2
        ),
      });
      return;
    }

    setRes({ kind: "pending" });
    try {
      const r = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), message: `[${type}] ${msg.trim()}` }),
      });
      const text = await r.text();
      const latency = `${Math.round(performance.now() - t0)} ms`;
      let data: unknown = text;
      try {
        data = JSON.parse(text);
      } catch {
        // non-JSON body: show it as-is
      }

      if (r.ok) {
        const gained = award("msg", "Request accepted · 201 Created");
        const queryId = data && typeof data === "object" && "queryId" in data ? (data as { queryId: unknown }).queryId : null;
        setRes({
          kind: "done",
          ok: true,
          statusText: "201 Created",
          latency,
          body: JSON.stringify(
            {
              id: queryId != null ? `req_${String(queryId)}` : "req_queued",
              status: "queued",
              type,
              reply_from: "kukreja.him@gmail.com",
              xp_awarded: gained,
              upstream: `POST /api/contact → ${r.status}`,
            },
            null,
            2
          ),
        });
        setMsg("");
      } else {
        setRes({
          kind: "done",
          ok: false,
          statusText: `${r.status} ${r.statusText || HTTP_TEXT[r.status] || "Error"}`,
          latency,
          body: typeof data === "string" ? data || "// empty response body" : JSON.stringify(data, null, 2),
        });
      }
    } catch (err) {
      setRes({
        kind: "done",
        ok: false,
        statusText: "ERR network",
        latency: `${Math.round(performance.now() - t0)} ms`,
        body: JSON.stringify(
          { error: "network_error", detail: err instanceof Error ? err.message : String(err), hint: "or email kukreja.him@gmail.com" },
          null,
          2
        ),
      });
    }
  };

  const invalid = (f: Field) => (errs.includes(f) ? true : undefined);

  let statusText = "awaiting request";
  let statusClass = "text-fg-3";
  let body = "// press Send to see the response";
  let latency = "";
  if (res.kind === "pending") {
    statusText = "pending…";
    body = "// handshaking…";
  } else if (res.kind === "done") {
    statusText = res.statusText;
    statusClass = res.ok ? "font-semibold text-ok" : "font-semibold text-bad-text";
    body = res.body;
    latency = res.latency;
  }

  return (
    <section id="contact" aria-labelledby="api-h" className="scroll-mt-20 border-t border-line bg-raised">
      <div className={`${container} flex flex-col gap-7 py-14 sm:py-[88px]`}>
        <div className="flex max-w-[760px] flex-col gap-3">
          <span className="break-all font-mono text-[13px] text-signal-text">❯ curl -X POST himanshukukreja.in/api/hire</span>
          <h2
            id="api-h"
            className="m-0 font-display text-[clamp(40px,6vw,80px)] font-extrabold leading-[0.9] tracking-[-0.05em] text-fg"
          >
            Send me a request
            <Dot />
          </h2>
          <p className="m-0 text-base leading-relaxed text-fg-2 sm:text-[17px]">
            Hiring, a backend that has to survive a spike, a question about a case file, Markdrop, or feedback on the
            Chukta beta. Fill the body, send it, read the response.
          </p>
        </div>

        <div aria-labelledby="work-h" className="flex flex-col gap-4">
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
            <h3 id="work-h" className="m-0 font-display text-[28px] font-bold tracking-[-0.02em] text-fg">
              Work with me
            </h3>
            <span className="font-mono text-xs text-fg-3">
              <span aria-hidden className="mr-1.5 inline-block h-2 w-2 bg-signal" />
              limited availability · part-time, alongside my full-time role
            </span>
          </div>
          <div className="grid gap-px border border-line-strong bg-line sm:grid-cols-2">
            {OFFERS.map((o) => (
              <div key={o.type} className="flex flex-col gap-3 bg-bg p-5">
                <span className="font-mono text-[11px] uppercase tracking-label text-signal-text">{o.kicker}</span>
                <span className="font-display text-2xl font-bold tracking-[-0.02em] text-fg">{o.title}</span>
                <p className="m-0 text-[15px] leading-relaxed text-fg-2">{o.body}</p>
                <ul className="m-0 flex list-none flex-col gap-1 p-0 font-mono text-[13px] text-fg-3">
                  {o.points.map((pt) => (
                    <li key={pt}>
                      <span className="text-signal-text">+</span> {pt}
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={() => {
                    setType(o.type);
                    document.getElementById("hire-message")?.focus();
                  }}
                  className="mt-auto inline-flex min-h-11 items-center justify-center self-start border border-line-strong px-4 font-mono text-xs text-fg hover:bg-surface-2"
                >
                  {`POST /api/hire {"type": "${o.type}"} →`}
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-px border border-line-strong bg-line">
          <form noValidate onSubmit={send} aria-label="POST /api/hire request body" className="flex min-w-0 flex-[1_1_520px] flex-col bg-bg">
            <div className="flex flex-wrap items-center gap-2.5 border-b border-line px-3 py-3 font-mono text-[13px] sm:px-4">
              <span className="bg-signal px-2 py-1 font-semibold text-on-signal">POST</span>
              <span className="text-fg">/api/hire</span>
              <span className="flex-grow" />
              <span className="hidden text-fg-3 sm:inline">Content-Type: application/json</span>
            </div>

            <div className="flex flex-col gap-2 px-3 py-4 font-mono text-sm leading-loose text-fg-2 sm:gap-0 sm:px-4 sm:py-[18px]">
              <span aria-hidden className="hidden sm:block">
                {"{"}
              </span>
              <label className={rowClass}>
                <span className="text-signal-text">&quot;name&quot;</span>
                <span aria-hidden className="hidden sm:inline">:</span>
                <input
                  type="text"
                  name="name"
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={'"Ada Lovelace"'}
                  aria-invalid={invalid("name")}
                  className={`${inputClass} sm:flex-[1_1_200px]`}
                />
                <span aria-hidden className="hidden sm:inline">,</span>
              </label>
              <label className={rowClass}>
                <span className="text-signal-text">&quot;email&quot;</span>
                <span aria-hidden className="hidden sm:inline">:</span>
                <input
                  type="email"
                  name="email"
                  autoComplete="email"
                  inputMode="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={'"you@company.com"'}
                  aria-invalid={invalid("email")}
                  className={`${inputClass} sm:flex-[1_1_200px]`}
                />
                <span aria-hidden className="hidden sm:inline">,</span>
              </label>
              <div role="group" aria-label="type" className={rowClass}>
                <span className="text-signal-text">
                  &quot;type&quot;<span aria-hidden className="hidden text-fg-2 sm:inline">:</span>
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {TYPES.map((t) => {
                    const on = type === t;
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setType(t)}
                        aria-pressed={on}
                        className={`min-h-11 px-2 font-mono text-[13px] sm:min-h-9 ${
                          on ? "border border-fg bg-fg text-bg" : "border border-line-strong bg-transparent text-fg-2 hover:bg-surface-2"
                        }`}
                      >
                        &quot;{t}&quot;
                      </button>
                    );
                  })}
                </div>
                <span aria-hidden className="hidden sm:inline">,</span>
              </div>
              <label className={`${rowBase} sm:items-start`}>
                <span className="text-signal-text sm:pt-1">&quot;message&quot;</span>
                <span aria-hidden className="hidden sm:inline sm:pt-1">:</span>
                <textarea
                  id="hire-message"
                  rows={3}
                  name="message"
                  value={msg}
                  onChange={(e) => setMsg(e.target.value)}
                  placeholder={'"What are we building?"'}
                  aria-invalid={invalid("message")}
                  className={`${inputClass} resize-y py-2 leading-normal sm:flex-[1_1_260px]`}
                />
              </label>
              <span aria-hidden className="hidden sm:block">
                {"}"}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-3 px-3 pb-[18px] sm:px-4">
              <button
                type="submit"
                disabled={sending}
                className="min-h-[52px] w-full bg-signal px-6 font-mono text-[15px] font-semibold text-on-signal hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45 sm:w-auto"
              >
                {sending ? "sending…" : "Send ⏎"}
              </button>
              <span className="font-mono text-xs text-signal-text">201 → +200 XP</span>
            </div>
          </form>

          <div className="flex min-w-0 flex-[1_1_420px] flex-col bg-surface">
            <div className="flex items-center gap-3 border-b border-line px-3 py-3 font-mono text-[13px] sm:px-4">
              <span className="text-fg-3">Response</span>
              <span className="flex-grow" />
              <span className={statusClass}>{statusText}</span>
              <span className="text-fg-3">{latency}</span>
            </div>
            <pre
              aria-live="polite"
              aria-label="Response body"
              className="m-0 flex-grow overflow-x-auto whitespace-pre-wrap break-words px-3 py-4 font-mono text-[13px] leading-[1.75] text-fg-2 sm:px-4 sm:py-[18px] sm:text-sm"
            >
              {body}
            </pre>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 border-t border-line px-3 py-3.5 text-[13px] text-fg-3 sm:px-4">
              <span>
                Prefer plain email? <span className="select-all text-fg-2">kukreja.him@gmail.com</span>
              </span>
              <span>Bengaluru · IST</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
