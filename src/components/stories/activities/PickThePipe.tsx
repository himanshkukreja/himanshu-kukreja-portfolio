"use client";

import { useId, useState } from "react";
import ActivityShell from "./ActivityShell";
import { ChoiceStep, ClassifyStep } from "./kit";
import type { ActivityProps } from "./registry";
import type { ActivityDef, StepCtx } from "./types";

const MBPS_PER_STREAM = 3; // the story's 1080p figure: 6 streams ≈ 18 Mbps
const HOME_LOW = 10;
const HOME_HIGH = 25;

function MeshMeter() {
  const [n, setN] = useState(4);
  const id = useId();
  const streams = 2 * (n - 1);
  const mbps = streams * MBPS_PER_STREAM;
  const scaleMax = 66;
  const pct = (v: number) => `${Math.min(100, (v / scaleMax) * 100)}%`;
  const fits = mbps <= HOME_HIGH;
  // Nodes on a circle with every pair connected: the mesh.
  const pts = Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    return { x: 60 + 46 * Math.cos(a), y: 60 + 46 * Math.sin(a) };
  });
  const edges: [number, number][] = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) edges.push([i, j]);

  return (
    <div className="flex flex-col gap-3 border border-line-strong bg-bg p-4">
      <div className="flex flex-wrap items-center gap-4">
        <svg viewBox="0 0 120 120" className="h-[112px] w-[112px] shrink-0" role="img" aria-label={`Full mesh of ${n} people: ${edges.length} peer connections`}>
          {edges.map(([a, b]) => (
            <line key={`${a}-${b}`} x1={pts[a].x} y1={pts[a].y} x2={pts[b].x} y2={pts[b].y} stroke="var(--c-line-strong)" strokeWidth={1} />
          ))}
          {pts.map((p, i) => (
            <rect key={i} x={p.x - 5} y={p.y - 5} width={10} height={10} fill={i === 0 ? "var(--c-signal)" : "var(--c-fg)"} />
          ))}
        </svg>
        <div className="flex min-w-[180px] grow flex-col gap-2">
          <label htmlFor={id} className="font-mono text-[11px] uppercase tracking-label text-fg-3">
            People in a peer-to-peer mesh: <span className="text-fg">{n}</span>
          </label>
          <input
            id={id}
            type="range"
            min={2}
            max={12}
            step={1}
            value={n}
            onChange={(e) => setN(Number(e.target.value))}
            className="h-11 w-full accent-[var(--c-signal)]"
          />
          <span className="font-mono text-[13px] text-fg-2">
            you send {n - 1} + receive {n - 1} = <span className="font-semibold text-fg">{streams} streams</span>
          </span>
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="relative h-6 border border-line bg-surface" aria-hidden>
          <span className="absolute inset-y-0 bg-ok/20" style={{ left: pct(HOME_LOW), width: `calc(${pct(HOME_HIGH)} - ${pct(HOME_LOW)})` }} />
          <span className={`absolute inset-y-1 left-0 ${fits ? "bg-fg-3" : "bg-signal"}`} style={{ width: pct(mbps) }} />
        </div>
        <span className="font-mono text-[12px] leading-relaxed text-fg-3" aria-live="polite">
          ≈ <span className={`font-semibold ${fits ? "text-fg" : "text-signal-text"}`}>{mbps} Mbps</span> per participant at 1080p · green band = typical home
          internet ({HOME_LOW}–{HOME_HIGH} Mbps) · {fits ? "fits, barely" : "won't fit"}
        </span>
      </div>
    </div>
  );
}

function Topology({ ctx }: { ctx: StepCtx }) {
  return (
    <div className="flex flex-col gap-5">
      <MeshMeter />
      <ClassifyStep
        ctx={ctx}
        prompt="Drag the slider to feel the mesh blow up, then pick the WebRTC topology for each call."
        sub="Using the story's decision tree."
        buckets={[
          { id: "p2p", label: "Peer-to-peer mesh", hint: "≤ 4 people" },
          { id: "sfu", label: "WebRTC + SFU", hint: "forwards, no re-encode" },
          { id: "mcu", label: "WebRTC + MCU", hint: "mixes one stream" },
        ]}
        items={[
          {
            label: "standup",
            text: "A 3-person team standup",
            bucket: "p2p",
            explain: "Up to about 4 people, a direct peer-to-peer mesh fits home bandwidth (3 people: 4 streams, ~12 Mbps at 1080p) and needs almost no server: WebRTC P2P.",
          },
          {
            label: "all-hands",
            text: "A 40-person all-hands where anyone can unmute",
            bucket: "sfu",
            explain: "5–100 participants: an SFU. Each user uploads once and the server forwards streams without encoding or decoding, so CPU stays low.",
          },
          {
            label: "workshop",
            text: "A call joined by old room systems that can decode only one video stream",
            bucket: "mcu",
            explain: "An MCU mixes all video into a single combined stream per user: ultra-low bandwidth and decoding for clients, at the cost of high server CPU and extra latency. (Big 100+ calls usually use cascaded SFUs instead.)",
          },
        ]}
      />
    </div>
  );
}

const DEF: ActivityDef = {
  kind: "topology picker",
  title: "Pick the pipe",
  blurb:
    "Emma's demo died because video went through a WebSocket server. Route six ConnectNow features to the right pipe, size a WebRTC call, and fix the firewall case.",
  minutes: 2,
  steps: [
    {
      id: "route",
      label: "Route the features",
      max: 6,
      render: (ctx) => (
        <ClassifyStep
          ctx={ctx}
          prompt="ConnectNow's hybrid: which pipe carries each feature?"
          buckets={[
            { id: "ws", label: "WebSockets", hint: "TCP · through the server" },
            { id: "rtc", label: "WebRTC", hint: "UDP · peer to peer" },
          ]}
          items={[
            {
              label: "chat",
              text: "Text chat in a meeting channel",
              bucket: "ws",
              explain: "Text needs every message, in order: TCP's guaranteed delivery, and the server can moderate, log and persist it. Slack and Discord do chat over WebSockets.",
            },
            {
              label: "video",
              text: "A 4-person video call",
              bucket: "rtc",
              explain: "Media goes peer to peer over UDP with built-in codecs and adaptive bitrate: roughly 100–300 ms glass-to-glass, versus 200–500 ms or worse through a server.",
            },
            {
              label: "signaling",
              text: "Exchanging the WebRTC offer, answer and ICE candidates",
              bucket: "ws",
              explain: "WebRTC needs a separate signaling channel to set the call up. ConnectNow's WebSocket server negotiates the WebRTC connections.",
            },
            {
              label: "screen",
              text: "Screen sharing",
              bucket: "rtc",
              explain: "Screen share is a media stream: it rides the WebRTC media layer with the video and audio.",
            },
            {
              label: "ticker",
              text: "Live stock price updates",
              bucket: "ws",
              explain: "Every price update must arrive and the server enforces rate limits and history: the story's live-trading example is WebSockets.",
            },
            {
              label: "voice",
              text: "A voice channel",
              bucket: "rtc",
              explain: "Discord runs voice over WebRTC (relayed by its own voice servers) and keeps text and presence on WebSockets.",
            },
          ]}
        />
      ),
    },
    { id: "size", label: "Size the call", max: 3, render: (ctx) => <Topology ctx={ctx} /> },
    {
      id: "turn",
      label: "Behind the firewall",
      max: 1,
      render: (ctx) => (
        <ChoiceStep
          ctx={ctx}
          prompt="A patient's hospital Wi-Fi blocks direct peer-to-peer connections. How does the video still get through?"
          options={[
            "A STUN server streams the video instead.",
            "Fall back to sending frames over the WebSocket chat channel.",
            "A TURN server relays the media.",
            "It can't: the call fails for that user.",
          ]}
          answer={2}
          explain="STUN only helps discover a public IP so a direct connection can happen. When a direct connection is impossible, a TURN server relays the traffic: a fallback used for roughly 10–20% of connections. MedConnect added TURN servers for patients behind restrictive firewalls."
        />
      ),
    },
    {
      id: "cpu",
      label: "Read the incident",
      max: 1,
      render: (ctx) => (
        <ChoiceStep
          ctx={ctx}
          prompt="Night before the demo: server CPU at 95% with just 50 video calls on the WebSocket build. Why?"
          options={[
            "TCP handshakes on every message.",
            "The server has to process every video frame of every call.",
            "Chat messages were not being persisted.",
            "Browsers don't support WebSockets for binary data.",
          ]}
          answer={1}
          explain="With WebSockets all media flows through the server: it processes every frame, buffers streams and pays for all the bandwidth. After moving media to WebRTC the same servers ran at 15% CPU with 500 users."
        />
      ),
    },
  ],
};

export default function PickThePipe({ slug, caseId }: ActivityProps) {
  return <ActivityShell slug={slug} caseId={caseId} def={DEF} />;
}
