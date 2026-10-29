/**
 * Icons for the whiteboard (design canvas + mock interview room), from the same packs the course
 * diagrams use, so a board reads like the diagrams in the lessons:
 *   sd:<name>    generic roles / components (Tabler, MIT), drawn in one colour
 *   tech:<name>  technology logos (svg-logos + Simple Icons, CC0), in their own colours
 *   tb:<name>    a few more Tabler outlines the component library needs that the course pack doesn't
 *                have (serverless, NoSQL, vector DB, pub/sub, DLQ, auth, secrets, external API); same
 *                set and stroke as `sd:`, copied from @iconify-json/tabler (MIT, Paweł Kuna)
 *
 * On the board, generic icons go in as SVG drawn in the block's line colour: Excalidraw's dark theme
 * inverts SVG images along with the shapes, so the icon always matches its block's line in both
 * themes. Logos go in as a PNG on a white rounded tile (PNGs are left alone, so brand colours stay).
 */
import { sd, tech } from "@/lib/diagrams/icons";

type Icon = { body: string; width?: number; height?: number };
type Pack = { icons: Record<string, Icon>; width?: number; height?: number };

const S = 'fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"';
const tb: Pack = {
  width: 24,
  height: 24,
  icons: {
    lambda: { body: `<path ${S} d="m6 20l6.5-9m6.5 9C13 20 13 4 7 4"/>` },
    braces: { body: `<path ${S} d="M7 4a2 2 0 0 0-2 2v3a2 3 0 0 1-2 3a2 3 0 0 1 2 3v3a2 2 0 0 0 2 2M17 4a2 2 0 0 1 2 2v3a2 3 0 0 0 2 3a2 3 0 0 0-2 3v3a2 2 0 0 1-2 2"/>` },
    vectors: { body: `<path ${S} d="M3 7a2 2 0 1 0 4 0a2 2 0 1 0-4 0m11 8a2 2 0 1 0 4 0a2 2 0 1 0-4 0m1-9a3 3 0 1 0 6 0a3 3 0 1 0-6 0M3 18a3 3 0 1 0 6 0a3 3 0 1 0-6 0m6-1l5-1.5m-7.5-7l7.81 5.37M7 7l8-1"/>` },
    broadcast: { body: `<g ${S}><path d="M18.364 19.364a9 9 0 1 0-12.728 0"/><path d="M15.536 16.536a5 5 0 1 0-7.072 0"/><path d="M11 13a1 1 0 1 0 2 0a1 1 0 1 0-2 0"/></g>` },
    "mail-x": { body: `<g ${S}><path d="M13.5 19H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6"/><path d="m3 7l9 6l9-6m1 15l-5-5m0 5l5-5"/></g>` },
    "user-shield": { body: `<path ${S} d="M6 21v-2a4 4 0 0 1 4-4h2m10 1c0 4-2.5 6-3.5 6S15 20 15 16c1 0 2.5-.5 3.5-1.5c1 1 2.5 1.5 3.5 1.5M8 7a4 4 0 1 0 8 0a4 4 0 0 0-8 0"/>` },
    plug: { body: `<path ${S} d="m7 12l5 5l-1.5 1.5a3.536 3.536 0 1 1-5-5zm10 0l-5-5l1.5-1.5a3.536 3.536 0 1 1 5 5zM3 21l2.5-2.5m13-13L21 3m-11 8l-2 2m5 1l-2 2"/>` },
    "lock-cog": { body: `<g ${S}><path d="M12 21H7a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2h10c.564 0 1.074.234 1.437.61"/><path d="M11 16a1 1 0 1 0 2 0a1 1 0 0 0-2 0m-3-5V7a4 4 0 1 1 8 0v4m1.001 8a2 2 0 1 0 4 0a2 2 0 1 0-4 0m2-3.5V17m0 4v1.5m3.031-5.25l-1.299.75m-3.463 2l-1.3.75m0-3.5l1.3.75m3.463 2l1.3.75"/></g>` },
  },
};

const packs: Record<string, Pack> = { sd: sd as unknown as Pack, tech: tech as unknown as Pack, tb };

export type IconRef = `sd:${string}` | `tech:${string}` | `tb:${string}`;

const NAMES: Record<string, string> = {
  bigquery: "BigQuery",
  bigtable: "Bigtable",
  clickhouse: "ClickHouse",
  cloudfront: "CloudFront",
  dynamodb: "DynamoDB",
  elasticsearch: "Elasticsearch",
  elb: "ELB",
  etcd: "etcd",
  fastapi: "FastAPI",
  gcs: "Cloud Storage",
  mongodb: "MongoDB",
  mysql: "MySQL",
  postgresql: "PostgreSQL",
  pubsub: "Pub/Sub",
  rabbitmq: "RabbitMQ",
  route53: "Route 53",
  s3: "S3",
  sendgrid: "SendGrid",
  sns: "SNS",
  sqlite: "SQLite",
  sqs: "SQS",
  timescaledb: "TimescaleDB",
  webrtc: "WebRTC",
  websocket: "WebSocket",
  "load-balancer": "Load balancer",
  "object-storage": "Object storage",
  "map-pin": "Map pin",
};

/** "tech:postgresql" → "PostgreSQL" */
export function iconName(ref: string): string {
  const n = ref.split(":")[1] || ref;
  return NAMES[n] || n.charAt(0).toUpperCase() + n.slice(1).replace(/-/g, " ");
}

/** Every technology logo, for the logo picker. */
export const TECH_ICONS = Object.keys(packs.tech.icons).sort() as string[];

/** Icons whose name matches the query, logos first. */
export function searchIcons(q: string, limit = 40): IconRef[] {
  const s = q.trim().toLowerCase();
  const hit = (n: string) => !s || n.includes(s) || iconName(n).toLowerCase().includes(s);
  const t = TECH_ICONS.filter(hit).map((n) => `tech:${n}` as IconRef);
  const g = Object.keys(packs.sd.icons).sort().filter(hit).map((n) => `sd:${n}` as IconRef);
  const x = Object.keys(tb.icons).sort().filter(hit).map((n) => `tb:${n}` as IconRef);
  return [...t, ...g, ...x].slice(0, limit);
}

/** The icon as an SVG string; generic icons take `color` for their strokes. */
export function iconSvg(ref: string, color = "currentColor"): string | null {
  const [p, n] = ref.split(":");
  const pack = packs[p];
  const ic = pack?.icons[n];
  if (!ic) return null;
  const mono = p !== "tech";
  const w = ic.width || pack.width || (mono ? 24 : 256);
  const h = ic.height || pack.height || (mono ? 24 : 256);
  const body = mono ? ic.body.replaceAll("currentColor", color) : ic.body;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${body}</svg>`;
}

/** A generic icon as an SVG data URL in one colour (for the board: it follows the board's theme). */
export function iconSvgUrl(ref: string, color: string): string | null {
  const svg = iconSvg(ref, color);
  return svg ? `data:image/svg+xml;base64,${btoa(svg)}` : null;
}

const pngCache = new Map<string, Promise<string>>();

/** The icon as a PNG data URL (size px square), ready for Excalidraw's addFiles. */
export function iconPng(ref: string, color: string, size = 96): Promise<string> {
  const key = `${ref}|${color}|${size}`;
  const hit = pngCache.get(key);
  if (hit) return hit;
  const job = (async () => {
    const svg = iconSvg(ref, color);
    if (!svg) throw new Error(`unknown icon ${ref}`);
    const img = new Image();
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const g = c.getContext("2d")!;
    const logo = ref.startsWith("tech:");
    if (logo) {
      // white tile with rounded corners, logo inset
      const r = size * 0.22;
      g.fillStyle = "#ffffff";
      g.beginPath();
      g.roundRect(0, 0, size, size, r);
      g.fill();
    }
    const pad = logo ? size * 0.16 : 0;
    const box = size - pad * 2;
    const ratio = img.width && img.height ? img.width / img.height : 1;
    const w = ratio >= 1 ? box : box * ratio;
    const h = ratio >= 1 ? box / ratio : box;
    g.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
    return c.toDataURL("image/png");
  })();
  pngCache.set(key, job);
  job.catch(() => pngCache.delete(key));
  return job;
}
