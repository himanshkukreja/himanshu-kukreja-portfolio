"use client";

/**
 * Inline session replay, used everywhere a recording plays in /admin (Journeys recordings, a
 * person's timeline, /admin/live).
 *
 * Default: our own rrweb player (./replay/RrwebPlayer, lazy chunk) fed by the admin-gated snapshots
 * route — themed controls with 0.5×–8× speed, skip inactivity, scrubber, fullscreen, keyboard.
 * PostHog's embedded/shared player (/embedded/{token}) exposes no speed parameter or postMessage
 * API, so it stays only as the fallback: if snapshots can't be loaded, or on demand ("PostHog
 * player"), we enable sharing for this one recording (PATCH …/sharing/) and iframe it as before.
 * The personal API key stays on the server either way.
 */
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { ConfirmButton, Skeleton, useAdminClient, useAdminData, type AdminError } from "@/components/admin/ui";
import type { EmbedRes, PhStatus } from "@/lib/analytics/journeys";
import { ExtLink, PhErrorState, cx } from "./bits";

const RrwebPlayer = dynamic(() => import("./replay/RrwebPlayer"), {
  ssr: false,
  loading: () => <Skeleton className="aspect-[16/10] max-h-[70vh] w-full" />,
});

type Mode = { kind: "ours"; attempt: number } | { kind: "embed"; reason: string | null };

export default function ReplayPlayer({ id, onClose, title, fill = false }: { id: string; onClose?: () => void; title?: string; fill?: boolean }) {
  const [mode, setMode] = useState<{ id: string; m: Mode }>({ id, m: { kind: "ours", attempt: 0 } });
  const { data: status } = useAdminData<PhStatus>("/api/admin/posthog/status");
  const fallbackUrl = status?.projectId ? `${status.uiHost}/project/${status.projectId}/replay/${id}` : null;
  const m: Mode = mode.id === id ? mode.m : { kind: "ours", attempt: 0 };
  const set = (next: Mode) => setMode({ id, m: next });

  return (
    <div className={cx("flex min-w-0 flex-col border border-line-strong bg-bg", fill && "min-h-0 flex-1")}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2">
        <span className="min-w-0 truncate font-mono text-[11px] text-fg-3">
          <span className="text-signal-text">▶</span> replay {title ? `· ${title}` : ""} <span className="text-fg-4">#{id.slice(-8)}</span>
        </span>
        <span className="flex flex-wrap items-center gap-1.5">
          {m.kind === "ours" ? (
            <button
              type="button"
              onClick={() => set({ kind: "embed", reason: null })}
              title="Use PostHog's embedded player instead (no speed control; enables a share link for this recording)"
              className="inline-flex min-h-10 items-center border border-line-strong px-3 font-mono text-xs text-fg-3 hover:bg-surface-2 hover:text-fg"
            >
              PostHog player
            </button>
          ) : (
            <button
              type="button"
              onClick={() => set({ kind: "ours", attempt: Date.now() })}
              className="inline-flex min-h-10 items-center border border-signal px-3 font-mono text-xs text-signal-text hover:bg-signal/10"
            >
              ↺ our player
            </button>
          )}
          {fallbackUrl && <ExtLink href={fallbackUrl}>open in PostHog</ExtLink>}
          {onClose && (
            <button type="button" onClick={onClose} aria-label="Close replay" className="grid h-10 w-10 place-items-center border border-line-strong text-fg hover:bg-surface-2">
              ×
            </button>
          )}
        </span>
      </div>
      {m.kind === "ours" ? (
        <RrwebPlayer
          key={`${id}:${m.attempt}`}
          id={id}
          fill={fill}
          onFail={(reason) => set({ kind: "embed", reason })}
          onRetry={() => set({ kind: "ours", attempt: Date.now() })}
        />
      ) : (
        <EmbedPlayer id={id} reason={m.reason} fill={fill} onClose={onClose} />
      )}
    </div>
  );
}

type EmbedState = { id: string; data?: EmbedRes; error?: AdminError };

/** PostHog's own player in an iframe (sharing enabled for this one recording). */
function EmbedPlayer({ id, reason, fill, onClose }: { id: string; reason: string | null; fill: boolean; onClose?: () => void }) {
  const client = useAdminClient();
  const [state, setState] = useState<EmbedState>({ id });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let off = false;
    client
      .json<EmbedRes>("/api/admin/posthog/recordings/share", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) })
      .then((data) => {
        if (!off) setState({ id, data });
      })
      .catch((error: AdminError) => {
        if (!off) setState({ id, error });
      });
    return () => {
      off = true;
    };
  }, [client, id, nonce]);

  const cur = state.id === id ? state : { id };
  const revoke = async () => {
    await client.json<EmbedRes>("/api/admin/posthog/recordings/share", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, enabled: false }) });
    onClose?.();
  };

  return (
    <div className={cx("flex flex-col", fill && "min-h-0 flex-1")}>
      {reason && (
        <p className="border-b border-line bg-signal/5 px-3 py-1.5 font-mono text-[11px] text-fg-3">
          our player couldn&apos;t load this replay ({reason}) · showing PostHog&apos;s player (no speed control)
        </p>
      )}
      {cur.error ? (
        <PhErrorState className="m-3" error={cur.error} title="Couldn't open this replay" onRetry={() => setNonce((n) => n + 1)} />
      ) : !cur.data ? (
        <Skeleton className="aspect-[16/10] max-h-[70vh] w-full" />
      ) : cur.data.embedUrl ? (
        <iframe
          key={cur.data.embedUrl}
          src={cur.data.embedUrl}
          title={`Session replay ${id}`}
          allow="fullscreen"
          allowFullScreen
          referrerPolicy="no-referrer"
          className={cx(
            "w-full border-0 bg-surface",
            fill ? "min-h-0 flex-1" : "h-[68vh] max-h-[640px] min-h-[320px] sm:aspect-[16/10] sm:h-auto sm:max-h-[72vh]"
          )}
        />
      ) : (
        <div className="flex flex-col items-start gap-2 px-4 py-6">
          <span className="font-mono text-xs text-fg-3">$ replay → 404</span>
          <p className="text-sm font-semibold text-fg">No recording for this session</p>
          <p className="max-w-prose text-sm text-fg-3">
            PostHog skips very short sessions (minimum duration), sessions from browsers with Do Not Track, and anything older than the replay retention (30 days on
            the free plan).
          </p>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-3 py-1.5 font-mono text-[10px] text-fg-4">
        <span>sharing makes this one replay viewable by anyone with its secret link · inputs are masked</span>
        {cur.data?.shared && (
          <ConfirmButton size="sm" confirmLabel="revoke link" onConfirm={revoke} aria-label="Revoke the public share link for this recording">
            unshare
          </ConfirmButton>
        )}
      </div>
    </div>
  );
}
