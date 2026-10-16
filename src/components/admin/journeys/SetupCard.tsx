"use client";

import type { ReactNode } from "react";
import { Badge, LABEL } from "@/components/admin/ui";
import type { PhStatus } from "@/lib/analytics/journeys";
import { cx } from "./bits";

type Step = { env: string; title: string; where: ReactNode; example: string; scope: "public" | "secret" };

const STEPS = (region: string): Step[] => [
  {
    env: "NEXT_PUBLIC_POSTHOG_KEY",
    title: "Create a PostHog project",
    where: (
      <>
        Sign up at {"posthog.com"} (pick the <b>US</b> or <b>EU</b> cloud), create a project for himanshukukreja.in, then copy{" "}
        <b>Project settings → General → Project API key</b>.
      </>
    ),
    example: "phc_…",
    scope: "public",
  },
  {
    env: "NEXT_PUBLIC_POSTHOG_HOST",
    title: "Region",
    where: <>The cloud you picked: us or eu. It decides the proxy target and the API host.</>,
    example: region || "us",
    scope: "public",
  },
  {
    env: "POSTHOG_PROJECT_ID",
    title: "Project id",
    where: (
      <>
        <b>Project settings → General → Project ID</b> (the number in /project/<b>12345</b>/ URLs).
      </>
    ),
    example: "12345",
    scope: "secret",
  },
  {
    env: "POSTHOG_PERSONAL_API_KEY",
    title: "Personal API key for this dashboard",
    where: (
      <>
        <b>Account settings → Personal API keys → Create</b>, limited to this project, with scopes: <b>query:read</b>, <b>person:read</b>,{" "}
        <b>session_recording:read</b>, <b>sharing_configuration:read</b> and <b>sharing_configuration:write</b> (for embedded replays). Server
        only, never NEXT_PUBLIC.
      </>
    ),
    example: "phx_…",
    scope: "secret",
  },
  {
    env: "NEXT_PUBLIC_GA_ID",
    title: "Google Analytics 4 (optional)",
    where: (
      <>
        {"analytics.google.com → "}<b>Admin → Data streams → Web → Measurement ID</b>. Keep Enhanced measurement → page changes based on browser
        history <b>on</b>; leave Google signals off.
      </>
    ),
    example: "G-XXXXXXXXXX",
    scope: "public",
  },
];

/** Shown instead of data when PostHog (or part of it) isn't configured yet. */
export default function SetupCard({ status, compact = false }: { status: PhStatus; compact?: boolean }) {
  const missing = new Set(status.missing);
  const steps = STEPS(status.region);
  const done = steps.filter((s) => !missing.has(s.env)).length;
  return (
    <section className="border border-dashed border-signal bg-signal/5" aria-labelledby="ph-setup-h">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-dashed border-signal/60 px-4 py-3">
        <div className="min-w-0">
          <div className={LABEL}>setup · {done}/{steps.length} done</div>
          <h2 id="ph-setup-h" className="font-display text-[22px] font-extrabold leading-tight tracking-[-0.03em] text-fg sm:text-[26px]">
            Connect PostHog to see journeys and replays here
          </h2>
        </div>
        <Badge tone={status.capture ? "ok" : "muted"}>{status.capture ? "capture on" : "capture off"}</Badge>
      </header>
      {!compact && (
        <p className="px-4 pt-3 text-sm text-fg-2">
          Until these exist the site sends nothing to PostHog or Google (no script, no request). Add them in{" "}
          <b className="text-fg">Vercel → Project → Settings → Environment Variables</b> (Production + Preview), then redeploy: public
          (NEXT_PUBLIC_*) values are baked in at build time, and the {`${status.proxyPath}/*`} proxy is registered at build time too.
        </p>
      )}
      <ol className="flex flex-col gap-0 px-4 py-3">
        {steps.map((s, i) => {
          const ok = !missing.has(s.env);
          return (
            <li key={s.env} className="flex gap-3 border-b border-line py-3 last:border-0">
              <span
                aria-hidden
                className={cx("grid h-7 w-7 shrink-0 place-items-center border font-mono text-xs", ok ? "border-ok bg-ok/10 text-ok" : "border-line-strong text-fg-3")}
              >
                {ok ? "✓" : i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-sm font-semibold text-fg">{s.title}</span>
                  <Badge tone={s.scope === "secret" ? "bad" : "neutral"}>{s.scope === "secret" ? "server secret" : "public"}</Badge>
                  {ok && <Badge tone="ok">set</Badge>}
                </div>
                <code className="mt-1 block break-all font-mono text-[12px] text-signal-text">
                  {s.env}={s.example}
                </code>
                <p className="mt-1 text-[13px] leading-relaxed text-fg-3 [&_b]:font-semibold [&_b]:text-fg-2">{s.where}</p>
              </div>
            </li>
          );
        })}
      </ol>
      <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-dashed border-signal/60 px-4 py-3 font-mono text-[11px] text-fg-3">
        <span>{`proxy · ${status.proxyPath}/* → ${status.region}.i.posthog.com`}</span>
        <span>api · {status.uiHost}</span>
        <span>replays · masked inputs, /admin never recorded</span>
      </div>
    </section>
  );
}
