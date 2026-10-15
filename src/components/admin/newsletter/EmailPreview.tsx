"use client";

/**
 * Preview: the exact email (same renderer the server sends with) in a sandboxed iframe (no scripts,
 * no same-origin), desktop / mobile width, HTML / plain text / merge data, "preview as" any
 * recipient with their real data. Tracking markup is included with the "preview" token, which the
 * pixel and click routes ignore.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Card, LABEL, useAdminData } from "@/components/admin/ui";
import { SearchInput, Segmented } from "@/components/admin/content/common";
import { unsubscribeUrlFor } from "@/lib/campaigns/links";
import { renderEmail } from "@/lib/campaigns/render";
import { MERGE_TAGS, SAMPLE_VARS, resolveTags, type MergeVars } from "@/lib/campaigns/tags";
import type { RecipientPreview } from "@/lib/campaigns/types";
import { cx, useDebounced } from "./bits";
import type { Draft } from "./types";

type View = "html" | "text" | "data";
type Width = "desktop" | "mobile";

export function renderPreview(draft: Draft, base: string, as: RecipientPreview | null) {
  const vars: MergeVars = { ...(as?.vars ?? SAMPLE_VARS), unsubscribe_url: unsubscribeUrlFor(base, "preview") };
  const utm = draft.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "campaign";
  return { vars, ...renderEmail(draft, vars, { base, token: "preview", trackOpens: draft.trackOpens, trackClicks: draft.trackClicks, utmCampaign: utm }) };
}

/** Renders the email at its real width and scales it down to fit narrow columns / phones. */
function ScaledFrame({ html, frameWidth, height }: { html: string; frameWidth: number; height: number }) {
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const scale = w ? Math.min(1, w / frameWidth) : 1;
  return (
    <div ref={box} className="relative w-full overflow-hidden border border-line bg-[#F5F4F0]" style={{ height: Math.round(height * scale) }}>
      {/* sandbox with no permissions: no scripts, no same-origin, no top navigation */}
      <iframe
        title="Email preview"
        sandbox=""
        srcDoc={html}
        className="absolute top-0 block border-0 bg-white"
        style={{ width: frameWidth, height, left: scale < 1 ? 0 : Math.max(0, (w - frameWidth) / 2), transform: `scale(${scale})`, transformOrigin: "top left" }}
      />
    </div>
  );
}

export function RecipientPicker({ as, setAs }: { as: RecipientPreview | null; setAs: (r: RecipientPreview | null) => void }) {
  const [q, setQ] = useState("");
  const dq = useDebounced(q.trim(), 300);
  const res = useAdminData<{ recipients: RecipientPreview[] }>(`/api/admin/newsletter/recipients?q=${encodeURIComponent(dq)}`);
  const list = res.data?.recipients ?? [];
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <span className={LABEL}>preview as</span>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setAs(null)} className={cx("min-h-10 border px-3 font-mono text-xs", !as ? "border-fg bg-fg text-bg" : "border-line-strong text-fg-2 hover:bg-surface-2")}>
          sample data
        </button>
        {as && (
          <span className="inline-flex min-h-10 min-w-0 items-center gap-2 border border-signal bg-signal/10 px-3 text-sm">
            <span className="truncate font-semibold text-fg">{as.name || as.email}</span>
            <span className="hidden truncate font-mono text-[11px] text-fg-3 sm:inline">{as.email}</span>
          </span>
        )}
      </div>
      <SearchInput value={q} onChange={setQ} placeholder="search a learner by name or email…" label="Search recipients" />
      {list.length > 0 && (
        <ul className="m-0 flex max-h-56 list-none flex-col overflow-y-auto border border-line p-0">
          {list.map((r) => (
            <li key={r.email} className="border-b border-line last:border-0">
              <button
                type="button"
                onClick={() => setAs(r)}
                className={cx("flex min-h-11 w-full min-w-0 items-center justify-between gap-3 px-3 py-1.5 text-left hover:bg-surface-2", as?.email === r.email && "bg-surface-2")}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm text-fg">{r.name || "—"}</span>
                  <span className="block truncate font-mono text-[11px] text-fg-3">{r.email}</span>
                </span>
                <span className="shrink-0 font-mono text-[11px] text-fg-4">
                  {r.source === "account" ? `${r.vars.lessons_completed} done · ${r.vars.streak}d` : r.source}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {res.error && <p className="m-0 text-xs text-bad-text">{res.error.message}</p>}
    </div>
  );
}

export default function EmailPreview({
  draft,
  base,
  as,
  setAs,
  compact,
  defaultWidth = "desktop",
}: {
  draft: Draft;
  base: string;
  as: RecipientPreview | null;
  setAs?: (r: RecipientPreview | null) => void;
  compact?: boolean;
  defaultWidth?: Width;
}) {
  const [view, setView] = useState<View>("html");
  const [width, setWidth] = useState<Width>(defaultWidth);
  const live = useDebounced(draft, compact ? 250 : 0);
  const out = useMemo(() => renderPreview(live, base, as), [live, base, as]);

  return (
    <Card
      label={compact ? "live preview" : "3 · preview"}
      title={<span className="whitespace-normal break-words">{out.subject || "(no subject)"}</span>}
      bodyClassName="flex flex-col gap-3 p-3 sm:p-4"
    >
      {!compact && setAs && <RecipientPicker as={as} setAs={setAs} />}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Segmented
          label="Preview format"
          value={view}
          onChange={setView}
          options={[
            { id: "html", label: "html" },
            { id: "text", label: "plain text" },
            { id: "data", label: "merge data" },
          ]}
        />
        {view === "html" && (
          <Segmented
            label="Preview width"
            value={width}
            onChange={setWidth}
            options={[
              { id: "desktop", label: "desktop" },
              { id: "mobile", label: "mobile" },
            ]}
          />
        )}
      </div>
      <div className="font-mono text-[11px] text-fg-3">
        <span className="text-fg-4">preheader ·</span> {draft.doc.layout === "raw" ? "(inside the template HTML)" : draft.preheader ? resolveTags(draft.preheader, out.vars) : "—"}
      </div>
      {view === "html" && (
        <ScaledFrame html={out.html} frameWidth={width === "mobile" ? 375 : 680} height={compact ? 900 : 1000} />
      )}
      {view === "text" && <pre className="m-0 max-h-[720px] overflow-auto whitespace-pre-wrap break-words border border-line bg-bg p-3 font-mono text-xs leading-relaxed text-fg-2">{out.text}</pre>}
      {view === "data" && (
        <div className="relative max-w-full overflow-x-auto border border-line">
          <table className="w-full border-collapse text-[13px]">
            <tbody>
              {MERGE_TAGS.map((t) => (
                <tr key={t.tag} className="border-b border-line last:border-0">
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-signal-text">{`{{${t.tag}}}`}</td>
                  <td className="break-all px-3 py-2 text-fg-2">{out.vars[t.tag] || <span className="text-fg-4">(empty · fallback used)</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="m-0 text-xs text-fg-4">Pixel and click links in the preview use the “preview” token, which is never recorded. Fonts load from Google Fonts like in Gmail / Apple Mail.</p>
    </Card>
  );
}
