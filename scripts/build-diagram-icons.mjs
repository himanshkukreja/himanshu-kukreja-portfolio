#!/usr/bin/env node
// Builds the two small Mermaid icon packs the course + case-file diagrams use, from the full Iconify
// sets in devDependencies, and writes them to src/lib/diagrams/icons/ (checked in; the site never
// ships the full sets).
//
//   tech:<name>  real technologies (Kafka, PostgreSQL, Redis, S3 ...): svg-logos (@iconify-json/logos,
//                CC0-1.0), plus Simple Icons (@iconify-json/simple-icons, CC0-1.0) where svg-logos has
//                no mark or only a wordmark / dark logo that is unreadable at 48 px on a dark tile. Brand colours are kept, but near-black ink is rewritten to currentColor so a
//                black logo (Kafka, Apple, WebSocket) takes the node's theme colour and stays visible
//                in dark mode. Simple Icons marks are monochrome currentColor already.
//   sd:<name>    generic roles and components (user, phone, server, database, queue, cache, load
//                balancer, CDN, lock, bell, cron ...): Tabler Icons (@iconify-json/tabler, MIT),
//                outline icons drawn in currentColor, so they follow the theme.
//
// Only icons the content uses (plus the common ones in DIAGRAMS.md) are listed, to keep the chunk small.
// Content uses only these names: `A@{ icon: "tech:kafka", label: "Kafka · orders" }`. To add an icon,
// add a line below, run `node scripts/build-diagram-icons.mjs`, and list it in the course DIAGRAMS.md.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const OUT = path.join(path.dirname(new URL(import.meta.url).pathname), "../src/lib/diagrams/icons");

/** tech:<name> → source set:icon */
const TECH = {
  // databases + storage
  postgresql: "logos:postgresql",
  mysql: "simple-icons:mysql",
  mongodb: "logos:mongodb-icon",
  cassandra: "simple-icons:apachecassandra",
  dynamodb: "logos:aws-dynamodb",
  redis: "logos:redis",
  elasticsearch: "logos:elasticsearch",
  sqlite: "simple-icons:sqlite",
  clickhouse: "simple-icons:clickhouse",
  timescaledb: "simple-icons:timescale",
  spanner: "simple-icons:googlecloudspanner",
  bigtable: "simple-icons:googlebigtable",
  bigquery: "simple-icons:googlebigquery",
  redshift: "logos:aws-redshift",
  s3: "logos:aws-s3",
  glacier: "logos:aws-glacier",
  gcs: "simple-icons:googlecloudstorage",
  // streams + processing
  kafka: "logos:kafka-icon",
  rabbitmq: "logos:rabbitmq-icon",
  sqs: "logos:aws-sqs",
  sns: "logos:aws-sns",
  kinesis: "logos:aws-kinesis",
  pubsub: "simple-icons:googlepubsub",
  dataflow: "simple-icons:googledataflow",
  dataproc: "simple-icons:googledataproc",
  flink: "simple-icons:apacheflink",
  spark: "simple-icons:apachespark",
  lambda: "logos:aws-lambda",
  // edge + network
  cloudfront: "logos:aws-cloudfront",
  cloudflare: "logos:cloudflare-icon",
  route53: "logos:aws-route53",
  elb: "logos:aws-elb",
  nginx: "logos:nginx",
  // platform + ops
  kubernetes: "logos:kubernetes",
  docker: "logos:docker-icon",
  etcd: "logos:etcd",
  prometheus: "logos:prometheus",
  grafana: "logos:grafana",
  // protocols + runtimes
  websocket: "logos:websocket",
  webrtc: "logos:webrtc",
  fastapi: "logos:fastapi-icon",
  // client platforms
  android: "logos:android-icon",
  apple: "logos:apple",
  windows: "logos:microsoft-windows-icon",
  linux: "simple-icons:linux",
  // third-party services used as components
  firebase: "logos:firebase-icon",
  sendgrid: "logos:sendgrid-icon",
  stripe: "simple-icons:stripe",
};

/** sd:<name> → tabler:<icon> */
const SD = {
  // people + devices
  user: "user",
  users: "users",
  phone: "device-mobile",
  tablet: "device-tablet",
  laptop: "device-laptop",
  desktop: "device-desktop",
  tv: "device-tv",
  gamepad: "device-gamepad-2",
  browser: "browser",
  terminal: "terminal-2",
  // components
  api: "api",
  gateway: "building-arch",
  server: "server",
  servers: "server-2",
  worker: "settings-automation",
  cpu: "cpu",
  database: "database",
  queue: "stack-push",
  stream: "arrow-big-right-lines",
  cache: "bolt",
  "load-balancer": "arrows-split",
  cdn: "world-share",
  dns: "world-www",
  globe: "world",
  cloud: "cloud",
  region: "map-2",
  network: "network",
  router: "router",
  tunnel: "route-2",
  "object-storage": "bucket",
  file: "file-text",
  folder: "folders",
  search: "search",
  index: "file-database",
  ml: "brain",
  chart: "chart-bar",
  dashboard: "chart-dots-3",
  log: "list-details",
  monitor: "activity-heartbeat",
  alert: "alert-triangle",
  webhook: "webhook",
  code: "code",
  robot: "robot",
  // security
  lock: "lock",
  key: "key",
  shield: "shield-lock",
  firewall: "wall",
  fingerprint: "fingerprint",
  id: "id",
  // time
  clock: "clock",
  cron: "calendar-time",
  timer: "hourglass",
  // messaging
  bell: "bell",
  mail: "mail",
  sms: "message",
  chat: "messages",
  feed: "rss",
  // money + commerce + places
  bank: "building-bank",
  card: "credit-card",
  wallet: "wallet",
  cart: "shopping-cart",
  store: "building-store",
  warehouse: "building-warehouse",
  building: "building",
  delivery: "motorbike",
  truck: "truck-delivery",
  car: "car",
  ambulance: "ambulance",
  "map-pin": "map-pin",
  map: "map",
  hexagons: "hexagons",
  train: "train",
  ticket: "ticket",
  printer: "printer",
  scan: "scan",
  qrcode: "qrcode",
  // media
  video: "video",
  music: "music",
  camera: "camera",
  usb: "usb",
  wifi: "wifi",
  crown: "crown",
};

const sets = {
  logos: require("@iconify-json/logos/icons.json"),
  tabler: require("@iconify-json/tabler/icons.json"),
  "simple-icons": require("@iconify-json/simple-icons/icons.json"),
};

function source(ref) {
  const [set, name] = ref.split(":");
  const pack = sets[set];
  let n = name;
  for (let i = 0; i < 5 && !pack.icons[n] && pack.aliases?.[n]; i++) n = pack.aliases[n].parent;
  const icon = pack.icons[n];
  if (!icon) throw new Error(`missing icon ${ref}`);
  return { body: icon.body, width: icon.width ?? pack.width ?? 16, height: icon.height ?? pack.height ?? 16 };
}

/** A near-black, near-grey ink (#231f20, #343741 …) that disappears on a dark tile; dark brand hues stay. */
function isInk(hex) {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (!/^[0-9a-f]{6}$/i.test(h)) return false;
  const srgb = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const [r, g, b] = srgb.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum < 0.06 && Math.max(...srgb) - Math.min(...srgb) < 0.15;
}

/** Near-black ink → currentColor; a logo with no fill at all (black by default) gets one. */
function themeInk(body) {
  let out = body.replace(/(fill|stroke|stop-color)="(#[0-9a-fA-F]{3,6}|black)"/g, (m, attr, col) =>
    col === "black" || isInk(col) ? `${attr}="currentColor"` : m,
  );
  if (!/fill="/.test(out)) out = `<g fill="currentColor">${out}</g>`;
  return out;
}

function pack(prefix, map, info, fn) {
  const icons = {};
  for (const [name, ref] of Object.entries(map)) icons[name] = fn(ref);
  return { prefix, info, icons };
}

const tech = pack(
  "tech",
  TECH,
  {
    name: "Technology logos (subset of SVG Logos + Simple Icons)",
    author: { name: "Gil Barbara (svg-logos); Simple Icons contributors", url: "https://github.com/gilbarbara/logos" },
    license: { title: "CC0 1.0", spdx: "CC0-1.0", url: "https://creativecommons.org/publicdomain/zero/1.0/" },
  },
  (ref) => {
    const s = source(ref);
    return { body: ref.startsWith("logos:") ? themeInk(s.body) : s.body, width: s.width, height: s.height };
  },
);

const sd = {
  ...pack(
    "sd",
    SD,
    {
      name: "Tabler Icons (subset)",
      author: { name: "Paweł Kuna", url: "https://github.com/tabler/tabler-icons" },
      license: { title: "MIT, Copyright (c) 2020-2024 Paweł Kuna", spdx: "MIT", url: "https://github.com/tabler/tabler-icons/blob/main/LICENSE" },
    },
    (name) => ({ body: source(`tabler:${name}`).body }),
  ),
  width: 24,
  height: 24,
};

fs.mkdirSync(OUT, { recursive: true });
for (const [file, data] of [["tech.json", tech], ["sd.json", sd]]) {
  const json = JSON.stringify(data);
  fs.writeFileSync(path.join(OUT, file), json + "\n");
  console.log(`${file}: ${Object.keys(data.icons).length} icons, ${json.length} bytes`);
}
// names only, for the validators (case-file CMS, validate-blocks): they check every icon a diagram names exists
const names = { tech: Object.keys(tech.icons), sd: Object.keys(sd.icons) };
fs.writeFileSync(path.join(OUT, "names.json"), JSON.stringify(names) + "\n");
