"use client";

/** "Case file update": pick the story; the email (subject, preheader, blocks) is rebuilt from it. */
import { Badge, Card, LABEL, fmtNum } from "@/components/admin/ui";
import { Field, inputCls } from "@/components/admin/content/common";
import type { StoryOption } from "@/lib/campaigns/types";
import { Note } from "./bits";

export default function StoryPicker({ stories, value, onPick, readOnly, error }: { stories: StoryOption[] | undefined; value: string | null; onPick: (s: StoryOption) => void; readOnly?: boolean; error?: string }) {
  const list = stories ?? [];
  const cur = list.find((s) => s.slug === value) ?? null;
  return (
    <Card label="0 · story" title="Which case file goes out" bodyClassName="flex flex-col gap-3 p-3 sm:p-4">
      <Field label="Story" hint={readOnly ? undefined : "Picking a story rebuilds the subject, preheader and body below; edit anything after."}>
        <select
          className={inputCls}
          value={value ?? ""}
          disabled={readOnly || !list.length}
          onChange={(e) => {
            const s = list.find((x) => x.slug === e.target.value);
            if (s) onPick(s);
          }}
        >
          {!list.length && <option value="">{error ? "couldn't load stories" : "loading stories…"}</option>}
          {list.map((s, i) => (
            <option key={s.slug} value={s.slug}>
              {s.caseId} · {s.title.split(/[:—–]\s/)[0]}
              {i === 0 ? " · newest" : ""}
              {s.sentTo ? ` · sent to ${s.sentTo}` : ""}
            </option>
          ))}
        </select>
      </Field>
      {cur && (
        <div className="grid gap-3 border border-line bg-bg p-3 sm:grid-cols-[180px_minmax(0,1fr)]">
          {cur.cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cur.cover} alt="" className="aspect-[3/2] w-full border border-line object-cover" />
          ) : (
            <div className="aspect-[3/2] w-full border border-dashed border-line-strong" />
          )}
          <div className="flex min-w-0 flex-col gap-1.5">
            <span className={LABEL}>
              <span className="text-signal-text">{cur.caseId}</span> · {cur.typeLabel} · {cur.mins} min{cur.date ? ` · ${cur.date}` : ""}
            </span>
            <span className="font-display text-lg font-extrabold leading-tight tracking-tight text-fg">{cur.title}</span>
            {cur.excerpt && <span className="line-clamp-3 text-sm text-fg-3">{cur.excerpt}</span>}
            <span className="mt-auto flex flex-wrap gap-1.5">
              {cur.sentTo ? <Badge tone="signal">already sent to {fmtNum(cur.sentTo)} people</Badge> : <Badge tone="ok">not sent to anyone yet</Badge>}
            </span>
          </div>
        </div>
      )}
      {cur && cur.sentTo > 0 && (
        <Note tone="warn" title="repeat story">
          {fmtNum(cur.sentTo)} people already got this case file (from a campaign or the old newsletter). They&apos;re skipped automatically; the audience counts show how many.
        </Note>
      )}
      {error && !list.length && <Note tone="bad" title="stories">{error}</Note>}
    </Card>
  );
}
