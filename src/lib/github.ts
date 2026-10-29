/**
 * GitHub API Service for fetching content from private system-design-mastery repo
 * Supports fetching directory listings and file contents
 */

import { contentSnapshot } from './content-snapshot';
import { questDifficulty } from '@/lib/learn/quest-difficulty';

const GITHUB_TOKEN = process.env.GITHUB_PERSONAL_ACCESS_TOKEN;
/** Cache tag on every GitHub content fetch (see /api/revalidate-courses). */
export const SDM_CONTENT_TAG = "sdm-content";
const REPO_OWNER = 'himanshkukreja';
const REPO_NAME = 'system-design-mastery';
// Content branch of the course repo (override e.g. to preview a content branch before merging).
// Course content branch. Preview deploys read the branch with the Mermaid diagrams until it is
// merged into the content repo's main (production keeps main). SDM_BRANCH always wins.
const PREVIEW_CONTENT_BRANCH = 'mermaid-diagrams';
const BRANCH = process.env.SDM_BRANCH || (process.env.VERCEL_ENV === 'preview' ? PREVIEW_CONTENT_BRANCH : 'main');
const BASE_PATH = 'resources';

/**
 * Local development fallback: point SDM_LOCAL_DIR at a checkout of the system-design-mastery
 * repo (e.g. SDM_LOCAL_DIR=../system-design-mastery) to read the course from disk instead of
 * the GitHub API. Unset in production, where content always comes from GitHub.
 */
const LOCAL_DIR = process.env.SDM_LOCAL_DIR;

async function readLocalContent(path: string): Promise<GitHubFile[]> {
  const fs = await import('fs/promises');
  const nodePath = await import('path');
  const full = nodePath.resolve(LOCAL_DIR as string, path);
  const stat = await fs.stat(full);
  const toFile = async (rel: string): Promise<GitHubFile> => {
    const st = await fs.stat(nodePath.resolve(LOCAL_DIR as string, rel));
    return { name: nodePath.basename(rel), path: rel, sha: '', size: st.size, type: st.isDirectory() ? 'dir' : 'file', download_url: null };
  };
  if (!stat.isDirectory()) return [await toFile(path)];
  const names = (await fs.readdir(full)).filter((n) => !n.startsWith('.'));
  return Promise.all(names.map((n) => toFile(`${path}/${n}`)));
}

export type GitHubFile = {
  name: string;
  path: string;
  sha: string;
  size: number;
  type: 'file' | 'dir';
  download_url: string | null;
};

export type Course = {
  id: string;
  title: string;
  description: string;
  repo: string;
  resourceCount: number;
  weeksCount: number;
};

export type LearningResource = {
  slug: string;
  title: string;
  course: string; // course ID
  week: string;
  day?: string;
  path: string;
  type: 'week-preview' | 'day-content' | 'capstone' | 'foundations' | 'overview' | 'bonus' | 'mcq' | 'problem' | 'lld';
  order: number;
};

/**
 * A failed content fetch, with its HTTP status. Loaders that cache their result must only treat a
 * 404 (the folder/file really isn't there) as "empty"; anything else (rate limit, 5xx, network) has
 * to throw, so a cache never stores an empty course and the last good copy keeps being served.
 */
export class ContentFetchError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "ContentFetchError";
  }
}

/** True when the content genuinely doesn't exist (GitHub 404, or a missing local file). */
export function isContentMissing(e: unknown): boolean {
  if (e instanceof ContentFetchError) return e.status === 404;
  const code = (e as { code?: string } | null)?.code;
  return code === "ENOENT" || code === "ENOTDIR";
}

/* ── the repo snapshot (lib/content-snapshot): one API call per instance instead of one per file ── */

const inSnapshot = (path: string) => path === BASE_PATH || path.startsWith(`${BASE_PATH}/`);

/** A directory listing from the snapshot; null = not served from it (fall back to the API). */
async function snapshotList(path: string): Promise<GitHubFile[] | null> {
  if (!inSnapshot(path)) return null;
  const s = await contentSnapshot(REPO_OWNER, REPO_NAME, BRANCH);
  if (!s) return null;
  const clean = path.replace(/\/+$/, '');
  const entry = (rel: string): GitHubFile => {
    const isDir = s.dirs.has(rel);
    return { name: rel.split('/').pop() as string, path: rel, sha: '', size: isDir ? 0 : s.files.get(rel)?.length ?? 0, type: isDir ? 'dir' : 'file', download_url: null };
  };
  const names = s.dirs.get(clean);
  if (names) return [...names].sort().map((n) => entry(`${clean}/${n}`));
  if (s.files.has(clean)) return [entry(clean)];
  throw new ContentFetchError(`Not found in content snapshot: ${clean}`, 404);
}

/** A file's text from the snapshot; null = not served from it (fall back to the API). */
async function snapshotRead(path: string): Promise<string | null> {
  if (!inSnapshot(path)) return null;
  const s = await contentSnapshot(REPO_OWNER, REPO_NAME, BRANCH);
  if (!s) return null;
  const b = s.files.get(path.replace(/^\/+/, ''));
  if (!b) throw new ContentFetchError(`Not found in content snapshot: ${path}`, 404);
  return b.toString('utf8');
}

/**
 * Fetch file or directory contents from GitHub
 */
export async function fetchGitHubContent(path: string): Promise<GitHubFile[]> {
  if (LOCAL_DIR) return readLocalContent(path);
  const fromSnap = await snapshotList(path);
  if (fromSnap) return fromSnap;
  const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}?ref=${BRANCH}`;

  const headers: Record<string, string> = {
    'Accept': 'application/vnd.github.v3+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  if (GITHUB_TOKEN) {
    headers['Authorization'] = `Bearer ${GITHUB_TOKEN}`;
  }

  const response = await fetch(url, {
    headers,
    // Cached for an hour (tag "sdm-content"); POST /api/revalidate-courses refreshes it at once
    next: { revalidate: 3600, tags: [SDM_CONTENT_TAG] }
  });

  if (!response.ok) {
    const errorText = await response.text();
    // Provide a clearer message for unauthenticated requests
    if (response.status === 401 || response.status === 403) {
      throw new ContentFetchError(`GitHub API authentication error (${response.status}). If your repository is private, set GITHUB_PERSONAL_ACCESS_TOKEN in the environment. ${errorText}`, response.status);
    }

    throw new ContentFetchError(`GitHub API error (${response.status}): ${errorText}`, response.status);
  }

  const data = await response.json();
  return Array.isArray(data) ? data : [data];
}

/**
 * Fetch raw markdown content from GitHub
 */
export async function fetchMarkdownContent(path: string): Promise<string> {
  if (LOCAL_DIR) {
    const fs = await import('fs/promises');
    const nodePath = await import('path');
    return fs.readFile(nodePath.resolve(LOCAL_DIR, path), 'utf8');
  }
  const fromSnap = await snapshotRead(path);
  if (fromSnap != null) return fromSnap;
  const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}?ref=${BRANCH}`;

  const headers: Record<string, string> = {
    'Accept': 'application/vnd.github.v3.raw',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  if (GITHUB_TOKEN) {
    headers['Authorization'] = `Bearer ${GITHUB_TOKEN}`;
  }

  const response = await fetch(url, {
    headers,
    // Cached for an hour (tag "sdm-content"); POST /api/revalidate-courses refreshes it at once
    next: { revalidate: 3600, tags: [SDM_CONTENT_TAG] }
  });

  if (!response.ok) {
    const errorText = await response.text();
    if (response.status === 401 || response.status === 403) {
      throw new ContentFetchError(`GitHub API authentication error (${response.status}) when fetching markdown. If private, set GITHUB_PERSONAL_ACCESS_TOKEN. ${errorText}`, response.status);
    }
    throw new ContentFetchError(`Failed to fetch markdown (${response.status}): ${errorText}`, response.status);
  }

  return response.text();
}

/**
 * Get all available courses
 */
export async function getAllCourses(): Promise<Course[]> {
  // For now, we have one course - System Design Mastery
  // In the future, this could fetch from multiple repos or a config file
  const resources = await getAllLearningResources();
  const weeks = await getAllWeeks();

  return [
    {
      id: 'system-design-mastery',
      title: 'System Design Mastery',
      description: '11-week intensive learning path for backend engineers moving from intermediate to advanced',
      repo: 'system-design-mastery',
      resourceCount: resources.length,
      weeksCount: weeks.length,
    },
  ];
}

/**
 * Get all weeks from the resources directory
 */
export async function getAllWeeks(): Promise<string[]> {
  const contents = await fetchGitHubContent(BASE_PATH);

  return contents
    .filter(item => item.type === 'dir' && item.name.startsWith('week-'))
    .map(item => item.name)
    .sort();
}

/**
 * Get all learning resources organized by week
 */
export async function getAllLearningResources(): Promise<LearningResource[]> {
  const weeks = await getAllWeeks();
  const resources: LearningResource[] = [];

  // Add the main learning plan
  try {
    const planExists = await fetchGitHubContent(`${BASE_PATH}/system-design-learning-plan.md`);
    if (planExists.length > 0) {
      resources.push({
        slug: 'plan',
        title: 'System Design Mastery: 11-Week Plan',
        course: 'system-design-mastery',
        week: 'overview',
        path: `${BASE_PATH}/system-design-learning-plan.md`,
        type: 'overview',
        order: 0,
      });
    }
  } catch {
    // File doesn't exist, skip
  }

  // Process each week
  for (const week of weeks) {
    const weekFiles = await fetchGitHubContent(`${BASE_PATH}/${week}`);

    for (const file of weekFiles) {
      // a week's internal planning notes (README.md, WEEK-PLAN.md) are not lessons
      if (file.type === 'file' && file.name.endsWith('.md') && !/^(readme|week-plan)/i.test(file.name)) {
        const resource = parseFileToResource(file, week);
        if (resource) {
          resources.push(resource);
        }
      }
    }
  }

  // Process bonus problems from resources/bonus-problems directory
  try {
    const bonusProblemsPath = `${BASE_PATH}/bonus-problems`;
    const bonusFiles = await fetchGitHubContent(bonusProblemsPath);

    for (const file of bonusFiles) {
      if (file.type === 'file' && file.name.endsWith('.md')) {
        const resource = parseFileToResource(file, 'bonus-problems');
        if (resource) {
          resources.push(resource);
        }
      }
    }
  } catch (error) {
    console.log('[GitHub] No bonus problems found or error fetching:', error);
  }

  // Extra collections, like the side quests: the interview problem bank and the low-level design
  // (machine coding) track. A missing folder just means the collection is empty.
  for (const folder of EXTRA_COLLECTIONS) {
    try {
      const files = await fetchGitHubContent(`${BASE_PATH}/${folder}`);
      for (const file of files) {
        if (file.type === 'file' && file.name.endsWith('.md') && !/^readme/i.test(file.name)) {
          const resource = parseFileToResource(file, folder);
          if (resource) resources.push(resource);
        }
      }
    } catch (error) {
      if (error instanceof ContentFetchError && !isContentMissing(error)) throw error;
    }
  }

  // side quests run easiest first (Previous / Next follow it); everything else by its order and path
  const rank = (r: LearningResource) => (r.type === 'bonus' ? questDifficulty(r.slug).rank : 0);
  return resources.sort((a, b) => a.order - b.order || rank(a) - rank(b) || a.path.localeCompare(b.path));
}

/** Content folders outside the weeks: folder → resource type (files are "<prefix>-NN-<slug>.md"). */
export const EXTRA_COLLECTIONS = ['problem-bank', 'low-level-design'] as const;

/**
 * Real lesson titles, taken from each markdown file's first H1 (minus the "Week N — Day N:" /
 * "Bonus Problem N:" prefix). Listing every week would otherwise need ~90 extra fetches just
 * for titles, and slug-derived titles carry the repo's typos ("Multi Tanency", "Url Shortner").
 * Unknown slugs fall back to the H1 (lesson page) or a cleaned-up slug (listings).
 */
const LESSON_TITLES: Record<string, string> = {
  // Bonus problems
  'bonus-01-indian-upi-system': "India's UPI",
  'bonus-02-whatsapp-messaging': 'WhatsApp Messaging',
  'bonus-03-aadhar-identity-system': 'Aadhaar (UIDAI)',
  'bonus-04-visa-mastercard-payments': 'Visa/Mastercard Global Payment Network',
  'bonus-05-google-search': 'Google Search',
  'bonus-06-netflix-streaming': 'Netflix Streaming',
  'bonus-07-spotify-streaming': 'Spotify',
  'bonus-08-AWS-S3': 'AWS S3',
  'bonus-09-uber': 'Uber',
  'bonus-10-twitter-x': 'Twitter/X',
  'bonus-11-irctc-booking-system': 'IRCTC Tatkal Ticket Booking System',
  'bonus-12-blinkit-quick-commerce': 'Blinkit Quick Commerce',
  'bonus-13-zerodha-kite-trading': 'Zerodha Kite Trading Platform',
  'bonus-14-chatgpt-llm-serving': 'ChatGPT LLM Serving',
  'bonus-15-figma-multiplayer': 'Figma Multiplayer Editing',
  'bonus-16-bookmyshow-seat-booking': 'BookMyShow Seat Booking',
  'bonus-17-swiggy-food-delivery': 'Swiggy Food Delivery',
  'bonus-18-razorpay-payment-gateway': 'Razorpay Payment Gateway',
  'bonus-19-youtube-video-platform': 'YouTube Video Platform',
  'bonus-20-google-docs-collaboration': 'Google Docs Collaboration',
  'bonus-21-instagram-feed': 'Instagram Feed and Stories',
  'bonus-22-google-maps': 'Google Maps Routing, Traffic and Tiles',
  'bonus-23-zoom-video-meetings': 'Zoom Video Meetings at Scale',
  'bonus-24-airbnb-stays-marketplace': 'Airbnb Stays Marketplace',
  'bonus-25-dream11-fantasy-sports': 'Dream11 Fantasy Sports',
  'bonus-26-truecaller-caller-id': 'Truecaller Caller ID and Spam Detection',
  'bonus-27-flipkart-big-billion-days': 'Flipkart Big Billion Days',
  'bonus-28-gmail-email-at-scale': 'Gmail',
  'bonus-29-github-code-hosting': 'GitHub',
  'bonus-30-tiktok-for-you-feed': "TikTok's For You Feed",
  'bonus-31-discord-voice-and-servers': 'Discord',
  'bonus-32-ondc-open-commerce': 'ONDC',
  'bonus-33-nse-stock-exchange': 'NSE Stock Exchange',
  'bonus-34-amazon-prime-day-checkout': 'Amazon Prime Day Checkout',
  'bonus-35-fastag-electronic-tolling': 'FASTag Electronic Tolling',
  'bonus-36-slack-workspace-messaging': 'Slack',
  // Week 0
  'foundations-part-1-basic-concepts': 'Part 1: System Design Fundamentals',
  'foundations-part-2-infrastructure-building-blocks': 'Part 2: Infrastructure Building Blocks',
  'foundations-part-3-back-of-the-envelope-estimation': 'Part 3: Back-of-the-Envelope Estimation',
  'foundations-part-4-networking': 'Part 4: Networking Fundamentals for System Design',
  'foundations-part-5-operating-systems': 'Part 5: Operating System Concepts for System Design',
  'foundations-part-6-terminology-and-theory': 'Part 6: System Design Terminology & Theory',
  'foundations-part-7-api-design': 'Part 7: API Design for System Design',
  'foundations-part-8-databases-in-depth': 'Part 8: Databases in Depth',
  'week-00-mcq-assessment': 'Week 0 Foundations - MCQ Assessment',
  // Week 1
  'day-01-partitioning-deep-dive': 'Partitioning Deep-Dive',
  'day-02-replication-tradeoffs': 'Replication Trade-offs',
  'day-03-rate-limiting-at-scale': 'Rate Limiting at Scale',
  'day-04-hot-keys-and-skew': 'Hot Keys and Skew',
  'day-05-session-store-design': 'Session Store Design',
  'capstone-interview-week-1-url-shortner-at-scale': 'Design a URL Shortener at Scale',
  'week-01-mcq-assessment': 'Week 1 Data at Scale - MCQ Assessment',
  // Week 2
  'day-01-timeout-hell': 'Timeout Hell',
  'day-02-idempotency-in-practice': 'Idempotency in Practice',
  'day-03-circuit-breakers': 'Circuit Breakers',
  'day-04-webhook-delivery': 'Webhook Delivery System',
  'day-05-distributed-cron': 'Distributed Cron & Job Scheduling',
  'capstone-interview-week-2-flash-sale-for-megamart': 'The Ultimate System Design Interview',
  'week-02-mcq-assessment': 'Week 2 Failure-First Design - MCQ Assessment',
  // Week 3
  'day-01-queue-vs-stream': 'Queue vs Stream',
  'day-02-transactional-outbox': 'Transactional Outbox',
  'day-03-backpressure-and-flow-control': 'Backpressure and Flow Control',
  'day-04-dead-letters-and-poison-pills': 'Dead Letters and Poison Pills',
  'day-05-audit-log-system': 'Audit Log System',
  'capstone-interview-week-3-event-driven-order-system': 'Event-Driven Food Delivery Order System',
  'week-03-mcq-assessment': 'Week 3 Messaging and Async Processing - MCQ Assessment',
  // Week 4
  'day-01-caching-patterns': 'Caching Patterns',
  'day-02-cache-invalidation': 'Invalidation Strategies',
  'day-03-thundering-herd': 'Thundering Herd',
  'day-04-feed-caching': 'Feed Caching',
  'day-05-multi-tier-caching': 'Multi-Tier Caching',
  'capstone-interview-week-4-ecommerce-product-catalog': 'Design a Global E-Commerce Product Catalog System',
  'week-04-mcq-assessment': 'Week 4 Caching - MCQ Assessment',
  // Week 5
  'day-01-consistency-models': 'Consistency Models',
  'day-02-saga-pattern': 'Distributed Transactions — The Saga Pattern',
  'day-03-saga-orchestration': 'Saga Orchestration Deep Dive',
  'day-04-conflict-resolution': 'Conflict Resolution',
  'day-05-leader-election': 'Leader Election and Coordination',
  'capstone-interview-week-5-multiplayer-game-matchmaking-system': 'Multiplayer Game Matchmaking System',
  'week-05-mcq-assessment': 'Week 5 Consistency and Coordination - MCQ Assessment',
  // Week 6
  'day-01-notification-platform-design': 'Designing a Real-Time Notification Platform',
  'day-02-core-notification-flow': 'The Delivery Pipeline: Guarantees, Priorities and Preferences',
  'day-03-advanced-features': 'Real-Time Channels: WebSockets and SSE at Scale',
  'day-04-scale-reliability-edge-cases': 'Presence and Chat Fan-Out at Scale',
  'day-05-operations-monitoring-interview': 'Operations, Scale and Edge Cases',
  'capstone-interview-week-6-food-delivery-system': 'Food Delivery Order System',
  'week-06-mcq-assessment': 'Week 6 Real-Time Delivery: Designing a Notification Platform - MCQ Assessment',
  // Week 7
  'day-01-search-fundamentals': 'Search Fundamentals & Architecture',
  'day-02-indexing-pipeline': 'Indexing Pipeline',
  'day-03-query-processing-relevance': 'Query Processing & Relevance',
  'day-04-advanced-search-features': 'Typeahead at Scale: Autocomplete, Spelling and Facets',
  'day-05-search-operations-scale': 'Location Search and Search at Scale',
  'capstone-interview-week-7-legal-document-search': 'Designing a Legal Document Search System',
  'week-07-mcq-assessment': 'Week 7 Designing a Search System - MCQ Assessment',
  // Week 8
  'day-01-event-ingestion': 'Event Ingestion at Scale',
  'day-02-streaming-vs-batch': 'Streaming vs Batch Processing',
  'day-03-data-modeling': 'Data Modeling for Analytics',
  'day-04-late-data': 'Late-Arriving Data and Correctness',
  'day-05-query-optimization': 'Query Layer and Optimization',
  'day-06-counting-at-scale': 'Counting at Scale: Bloom Filters, HyperLogLog, Count-Min Sketch and Top-K',
  'capstone-interview-week-8-streaming-analytics': 'Real-Time Analytics for Video Streaming Platform',
  'week-08-mcq-assessment': 'Week 8 Designing an Analytics Pipeline - MCQ Assessment',
  // Week 9
  'day-01-tenant-isolation': 'Tenant Isolation Strategies',
  'day-02-noisy-neighbour': 'Noisy Neighbor Prevention',
  'day-03-data-residency': 'Data Residency and GDPR',
  'day-04-right-to-deletion': 'Right to Deletion',
  'day-05-security-architecture': 'Security Architecture',
  'capstone-interview-week-9-multi-tenant-saas': 'Design a Multi-Tenant Enterprise SaaS Platform',
  'week-09-mcq-assessment': 'Week 9 Multi-Tenancy and Security - MCQ Assessment',
  // Week 10
  'day-01-slis-slos-slas': 'SLIs, SLOs and SLAs',
  'day-02-observability': 'Observability',
  'day-03-deployment-strategies': 'Deployment Strategies',
  'day-04-capacity-planning': 'Capacity Planning',
  'day-05-incident-management': 'Incident Management',
  'capstone-interview-week-10-the-grand-finale': 'The Grand Finale',
  'week-10-mcq-assessment': 'Week 10 Production Readiness and Operational Excellence - MCQ Assessment',
  // Week 11
  'day-01-llm-serving': 'LLM Serving: Tokens, Latency and Cost',
  'day-02-embeddings-and-vector-search': 'Embeddings and Vector Search',
  'day-03-rag-systems': 'RAG Systems',
  'day-04-evaluation-and-guardrails': 'Evaluation and Guardrails',
  'day-05-cost-caching-and-operations': 'Cost, Caching and Operations',
  'capstone-interview-week-11-ai-support-assistant': 'Design an AI Customer-Support Assistant',
  'week-11-mcq-assessment': 'Week 11 Designing AI Systems - MCQ Assessment',
};

/** Week folder topic names, with the folder typos corrected. */
const WEEK_TOPICS: Record<string, string> = {
  'week-00-foundations': 'Foundations',
  'week-01-data-at-scale': 'Data at Scale',
  'week-02-failure-first-design': 'Failure-First Design',
  'week-03-messaging-and-async-processing': 'Messaging and Async Processing',
  'week-04-caching': 'Caching',
  'week-05-consistency-and-coordination': 'Consistency and Coordination',
  'week-06-designing-notification-platform': 'Real-Time Delivery',
  'week-07-designing-search-system': 'Designing a Search System',
  'week-08-designing-analytics-pipeline': 'Designing an Analytics Pipeline',
  'week-09-multi-tanency-security': 'Multi-tenancy and Security',
  'week-10-production-readiness-and-operational-excellence': 'Production Readiness and Operational Excellence',
  'week-11-designing-ai-systems': 'Designing AI Systems',
};

// Word-level fixes for slugs not in LESSON_TITLES (typos and acronyms).
const WORD_FIXES: Record<string, string> = {
  tanency: 'tenancy', shortner: 'Shortener', aadhar: 'Aadhaar', url: 'URL', upi: 'UPI', irctc: 'IRCTC',
  aws: 'AWS', s3: 'S3', api: 'API', slis: 'SLIs', slos: 'SLOs', slas: 'SLAs', sli: 'SLI', slo: 'SLO', sla: 'SLA',
  gdpr: 'GDPR', saas: 'SaaS', cdn: 'CDN', dns: 'DNS', http: 'HTTP', sql: 'SQL', nosql: 'NoSQL', vs: 'vs',
};
const SMALL_WORDS = new Set(['a', 'an', 'and', 'at', 'for', 'in', 'of', 'on', 'or', 'the', 'to', 'vs']);

function humanizeSlug(slugPart: string): string {
  return slugPart
    .split('-')
    .filter(Boolean)
    .map((word, i) => {
      const lower = word.toLowerCase();
      if (WORD_FIXES[lower]) return i === 0 ? WORD_FIXES[lower].charAt(0).toUpperCase() + WORD_FIXES[lower].slice(1) : WORD_FIXES[lower];
      if (i > 0 && SMALL_WORDS.has(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ')
    .replace(/\bMulti tenancy\b/i, 'Multi-tenancy');
}

/** Human-readable topic for a week folder, e.g. "week-09-multi-tanency-security" -> "Multi-tenancy and Security". */
export function formatWeekTopic(week: string): string {
  if (WEEK_TOPICS[week]) return WEEK_TOPICS[week];
  if (week === 'overview') return 'Overview';
  if (week === 'bonus-problems') return 'Bonus Problems';
  if (week === 'problem-bank') return 'Interview Problems';
  if (week === 'low-level-design') return 'Low-Level Design';
  const match = week.match(/week-(\d+)-(.+)/);
  return match ? humanizeSlug(match[2]) : week.replace('week-', 'Week ');
}

/**
 * Title from a markdown file's first H1, minus the course prefix:
 * "# Week 1 — Day 1: Partitioning Deep-Dive" -> "Partitioning Deep-Dive".
 */
export function titleFromMarkdown(content: string): string | null {
  const h1 = content.match(/^#\s+(.+)$/m)?.[1]?.trim();
  if (!h1) return null;
  const cleaned = h1
    .replace(/^Weeks?\s+\d+\s*[—-]\s*(?=Part\s+\d+:)/i, '')
    .replace(/^(?:Weeks?\s+[\d-]+(?:\s*[—-]\s*)?\s*(?:Day\s+\d+|Capstone|Preview)?|Bonus Problem\s+\d+):\s*/i, '')
    .trim();
  return cleaned || h1;
}

/**
 * Parse GitHub file metadata to LearningResource
 */
function parseFileToResource(file: GitHubFile, week: string): LearningResource | null {
  const fileName = file.name.replace('.md', '');

  // Determine type based on filename pattern
  let type: LearningResource['type'] = 'day-content';
  let title = fileName;
  let day: string | undefined;
  let order = 1000; // Default order
  const weekOrder = getWeekOrder(week);

  // Within a week: preview (+0) -> days (+1..+n) -> capstone (+90) -> MCQ (+95).
  // Every value stays below the next week's preview ((week + 1) * 100).
  if (week === 'problem-bank' || week === 'low-level-design') {
    type = week === 'problem-bank' ? 'problem' : 'lld';
    title = extractTitle(fileName);
    const n = fileName.match(/^[a-z]+-(\d+)/)?.[1];
    order = (week === 'problem-bank' ? 20000 : 30000) + parseInt(n || '1', 10);
  } else if (week === 'bonus-problems') {
    type = 'bonus';
    title = extractTitle(fileName);
    const bonusNum = fileName.match(/bonus-(\d+)/)?.[1];
    order = 10000 + parseInt(bonusNum || '1', 10); // Place after all weeks
  } else if (fileName.includes('preview')) {
    type = 'week-preview';
    title = `${formatWeekTopic(week)} Preview`;
    order = weekOrder * 100;
  } else if (fileName.includes('capstone')) {
    type = 'capstone';
    title = extractTitle(fileName);
    order = weekOrder * 100 + 90;
  } else if (fileName.includes('foundations')) {
    type = 'foundations';
    title = extractTitle(fileName);
    const partNum = fileName.match(/part-(\d+)/)?.[1];
    order = weekOrder * 100 + parseInt(partNum || '1', 10);
  } else if (fileName.includes('mcq')) {
    // MCQ Assessment - placeholder unless the title map knows it; getWeekResources fills it in
    type = 'mcq';
    title = LESSON_TITLES[fileName] || 'MCQ Assessment';
    order = weekOrder * 100 + 95;
  } else if (fileName.startsWith('day-')) {
    type = 'day-content';
    const dayMatch = fileName.match(/day-(\d+)/);
    if (dayMatch) {
      day = `day-${dayMatch[1]}`;
      order = weekOrder * 100 + parseInt(dayMatch[1], 10);
    }
    title = extractTitle(fileName);
  }

  return {
    slug: fileName,
    title,
    course: 'system-design-mastery',
    week: week,
    day,
    path: file.path,
    type,
    order,
  };
}

/**
 * Extract human-readable title from filename
 */
function extractTitle(fileName: string): string {
  if (LESSON_TITLES[fileName]) return LESSON_TITLES[fileName];
  // Remove day-XX- / week-XX- / capstone-interview-week-N- / foundations- / bonus-XX- prefixes
  const rest = fileName.replace(/^(day-\d+-|week-\d+-|capstone-(?:interview-)?(?:week-\d+-)?|foundations-|bonus-\d+-|problem-\d+-|lld-\d+-)/, '');
  return humanizeSlug(rest);
}

/**
 * Get numeric order for week (week-00 = 0, week-01 = 1, etc.)
 */
function getWeekOrder(week: string): number {
  const match = week.match(/week-(\d+)/);
  return match ? parseInt(match[1]) : 999;
}

/**
 * Get a specific learning resource by week and slug
 */
export async function getLearningResource(week: string, slug: string): Promise<{ resource: LearningResource; content: string } | null> {
  try {
    const allResources = await getAllLearningResources();
    const resource = allResources.find(r => r.week === week && r.slug === slug);

    if (!resource) {
      return null;
    }

    const content = await fetchMarkdownContent(resource.path);

    // Lessons the title map doesn't know yet take their title from the file's own H1
    // (also replaces the generic "MCQ Assessment" placeholder).
    if (!LESSON_TITLES[slug] && resource.type !== 'week-preview' && resource.week !== 'overview') {
      const h1Title = titleFromMarkdown(content);
      if (h1Title) {
        return { resource: { ...resource, title: h1Title }, content };
      }
    }

    return {
      resource,
      content,
    };
  } catch (error) {
    console.error(`Error fetching resource ${week}/${slug}:`, error);
    return null;
  }
}

/**
 * Get resources for a specific week
 */
export async function getWeekResources(week: string): Promise<LearningResource[]> {
  const allResources = await getAllLearningResources();
  const weekResources = allResources.filter(r => r.week === week);
  
  // For MCQ resources, fetch content to get the real title
  const resourcesWithTitles = await Promise.all(
    weekResources.map(async (resource) => {
      if (resource.slug.includes('mcq') && resource.title === 'MCQ Assessment') {
        try {
          const content = await fetchMarkdownContent(resource.path);
          const h1Title = content.match(/^#\s+(.+)/m)?.[1]?.trim();
          if (h1Title) {
            return { ...resource, title: h1Title };
          }
        } catch (error) {
          console.error(`Error fetching MCQ title for ${resource.slug}:`, error);
        }
      }
      return resource;
    })
  );
  
  return resourcesWithTitles;
}
