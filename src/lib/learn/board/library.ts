/**
 * The whiteboard's component library, shared by the design canvas (/learn/canvas) and the mock
 * interview room: the categories, the components in each (name, icon, shape, search words), the
 * colours, and the Excalidraw elements one component is drawn with. Plain data, no Excalidraw import:
 * the board turns these skeletons into elements with convertToExcalidrawElements.
 *
 * Colours are the course diagram palette (src/lib/diagrams/palette.json, light values): Excalidraw
 * stores light-theme colours and its dark theme inverts the canvas, so the same block reads as the
 * palette's dark version there. No purple anywhere.
 *
 * Every component is one group: its shape (the "container", which holds the label and a
 * `customData.kind`), any decoration (a cylinder's lid, a queue's slots…) and its icon. The AI review
 * reads the label and the kind from the container (src/lib/learn/mock/sketch.ts).
 */
import type { IconRef } from "./icons";

export type Tone = "plain" | "grey" | "orange" | "green" | "blue" | "yellow" | "lime" | "red";

/** fill/stroke/text as stored on the board (light theme); `ui` is the swatch colour in the site's light and dark themes */
export const TONES: Record<Tone, { fill: string; stroke: string; text: string; ui: [string, string]; name: string }> = {
  plain: { fill: "#FFFFFF", stroke: "#55555B", text: "#0B0B0B", ui: ["#55555B", "#C9C8C4"], name: "Neutral" },
  grey: { fill: "#F2F1EC", stroke: "#2E2E33", text: "#0B0B0B", ui: ["#2E2E33", "#F3F2EE"], name: "Grey" },
  orange: { fill: "#FFE8DB", stroke: "#C2410C", text: "#431407", ui: ["#C2410C", "#FF6B2B"], name: "Orange" },
  green: { fill: "#DDF7F3", stroke: "#0F766E", text: "#042F2E", ui: ["#0F766E", "#2DD4BF"], name: "Teal" },
  blue: { fill: "#E3F2FF", stroke: "#1D6FB8", text: "#0B2740", ui: ["#1D6FB8", "#4FB3FF"], name: "Blue" },
  yellow: { fill: "#FDF1D6", stroke: "#A16207", text: "#3A2402", ui: ["#A16207", "#F5B83D"], name: "Amber" },
  lime: { fill: "#EEF8DA", stroke: "#4D7C0F", text: "#1A2E05", ui: ["#4D7C0F", "#A3E635"], name: "Lime" },
  red: { fill: "#FDE2E2", stroke: "#B91C1C", text: "#450A0A", ui: ["#B91C1C", "#E5484D"], name: "Red" },
};

export type Shape = "box" | "cylinder" | "bucket" | "queue" | "log" | "topic" | "stack" | "ellipse" | "diamond";

export type CategoryId = "clients" | "edge" | "compute" | "data" | "messaging" | "infra";
export const CATEGORIES: { id: CategoryId; name: string; tone: Tone }[] = [
  { id: "clients", name: "Clients", tone: "plain" },
  { id: "edge", name: "Edge", tone: "blue" },
  { id: "compute", name: "Compute", tone: "orange" },
  { id: "data", name: "Data", tone: "green" },
  { id: "messaging", name: "Messaging", tone: "yellow" },
  { id: "infra", name: "Infra", tone: "lime" },
];

export type Component = {
  /** stable id, saved on the board as customData.kind */
  kind: string;
  cat: CategoryId;
  /** the name in the list, and the block's first label */
  name: string;
  icon: IconRef;
  shape: Shape;
  dashed?: boolean;
  /** extra search words */
  words?: string;
};

export const COMPONENTS: Component[] = [
  { kind: "web-client", cat: "clients", name: "Web app", icon: "sd:browser", shape: "box", words: "client browser frontend spa user" },
  { kind: "mobile-client", cat: "clients", name: "Mobile app", icon: "sd:phone", shape: "box", words: "client ios android phone app user" },
  { kind: "desktop-client", cat: "clients", name: "Desktop app", icon: "sd:desktop", shape: "box", words: "client pc laptop" },
  { kind: "device", cat: "clients", name: "IoT device", icon: "sd:cpu", shape: "box", words: "client sensor device iot embedded" },
  { kind: "users", cat: "clients", name: "Users", icon: "sd:users", shape: "box", words: "client people actor" },
  { kind: "third-party", cat: "clients", name: "Third-party client", icon: "sd:building", shape: "box", dashed: true, words: "partner b2b external client integration" },

  { kind: "dns", cat: "edge", name: "DNS", icon: "sd:dns", shape: "box", words: "domain resolver route53" },
  { kind: "cdn", cat: "edge", name: "CDN", icon: "sd:cdn", shape: "box", words: "edge cache static cloudfront" },
  { kind: "load-balancer", cat: "edge", name: "Load balancer", icon: "sd:load-balancer", shape: "box", words: "lb elb alb nginx haproxy" },
  { kind: "api-gateway", cat: "edge", name: "API gateway", icon: "sd:gateway", shape: "box", words: "gateway bff ingress proxy" },
  { kind: "waf", cat: "edge", name: "WAF / rate limiter", icon: "sd:firewall", shape: "box", words: "firewall throttle rate limit ddos security" },

  { kind: "service", cat: "compute", name: "Service", icon: "sd:server", shape: "box", words: "api server backend microservice app" },
  { kind: "worker", cat: "compute", name: "Worker", icon: "sd:worker", shape: "stack", words: "consumer job background async processor" },
  { kind: "function", cat: "compute", name: "Serverless function", icon: "tb:lambda", shape: "box", words: "lambda faas cloud function" },
  { kind: "scheduler", cat: "compute", name: "Scheduler / cron", icon: "sd:cron", shape: "box", words: "cron timer job batch schedule" },

  { kind: "sql-db", cat: "data", name: "SQL database", icon: "sd:database", shape: "cylinder", words: "db relational postgres mysql rdbms" },
  { kind: "nosql-db", cat: "data", name: "NoSQL / KV store", icon: "tb:braces", shape: "cylinder", words: "db document key value dynamo mongo cassandra kv" },
  { kind: "cache", cat: "data", name: "Cache", icon: "sd:cache", shape: "box", words: "redis memcached in-memory" },
  { kind: "search-index", cat: "data", name: "Search index", icon: "sd:search", shape: "cylinder", words: "elasticsearch opensearch full text" },
  { kind: "object-storage", cat: "data", name: "Object storage", icon: "sd:object-storage", shape: "bucket", words: "s3 blob bucket files gcs" },
  { kind: "warehouse", cat: "data", name: "Data warehouse", icon: "sd:warehouse", shape: "cylinder", words: "analytics olap bigquery redshift snowflake lake" },
  { kind: "vector-db", cat: "data", name: "Vector DB", icon: "tb:vectors", shape: "cylinder", words: "embeddings similarity ann rag pinecone" },

  { kind: "queue", cat: "messaging", name: "Queue", icon: "sd:queue", shape: "queue", words: "sqs rabbitmq message buffer" },
  { kind: "stream", cat: "messaging", name: "Stream / log", icon: "sd:stream", shape: "log", words: "kafka kinesis event log partition" },
  { kind: "pubsub", cat: "messaging", name: "Pub/sub topic", icon: "tb:broadcast", shape: "topic", words: "sns fan out event bus topic broadcast" },
  { kind: "dlq", cat: "messaging", name: "Dead-letter queue", icon: "tb:mail-x", shape: "queue", dashed: true, words: "dlq failed retry poison" },

  { kind: "auth", cat: "infra", name: "Auth / IdP", icon: "tb:user-shield", shape: "box", words: "identity login oauth sso jwt" },
  { kind: "secrets", cat: "infra", name: "Config / secrets", icon: "tb:lock-cog", shape: "box", words: "vault kms config settings keys" },
  { kind: "monitoring", cat: "infra", name: "Monitoring", icon: "sd:monitor", shape: "box", words: "metrics logs alerts observability prometheus grafana" },
  { kind: "external-api", cat: "infra", name: "External API", icon: "tb:plug", shape: "box", dashed: true, words: "third party vendor webhook integration" },
  { kind: "payment-gateway", cat: "infra", name: "Payment gateway", icon: "sd:card", shape: "box", dashed: true, words: "stripe razorpay upi psp card" },
];

export const toneOf = (cat: CategoryId): Tone => CATEGORIES.find((c) => c.id === cat)!.tone;
export const componentOf = (kind: string | undefined) => COMPONENTS.find((c) => c.kind === kind);

/** Components matching a query (name, category, search words), in library order. */
export function searchComponents(q: string): Component[] {
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return COMPONENTS;
  return COMPONENTS.filter((c) => {
    const hay = `${c.name} ${c.kind} ${c.cat} ${c.words || ""}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

/** What goes on the board: a component from the library, a tech logo, or one of the learner's own blocks. */
export type Block = { label: string; shape: Shape; tone: Tone; icon?: string; dashed?: boolean; kind?: string };

export const blockOf = (c: Component): Block => ({ label: c.name, shape: c.shape, tone: toneOf(c.cat), icon: c.icon, dashed: c.dashed, kind: c.kind });

/** width × height of a block on the board */
export const SIZE: Record<Shape, [number, number]> = {
  box: [184, 88],
  stack: [184, 88],
  queue: [196, 88],
  log: [196, 100],
  topic: [184, 88],
  cylinder: [168, 116],
  bucket: [168, 108],
  ellipse: [200, 112],
  diamond: [220, 136],
};

export const ICON = 28;
/** Nunito: clean labels (Excalidraw's default is a hand-drawn font) */
export const FONT = 6;

type Sk = Record<string, unknown>;

/**
 * The elements one block is drawn with, top-left at (x, y): decoration behind, the container
 * (labelled, bindable: arrows attach to it), decoration in front, and where the icon goes.
 */
export function blockParts(b: Block, x: number, y: number): { parts: Sk[]; container: number; icon: [number, number] | null } {
  const t = TONES[b.tone] || TONES.plain;
  const [w, h] = SIZE[b.shape] || SIZE.box;
  const line = { strokeColor: t.stroke, strokeWidth: 2, roughness: 0, strokeStyle: b.dashed ? "dashed" : "solid" };
  const fill = { backgroundColor: t.fill, fillStyle: "solid" };
  const label = (align: "bottom" | "middle" = b.icon ? "bottom" : "middle") => ({ text: b.label, fontSize: 16, fontFamily: FONT, strokeColor: t.text, verticalAlign: align });
  const rect = (rx: number, ry: number, rw: number, rh: number, extra: Sk = {}): Sk => ({ type: "rectangle", x: rx, y: ry, width: rw, height: rh, ...line, ...fill, roundness: { type: 3 }, ...extra });
  const seg = (x1: number, y1: number, x2: number, y2: number, extra: Sk = {}): Sk => ({ type: "line", x: x1, y: y1, points: [[0, 0], [x2 - x1, y2 - y1]], ...line, strokeStyle: "solid", ...extra });
  const iconAt = (top: number): [number, number] | null => (b.icon ? [x + w / 2 - ICON / 2, y + top] : null);
  const kind = b.kind ? { customData: { kind: b.kind } } : {};

  switch (b.shape) {
    case "cylinder": {
      // a lid ellipse, a body with side lines, and the bottom ellipse behind the body (only its lower arc shows)
      const e = 22;
      const parts: Sk[] = [
        { type: "ellipse", x, y: y + h - e, width: w, height: e, ...line, ...fill },
        rect(x, y + e / 2, w, h - e, { strokeColor: "transparent", roundness: null, label: label(), ...kind }),
        seg(x, y + e / 2, x, y + h - e / 2),
        seg(x + w, y + e / 2, x + w, y + h - e / 2),
        { type: "ellipse", x, y, width: w, height: e, ...line, ...fill },
      ];
      return { parts, container: 1, icon: iconAt(e + 6) };
    }
    case "bucket": {
      // a bucket: a trapezoid wider at the top, with an open lid
      const e = 20;
      const inset = 14;
      const parts: Sk[] = [
        { type: "line", x, y: y + e / 2, points: [[0, 0], [w, 0], [w - inset, h - e / 2], [inset, h - e / 2], [0, 0]], ...line, ...fill },
        rect(x + inset, y + e / 2, w - inset * 2, h - e / 2 - 2, { strokeColor: "transparent", roundness: null, label: label(), ...kind }),
        { type: "ellipse", x, y, width: w, height: e, ...line, ...fill },
      ];
      return { parts, container: 1, icon: iconAt(e + 4) };
    }
    case "stack": {
      // more than one of it: two plates behind
      const parts: Sk[] = [rect(x + 12, y - 12, w, h), rect(x + 6, y - 6, w, h), rect(x, y, w, h, { label: label(), ...kind })];
      return { parts, container: 2, icon: iconAt(12) };
    }
    case "queue": {
      // messages waiting: slots at the head of the queue
      const parts: Sk[] = [rect(x, y, w, h, { label: label(), ...kind }), ...[12, 22, 32].map((d) => seg(x + w - d, y + 14, x + w - d, y + h - 14, { strokeWidth: 1.5 }))];
      return { parts, container: 0, icon: iconAt(12) };
    }
    case "log": {
      // an append-only log: a band of segments along the bottom
      const band = 18;
      const cells = 7;
      const cw = (w - 24) / cells;
      const parts: Sk[] = [
        rect(x, y, w, h, { label: label("middle"), ...kind }),
        ...Array.from({ length: cells }, (_, i) => ({ type: "rectangle", x: x + 12 + i * cw, y: y + h - band - 8, width: cw, height: band, ...line, strokeWidth: 1, strokeStyle: "solid", backgroundColor: i === cells - 1 ? t.stroke : "transparent", fillStyle: "solid", roundness: null })),
      ];
      return { parts, container: 0, icon: iconAt(10) };
    }
    case "topic": {
      // a topic: an inner frame, so it reads as a channel others subscribe to
      const parts: Sk[] = [rect(x, y, w, h, { label: label(), ...kind }), rect(x + 5, y + 5, w - 10, h - 10, { backgroundColor: "transparent", strokeWidth: 1 })];
      return { parts, container: 0, icon: iconAt(12) };
    }
    case "ellipse":
    case "diamond": {
      const parts: Sk[] = [{ type: b.shape, x, y, width: w, height: h, ...line, ...fill, label: label(), ...kind }];
      return { parts, container: 0, icon: iconAt(b.shape === "ellipse" ? 20 : 26) };
    }
    default:
      return { parts: [rect(x, y, w, h, { label: label(), ...kind })], container: 0, icon: iconAt(12) };
  }
}
