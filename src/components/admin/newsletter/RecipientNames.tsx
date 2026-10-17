"use client";

/**
 * Recipients · names. Lists the resolved recipients of an audience (or everyone) with the name the
 * campaign service will use and where it came from (set by you / account profile / sign-in metadata /
 * none), highlights people without a name, and lets the admin add or change names:
 *
 *   inline   click a name → input → Enter / blur saves, Esc cancels; optimistic, rolled back on error
 *   bulk     paste "email, Name" lines (or tab-separated) → preview of every change → save
 *   suggest  "himanshu.kukreja@…" → "Himanshu Kukreja", always shown for confirmation, never auto-saved
 *
 * Names are email-only display names (public.email_names). They take precedence over profile /
 * metadata names in newsletters and never change a learner's own profile.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Badge, Card, ConfirmButton, Drawer, LABEL, Skeleton, fmtNum, timeAgo, useAdminClient, type BadgeTone } from "@/components/admin/ui";
import { SearchInput, btnCls, inputCls, primaryBtnCls } from "@/components/admin/content/common";
import { NAME_MAX, NAME_SOURCE_LABEL, checkName, greetingName, normalizeName, parseBulk, suggestFromEmail, titleCaseSuggestion, type NameSource } from "@/lib/campaigns/names-core";
import type { AudienceSpec, NamedPerson, NamesReply } from "@/lib/campaigns/types";
import { Note, Toggle, cx, jsonInit, textareaCls, useDebounced } from "./bits";

export type NamesScope = { spec: AudienceSpec | null; storySlug?: string | null };
type Saved = (people: NamedPerson[]) => void;
type AdminErr = Error & { status?: number; code?: string; errors?: { index: number; email: string; error: string }[] };

const API = "/api/admin/newsletter/names";
const PAGE = 100;
const MIGRATION = "supabase/migrations/20261017_email_names.sql";

const SOURCE_TONE: Record<NameSource, BadgeTone> = { override: "signal", profile: "neutral", metadata: "muted", none: "bad" };

export function SourceBadge({ source }: { source: NameSource }) {
  return (
    <Badge tone={SOURCE_TONE[source]} title={source === "override" ? "You set this name; it's used for emails only (the learner's own profile is unchanged)." : undefined}>
      {NAME_SOURCE_LABEL[source]}
    </Badge>
  );
}

function useIsPhone() {
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const on = () => setPhone(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return phone;
}

const fallbackOf = (p: NamedPerson) => p.profileName || p.metaName || null;
/** the row as it looks right after an override is saved / cleared (optimistic) */
const withOverride = (p: NamedPerson, name: string | null): NamedPerson => {
  if (name) return { ...p, name, source: "override", firstName: greetingName(name), override: { name, updatedAt: new Date().toISOString(), updatedBy: p.override?.updatedBy ?? null } };
  const fb = fallbackOf(p);
  return { ...p, name: fb, source: p.profileName ? "profile" : p.metaName ? "metadata" : "none", firstName: greetingName(fb), override: null };
};

/* ───────────────────────────── data ───────────────────────────── */

type ListState = { key: string; rows: NamedPerson[]; meta: Omit<NamesReply, "people"> | null; error: string | null; loadingMore: boolean };

function useNamesList(scope: NamesScope, q: string, missing: boolean) {
  const client = useAdminClient();
  const key = JSON.stringify({ spec: scope.spec, storySlug: scope.storySlug || null, q, missing });
  const dkey = useDebounced(key, 300);
  const [nonce, setNonce] = useState(0);
  const [state, setState] = useState<ListState>({ key: "", rows: [], meta: null, error: null, loadingMore: false });

  const fetchPage = useCallback(
    (k: string, offset: number) => {
      const p = JSON.parse(k) as { spec: AudienceSpec | null; storySlug: string | null; q: string; missing: boolean };
      return client.json<NamesReply>(API, jsonInit("POST", { audience: p.spec, storySlug: p.storySlug, q: p.q, missing: p.missing, limit: PAGE, offset }));
    },
    [client]
  );

  useEffect(() => {
    let off = false;
    fetchPage(dkey, 0)
      .then((r) => {
        if (off) return;
        const { people, ...meta } = r;
        setState({ key: dkey, rows: people, meta, error: null, loadingMore: false });
      })
      .catch((e: Error) => {
        if (!off) setState((s) => ({ ...s, key: dkey, error: e.message }));
      });
    return () => {
      off = true;
    };
  }, [dkey, nonce, fetchPage]);

  const loadMore = async () => {
    const k = state.key;
    setState((s) => ({ ...s, loadingMore: true }));
    try {
      const r = await fetchPage(k, state.rows.length);
      setState((s) => (s.key === k ? { ...s, rows: [...s.rows, ...r.people.filter((x) => !s.rows.some((y) => y.email === x.email))], loadingMore: false } : s));
    } catch (e) {
      setState((s) => ({ ...s, loadingMore: false, error: (e as Error).message }));
    }
  };

  /** patch rows in place (keeps order + the "missing only" view stable while editing) and adjust counts */
  const patch = useCallback((next: NamedPerson[]) => {
    setState((s) => {
      if (!s.meta) return s;
      const bySource = { ...s.meta.bySource };
      const rows = s.rows.map((r) => {
        const n = next.find((x) => x.email === r.email);
        if (!n) return r;
        bySource[r.source]--;
        bySource[n.source]++;
        return n;
      });
      return { ...s, rows, meta: { ...s.meta, bySource, missing: bySource.none } };
    });
  }, []);

  return { ...state, loading: state.key !== key, refresh: () => setNonce((n) => n + 1), loadMore, patch };
}

/* ───────────────────────────── inline editor ───────────────────────────── */

function NameEditor({ person, locked, onCommit, prefill, onPrefillDone }: { person: NamedPerson; locked: string | null; onCommit: (name: string | null) => Promise<string | null>; prefill: string | null; onPrefillDone: () => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fromSuggestion, setFromSuggestion] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const committing = useRef(false);

  const open = (v: string, suggested = false) => {
    if (locked) return setError(locked);
    setValue(v);
    setError(null);
    setFromSuggestion(suggested);
    setEditing(true);
    window.requestAnimationFrame(() => {
      input.current?.focus();
      input.current?.select();
    });
  };

  useEffect(() => {
    if (prefill == null) return;
    open(prefill, true);
    onPrefillDone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill]);

  const cancel = () => {
    setEditing(false);
    setError(null);
  };

  const commit = async () => {
    if (committing.current) return;
    const v = normalizeName(value);
    // unchanged → just close (never turns a profile name into an override); empty → remove your name
    if (v === (person.name || "")) return cancel();
    if (!v && !person.override) return cancel();
    if (v) {
      const c = checkName(v);
      if (!c.ok) {
        setError(c.error);
        return;
      }
    }
    committing.current = true;
    setEditing(false);
    const err = await onCommit(v || null);
    committing.current = false;
    if (err) {
      setValue(v);
      setError(err);
      setEditing(true);
    }
  };

  const live = editing ? checkName(value) : null;
  const tc = live?.ok && !error ? live.suggestion : null;
  const sug = editing && !normalizeName(value) ? suggestFromEmail(person.email) : null;

  if (!editing)
    return (
      <div className="flex min-w-0 flex-col gap-0.5">
        <button
          type="button"
          onClick={() => open(person.name || "")}
          aria-label={person.name ? `Edit name for ${person.email}: ${person.name}` : `Add a name for ${person.email}`}
          className={cx(
            "group flex min-h-10 w-full min-w-0 items-center gap-2 border px-2.5 text-left text-sm",
            person.source === "none" ? "border-dashed border-signal/70 bg-signal/[0.06] text-signal-text hover:bg-signal/10" : "border-transparent text-fg hover:border-line-strong hover:bg-surface-2"
          )}
        >
          <span className={cx("min-w-0 flex-1 truncate", person.source !== "none" && "font-semibold")}>{person.name || "+ add name"}</span>
          <span aria-hidden className="shrink-0 font-mono text-[11px] text-fg-4 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100">
            ✎
          </span>
        </button>
        {error && <span className="px-2.5 text-xs text-bad-text">{error}</span>}
      </div>
    );

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <input
        ref={input}
        className={cx(inputCls, error && "border-bad focus:border-bad")}
        value={value}
        maxLength={NAME_MAX + 20}
        onChange={(e) => {
          setValue(e.target.value);
          setError(null);
          setFromSuggestion(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void commit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation(); // don't close the drawer
            cancel();
          }
        }}
        // blur saves what you typed; a suggestion is only saved by an explicit Enter / ✓ save
        onBlur={() => {
          if (!fromSuggestion) void commit();
        }}
        placeholder={fallbackOf(person) ? `empty = use “${fallbackOf(person)}”` : "Full name"}
        aria-label={`Name for ${person.email}`}
        aria-invalid={!!error}
        autoComplete="off"
        spellCheck={false}
      />
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[11px] text-fg-4">
        {error ? (
          <span className="text-bad-text">{error}</span>
        ) : live && live.ok ? (
          <span>
            greets as <span className="text-fg-2">{greetingName(live.name) ? `Hi ${greetingName(live.name)},` : "fallback"}</span>
          </span>
        ) : person.override && !normalizeName(value) ? (
          <span>empty + Enter = remove your name</span>
        ) : null}
        {fromSuggestion && (
          <>
            <span className="text-signal-text">suggested from the address · check it, then</span>
            <button type="button" className="border border-signal px-1.5 py-0.5 text-signal-text hover:bg-signal/10" onMouseDown={(e) => e.preventDefault()} onClick={() => void commit()}>
              ✓ save
            </button>
            <button type="button" className="border border-line-strong px-1.5 py-0.5 text-fg-3 hover:text-fg" onMouseDown={(e) => e.preventDefault()} onClick={cancel}>
              cancel
            </button>
          </>
        )}
        {tc && (
          <button type="button" className="text-signal-text underline-offset-2 hover:underline" onMouseDown={(e) => e.preventDefault()} onClick={() => setValue(tc)}>
            use “{tc}”?
          </button>
        )}
        {sug && (
          <button
            type="button"
            className="text-signal-text underline-offset-2 hover:underline"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setValue(sug.name);
              setFromSuggestion(true);
            }}
          >
            suggest “{sug.name}”{sug.confident ? "" : " (guess)"}
          </button>
        )}
        <span className="ml-auto hidden sm:inline">enter saves · esc cancels</span>
      </div>
    </div>
  );
}

/* ───────────────────────────── rows ───────────────────────────── */

function RowMeta({ p }: { p: NamedPerson }) {
  return (
    <span className="flex flex-wrap items-center gap-1">
      {p.kind !== "account" && <Badge tone="muted">{p.kind === "subscriber" ? "subscriber only" : "not a known address"}</Badge>}
      {p.blocked && <Badge tone="bad">{p.blocked}</Badge>}
    </span>
  );
}

function Greets({ p }: { p: NamedPerson }) {
  return p.firstName ? <span className="font-mono text-xs text-fg-2">Hi {p.firstName},</span> : <span className="font-mono text-xs text-fg-4">fallback greeting</span>;
}

function SourceCell({ p }: { p: NamedPerson }) {
  const fb = fallbackOf(p);
  return (
    <span className="flex min-w-0 flex-col items-start gap-0.5">
      <SourceBadge source={p.source} />
      {p.source === "override" && fb && fb !== p.name && <span className="max-w-[180px] truncate font-mono text-[10px] text-fg-4" title={`Their own name: ${fb}`}>own: {fb}</span>}
      {p.source === "override" && p.override && <span className="font-mono text-[10px] text-fg-4">{timeAgo(p.override.updatedAt)}</span>}
    </span>
  );
}

function Actions({ p, onSuggest, onClear }: { p: NamedPerson; onSuggest: (name: string) => void; onClear: () => Promise<unknown> }) {
  const sug = p.source === "none" ? suggestFromEmail(p.email) : null;
  const fb = fallbackOf(p);
  return (
    <span className="flex flex-wrap items-center justify-end gap-1.5">
      {sug && (
        <button type="button" className={cx(btnCls, "min-h-9 whitespace-nowrap px-2.5")} onClick={() => onSuggest(sug.name)} title="Fills the field with a guess from the address. Nothing is saved until you press Enter.">
          ✦ suggest
        </button>
      )}
      {p.override && (
        <ConfirmButton size="sm" tone="signal" onConfirm={onClear} confirmLabel={fb ? `use “${fb}”?` : "remove name?"} aria-label={`Remove your name for ${p.email}`}>
          ↺ reset
        </ConfirmButton>
      )}
    </span>
  );
}

/* ───────────────────────────── bulk paste ───────────────────────────── */

type Change = { email: string; name: string; current: NamedPerson | null; status: "new" | "change" | "same"; suggested: boolean; line: number };

function BulkNames({ scope, locked, onSaved, onClose }: { scope: NamesScope; locked: string | null; onSaved: Saved; onClose: () => void }) {
  const client = useAdminClient();
  const [text, setText] = useState("");
  const [suggested, setSuggested] = useState<Map<string, string>>(new Map());
  const [current, setCurrent] = useState<Map<string, NamedPerson>>(new Map());
  const [skip, setSkip] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<"suggest" | "save" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const dtext = useDebounced(text, 300);
  const parsed = useMemo(() => parseBulk(dtext), [dtext]);
  const emails = useMemo(() => parsed.rows.filter((r) => !r.error).map((r) => r.email), [parsed]);
  const lookupKey = emails.filter((e) => !current.has(e)).join(",");

  useEffect(() => {
    if (!lookupKey) return;
    let off = false;
    client
      .json<{ people: NamedPerson[] }>(API, jsonInit("POST", { lookup: lookupKey.split(",") }))
      .then((r) => {
        if (!off) setCurrent((m) => new Map([...m, ...r.people.map((p) => [p.email, p] as const)]));
      })
      .catch((e: Error) => {
        if (!off) setError(e.message);
      });
    return () => {
      off = true;
    };
  }, [lookupKey, client]);

  const changes: Change[] = parsed.rows
    .filter((r) => !r.error)
    .map((r) => {
      const cur = current.get(r.email) ?? null;
      const status: Change["status"] = !cur || cur.source === "none" ? "new" : cur.name === r.name ? "same" : "change";
      return { email: r.email, name: r.name, current: cur, status, suggested: suggested.get(r.email) === r.name, line: r.line };
    });
  const errors = parsed.rows.filter((r) => r.error);
  const toSave = changes.filter((c) => c.status !== "same" && !skip.has(c.email));
  const pendingLookup = emails.some((e) => !current.has(e));

  const fillSuggestions = async () => {
    setBusy("suggest");
    setError(null);
    try {
      const r = await client.json<NamesReply>(API, jsonInit("POST", { audience: scope.spec, storySlug: scope.storySlug || null, missing: true, limit: 500, offset: 0 }));
      const add: string[] = [];
      const next = new Map(suggested);
      const have = new Set(parsed.rows.map((x) => x.email));
      for (const p of r.people) {
        const s = suggestFromEmail(p.email);
        if (!s || have.has(p.email)) continue;
        next.set(p.email, s.name);
        add.push(`${p.email}, ${s.name}`);
      }
      setSuggested(next);
      setCurrent((m) => new Map([...m, ...r.people.map((p) => [p.email, p] as const)]));
      if (add.length) setText((t) => [t.trim(), ...add].filter(Boolean).join("\n"));
      setDone(add.length ? `Added ${add.length} suggestion${add.length === 1 ? "" : "s"} from addresses. Check each one below, fix or delete lines, then save.` : "No usable suggestions: the remaining addresses don't look like names.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    if (locked) return setError(locked);
    setBusy("save");
    setError(null);
    try {
      const r = await client.json<{ saved: number; people: NamedPerson[] }>(API, jsonInit("PUT", { items: toSave.map((c) => ({ email: c.email, name: c.name })) }));
      onSaved(r.people);
      setCurrent((m) => new Map([...m, ...r.people.map((p) => [p.email, p] as const)]));
      setText("");
      setSuggested(new Map());
      setSkip(new Set());
      setDone(`Saved ${fmtNum(r.saved)} name${r.saved === 1 ? "" : "s"}. They're used for every email not sent yet, including this campaign's queue.`);
    } catch (e) {
      const err = e as AdminErr;
      setError(err.code === "names-missing" ? locked || err.message : err.errors?.length ? `${err.message} ${err.errors.slice(0, 3).map((x) => `${x.email}: ${x.error}`).join(" · ")}` : err.message);
    } finally {
      setBusy(null);
    }
  };

  const statusBadge = (c: Change) =>
    c.status === "same" ? <Badge tone="muted">no change</Badge> : c.status === "new" ? <Badge tone="ok">+ new name</Badge> : <Badge tone="signal">change</Badge>;

  return (
    <div className="flex flex-col gap-4">
      <p className="m-0 text-sm text-fg-3">
        One person per line: <code className="font-mono text-xs text-fg-2">email, Name</code>, tab-separated (paste from a sheet) or <code className="font-mono text-xs text-fg-2">Name &lt;email&gt;</code>. Nothing is saved until you
        review the changes below.
      </p>
      <textarea
        className={`${textareaCls} font-mono text-[13px]`}
        rows={7}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setDone(null);
        }}
        placeholder={"priya.sharma@example.com, Priya Sharma\nrohan@example.org\tRohan Mehta\nSara Iqbal <sara.i@example.net>"}
        aria-label="Paste names"
        spellCheck={false}
      />
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={btnCls} disabled={!!busy} onClick={fillSuggestions} title="Adds a guessed name for each person without one, from their address. You review every line before saving.">
          {busy === "suggest" ? "suggesting…" : "✦ suggest names from addresses"}
        </button>
        {text && (
          <button
            type="button"
            className={btnCls}
            onClick={() => {
              setText("");
              setSuggested(new Map());
              setSkip(new Set());
              setDone(null);
            }}
          >
            clear
          </button>
        )}
      </div>
      {done && <Note>{done}</Note>}

      {(changes.length > 0 || errors.length > 0) && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className={LABEL}>preview · {fmtNum(toSave.length)} to save</span>
            <span className="font-mono text-[11px] text-fg-4">
              {fmtNum(changes.filter((c) => c.status === "new").length)} new · {fmtNum(changes.filter((c) => c.status === "change").length)} changed · {fmtNum(changes.filter((c) => c.status === "same").length)} unchanged · {fmtNum(errors.length)} with problems
            </span>
          </div>
          <ul className="m-0 flex max-h-[42dvh] list-none flex-col overflow-y-auto border border-line p-0">
            {errors.map((r) => (
              <li key={`e${r.line}`} className="flex flex-col gap-0.5 border-b border-line bg-bad/5 px-3 py-2 last:border-0">
                <span className="break-all font-mono text-[11px] text-fg-3">
                  line {r.line} · {r.raw}
                </span>
                <span className="text-xs text-bad-text">{r.error}</span>
              </li>
            ))}
            {changes.map((c) => {
              const off = skip.has(c.email) || c.status === "same";
              return (
                <li key={c.email} className={cx("flex items-start gap-3 border-b border-line px-3 py-2 last:border-0", off && "opacity-60")}>
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 shrink-0 accent-signal"
                    checked={!off}
                    disabled={c.status === "same"}
                    onChange={(e) => setSkip((s) => (e.target.checked ? new Set([...s].filter((x) => x !== c.email)) : new Set([...s, c.email])))}
                    aria-label={`Save ${c.name} for ${c.email}`}
                  />
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="break-all font-mono text-[11px] text-fg-3">{c.email}</span>
                    <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                      {c.current?.name && c.status === "change" && (
                        <>
                          <span className="text-fg-4 line-through decoration-fg-4/60">{c.current.name}</span>
                          <span aria-hidden className="text-fg-4">→</span>
                        </>
                      )}
                      <span className="font-semibold text-fg">{c.name}</span>
                      {titleCaseSuggestion(c.name) && <span className="font-mono text-[11px] text-fg-4">(case: {titleCaseSuggestion(c.name)}?)</span>}
                    </span>
                    <span className="flex flex-wrap items-center gap-1">
                      {statusBadge(c)}
                      {c.current && c.status !== "new" && <SourceBadge source={c.current.source} />}
                      {c.suggested && <Badge tone="signal">✦ suggested · check</Badge>}
                      {c.current?.kind === "other" && <Badge tone="muted">not a known address</Badge>}
                      {!c.current && pendingLookup && <span className="font-mono text-[11px] text-fg-4">checking…</span>}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
          {parsed.skipped > 0 && <p className="m-0 text-xs text-bad-text">{fmtNum(parsed.skipped)} lines over the 1,000 limit were ignored.</p>}
        </div>
      )}
      {error && <Note tone="bad" title="not saved">{error}</Note>}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={primaryBtnCls} disabled={!toSave.length || !!busy || pendingLookup} onClick={save}>
          {busy === "save" ? "saving…" : `save ${fmtNum(toSave.length)} name${toSave.length === 1 ? "" : "s"}`}
        </button>
        <button type="button" className={btnCls} onClick={onClose}>
          done
        </button>
        {errors.length > 0 && toSave.length > 0 && <span className="text-xs text-fg-4">lines with problems are skipped</span>}
      </div>
    </div>
  );
}

/* ───────────────────────────── panel ───────────────────────────── */

export default function RecipientNames({
  scope,
  initialQuery = "",
  initialMissing = false,
  onSaved,
  label = "recipients · names",
  title = "What each recipient is called",
  framed = true,
  intro,
}: {
  scope: NamesScope;
  initialQuery?: string;
  initialMissing?: boolean;
  onSaved?: Saved;
  label?: ReactNode;
  title?: ReactNode;
  /** false inside a drawer (no card chrome) */
  framed?: boolean;
  intro?: ReactNode;
}) {
  const client = useAdminClient();
  const phone = useIsPhone();
  const [q, setQ] = useState(initialQuery);
  const [missing, setMissing] = useState(initialMissing);
  const [bulk, setBulk] = useState(false);
  const [prefill, setPrefill] = useState<{ email: string; name: string } | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const list = useNamesList(scope, q.trim(), missing);
  const meta = list.meta;
  const locked = meta && !meta.namesReady ? `Names can't be saved yet: apply ${MIGRATION} in the Supabase SQL editor.` : null;

  const saved = (people: NamedPerson[]) => {
    list.patch(people);
    onSaved?.(people);
  };

  /** optimistic save / clear for one row; returns an error message (rolled back) or null */
  const commit = async (p: NamedPerson, name: string | null): Promise<string | null> => {
    const before = p;
    list.patch([withOverride(p, name)]);
    setRowError(null);
    try {
      const r = name
        ? await client.json<{ people: NamedPerson[] }>(API, jsonInit("PUT", { email: p.email, name }))
        : await client.json<{ people: NamedPerson[] }>(`${API}?email=${encodeURIComponent(p.email)}`, { method: "DELETE" });
      saved(r.people);
      return null;
    } catch (e) {
      list.patch([before]);
      const err = e as AdminErr;
      const msg = err.code === "names-missing" ? `Names can't be saved yet: apply ${MIGRATION} in the Supabase SQL editor.` : err.message;
      if (!name) setRowError(`${p.email}: ${msg}`); // a failed save re-opens its field with the error instead
      return msg;
    }
  };

  const rows = list.rows;
  const body = (
    <div className="flex min-w-0 flex-col gap-3">
      {intro}
      {locked && (
        <Note tone="bad" title="apply migration · names are read-only">
          The <code className="font-mono text-xs">email_names</code> table doesn&apos;t exist yet. Apply <code className="font-mono text-xs">{MIGRATION}</code> in the Supabase SQL editor to add or change names.
          Until then everyone uses their profile / sign-in name, or the fallback greeting.
        </Note>
      )}
      {meta && meta.missing > 0 && (
        <Note tone="warn" title="missing names">
          <span className="flex flex-wrap items-center justify-between gap-2">
            <span>
              <b className="text-fg">{fmtNum(meta.missing)}</b> {scope.spec ? (meta.missing === 1 ? "recipient has" : "recipients have") : meta.missing === 1 ? "person has" : "people have"} no name — they&apos;ll get the fallback greeting.
            </span>
            {!missing && (
              <button type="button" className={cx(btnCls, "min-h-9")} onClick={() => setMissing(true)}>
                add names →
              </button>
            )}
          </span>
        </Note>
      )}
      {meta && meta.missing === 0 && meta.total > 0 && <Note>Everyone {scope.spec ? "in this audience " : ""}has a name.</Note>}

      {meta && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-fg-3" aria-label="Where names come from">
          <span>{fmtNum(meta.total)} {scope.spec ? "recipients" : "people"}</span>
          {(["override", "profile", "metadata", "none"] as NameSource[]).map((s) => (
            <span key={s} className="inline-flex items-center gap-1">
              <SourceBadge source={s} /> {fmtNum(meta.bySource[s])}
            </span>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <SearchInput value={q} onChange={setQ} placeholder="search by email or name…" label="Search recipients" className="sm:flex-1" />
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <Toggle on={missing} onChange={setMissing} label="missing name only" />
          <button type="button" className={cx(btnCls, bulk && "border-signal text-signal-text")} aria-expanded={bulk} onClick={() => setBulk((b) => !b)}>
            ⇣ bulk paste
          </button>
        </div>
      </div>

      {bulk && (
        <section className="border border-line-strong bg-surface-2/40 p-3 sm:p-4" aria-label="Bulk add or change names">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="m-0 text-[15px] font-semibold text-fg">Bulk add or change names</h3>
            <button type="button" className={cx(btnCls, "min-h-9 w-9 px-0")} aria-label="Close bulk paste" onClick={() => setBulk(false)}>
              ×
            </button>
          </div>
          <BulkNames
            scope={scope}
            locked={locked}
            onSaved={(people) => {
              saved(people);
              list.refresh();
            }}
            onClose={() => setBulk(false)}
          />
        </section>
      )}

      {rowError && (
        <Note tone="bad" title="not saved · rolled back">
          {rowError}
        </Note>
      )}
      {list.error && !rows.length && <Note tone="bad" title="couldn't load recipients">{list.error}</Note>}

      {!meta && !list.error ? (
        <div className="flex flex-col gap-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : rows.length === 0 && meta ? (
        <p className="m-0 border border-dashed border-line px-3 py-6 text-center text-sm text-fg-3">{missing ? "Nobody without a name matches." : q ? "Nobody matches that search." : "Nobody in this audience."}</p>
      ) : phone ? (
        <ul className={cx("m-0 flex list-none flex-col gap-2 p-0", list.loading && "opacity-70")} aria-label="Recipients">
          {rows.map((p) => (
            <li key={p.email} className={cx("flex flex-col gap-2 border p-3", p.source === "none" ? "border-signal/40 bg-signal/[0.03]" : "border-line bg-surface")}>
              <span className="flex min-w-0 items-start justify-between gap-2">
                <span className="min-w-0 break-all font-mono text-[11px] text-fg-3">{p.email}</span>
                <SourceBadge source={p.source} />
              </span>
              <NameEditor person={p} locked={locked} onCommit={(n) => commit(p, n)} prefill={prefill?.email === p.email ? prefill.name : null} onPrefillDone={() => setPrefill(null)} />
              <span className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex flex-wrap items-center gap-2">
                  <Greets p={p} />
                  <RowMeta p={p} />
                </span>
                <Actions p={p} onSuggest={(name) => setPrefill({ email: p.email, name })} onClear={() => commit(p, null)} />
              </span>
            </li>
          ))}
        </ul>
      ) : (
        // in a page card the list scrolls inside (long audiences); in a drawer the drawer scrolls
        <div className={cx("relative max-w-full overflow-x-auto border border-line", framed && "max-h-[min(72dvh,680px)] overflow-y-auto", list.loading && "opacity-70")}>
          <table className="w-full border-collapse text-[13px]" style={{ minWidth: 720 }}>
            <thead className="sticky top-0 z-[1] bg-surface">
              <tr className="border-b border-line bg-surface-2/60 text-left font-mono text-[11px] uppercase tracking-label text-fg-3">
                <th scope="col" className="px-3 py-2 font-normal">email</th>
                <th scope="col" className="w-[34%] px-3 py-2 font-normal">name</th>
                <th scope="col" className="px-3 py-2 font-normal">source</th>
                <th scope="col" className="px-3 py-2 font-normal">greets as</th>
                <th scope="col" className="px-3 py-2 text-right font-normal">
                  <span className="sr-only">actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.email} className={cx("border-b border-line align-top last:border-0", p.source === "none" && "bg-signal/[0.03]")}>
                  <td className="max-w-[260px] px-3 py-2">
                    <span className="flex min-w-0 flex-col gap-1 pt-2">
                      <span className="truncate font-mono text-xs text-fg-2" title={p.email}>
                        {p.email}
                      </span>
                      <RowMeta p={p} />
                    </span>
                  </td>
                  <td className="px-2 py-1.5">
                    <NameEditor person={p} locked={locked} onCommit={(n) => commit(p, n)} prefill={prefill?.email === p.email ? prefill.name : null} onPrefillDone={() => setPrefill(null)} />
                  </td>
                  <td className="px-3 py-2">
                    <span className="block pt-2">
                      <SourceCell p={p} />
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">
                    <span className="block pt-2.5">
                      <Greets p={p} />
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    <Actions p={p} onSuggest={(name) => setPrefill({ email: p.email, name })} onClear={() => commit(p, null)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {meta && (
        <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-[11px] text-fg-4">
          <span>
            showing {fmtNum(rows.length)} of {fmtNum(meta.matched)}
            {meta.matched !== meta.total ? ` (of ${fmtNum(meta.total)})` : ""} · without a name first
          </span>
          {rows.length < meta.matched && (
            <button type="button" className={btnCls} disabled={list.loadingMore} onClick={() => void list.loadMore()}>
              {list.loadingMore ? "loading…" : `load ${fmtNum(Math.min(PAGE, meta.matched - rows.length))} more`}
            </button>
          )}
        </div>
      )}
      <p className="m-0 text-xs text-fg-4">
        Names you set are used for this newsletter&apos;s <code className="font-mono">{"{{first_name}}"}</code> / <code className="font-mono">{"{{name}}"}</code> only and win over profile names. Learners&apos; own profiles and
        share pages are never changed. Order: set by you → account profile → sign-in metadata → fallback.
      </p>

    </div>
  );

  if (!framed) return body;
  return (
    <Card label={label} title={title} bodyClassName="p-3 sm:p-4">
      {body}
    </Card>
  );
}

/* ───────────────────────────── send-step banner + drawer ───────────────────────────── */

/** "N recipients have no name" line with a button that opens the Recipients drawer. */
export function NamesBanner({ scope, onSaved }: { scope: NamesScope; onSaved?: Saved }) {
  const client = useAdminClient();
  const [open, setOpen] = useState(false);
  const [meta, setMeta] = useState<{ missing: number; total: number } | null>(null);
  const [nonce, setNonce] = useState(0);
  const key = JSON.stringify(scope);
  useEffect(() => {
    let off = false;
    const s = JSON.parse(key) as NamesScope;
    client
      .json<NamesReply>(API, jsonInit("POST", { audience: s.spec, storySlug: s.storySlug || null, limit: 1, offset: 0 }))
      .then((r) => !off && setMeta({ missing: r.missing, total: r.total }))
      .catch(() => !off && setMeta(null));
    return () => {
      off = true;
    };
  }, [key, client, nonce]);
  if (!meta || meta.total === 0) return null;
  return (
    <>
      <Note tone={meta.missing ? "warn" : "neutral"} title="recipient names">
        <span className="flex flex-wrap items-center justify-between gap-2">
          <span>{meta.missing ? <><b className="text-fg">{fmtNum(meta.missing)}</b> of {fmtNum(meta.total)} recipients have no name — they&apos;ll get the fallback greeting.</> : `All ${fmtNum(meta.total)} recipients have a name.`}</span>
          <button type="button" className={cx(btnCls, "min-h-9")} onClick={() => setOpen(true)}>
            {meta.missing ? "add names →" : "review names"}
          </button>
        </span>
      </Note>
      <Drawer
        open={open}
        onClose={() => {
          setOpen(false);
          setNonce((n) => n + 1);
        }}
        label="recipients · names"
        title="Names for this send"
        width={880}
      >
        <RecipientNames scope={scope} initialMissing={meta.missing > 0} onSaved={onSaved} framed={false} />
      </Drawer>
    </>
  );
}

/** Drawer around the panel (e.g. "edit name" from preview-as). */
export function RecipientNamesDrawer({ open, onClose, scope, query, onSaved, title = "Recipient names" }: { open: boolean; onClose: () => void; scope: NamesScope; query?: string; onSaved?: Saved; title?: ReactNode }) {
  return (
    <Drawer open={open} onClose={onClose} label="recipients · names" title={title} width={880}>
      {open && <RecipientNames key={query || ""} scope={scope} initialQuery={query} onSaved={onSaved} framed={false} />}
    </Drawer>
  );
}
