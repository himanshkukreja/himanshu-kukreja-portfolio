// Single source of truth for who Himanshu is, what he can do and where he has been.
// Every concept in /lab/showcase and the shipped home sections read from here, so dates stay exact everywhere.

export type EraId = "thapar" | "ikarus" | "autoflow" | "nativebridge" | "pcloudy" | "senseloaf" | "markdrop" | "chukta";

export type Ym = [number, number]; // [year, month 1-12]

export type Era = {
  id: EraId;
  org: string;
  role: string;
  kind: "edu" | "job" | "freelance" | "venture";
  start: Ym;
  /** null = still running */
  end: Ym | null;
  /** Exact, human period. Never derived, so it can't drift. */
  period: string;
  place?: string;
  href?: string;
  /** Extra links shown under the chapter (a side project's app, beta, web app). */
  links?: { label: string; href: string }[];
  /** Short tag on a bonus-stage card. */
  tag?: string;
  /** One line: what this chapter was. */
  line: string;
  points: string[];
  wins: string[];
  /** The problem this chapter beat, in game terms. */
  boss: string;
  bossNote: string;
  /** What he took away from it. */
  loot: string;
  skills: SkillId[];
};

export type BranchId = "backend" | "realtime" | "ai" | "infra" | "product" | "lead";

export type SkillId =
  | "python"
  | "fastapi"
  | "microservices"
  | "go"
  | "postgres"
  | "redis"
  | "webrtc"
  | "devices"
  | "tunnels"
  | "video"
  | "tensorflow"
  | "llm-agents"
  | "mcp"
  | "playwright"
  | "docker"
  | "cloudrun"
  | "aws"
  | "cicd"
  | "typescript"
  | "react"
  | "ui"
  | "devtools"
  | "mentoring"
  | "founding"
  | "lead"
  | "writing";

export type Proof = { era: EraId | "oss" | "writing" | "stack"; text: string };

export type Skill = { id: SkillId; name: string; branch: BranchId; proof: Proof[] };

export type Branch = { id: BranchId; name: string; short: string; blurb: string };

export const PERSON = {
  name: "Himanshu Kukreja",
  first: "Himanshu",
  last: "Kukreja",
  handle: "himanshkukreja",
  title: "Senior Software Engineer",
  lead: "Engineering lead @ Senseloaf AI",
  city: "Bengaluru",
  degree: "B.E. Computer Science, Thapar Institute · CGPA 9.04",
  now: "Building SIA and its MCP server",
  side: "Markdrop and Chukta, nights and weekends",
  github: "https://github.com/himanshkukreja",
  linkedin: "https://www.linkedin.com/in/himanshukukreja/",
  x: "https://x.com/hi_kukreja",
  markdrop: "https://markdrop.in",
  chukta: "https://getchukta.in",
  /** The landing page's Android card: install hint + the APK download (/download/chukta.apk). */
  chuktaBeta: "https://getchukta.in/#android",
  chuktaWeb: "https://app.getchukta.in",
  stars: 99,
};

export const ERAS: Era[] = [
  {
    id: "thapar",
    org: "Thapar Institute",
    role: "B.E. Computer Science",
    kind: "edu",
    start: [2019, 8],
    end: [2023, 7],
    period: "2019 – 2023",
    place: "Patiala",
    line: "Four years of CS, finished with a 9.04.",
    points: [
      "B.E. Computer Science, CGPA 9.04 / 10.",
      "AI smart glasses for visually impaired people on a NodeMCU ESP8266, with 4 teammates.",
      "SmartAgri: crop recommendations at 96% accuracy and plant-disease detection with TensorFlow.",
    ],
    wins: ["CGPA 9.04", "96% crop model"],
    boss: "The tutorial",
    bossNote: "A model is the easy part. Getting it onto a $3 microcontroller is the project.",
    loot: "Python, TensorFlow, the habit of shipping things to real hardware",
    skills: ["python", "tensorflow"],
  },
  {
    id: "ikarus",
    org: "Ikarus 3D",
    role: "SDA → SDE 1",
    kind: "job",
    start: [2023, 1],
    end: [2023, 10],
    period: "Jan – Oct 2023",
    place: "Chandigarh",
    line: "First job. Led the backend for IkarusNest across 7+ microservices.",
    points: [
      "Led backend for IkarusNest across 7+ microservices: auth, carts, orders, slicer.",
      "Moved the slicer to Cloud Run: −90% infra cost, −50% API latency, −30% login time.",
      "Set up the first CI/CD pipelines and mentored 3 interns.",
    ],
    wins: ["−90% infra cost", "−50% API latency", "−30% login time"],
    boss: "The AWS bill",
    bossNote: "Defeated by moving the slicer to Cloud Run. The cheapest server is the one that turns itself off.",
    loot: "Microservices, Cloud Run, CI/CD, a first taste of mentoring",
    skills: ["python", "microservices", "postgres", "cloudrun", "aws", "cicd", "docker", "mentoring"],
  },
  {
    id: "autoflow",
    org: "AutoFlow",
    role: "Founding engineer #1",
    kind: "job",
    start: [2024, 1],
    end: [2024, 12],
    period: "Jan – Dec 2024",
    place: "Bengaluru",
    line: "Employee #1. The whole backend, from an empty repo.",
    points: [
      "Built the whole backend from an empty repo.",
      "AI for autonomous UI testing on a fleet of Playwright runners.",
      "Launched on Product Hunt: Product of the Day.",
    ],
    wins: ["employee #1", "Product of the Day"],
    boss: "git init",
    bossNote: "An empty repo and a launch date. Founding engineer means you also own the pager, the bill and the demo.",
    loot: "FastAPI from scratch, LLM agents, a Playwright runner fleet",
    skills: ["python", "fastapi", "llm-agents", "playwright", "postgres", "aws", "founding"],
  },
  {
    id: "nativebridge",
    org: "NativeBridge",
    role: "Founding engineer",
    kind: "job",
    start: [2025, 1],
    end: [2026, 3],
    period: "Jan 2025 – Mar 2026",
    line: "Real Android and iOS devices in the cloud, streamed to a browser in under 100 ms.",
    points: [
      "Cloud Android and iOS devices streamed over WebRTC in under 100 ms.",
      "Open-sourced iOS Bridge (75★) and BridgeLink.",
    ],
    wins: ["<100 ms streams", "iOS Bridge 75★", "BridgeLink"],
    boss: "The 100 ms wall",
    bossNote: "Latency is a feature. Users feel 80 ms before they can name it.",
    loot: "WebRTC, device control on two OSes, open source people actually use",
    skills: ["webrtc", "devices", "tunnels", "python", "founding"],
  },
  {
    id: "pcloudy",
    org: "pCloudy",
    role: "Freelance",
    kind: "freelance",
    start: [2026, 3],
    end: [2026, 6],
    period: "Mar – Jun 2026",
    line: "Device-streaming research for a 5,000+ device cloud.",
    points: ["Device-streaming research for a 5,000+ device cloud.", "Mobile app testing solutions."],
    wins: ["5,000+ devices"],
    boss: "Scale ×5,000",
    bossNote: "Streaming one phone well is a demo. Streaming a cloud of them is a system.",
    loot: "Device streaming at fleet scale",
    skills: ["webrtc", "devices"],
  },
  {
    id: "senseloaf",
    org: "Senseloaf AI",
    role: "Senior SWE · eng lead",
    kind: "job",
    start: [2026, 4],
    end: null,
    period: "Apr 2026 – present",
    place: "Bengaluru",
    href: "https://senseloaf.ai",
    line: "Leading engineering for an agentic hiring platform.",
    points: [
      "Lead engineering of an agentic hiring platform used by enterprises and startups: agents for sourcing, resume-to-job matching, profile verification, prescreening and AI interviews.",
      "Own features end to end: product research, UI design, frontend, backend, infra scaling.",
      "Building SIA (Senseloaf Intelligent Agent), a chat where a recruiter does all of hiring from one conversation, plus its MCP server.",
    ],
    wins: ["5 hiring agents", "SIA + MCP server"],
    boss: "One-chat hiring",
    bossNote: "An agent is only as good as the product decisions around it.",
    loot: "In progress",
    skills: ["llm-agents", "mcp", "typescript", "ui", "lead"],
  },
  {
    id: "markdrop",
    org: "Markdrop",
    role: "Founder · side venture",
    kind: "venture",
    start: [2026, 3],
    end: null,
    period: "Mar 2026 – present",
    href: "https://markdrop.in",
    tag: "my own venture",
    line: "Publish markdown, AI docs and files as links that render.",
    points: [
      "Publish markdown and AI docs and files as links that render.",
      "A web app, a VS Code extension and a CLI on Homebrew and Scoop.",
    ],
    wins: ["web + VS Code + CLI", "Homebrew · Scoop"],
    boss: "Shipping solo",
    bossNote: "Nights and weekends. Product, code, distribution, all of it.",
    loot: "In progress",
    skills: ["typescript", "devtools", "ui"],
  },
  {
    id: "chukta",
    org: "Chukta",
    role: "Solo builder · side project",
    kind: "venture",
    start: [2026, 10],
    end: null,
    period: "Oct 2026 – present",
    href: "https://getchukta.in",
    links: [
      { label: "getchukta.in ↗", href: "https://getchukta.in" },
      { label: "Android beta ↗", href: "https://getchukta.in/#android" },
      { label: "web app ↗", href: "https://app.getchukta.in" },
    ],
    tag: "android beta · live",
    line: "Free, ad-free bill splitting for friends in India, settled over UPI in one tap.",
    points: [
      "Splitwise’s features with no Pro plan, no ads and no limits, plus one-tap UPI settle-up, pay-me links and WhatsApp reminders.",
      "Receipt scanning with item-by-item splits, simplify debts, any currency, works offline, and a Splitwise import that checks every balance before it saves.",
      "Android app and iPhone web app from one Expo + React Native codebase on Supabase. The money maths is a pure TypeScript package in whole paise, tested with Vitest.",
      "Building since Oct 2026. The first beta, 0.2.0, shipped on 18 Oct 2026.",
    ],
    wins: ["Android beta · Oct 2026", "one-tap UPI", "offline-first", "Splitwise import"],
    boss: "Never lose a paisa",
    bossNote: "Every amount in whole paise, every split checked again on the server, and offline edits that replay safely.",
    loot: "In progress",
    skills: ["typescript", "react", "postgres", "ui"],
  },
];

export const ERA_BY_ID = Object.fromEntries(ERAS.map((e) => [e.id, e])) as Record<EraId, Era>;

/** Career chapters in order (jobs only, no side venture), oldest first. */
export const CHAPTERS = ERAS.filter((e) => e.kind !== "venture");

export const BRANCHES: Branch[] = [
  { id: "backend", name: "Backend & data", short: "backend", blurb: "APIs, services and the stores under them." },
  { id: "realtime", name: "Realtime & devices", short: "realtime", blurb: "Real phones, in a browser, fast." },
  { id: "ai", name: "AI & agents", short: "ai", blurb: "From a crop model to hiring agents." },
  { id: "infra", name: "Cloud & infra", short: "infra", blurb: "Make it cheap, make it ship." },
  { id: "product", name: "Product & frontend", short: "product", blurb: "The part users actually touch." },
  { id: "lead", name: "Leadership", short: "lead", blurb: "Owning outcomes, not tickets." },
];

export const SKILLS: Skill[] = [
  // backend & data
  { id: "python", name: "Python", branch: "backend", proof: [
    { era: "thapar", text: "TensorFlow models and a Flask app, first deploy" },
    { era: "ikarus", text: "IkarusNest backend, 7+ microservices" },
    { era: "autoflow", text: "the whole backend, from an empty repo" },
    { era: "oss", text: "iOS Bridge (75★) and BridgeLink" },
  ] },
  { id: "fastapi", name: "FastAPI", branch: "backend", proof: [
    { era: "autoflow", text: "the AutoFlow core API, from git init" },
    { era: "stack", text: "every backend since 2023" },
  ] },
  { id: "microservices", name: "Microservices", branch: "backend", proof: [
    { era: "ikarus", text: "auth, carts, orders, slicer: 7+ services, JWT between them" },
  ] },
  { id: "postgres", name: "SQL: Postgres, MySQL", branch: "backend", proof: [
    { era: "ikarus", text: "MySQL with Liquibase migrations, not hand edits" },
    { era: "autoflow", text: "PostgreSQL, the default store" },
    { era: "chukta", text: "Supabase Postgres: RLS, balance views, expense RPCs" },
  ] },
  { id: "redis", name: "Redis", branch: "backend", proof: [{ era: "stack", text: "locks, queues and rate limits" }] },
  { id: "go", name: "Go", branch: "backend", proof: [{ era: "oss", text: "waygate, a self-hosted tunnel" }] },

  // realtime & devices
  { id: "webrtc", name: "WebRTC", branch: "realtime", proof: [
    { era: "nativebridge", text: "cloud devices streamed in under 100 ms" },
    { era: "pcloudy", text: "streaming research for a 5,000+ device cloud" },
    { era: "oss", text: "ios-web-streamer" },
  ] },
  { id: "devices", name: "Android + iOS control", branch: "realtime", proof: [
    { era: "nativebridge", text: "touch, rotation, clipboard, file transfer on real devices" },
    { era: "oss", text: "iOS Bridge: simulators from any OS (75★)" },
    { era: "pcloudy", text: "mobile app testing solutions" },
  ] },
  { id: "tunnels", name: "Secure tunnels", branch: "realtime", proof: [
    { era: "nativebridge", text: "BridgeLink: remote Android over secure tunnels" },
    { era: "oss", text: "waygate: expose localhost on your own infra" },
  ] },
  { id: "video", name: "HLS / video", branch: "realtime", proof: [
    { era: "oss", text: "obscura: encrypted HLS segments from S3" },
  ] },

  // ai & agents
  { id: "tensorflow", name: "TensorFlow", branch: "ai", proof: [
    { era: "thapar", text: "SmartAgri, 96% crop recommendations; plant-disease detection" },
  ] },
  { id: "playwright", name: "Playwright", branch: "ai", proof: [
    { era: "autoflow", text: "a fleet of runners for autonomous UI testing" },
  ] },
  { id: "llm-agents", name: "LLM agents", branch: "ai", proof: [
    { era: "autoflow", text: "an agent that writes and runs UI tests" },
    { era: "senseloaf", text: "sourcing → matching → verification → prescreening → AI interviews" },
  ] },
  { id: "mcp", name: "MCP", branch: "ai", proof: [{ era: "senseloaf", text: "the MCP server behind SIA" }] },

  // infra
  { id: "docker", name: "Docker", branch: "infra", proof: [
    { era: "ikarus", text: "ECS, then Cloud Run: containers all the way down" },
  ] },
  { id: "cloudrun", name: "GCP Cloud Run", branch: "infra", proof: [
    { era: "ikarus", text: "slicer migration: −90% infra cost, −50% API latency" },
  ] },
  { id: "aws", name: "AWS", branch: "infra", proof: [
    { era: "ikarus", text: "ECS and EFS, before the move" },
    { era: "autoflow", text: "runner workers across AWS and GCP" },
  ] },
  { id: "cicd", name: "CI/CD", branch: "infra", proof: [{ era: "ikarus", text: "the company’s first pipelines" }] },

  // product & frontend
  { id: "typescript", name: "TypeScript", branch: "product", proof: [
    { era: "markdrop", text: "web app, VS Code extension, CLI" },
    { era: "senseloaf", text: "SIA’s chat interface" },
    { era: "chukta", text: "an Expo app and a pure-TS money package, Vitest" },
  ] },
  { id: "react", name: "React / Next.js", branch: "product", proof: [
    { era: "writing", text: "this site, its six games and the course reader (Next.js)" },
    { era: "chukta", text: "one React Native codebase for Android and the iPhone web app" },
  ] },
  { id: "ui", name: "UI design", branch: "product", proof: [
    { era: "senseloaf", text: "owns features from research to UI to infra" },
    { era: "markdrop", text: "designed and built solo" },
    { era: "chukta", text: "designed solo, phones first, light and dark" },
  ] },
  { id: "devtools", name: "Dev tools & CLIs", branch: "product", proof: [
    { era: "markdrop", text: "CLI on Homebrew and Scoop, a VS Code extension" },
    { era: "oss", text: "iOS Bridge desktop app" },
  ] },

  // leadership
  { id: "mentoring", name: "Mentoring", branch: "lead", proof: [{ era: "ikarus", text: "mentored 3 interns" }] },
  { id: "founding", name: "Founding engineer", branch: "lead", proof: [
    { era: "autoflow", text: "employee #1, Product of the Day" },
    { era: "nativebridge", text: "founding engineer, devices to open source" },
  ] },
  { id: "lead", name: "Eng lead", branch: "lead", proof: [{ era: "senseloaf", text: "leads engineering of the hiring platform" }] },
  { id: "writing", name: "Writing & teaching", branch: "lead", proof: [
    { era: "writing", text: "engineering case files at /stories" },
    { era: "writing", text: "a free System Design Mastery course at /learn" },
  ] },
];

export const SKILL_BY_ID = Object.fromEntries(SKILLS.map((s) => [s.id, s])) as Record<SkillId, Skill>;

export const PROOF_LABEL: Record<Proof["era"], string> = {
  thapar: "Thapar",
  ikarus: "Ikarus 3D",
  autoflow: "AutoFlow",
  nativebridge: "NativeBridge",
  pcloudy: "pCloudy",
  senseloaf: "Senseloaf AI",
  markdrop: "Markdrop",
  chukta: "Chukta",
  oss: "open source",
  writing: "this site",
  stack: "daily stack",
};

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function nowYm(): Ym {
  const d = new Date();
  return [d.getFullYear(), d.getMonth() + 1];
}

/** Months since Jan 2019 (index 0). */
export function mIndex([y, m]: Ym): number {
  return (y - 2019) * 12 + (m - 1);
}

export function ymLabel([y, m]: Ym): string {
  return `${MON[m - 1]} ${y}`;
}

/** Whole months between two points, inclusive of the start month. */
export function monthsBetween(a: Ym, b: Ym): number {
  return mIndex(b) - mIndex(a) + 1;
}

export function durationLabel(months: number): string {
  const y = Math.floor(months / 12);
  const m = months % 12;
  if (!y) return `${m} mo`;
  return m ? `${y}y ${m}mo` : `${y}y`;
}

/** Industry time since the first job (Jan 2023). */
export function shippingMonths(now: Ym = nowYm()): number {
  return monthsBetween([2023, 1], now);
}
