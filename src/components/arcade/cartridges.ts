export type CartridgeId = "sia" | "markdrop" | "ios-bridge" | "bridgelink" | "waygate" | "obscura" | "codeflow";

export type Cartridge = {
  id: CartridgeId;
  code: string;
  rarity: string;
  name: string;
  /** Short name for the compact mobile shelf. */
  short: string;
  /** Extra tag shown on the compact mobile shelf (e.g. star count). */
  shelfTag?: string;
  genre: string;
  stars: string;
  objective: string;
  role: string;
  pitch: string;
  url: string;
  cta: string;
  points: string[];
  stack: string[];
};

export const CARTRIDGES: Cartridge[] = [
  {
    id: "sia",
    code: "CART-01",
    rarity: "MAIN QUEST",
    name: "SIA · Senseloaf",
    short: "SIA",
    genre: "Agentic hiring · work",
    stars: "live",
    objective: "Hire someone from one chat",
    role: "Senior SWE, eng lead · end to end",
    pitch: "A recruiter describes the role. SIA runs the pipeline.",
    url: "https://senseloaf.ai",
    cta: "senseloaf.ai →",
    points: [
      "Senseloaf’s agents cover sourcing, resume-to-job matching, profile verification, prescreening and AI interviews.",
      "SIA (Senseloaf Intelligent Agent) puts all of it behind one chat; we are also building its MCP server.",
      "My part: product research, UI design, frontend, backend, and scaling the infra behind it.",
    ],
    stack: ["LLM agents", "MCP", "Python", "TypeScript", "React", "[STACK]"],
  },
  {
    id: "markdrop",
    code: "CART-02",
    rarity: "FOUNDER",
    name: "Markdrop",
    short: "Markdrop",
    genre: "Docs → links · my venture",
    stars: "★ 5",
    objective: "Publish a doc, get a link",
    role: "Founder · solo",
    pitch: "Docs and files as links that render.",
    url: "https://markdrop.in",
    cta: "markdrop.in →",
    points: [
      "Paste markdown or AI write-ups and get a link with no account.",
      "Upload HTML, PDFs, sheets, Word docs, video and zipped sites; all open rendered in any browser.",
      "Web app, VS Code extension, CLI on Homebrew and Scoop.",
    ],
    stack: ["TypeScript", "Next.js", "VS Code API", "CLI"],
  },
  {
    id: "ios-bridge",
    code: "CART-03",
    rarity: "LEGENDARY",
    name: "iOS Bridge",
    short: "iOS Bridge",
    shelfTag: "★75",
    genre: "Simulator streaming · OSS",
    stars: "★ 75",
    objective: "Tap a Mac simulator from Windows",
    role: "Creator · open source",
    pitch: "iOS simulators, from any OS.",
    url: "https://github.com/himanshkukreja/ios-bridge",
    cta: "github →",
    points: [
      "Stream and control iOS simulators with full touch from Windows, Linux or another Mac.",
      "App management and recording in a cross-platform desktop app.",
      "75 stars and 10 forks; written up as CASE-008.",
    ],
    stack: ["Python", "WebRTC", "FastAPI", "Electron"],
  },
  {
    id: "bridgelink",
    code: "CART-04",
    rarity: "RARE",
    name: "BridgeLink",
    short: "BridgeLink",
    genre: "Remote Android · OSS",
    stars: "★ 6",
    objective: "Use an office phone from home",
    role: "Creator · built at NativeBridge",
    pitch: "A phone on your desk, usable from anywhere.",
    url: "https://github.com/himanshkukreja/bridgelink",
    cta: "github →",
    points: [
      "Connect Android devices over USB or Wi-Fi and expose them through secure tunnels.",
      "Remote developers run adb as if the phone were plugged into their laptop.",
      "Written up as CASE-009.",
    ],
    stack: ["Python", "ADB", "Tunnels", "NativeBridge"],
  },
  {
    id: "waygate",
    code: "CART-05",
    rarity: "RARE",
    name: "Waygate",
    short: "Waygate",
    genre: "Self-hosted tunnel · OSS",
    stars: "★ 4",
    objective: "Expose localhost:3000",
    role: "Creator · open source",
    pitch: "ngrok-style tunnels through infrastructure you own.",
    url: "https://github.com/himanshkukreja/waygate",
    cta: "github →",
    points: ["Securely expose local services through a server you control.", "No third-party relay sees your traffic."],
    stack: ["Go", "TLS", "Reverse proxy"],
  },
  {
    id: "obscura",
    code: "CART-06",
    rarity: "RARE",
    name: "Obscura",
    short: "Obscura",
    genre: "Private video · OSS",
    stars: "★ 3",
    objective: "Stream it, never leak it",
    role: "Creator · open source",
    pitch: "Private video delivery without handing out the file.",
    url: "https://github.com/himanshkukreja/obscura",
    cta: "github →",
    points: [
      "Self-hostable HLS streaming from S3-compatible storage.",
      "Encrypted segments: viewers stream, nobody downloads the original.",
    ],
    stack: ["TypeScript", "ffmpeg", "HLS", "S3"],
  },
  {
    id: "codeflow",
    code: "CART-07",
    rarity: "COMMON",
    name: "codeflow-analyzer",
    short: "codeflow",
    genre: "Static analysis CLI · npm",
    stars: "npm",
    objective: "Read a codebase without running it",
    role: "Creator · published on npm",
    pitch: "Behavior reports for React and Next.js apps, statically.",
    url: "https://www.npmjs.com/package/codeflow-analyzer",
    cta: "npm →",
    points: ["Statically analyzes a React or Next.js codebase and generates behavior reports.", "Never executes the app."],
    stack: ["Node.js", "AST", "React", "Next.js"],
  },
];

export const questId = (id: CartridgeId) => `arcade:${id}`;
