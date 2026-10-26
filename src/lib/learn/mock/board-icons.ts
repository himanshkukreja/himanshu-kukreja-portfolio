/**
 * Icons for the mock interview whiteboard, from the same two packs the course diagrams use:
 *   sd:<name>    generic roles / components (Tabler, MIT), drawn in one colour
 *   tech:<name>  technology logos (svg-logos + Simple Icons, CC0), in their own colours
 * Excalidraw's dark theme inverts SVG images along with the canvas, but leaves PNGs alone, so an
 * icon goes onto the board as a small PNG: generic icons in a colour that reads on the dark canvas,
 * logos on a white rounded tile so dark logos stay visible.
 */
import { sd, tech } from "@/lib/diagrams/icons";

type Icon = { body: string; width?: number; height?: number };
const packs = { sd: sd as unknown as { icons: Record<string, Icon>; width?: number; height?: number }, tech: tech as unknown as { icons: Record<string, Icon>; width?: number; height?: number } };

export type IconRef = `sd:${string}` | `tech:${string}`;

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
  return [...t, ...g].slice(0, limit);
}

/** The icon as an SVG string; generic icons take `color` for their strokes. */
export function iconSvg(ref: string, color = "currentColor"): string | null {
  const [p, n] = ref.split(":") as ["sd" | "tech", string];
  const pack = packs[p];
  const ic = pack?.icons[n];
  if (!ic) return null;
  const w = ic.width || pack.width || (p === "sd" ? 24 : 256);
  const h = ic.height || pack.height || (p === "sd" ? 24 : 256);
  const body = p === "sd" ? ic.body.replaceAll("currentColor", color) : ic.body;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${body}</svg>`;
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
