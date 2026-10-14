"use client";

import { useEffect, useRef, useState } from "react";
import { DEMO_LABEL, type DemoProps } from "../useTicker";

const INITIAL = "# Release notes v2.4\n\n- Faster uploads\n- Dark mode for shared links\n- VS Code: publish on save\n\nShip it before standup.";

type Block = { kind: "h1" | "h2" | "li" | "p"; text: string };

function render(md: string): Block[] {
  return md
    .split("\n")
    .filter((l) => l.trim().length)
    .map((l) => {
      if (l.startsWith("# ")) return { kind: "h1", text: l.slice(2) };
      if (l.startsWith("## ")) return { kind: "h2", text: l.slice(3) };
      if (l.startsWith("- ")) return { kind: "li", text: l.slice(2) };
      return { kind: "p", text: l };
    });
}

export default function MarkdropDemo({ clear }: DemoProps) {
  const [text, setText] = useState(INITIAL);
  const [link, setLink] = useState("");
  const [copied, setCopied] = useState(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const drop = () => {
    const id = Math.random().toString(36).slice(2, 7);
    const path = `markdrop.in/${id}`;
    setLink(path);
    setCopied(false);
    clear("Dropped · link copied");
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      navigator.clipboard
        .writeText(`https://${path}`)
        .then(() => {
          if (alive.current) setCopied(true);
        })
        .catch(() => {
          // clipboard permission denied; the link is still shown
        });
    }
  };

  const blocks = render(text);

  return (
    <>
      <div className="flex flex-wrap gap-3">
        <label className={`flex min-w-0 flex-[1_1_300px] flex-col gap-2 ${DEMO_LABEL}`}>
          NOTES.MD · edit me
          <textarea
            rows={12}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setLink("");
              setCopied(false);
            }}
            spellCheck={false}
            className="resize-y border border-line-strong bg-surface p-3 font-mono text-sm normal-case leading-[1.6] tracking-normal text-fg placeholder:text-fg-4"
          />
        </label>
        <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-2">
          <span className={DEMO_LABEL}>RENDERED · what the link opens</span>
          <div className="flex min-h-[250px] grow flex-col gap-2 bg-[#F5F4F0] p-[18px] text-[#0B0B0B]">
            {blocks.map((b, i) => {
              if (b.kind === "h1")
                return (
                  <div key={i} className="font-display text-[26px] font-extrabold tracking-[-0.02em]">
                    {b.text}
                  </div>
                );
              if (b.kind === "h2")
                return (
                  <div key={i} className="text-lg font-bold">
                    {b.text}
                  </div>
                );
              if (b.kind === "li")
                return (
                  <div key={i} className="pl-1.5 text-[15px]">
                    <span aria-hidden>•&nbsp;&nbsp;</span>
                    {b.text}
                  </div>
                );
              return (
                <div key={i} className="text-[15px] leading-normal text-[#333336]">
                  {b.text}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2.5">
        <button
          type="button"
          onClick={drop}
          className="min-h-12 bg-signal px-5 text-[15px] font-semibold text-on-signal"
        >
          Drop it
        </button>
        <span role="status" className={`font-mono text-sm ${link ? "font-semibold text-signal-text" : "text-fg-4"}`}>
          {link ? `${link}${copied ? "  · copied to clipboard" : ""}` : "no link yet"}
        </span>
      </div>
    </>
  );
}
