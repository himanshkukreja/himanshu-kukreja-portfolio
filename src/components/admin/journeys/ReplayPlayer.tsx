"use client";

/**
 * Inline PostHog replay. Asks the server to enable sharing for the recording (PATCH …/sharing/)
 * and embeds PostHog's player ({ui host}/embedded/{token}) in an iframe, so the admin never has to
 * leave /admin. The personal API key stays on the server.
 */
import { useEffect, useState } from "react";
import { ConfirmButton, Skeleton, useAdminClient, useAdminData, type AdminError } from "@/components/admin/ui";
import type { EmbedRes, PhStatus } from "@/lib/analytics/journeys";
import { ExtLink, PhErrorState } from "./bits";

type State = { id: string; data?: EmbedRes; error?: AdminError };

export default function ReplayPlayer({ id, onClose, title }: { id: string; onClose?: () => void; title?: string }) {
  const client = useAdminClient();
  const [state, setState] = useState<State>({ id });
  const [nonce, setNonce] = useState(0);
  const { data: status } = useAdminData<PhStatus>("/api/admin/posthog/status");
  const fallbackUrl = status?.projectId ? `${status.uiHost}/project/${status.projectId}/replay/${id}` : null;

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
    <div className="flex flex-col border border-line-strong bg-bg">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2">
        <span className="min-w-0 truncate font-mono text-[11px] text-fg-3">
          <span className="text-signal-text">▶</span> replay {title ? `· ${title}` : ""} <span className="text-fg-4">#{id.slice(-8)}</span>
        </span>
        <span className="flex flex-wrap items-center gap-1.5">
          {(cur.data?.appUrl || fallbackUrl) && <ExtLink href={(cur.data?.appUrl || fallbackUrl)!}>open in PostHog</ExtLink>}
          {cur.data?.shared && (
            <ConfirmButton size="sm" confirmLabel="revoke link" onConfirm={revoke} aria-label="Revoke the public share link for this recording">
              unshare
            </ConfirmButton>
          )}
          {onClose && (
            <button type="button" onClick={onClose} aria-label="Close replay" className="grid h-10 w-10 place-items-center border border-line-strong text-fg hover:bg-surface-2">
              ×
            </button>
          )}
        </span>
      </div>
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
          className="h-[68vh] max-h-[640px] min-h-[320px] w-full border-0 bg-surface sm:aspect-[16/10] sm:h-auto sm:max-h-[72vh]"
        />
      ) : (
        <div className="flex flex-col items-start gap-2 px-4 py-6">
          <span className="font-mono text-xs text-fg-3">$ replay → 404</span>
          <p className="text-sm font-semibold text-fg">No recording for this session</p>
          <p className="max-w-prose text-sm text-fg-3">
            PostHog skips very short sessions (minimum duration), sessions from browsers with Do Not Track, and anything older than the
            replay retention (30 days on the free plan).
          </p>
        </div>
      )}
      <p className="border-t border-line px-3 py-1.5 font-mono text-[10px] text-fg-4">
        sharing makes this one replay viewable by anyone with its secret link · inputs are masked
      </p>
    </div>
  );
}
