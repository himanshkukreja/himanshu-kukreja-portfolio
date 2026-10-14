import { Prompt, container, h2Class } from "./ui";

const TILES = [
  { value: "−90%", label: "infra cost, AWS → Cloud Run", accent: false },
  { value: "<100ms", label: "device streaming, WebRTC", accent: false },
  { value: "#1", label: "Product of the Day", accent: true },
  { value: "75★", label: "iOS Bridge on GitHub", accent: false },
];

const DEPS: [string, string][] = [
  ["python", "daily driver"],
  ["typescript", "markdrop, sia, this site"],
  ["go", "tunnels (see waygate)"],
  ["fastapi", "every backend since 2023"],
  ["webrtc", "sub-100ms or it didn't ship"],
  ["mcp", "sia speaks it"],
  ["llm-agents", "sourcing → matching → interviews"],
  ["postgres", "^ the default"],
  ["redis", "locks, queues, rate limits"],
  ["aws | gcp", "cloud run when the bill matters"],
  ["docker", "*"],
];

function Key({ children }: { children: string }) {
  return <span className="text-signal-text">&quot;{children}&quot;</span>;
}

export default function Dependencies() {
  return (
    <section aria-labelledby="pkg-h" className="border-y border-line bg-raised">
      <div className={`${container} flex flex-wrap items-start gap-10 py-12 sm:py-16`}>
        <div className="flex min-w-0 flex-[1_1_340px] flex-col gap-4">
          <Prompt>cat package.json</Prompt>
          <h2 id="pkg-h" className={h2Class}>
            Dependencies
          </h2>
          <p className="m-0 text-base leading-relaxed text-fg-2 sm:text-[17px]">
            The stack, resolved. No peer-dependency warnings, one known issue.
          </p>
          <dl className="m-0 grid grid-cols-2 gap-px border border-line bg-line">
            {TILES.map((t) => (
              <div key={t.label} className="flex flex-col-reverse gap-1.5 bg-bg p-4 sm:p-[18px]">
                <dt className="text-[13px] text-fg-3">{t.label}</dt>
                <dd
                  className={`m-0 font-display text-[32px] font-extrabold leading-none tracking-[-0.04em] sm:text-[40px] ${
                    t.accent ? "text-signal-text" : "text-fg"
                  }`}
                >
                  {t.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
        <pre
          tabIndex={0}
          aria-label="package.json"
          className="m-0 min-w-0 flex-[1_1_520px] overflow-x-auto border border-line bg-bg p-4 font-mono text-[13px] leading-[1.75] text-fg-2 sm:p-6 sm:text-sm"
        >
          {"{\n  "}
          <Key>name</Key>
          {': "himanshu-kukreja",\n  '}
          <Key>version</Key>
          {': "4.0.0-senior",\n  '}
          <Key>main</Key>
          {': "backend.py",\n  '}
          <Key>dependencies</Key>
          {": {\n"}
          {DEPS.map(([k, v], i) => `    "${k}": "${v}"${i < DEPS.length - 1 ? "," : ""}\n`).join("")}
          {"  },\n  "}
          <Key>knownIssues</Key>
          {': [\n    "will turn any conversation into a system design interview"\n  ]\n}'}
        </pre>
      </div>
    </section>
  );
}
