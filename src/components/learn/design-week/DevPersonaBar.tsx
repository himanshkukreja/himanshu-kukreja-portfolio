"use client";

/** DEV ONLY (DOW_FIXTURES=1): act as a fixture learner on the Design of the week pages. */
import { setPersona, usePersona } from "./client";

const PEOPLE = [
  { id: "fx-ada", label: "Ada · eligible" },
  { id: "fx-newbie", label: "Newbie · can't vote" },
  { id: "fx-grace", label: "Grace · past winner" },
];

export default function DevPersonaBar() {
  const persona = usePersona();
  if (process.env.NODE_ENV !== "development") return null;
  return (
    <div className="flex flex-wrap items-center gap-2 border border-dashed border-signal bg-signal/10 px-3 py-2 font-mono text-xs text-fg" data-dow-dev>
      <span className="font-semibold text-signal-text">DEV FIXTURES</span>
      <span className="text-fg-3">act as:</span>
      {PEOPLE.map((p) => (
        <button
          key={p.id}
          type="button"
          onClick={() => setPersona(p.id)}
          aria-pressed={persona === p.id}
          className={`min-h-9 border px-2 ${persona === p.id ? "border-signal bg-signal text-on-signal" : "border-line-strong hover:bg-surface-2"}`}
        >
          {p.label}
        </button>
      ))}
      <button type="button" onClick={() => setPersona(null)} aria-pressed={!persona} className={`min-h-9 border px-2 ${!persona ? "border-signal bg-signal text-on-signal" : "border-line-strong hover:bg-surface-2"}`}>
        real session
      </button>
    </div>
  );
}
