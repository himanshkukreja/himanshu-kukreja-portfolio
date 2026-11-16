"use client";

/** A shared Playground file, read-only, with "Open in Playground" (copies it into your drafts for that language). */
import { useRouter } from "next/navigation";
import { DSA_LANG_LABEL, type DsaLang } from "@/lib/dsa/types";
import { INCOMING_KEY } from "@/lib/dsa/playground/drafts";

export default function SharedProgram({ file }: { file: { name: string; language: DsaLang; code: string; stdin: string } }) {
  const router = useRouter();
  const open = () => {
    try {
      window.localStorage.setItem(INCOMING_KEY, JSON.stringify({ lang: file.language, code: file.code, stdin: file.stdin, from: { title: `shared file ${file.name}`, href: window.location.pathname }, at: Date.now() }));
    } catch {
      /* storage blocked: the Playground opens on its own drafts */
    }
    router.push("/dsa/playground");
  };
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="font-mono text-[12px] uppercase tracking-label text-fg-3">Shared program · {DSA_LANG_LABEL[file.language]} · read-only</span>
          <h1 className="m-0 font-display text-[28px] font-bold tracking-[-0.02em] text-fg">{file.name}</h1>
        </div>
        <button type="button" onClick={open} className="inline-flex h-10 items-center rounded-[10px] bg-signal px-4 text-[14px] font-semibold text-on-signal hover:brightness-110">
          Open in Playground
        </button>
      </div>
      <pre className="m-0 overflow-auto rounded-2xl border border-line bg-surface p-4 font-mono text-[13.5px] leading-relaxed text-fg">{file.code}</pre>
      {file.stdin ? (
        <section className="flex flex-col gap-1.5">
          <h2 className="m-0 text-[13px] font-medium text-fg-2">Input (stdin)</h2>
          <pre className="m-0 overflow-auto rounded-2xl border border-line bg-surface p-3 font-mono text-[13px] text-fg">{file.stdin}</pre>
        </section>
      ) : null}
    </>
  );
}
