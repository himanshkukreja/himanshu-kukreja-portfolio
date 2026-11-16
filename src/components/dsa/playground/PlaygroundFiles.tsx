"use client";

/**
 * Named files and read-only share links in the Playground's file list. Rendered only when DSA_PLAYGROUND_FILES=on
 * (the dsa_playground_files migration applied): /api/dsa/playground/files and /share. Opening a file loads it into its
 * language's draft; Save writes the editor back to the open file; Share copies its read-only link.
 */
import { useCallback, useEffect, useState } from "react";
import { Link2, Plus, Save, Trash2 } from "lucide-react";
import { userJson } from "@/components/learn/progress/userFetch";
import { track } from "@/lib/track";
import { DSA_LANG_LABEL, type DsaLang } from "@/lib/dsa/types";
import { ago } from "@/lib/dsa/playground/drafts";

export type OpenFile = { id: string; name: string; language: DsaLang; code: string; stdin: string; shared: boolean };
type Row = { id: string; name: string; language: DsaLang; code: string; stdin: string; shareSlug: string | null; updatedAt: string };

const ICON = "inline-flex h-7 w-7 items-center justify-center rounded-lg border border-line-strong text-fg-2 hover:bg-surface-2 hover:text-fg disabled:opacity-40";

export default function PlaygroundFiles({
  signedIn,
  current,
  open,
  onOpen,
  onSaved,
}: {
  signedIn: boolean;
  current: { language: DsaLang; code: () => string; stdin: string };
  open: OpenFile | null;
  onOpen: (f: OpenFile) => void;
  onSaved: (f: OpenFile) => void;
}) {
  const [files, setFiles] = useState<Row[] | null>(null);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const j = await userJson<{ files: Row[] }>("/api/dsa/playground/files");
      setFiles(j.files);
    } catch {
      setFiles([]);
    }
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (signedIn) void load();
  }, [signedIn, load]);

  const asOpen = (r: Row): OpenFile => ({ id: r.id, name: r.name, language: r.language, code: r.code, stdin: r.stdin, shared: !!r.shareSlug });

  const save = async (asNew: boolean) => {
    setMsg(null);
    try {
      const body = { ...(asNew || !open ? {} : { id: open.id }), name: asNew || !open ? name.trim() : open.name, language: current.language, code: current.code(), stdin: current.stdin };
      const j = await userJson<{ file: Row }>("/api/dsa/playground/files", { method: "POST", body: JSON.stringify(body) });
      onSaved(asOpen(j.file));
      setNaming(false);
      setName("");
      setMsg("Saved");
      track("dsa_playground_file_save", { lang: current.language, new: asNew });
      void load();
    } catch (e) {
      setMsg((e as Error).message);
    }
  };

  const remove = async (r: Row) => {
    if (!window.confirm(`Delete ${r.name}?`)) return;
    try {
      await userJson(`/api/dsa/playground/files?id=${r.id}`, { method: "DELETE" });
      void load();
    } catch (e) {
      setMsg((e as Error).message);
    }
  };

  const share = async () => {
    if (!open) return;
    try {
      const j = await userJson<{ path?: string }>("/api/dsa/playground/share", { method: "POST", body: JSON.stringify({ id: open.id, on: true }) });
      if (j.path) {
        const url = `${window.location.origin}${j.path}`;
        await navigator.clipboard?.writeText(url).catch(() => undefined);
        setMsg("Read-only link copied");
        track("dsa_playground_share", { lang: open.language });
        void load();
      }
    } catch (e) {
      setMsg((e as Error).message);
    }
  };

  if (!signedIn) return <p className="m-0 px-1 pt-2 text-[12px] text-fg-3">Sign in to save named files and share them.</p>;

  return (
    <div className="flex flex-col gap-1.5 border-t border-line pt-2.5">
      <div className="flex items-center justify-between px-1">
        <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">Saved files</span>
        <span className="flex gap-1">
          {open ? (
            <>
              <button type="button" onClick={() => void save(false)} className={ICON} aria-label={`Save ${open.name}`} title="Save">
                <Save className="h-3.5 w-3.5" aria-hidden />
              </button>
              <button type="button" onClick={() => void share()} className={ICON} aria-label="Copy a read-only share link" title="Share link">
                <Link2 className="h-3.5 w-3.5" aria-hidden />
              </button>
            </>
          ) : null}
          <button type="button" onClick={() => setNaming((n) => !n)} className={ICON} aria-label="Save as a new file" title="New file">
            <Plus className="h-3.5 w-3.5" aria-hidden />
          </button>
        </span>
      </div>
      {naming ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) void save(true);
          }}
          className="flex gap-1.5 px-1"
        >
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder={`two-sum ${DSA_LANG_LABEL[current.language]}`} aria-label="File name" className="min-w-0 flex-1 rounded-lg border border-line-strong bg-surface px-2 py-1 text-[13px] text-fg" />
          <button type="submit" className="rounded-lg bg-signal px-2.5 text-[12px] font-semibold text-on-signal">
            Save
          </button>
        </form>
      ) : null}
      {msg ? <p className="m-0 px-1 text-[12px] text-fg-3" role="status">{msg}</p> : null}
      <ul className="m-0 flex list-none flex-col gap-1 p-0">
        {(files || []).map((r) => (
          <li key={r.id} className="group flex items-center gap-1">
            <button type="button" onClick={() => onOpen(asOpen(r))} aria-current={open?.id === r.id ? "true" : undefined} className={`flex min-w-0 flex-1 flex-col gap-0.5 rounded-[10px] px-2.5 py-2 text-left ${open?.id === r.id ? "bg-surface-2" : "hover:bg-surface-2"}`}>
              <span className="truncate text-[13px] font-medium text-fg">{r.name}</span>
              <span className="text-[11.5px] text-fg-3">
                {DSA_LANG_LABEL[r.language]} · {ago(Date.parse(r.updatedAt))}
                {r.shareSlug ? " · shared" : ""}
              </span>
            </button>
            <button type="button" onClick={() => void remove(r)} className={`${ICON} opacity-0 group-hover:opacity-100 focus:opacity-100`} aria-label={`Delete ${r.name}`}>
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
            </button>
          </li>
        ))}
        {files && !files.length ? <li className="px-2.5 py-1 text-[12px] text-fg-3">No saved files yet.</li> : null}
      </ul>
    </div>
  );
}
