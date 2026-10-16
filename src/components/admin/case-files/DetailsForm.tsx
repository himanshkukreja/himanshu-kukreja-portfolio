"use client";

/** Frontmatter: title, slug, excerpt, type, tags, date, cover (+ alt, motion layer), SEO. */
import { useRef, useState, type ChangeEvent, type KeyboardEvent, type ReactNode } from "react";
import { CASE_TYPE_LABEL, type CaseType } from "@/components/stories/case-types";
import { UPLOAD_LIMITS, slugify, type CaseFileFields, type Problem } from "@/lib/case-files/types";
import { BTN, Counter, FieldLabel, INPUT, cx } from "./client";

type Props = {
  f: CaseFileFields;
  set: (patch: Partial<CaseFileFields>) => void;
  problems: Problem[];
  slugLocked: string | null;
  readOnly?: boolean;
  onUpload: (file: File, kind: "cover" | "motion") => Promise<string>;
  /** auto-fill the slug from the title until it's edited by hand */
  slugAuto: boolean;
  setSlugAuto: (v: boolean) => void;
  /** case number: reserved / assigned, the next free one, and whether it can still change */
  caseNumber?: { value: number | null; next: string | null; canReserve: boolean; onReserve: (n: number | null) => Promise<void> };
};

function FieldProblems({ problems, field }: { problems: Problem[]; field: string }) {
  const mine = problems.filter((p) => p.field === field);
  if (!mine.length) return null;
  return (
    <ul className="m-0 mt-1.5 flex list-none flex-col gap-0.5 p-0" data-field-problems={field}>
      {mine.map((p, i) => (
        <li key={i} className={cx("text-[12.5px] leading-snug", p.level === "error" ? "text-bad-text" : "text-signal-text")}>
          {p.level === "error" ? "✗ " : "! "}
          {p.message}
        </li>
      ))}
    </ul>
  );
}

function Section({ title, children, hint }: { title: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <section className="flex flex-col gap-4 border border-line bg-surface p-4">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[15px] font-semibold text-fg">{title}</h3>
        {hint && <span className="font-mono text-[11px] text-fg-4">{hint}</span>}
      </header>
      {children}
    </section>
  );
}

export default function DetailsForm({ f, set, problems, slugLocked, readOnly, onUpload, slugAuto, setSlugAuto, caseNumber }: Props) {
  const [tagDraft, setTagDraft] = useState("");
  const coverRef = useRef<HTMLInputElement>(null);
  const motionRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"cover" | "motion" | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [ratio, setRatio] = useState<number | null>(null);

  const addTags = (raw: string) => {
    const next = raw
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    if (!next.length) return;
    const have = new Set(f.tags.map((t) => t.toLowerCase()));
    set({ tags: [...f.tags, ...next.filter((t) => !have.has(t.toLowerCase()))] });
    setTagDraft("");
  };
  const onTagKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTags(tagDraft);
    } else if (e.key === "Backspace" && !tagDraft && f.tags.length) set({ tags: f.tags.slice(0, -1) });
  };

  const upload = async (ev: ChangeEvent<HTMLInputElement>, kind: "cover" | "motion") => {
    const file = ev.target.files?.[0];
    ev.target.value = "";
    if (!file) return;
    setUploadError(null);
    setBusy(kind);
    try {
      const url = await onUpload(file, kind);
      set(kind === "cover" ? { coverUrl: url } : { motionCoverUrl: url });
    } catch (e) {
      setUploadError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const id = (k: string) => `cf-${k}`;
  const titleLen = f.title.trim().length;
  const excerptLen = f.excerpt.trim().length;

  return (
    <div className="flex flex-col gap-4">
      <Section title="Headline" hint="title · slug · excerpt">
        <div>
          <FieldLabel htmlFor={id("title")} right={<Counter n={titleLen} min={15} max={140} soft={[15, 110]} />}>
            Title
          </FieldLabel>
          <input
            id={id("title")}
            className={cx(INPUT, "font-display text-[18px] font-extrabold tracking-[-0.02em]")}
            value={f.title}
            disabled={readOnly}
            placeholder="The Great ID Crisis: When Auto-Increment Hits the Mathematical Wall"
            onChange={(e) => set(slugAuto && !slugLocked ? { title: e.target.value, slug: slugify(e.target.value) || f.slug } : { title: e.target.value })}
          />
          <FieldProblems problems={problems} field="title" />
        </div>
        <div>
          <FieldLabel htmlFor={id("slug")} hint={slugLocked ? `locked: ${slugLocked}` : slugAuto ? "follows the title" : undefined}>
            Slug
          </FieldLabel>
          <div className="flex items-stretch">
            <span className="hidden items-center border border-r-0 border-line-strong bg-surface-2 px-2.5 font-mono text-[12px] text-fg-3 sm:flex">/stories/</span>
            <input
              id={id("slug")}
              className={cx(INPUT, "font-mono text-[13px]")}
              value={f.slug}
              disabled={readOnly || !!slugLocked}
              onChange={(e) => {
                setSlugAuto(false);
                set({ slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-{2,}/g, "-") });
              }}
            />
            {!slugLocked && !slugAuto && (
              <button type="button" className={cx(BTN, "border-l-0")} disabled={readOnly} onClick={() => (setSlugAuto(true), set({ slug: slugify(f.title) || f.slug }))}>
                from title
              </button>
            )}
          </div>
          <FieldProblems problems={problems} field="slug" />
        </div>
        <div>
          <FieldLabel htmlFor={id("excerpt")} hint="card text · meta description · email teaser" right={<Counter n={excerptLen} min={60} max={320} soft={[100, 260]} />}>
            Excerpt
          </FieldLabel>
          <textarea id={id("excerpt")} rows={3} className={cx(INPUT, "resize-y leading-relaxed")} value={f.excerpt} disabled={readOnly} onChange={(e) => set({ excerpt: e.target.value })} />
          <FieldProblems problems={problems} field="excerpt" />
        </div>
      </Section>

      <Section title="Filing" hint="type · tags · date">
        <div>
          <FieldLabel>Type</FieldLabel>
          <div role="radiogroup" aria-label="Case type" className="grid grid-cols-3 border border-line-strong">
            {(Object.keys(CASE_TYPE_LABEL) as CaseType[]).map((t, i) => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={f.type === t}
                disabled={readOnly}
                onClick={() => set({ type: t })}
                className={cx("min-h-10 px-2 font-mono text-[12px]", i > 0 && "border-l border-line-strong", f.type === t ? "bg-signal font-semibold text-on-signal" : "text-fg-2 hover:bg-surface-2")}
              >
                {CASE_TYPE_LABEL[t].toLowerCase()}
              </button>
            ))}
          </div>
        </div>
        <div>
          <FieldLabel htmlFor={id("tags")} hint="Enter or comma to add" right={<span className="font-mono text-[11px] text-fg-4">{f.tags.length}</span>}>
            Tags
          </FieldLabel>
          <div className="flex min-h-10 flex-wrap items-center gap-1.5 border border-line-strong bg-bg px-2 py-1.5 focus-within:border-signal">
            {f.tags.map((t) => (
              <span key={t} className="inline-flex items-center gap-1 border border-line-strong px-2 py-0.5 font-mono text-[11px] text-fg-2">
                {t}
                {!readOnly && (
                  <button type="button" aria-label={`Remove tag ${t}`} className="grid h-6 w-6 place-items-center text-fg-3 hover:text-bad-text" onClick={() => set({ tags: f.tags.filter((x) => x !== t) })}>
                    ×
                  </button>
                )}
              </span>
            ))}
            <input
              id={id("tags")}
              value={tagDraft}
              disabled={readOnly}
              onChange={(e) => setTagDraft(e.target.value)}
              onKeyDown={onTagKey}
              onBlur={() => addTags(tagDraft)}
              placeholder={f.tags.length ? "" : "System Design, Concurrency, Production Incidents"}
              className="min-h-8 min-w-[140px] flex-1 bg-transparent text-[14px] text-fg placeholder:text-fg-4 focus:outline-none"
            />
          </div>
          <FieldProblems problems={problems} field="tags" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <FieldLabel htmlFor={id("date")} hint="shown as the opened date">
              Date
            </FieldLabel>
            <input id={id("date")} type="date" className={cx(INPUT, "font-mono")} value={f.date} disabled={readOnly} onChange={(e) => set({ date: e.target.value })} />
            <FieldProblems problems={problems} field="date" />
          </div>
          {caseNumber && <CaseNumberField c={caseNumber} readOnly={readOnly} />}
        </div>
      </Section>

      <Section title="Cover" hint="1536×1024 · PNG / WebP ≤ 6 MB">
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="relative aspect-[3/2] overflow-hidden border border-line bg-raised bg-[linear-gradient(var(--c-line)_1px,transparent_1px),linear-gradient(90deg,var(--c-line)_1px,transparent_1px)] bg-[size:24px_24px]">
            {f.coverUrl ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element -- admin preview of an arbitrary uploaded URL */}
                <img
                  src={f.coverUrl}
                  alt={f.coverAlt || "Cover preview"}
                  className="absolute inset-0 h-full w-full object-cover"
                  onLoad={(e) => setRatio(e.currentTarget.naturalWidth / Math.max(1, e.currentTarget.naturalHeight))}
                />
                {f.motionCoverUrl && (
                  // eslint-disable-next-line @next/next/no-img-element -- animated SVG layer
                  <img src={f.motionCoverUrl} alt="" aria-hidden className="pointer-events-none absolute inset-0 h-full w-full object-cover" />
                )}
              </>
            ) : (
              <span className="absolute inset-0 grid place-items-center font-mono text-[12px] text-fg-3">no cover yet</span>
            )}
          </div>
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-2">
              <button type="button" className={BTN} disabled={readOnly || !!busy} onClick={() => coverRef.current?.click()}>
                {busy === "cover" ? "uploading…" : f.coverUrl ? "replace cover" : "upload cover"}
              </button>
              {f.coverUrl && (
                <button type="button" className={BTN} disabled={readOnly} onClick={() => set({ coverUrl: "", motionCoverUrl: "" })}>
                  remove
                </button>
              )}
              <input ref={coverRef} type="file" hidden accept={UPLOAD_LIMITS.types.join(",")} onChange={(e) => upload(e, "cover")} />
            </div>
            {ratio && Math.abs(ratio - 1.5) > 0.03 && <p className="m-0 text-[12.5px] text-signal-text">! This image is {ratio.toFixed(2)}:1, the covers are 3:2 (1536×1024): it will be cropped.</p>}
            <div>
              <FieldLabel htmlFor={id("coverUrl")}>Cover URL</FieldLabel>
              <input id={id("coverUrl")} className={cx(INPUT, "font-mono text-[12px]")} value={f.coverUrl} disabled={readOnly} placeholder="/covers/… or the uploaded URL" onChange={(e) => set({ coverUrl: e.target.value.trim() })} />
              <FieldProblems problems={problems} field="coverUrl" />
            </div>
            <div>
              <FieldLabel htmlFor={id("coverAlt")} hint="what the blueprint shows">
                Alt text
              </FieldLabel>
              <textarea id={id("coverAlt")} rows={2} className={cx(INPUT, "resize-y")} value={f.coverAlt} disabled={readOnly} onChange={(e) => set({ coverAlt: e.target.value })} />
              <FieldProblems problems={problems} field="coverAlt" />
            </div>
          </div>
        </div>
        <div className="border-t border-line pt-3">
          <FieldLabel htmlFor={id("motionCoverUrl")} hint="optional · transparent animated SVG, same 1536×1024 canvas, ≤ 1 MB">
            Motion cover
          </FieldLabel>
          <div className="flex flex-wrap items-stretch gap-2">
            <input id={id("motionCoverUrl")} className={cx(INPUT, "min-w-0 flex-1 font-mono text-[12px]")} value={f.motionCoverUrl} disabled={readOnly} placeholder="none" onChange={(e) => set({ motionCoverUrl: e.target.value.trim() })} />
            <button type="button" className={BTN} disabled={readOnly || !!busy} onClick={() => motionRef.current?.click()}>
              {busy === "motion" ? "uploading…" : "upload svg"}
            </button>
            {f.motionCoverUrl && (
              <button type="button" className={BTN} disabled={readOnly} onClick={() => set({ motionCoverUrl: "" })}>
                remove
              </button>
            )}
            <input ref={motionRef} type="file" hidden accept="image/svg+xml" onChange={(e) => upload(e, "motion")} />
          </div>
          <FieldProblems problems={problems} field="motionCoverUrl" />
        </div>
        {uploadError && <p className="m-0 text-[13px] text-bad-text">✗ {uploadError}</p>}
      </Section>

      <Section title="Search & sharing" hint="optional · defaults to title and excerpt">
        <div>
          <FieldLabel htmlFor={id("seoTitle")} right={<Counter n={f.seoTitle.trim().length} max={70} />}>
            SEO title
          </FieldLabel>
          <input id={id("seoTitle")} className={INPUT} value={f.seoTitle} disabled={readOnly} placeholder={f.title} onChange={(e) => set({ seoTitle: e.target.value })} />
          <FieldProblems problems={problems} field="seoTitle" />
        </div>
        <div>
          <FieldLabel htmlFor={id("seoDescription")} right={<Counter n={f.seoDescription.trim().length} max={170} />}>
            SEO description
          </FieldLabel>
          <textarea id={id("seoDescription")} rows={2} className={cx(INPUT, "resize-y")} value={f.seoDescription} disabled={readOnly} placeholder={f.excerpt} onChange={(e) => set({ seoDescription: e.target.value })} />
          <FieldProblems problems={problems} field="seoDescription" />
        </div>
        <div className="border border-line bg-bg p-3" aria-label="Search result preview">
          <div className="truncate font-mono text-[11px] text-fg-3">himanshukukreja.in › stories › {f.slug || "…"}</div>
          <div className="truncate text-[16px] font-semibold text-signal-text">{(f.seoTitle || f.title || "Untitled") + " · Case files"}</div>
          <p className="m-0 line-clamp-2 text-[13px] text-fg-2">{f.seoDescription || f.excerpt || "No description yet."}</p>
        </div>
      </Section>
    </div>
  );
}

function CaseNumberField({ c, readOnly }: { c: NonNullable<Props["caseNumber"]>; readOnly?: boolean }) {
  const [draft, setDraft] = useState(c.value ? String(c.value) : "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const run = async (n: number | null) => {
    setBusy(true);
    setErr(null);
    try {
      await c.onReserve(n);
      if (n == null) setDraft("");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div>
      <FieldLabel htmlFor="cf-caseNumber" hint={c.canReserve ? (c.value ? "reserved for first publish" : `auto: ${c.next || "next free"}`) : "assigned"}>
        Case number
      </FieldLabel>
      <div className="flex items-stretch">
        <span className="flex items-center border border-r-0 border-line-strong bg-surface-2 px-2.5 font-mono text-[12px] text-fg-3">CASE-</span>
        <input
          id="cf-caseNumber"
          inputMode="numeric"
          className={cx(INPUT, "font-mono")}
          value={c.canReserve ? draft : c.value ? String(c.value).padStart(3, "0") : ""}
          placeholder={c.next ? c.next.slice(5) : "auto"}
          disabled={readOnly || !c.canReserve || busy}
          onChange={(e) => setDraft(e.target.value.replace(/\D/g, "").slice(0, 3))}
        />
        {c.canReserve && (
          <button type="button" className={cx(BTN, "border-l-0")} disabled={readOnly || busy || !draft || Number(draft) === c.value} onClick={() => run(Number(draft))}>
            reserve
          </button>
        )}
        {c.canReserve && c.value != null && (
          <button type="button" className={cx(BTN, "border-l-0")} disabled={readOnly || busy} onClick={() => run(null)}>
            auto
          </button>
        )}
      </div>
      {err && <p className="m-0 mt-1.5 text-[12.5px] text-bad-text">✗ {err}</p>}
      {c.canReserve && <p className="m-0 mt-1.5 text-[12px] text-fg-4">Only if the cover already shows a number. Otherwise the next free one is taken at publish.</p>}
    </div>
  );
}

export { FieldProblems, Section };
