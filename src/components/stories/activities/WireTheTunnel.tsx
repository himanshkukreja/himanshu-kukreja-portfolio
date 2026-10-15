"use client";

import { useState } from "react";
import ActivityShell from "./ActivityShell";
import { BTN_PRIMARY, ChoiceStep, Feedback, OrderStep, StepPrompt } from "./kit";
import type { ActivityProps } from "./registry";
import type { ActivityDef, StepCtx } from "./types";

type Part = string | { blank: number };

const SCRIPT: { comment: string; parts: Part[] }[] = [
  { comment: "# enable ADB over TCP on the USB-connected device", parts: ["adb -s 1d752b81 tcpip ", { blank: 0 }] },
  { comment: "# forward a local port to the device", parts: ["adb -s 1d752b81 forward tcp:", { blank: 1 }, " tcp:", { blank: 2 }] },
  { comment: "# create the bore tunnel", parts: ["bore local ", { blank: 3 }, " --to bore.pub &"] },
  { comment: "# connect from anywhere", parts: ["adb connect bore.pub:", { blank: 4 }] },
];

const ANSWERS = ["5555", "5000", "5555", "5000", "15750"];
const WHY = [
  "adb tcpip 5555 switches the phone's ADB daemon to listen on TCP port 5555.",
  "The laptop's local port 5000 is forwarded…",
  "…to the device's ADB port 5555.",
  "bore exposes that same local port 5000 to the internet.",
  "bore.pub hands back a public port (15750 in the story); that is what a teammate connects to.",
];
const CHIPS = ["5000", "5555", "8080", "15750"];

function FillTheScript({ ctx }: { ctx: StepCtx }) {
  const [vals, setVals] = useState<(string | null)[]>(() => ANSWERS.map(() => null));
  const [active, setActive] = useState(0);
  const [checked, setChecked] = useState(false);
  const full = vals.every((v) => v !== null);
  const score = vals.filter((v, i) => v === ANSWERS[i]).length;

  const put = (chip: string) => {
    if (checked) return;
    const next = [...vals];
    next[active] = chip;
    setVals(next);
    const empty = next.findIndex((v, i) => v === null && i > active);
    const any = next.findIndex((v) => v === null);
    setActive(empty >= 0 ? empty : any >= 0 ? any : active);
  };
  const check = () => {
    if (!full || checked) return;
    setChecked(true);
    ctx.done(score);
  };

  return (
    <div className="flex flex-col gap-4">
      <StepPrompt sub="Priya's weekend-1 prototype. Tap a blank, then a port. Same port can be used twice.">
        Fill in the ports so a phone in Koramangala answers <code className="font-mono text-[0.9em]">adb</code> from HSR Layout.
      </StepPrompt>
      <div className="border border-line-strong bg-bg">
        <div className="border-b border-line px-3 py-2 font-mono text-[11px] text-fg-3">expose-device.sh</div>
        <div className="flex flex-col gap-3 p-3 font-mono text-[13px] leading-[1.6]">
          {SCRIPT.map((line, li) => (
            <div key={li} className="flex flex-col">
              <span className="text-fg-4">{line.comment}</span>
              <span className="flex flex-wrap items-center gap-y-1.5 text-fg">
                {line.parts.map((p, pi) =>
                  typeof p === "string" ? (
                    <span key={pi} className="whitespace-pre-wrap break-all">
                      {p}
                    </span>
                  ) : (
                    <button
                      key={pi}
                      type="button"
                      onClick={() => !checked && setActive(p.blank)}
                      disabled={checked}
                      aria-label={`Blank ${p.blank + 1}: ${vals[p.blank] ?? "empty"}${checked ? (vals[p.blank] === ANSWERS[p.blank] ? ", correct" : `, should be ${ANSWERS[p.blank]}`) : ""}`}
                      aria-pressed={!checked && active === p.blank}
                      className={`mx-0.5 inline-grid h-11 min-w-[64px] place-items-center border-2 px-2 font-mono text-[13px] font-semibold disabled:cursor-default ${
                        checked
                          ? vals[p.blank] === ANSWERS[p.blank]
                            ? "border-signal bg-signal text-on-signal"
                            : "border-bad text-bad-text line-through"
                          : active === p.blank
                            ? "border-signal bg-signal/15 text-fg"
                            : vals[p.blank]
                              ? "border-line-strong bg-surface text-fg"
                              : "border-dashed border-line-strong text-fg-4"
                      }`}
                    >
                      {vals[p.blank] ?? "____"}
                    </button>
                  )
                )}
                {checked &&
                  line.parts.map((p) =>
                    typeof p !== "string" && vals[p.blank] !== ANSWERS[p.blank] ? (
                      <span key={`fix-${p.blank}`} className="ml-2 text-signal-text">
                        → {ANSWERS[p.blank]}
                      </span>
                    ) : null
                  )}
              </span>
            </div>
          ))}
        </div>
      </div>
      {!checked && (
        <div className="flex flex-col gap-2">
          <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">Ports · filling blank {active + 1}</span>
          <div className="grid grid-cols-4 gap-2" role="group" aria-label="Ports">
            {CHIPS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => put(c)}
                className="min-h-12 border border-line-strong bg-bg font-mono text-[15px] font-semibold text-fg hover:bg-surface-2"
              >
                {c}
              </button>
            ))}
          </div>
          <button type="button" onClick={check} disabled={!full} className={`${BTN_PRIMARY} self-start`}>
            run expose-device.sh
          </button>
        </div>
      )}
      <div aria-live="polite">
        {checked && (
          <Feedback ok={score === ANSWERS.length} title={score === ANSWERS.length ? "connected to 1d752b81 ✓" : `${score} of ${ANSWERS.length} ports right.`}>
            <ol className="m-0 flex list-decimal flex-col gap-1 pl-5">
              {WHY.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ol>
            <p className="m-0 mt-2">8080 was a decoy: nothing in the path listens there.</p>
          </Feedback>
        )}
      </div>
    </div>
  );
}

const DEF: ActivityDef = {
  kind: "fill the blanks",
  title: "Wire the tunnel",
  blurb:
    "Rebuild Priya's weekend prototype port by port, move a phone off its USB cable, then keep it alive when the battery dies. Four quick steps, all from this case file.",
  minutes: 2,
  steps: [
    { id: "ports", label: "Fill in the ports", max: 5, render: (ctx) => <FillTheScript ctx={ctx} /> },
    {
      id: "wifi",
      label: "Cut the cable",
      max: 4,
      render: (ctx) => (
        <OrderStep
          ctx={ctx}
          seed="bridgelink-wifi"
          prompt="bridgelink devices add --wifi: put the three-step WiFi setup (and the payoff) in order."
          items={[
            { id: "tcpip", text: "Enable TCP/IP mode: adb tcpip 5555", note: "while the phone is still on USB" },
            { id: "ip", text: "Read the phone's WiFi IP from adb shell ip route", note: "e.g. 192.168.1.15" },
            { id: "connect", text: "adb connect 192.168.1.15:5555", note: "the new WiFi serial" },
            { id: "unplug", text: "Disconnect the USB cable", note: "the tunnel still works globally" },
          ]}
        />
      ),
    },
    {
      id: "health",
      label: "Battery dies",
      max: 1,
      render: (ctx) => (
        <ChoiceStep
          ctx={ctx}
          prompt="Mid-test, a Redmi's battery dies. The tunnel process is still running. What does the health monitor do?"
          options={[
            "Nothing until the next nightly sweep picks it up.",
            "Within about a second: stops that device's tunnel and marks it inactive.",
            "Keeps the tunnel open and retries the test on the same port forever.",
            "Restarts bore for every device on the machine.",
          ]}
          answer={1}
          explain="The background HealthMonitor checks every active device every 1 second (adb shell echo ping, 5 s timeout). On a failure it stops that device's tunnel and updates the backend state to inactive, so nobody connects to a dead phone. The ConnectionMonitor auto-activates it again when it comes back."
        />
      ),
    },
    {
      id: "why-bore",
      label: "Why bore",
      max: 1,
      render: (ctx) => (
        <ChoiceStep
          ctx={ctx}
          prompt="What did BridgeLink need bore for, given ADB already controls the phone?"
          options={[
            "Recording the phone's screen as video.",
            "Installing APKs faster than adb install.",
            "A TCP tunnel that exposes a local port to the internet.",
            "Running the phone's ADB daemon on port 5555.",
          ]}
          answer={2}
          explain="ADB already worked over the local network. The missing piece was secure tunnelling: bore exposes a local TCP port (5000) at bore.pub, so adb connect bore.pub:<port> works from anywhere."
        />
      ),
    },
  ],
};

export default function WireTheTunnel({ slug, caseId }: ActivityProps) {
  return <ActivityShell slug={slug} caseId={caseId} def={DEF} />;
}
