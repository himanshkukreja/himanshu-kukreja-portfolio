/**
 * Low-level design (LLD) metadata the site keeps itself, because the lessons carry none: a short
 * name, difficulty, round length and the patterns each case study uses, plus the pattern catalogue.
 * Pure data, no imports, so node --test runs it (scripts/tests/lld.test.mjs).
 *
 * WHY HERE AND NOT IN THE LESSONS' FRONT MATTER: the content repo's main syncs to the live site on
 * push and the renderer does not strip front matter, so a header on a lesson would print as text.
 * When the owner approves metadata in the content repo, this file stays as the fallback: the loader
 * (src/lib/learn/lld/load.ts) prefers anything the content supplies and falls back to this.
 *
 * What is NOT stored here, because it comes from the content and would drift:
 *   - the lesson's full title (its H1) and the class diagram, from the lesson file
 *   - companies: the prep data (resources/interview-prep/companies/*.md) already says which companies
 *     were reported to ask each lesson, with sources; the home reads those, never a list kept here
 *   - progress: the learner's own, read in the browser
 *
 * To add a case study: add its row to CASES (the slug is the lesson's file name without .md).
 * Pattern slugs must exist in PATTERNS (the plan's 28 lessons, docs/design-patterns/design-patterns-plan.md section 2) (scripts/tests/lld.test.mjs checks both ways).
 */

export type Difficulty = "Medium" | "Hard" | "Expert";
export const DIFFICULTIES: Difficulty[] = ["Medium", "Hard", "Expert"];

export type CaseMeta = {
  /** the lesson's file name without .md */
  slug: string;
  n: number;
  /** the problem's own name, properly capitalised: "LRU Cache", not "Lru Cache" */
  name: string;
  difficulty: Difficulty;
  /** how long the round runs (machine-coding rounds are 60 to 90 minutes) */
  roundMinutes: number;
  /** what you build, in one line */
  blurb: string;
  /** pattern slugs (PATTERNS) the lesson applies */
  patterns: string[];
  /** code labs (resources/labs ids) that practise the same thing: the code step links them */
  labs: string[];
  /** languages the lesson's code is written in */
  langs: ("python" | "java" | "cpp" | "javascript")[];
};

const c = (n: number, slug: string, name: string, difficulty: Difficulty, roundMinutes: number, blurb: string, patterns: string[], labs: string[] = []): CaseMeta => ({
  slug: `lld-${String(n).padStart(2, "0")}-${slug}`,
  n,
  name,
  difficulty,
  roundMinutes,
  blurb,
  patterns,
  labs,
  langs: ["python"],
});

export const CASES: CaseMeta[] = [
  c(1, "parking-lot", "Parking Lot", "Medium", 90, "Floors, spots, tickets and fees, with two gates that can never give one spot to two cars.", ["strategy", "solid-isp-dip-and-di", "factory-method-and-abstract-factory", "singleton", "observer", "decorator"], ["parking-lot"]),
  c(2, "lru-cache", "LRU Cache", "Medium", 60, "A bounded cache with O(1) get and put and an eviction rule you can swap.", ["strategy", "oop-and-composition", "observer"], ["lru-cache", "lfu-cache"]),
  c(3, "rate-limiter", "Rate Limiter", "Hard", 75, "Three limiting algorithms behind one interface, built from rules and kept per key.", ["strategy", "factory-method-and-abstract-factory", "solid-isp-dip-and-di"], ["token-bucket", "sliding-window-counter"]),
  c(4, "elevator-system", "Elevator System", "Hard", 90, "Several cars, hall calls and car calls, with a schedule per car and a dispatcher.", ["strategy", "state", "observer", "command"], ["elevator-system"]),
  c(5, "movie-ticket-booking", "Movie Ticket Booking", "Hard", 90, "Seat holds, confirmation and expiry, with two buyers racing for the same seats.", ["strategy", "adapter", "state", "facade", "concurrency-patterns"], ["movie-ticket-booking"]),
  c(6, "splitwise", "Splitwise", "Hard", 90, "Expenses split three ways, net balances, and the fewest payments to settle up.", ["strategy", "facade", "oop-and-composition"], ["splitwise"]),
  c(7, "vending-machine", "Vending Machine", "Medium", 60, "A coin-operated machine as four states, each answering every button.", ["state", "strategy", "observer"], ["vending-machine"]),
  c(8, "pub-sub-logger", "Logging Framework", "Hard", 90, "Formatters, sinks and filters wired as a chain, a pub-sub bus and strategies.", ["chain-of-responsibility", "observer", "strategy", "decorator", "singleton", "concurrency-patterns"], ["pub-sub-logger"]),
  c(9, "snake-and-ladder", "Snake and Ladder", "Medium", 60, "A board game with pluggable dice and end-of-board rules, and a turn that survives a double tap.", ["strategy", "observer", "solid-isp-dip-and-di", "oop-and-composition"], ["snake-and-ladder"]),
  c(10, "chess", "Chess", "Hard", 90, "Pieces that know geometry and a game that decides what is legal, with undo.", ["oop-and-composition", "command", "iterator", "concurrency-patterns"], ["chess"]),
  c(11, "atm", "ATM", "Medium", 75, "A card, a PIN and a cash dispenser as states, with every failure after the debit reversed.", ["state", "adapter", "solid-isp-dip-and-di", "observer"], ["atm"]),
  c(12, "library-management", "Library Management", "Medium", 75, "Titles and copies, loans, reservations, fines and reminders over a month.", ["strategy", "observer", "state", "facade"], ["library-management"]),
  c(13, "hotel-reservation", "Hotel Reservation", "Hard", 90, "Room inventory over date ranges, holds, stacked pricing and cancellation.", ["strategy", "state", "oop-and-composition"], ["hotel-reservation"]),
  c(14, "ride-sharing", "Ride Sharing", "Hard", 90, "Riders, drivers on a grid, matching and fares, and a trip with a life cycle.", ["strategy", "decorator", "state", "facade", "concurrency-patterns"], ["ride-sharing-round"]),
  c(15, "food-delivery", "Food Delivery", "Hard", 90, "Carts, orders with a state machine, payments, partners and refunds.", ["state", "strategy", "adapter", "facade"], ["food-delivery-orders"]),
  c(16, "meeting-room-scheduler", "Meeting Room Scheduler", "Hard", 75, "Room calendars with conflict detection, recurring meetings and invites.", ["strategy", "observer", "oop-and-composition"], ["meeting-room-scheduler"]),
  c(17, "in-memory-file-system", "In-Memory File System", "Hard", 75, "Files and directories as one tree, path resolution, and a thread-safe log.", ["composite", "facade", "iterator", "visitor"], ["in-memory-file-system"]),
  c(18, "text-editor-undo-redo", "Text Editor with Undo and Redo", "Hard", 75, "A document, a cursor and an undo history, compared with snapshots.", ["command", "composite", "mediator-and-memento", "concurrency-patterns"], ["text-editor-undo-redo"]),
  c(19, "online-auction", "Online Auction", "Hard", 90, "Timed auctions with validated bids, a soft close and bidders who hear about it.", ["state", "observer", "strategy"], ["online-auction"]),
  c(20, "stock-exchange-order-book", "Stock Exchange Order Book", "Expert", 90, "A limit order book and its matching engine, fed from eight threads.", ["command", "concurrency-patterns", "oop-and-composition"], ["order-book-matching"]),
  c(21, "task-scheduler-dependencies", "Task Scheduler with Dependencies", "Expert", 90, "A dependency-aware scheduler with a worker pool, retries and cycle checks.", ["concurrency-patterns", "strategy"], ["task-scheduler-dag"]),
  c(22, "key-value-store-ttl-transactions", "Key-Value Store with TTL and Transactions", "Expert", 90, "An in-memory store with expiry, nested transactions and pluggable eviction.", ["strategy", "proxy", "concurrency-patterns"], ["kv-store-transactions"]),
  c(23, "tic-tac-toe", "Tic-Tac-Toe", "Medium", 45, "An N×N board with K in a row, a win check that never rescans, pluggable players and undo.", ["strategy", "command", "state", "factory-method-and-abstract-factory"], ["tic-tac-toe"]),
  c(24, "car-rental", "Car Rental", "Medium", 60, "Branches and car classes, date-range bookings checked by peak overlap, and a pricing rule pipeline.", ["strategy", "chain-of-responsibility", "state", "facade"], ["car-rental"]),
  c(25, "digital-wallet", "Digital Wallet", "Hard", 90, "A double-entry ledger, idempotent transfers, holds and limits, and locks taken in one order.", ["strategy", "facade", "concurrency-patterns"], ["digital-wallet"]),
  c(26, "inventory-order-management", "Inventory and Order Management", "Hard", 60, "Stock per warehouse, expiring reservations, split allocation, and an order state machine.", ["strategy", "state", "facade"], ["inventory-order-management"]),
  c(27, "notification-service", "Notification Service", "Medium", 45, "Channels behind one interface, a rule chain with quiet hours, retries with backoff, and dedupe.", ["chain-of-responsibility", "strategy", "adapter", "observer"], ["notification-service"]),
  c(28, "airline-booking", "Airline Booking", "Hard", 90, "Seat maps and cabin capacity, timed holds, an overbooking policy, tiered refunds and bumping.", ["strategy", "state", "facade", "oop-and-composition"], ["airline-booking"]),
  c(29, "restaurant-management", "Restaurant Management", "Medium", 60, "Tables and walk-ins, one kitchen ticket per station, sold-out dishes, and a bill split to the cent.", ["strategy", "observer", "state", "facade"], ["restaurant-management"]),
  c(30, "traffic-signal", "Traffic Signal Controller", "Medium", 60, "A phase state machine with timings as data, pedestrian and emergency requests, and a safe fault.", ["state", "observer", "command", "facade"], ["traffic-signal"]),
];

export const caseBySlug = (slug: string): CaseMeta | undefined => CASES.find((x) => x.slug === slug);

/* ------------------------------------------------------------------ patterns */

export const PATTERN_GROUPS = [
  { id: "foundations", label: "Foundations", note: "The habits every pattern rests on." },
  { id: "creational", label: "Creational", note: "How objects get made." },
  { id: "structural", label: "Structural", note: "How objects fit together." },
  { id: "behavioural", label: "Behavioural", note: "How objects share the work." },
  { id: "practice", label: "In practice", note: "What shows up in real machine-coding rounds." },
] as const;
export type PatternGroup = (typeof PATTERN_GROUPS)[number]["id"];

export type PatternMeta = {
  /** the plan's lesson number (DP-NN) */
  n: number;
  /** the route slug: the lesson id without its dp-NN- prefix */
  slug: string;
  name: string;
  group: PatternGroup;
  /** the problem it solves, in a sentence */
  problem: string;
};

const p = (n: number, group: PatternGroup, slug: string, name: string, problem: string): PatternMeta => ({ n, slug, name, group, problem });

/** "DP-16" */
export const patternCode = (m: PatternMeta) => `DP-${String(m.n).padStart(2, "0")}`;
/** the lesson id in the content repo (resources/low-level-design/<id>.md): "dp-16-strategy" */
export const patternLessonId = (m: PatternMeta) => `dp-${String(m.n).padStart(2, "0")}-${m.slug}`;

export const PATTERNS: PatternMeta[] = [
  p(1, "foundations", "oop-and-composition", "OOP Pillars and Composition over Inheritance", "Behaviour that varies is easier to swap when a class holds a part than when it inherits one."),
  p(2, "foundations", "uml-class-diagrams", "UML Class Diagrams for Interviews", "You cannot discuss a design in an interview if you cannot draw it quickly."),
  p(3, "foundations", "solid-srp-ocp-lsp", "SOLID, Part 1: Single Responsibility, Open/Closed, Liskov", "Classes that do five jobs break whenever any one job changes."),
  p(4, "foundations", "solid-isp-dip-and-di", "SOLID, Part 2: Interface Segregation, Dependency Inversion and Injection", "A class that builds or looks up its own parts cannot be tested or changed."),
  p(5, "foundations", "coupling-cohesion-dry-kiss-yagni", "Coupling, Cohesion, DRY, KISS and YAGNI", "The forces behind every pattern, and the case for not adding one."),
  p(6, "creational", "singleton", "Singleton", "You need exactly one of something, and need to know why that is usually a trap."),
  p(7, "creational", "factory-method-and-abstract-factory", "Factory Method and Abstract Factory", "Callers hard-code which class to build, so adding a type means editing every caller."),
  p(8, "creational", "builder", "Builder", "A constructor with ten optional arguments is unreadable and easy to get wrong."),
  p(9, "creational", "prototype", "Prototype: Copying Objects Safely", "Building an object from scratch is costly, and a careless copy shares state it should not."),
  p(10, "structural", "adapter", "Adapter", "A class you must use speaks a different interface than the one your code expects."),
  p(11, "structural", "decorator", "Decorator", "You want to add behaviour to one object without a subclass for every combination."),
  p(12, "structural", "facade", "Facade", "Callers must know five classes and their order just to do one common thing."),
  p(13, "structural", "composite", "Composite", "A single item and a group of items should be used the same way, such as a file and a folder."),
  p(14, "structural", "proxy", "Proxy", "You need to control access to an object: lazily, remotely, with a cache or a check."),
  p(15, "structural", "bridge-and-flyweight", "Bridge and Flyweight", "Two things vary independently, or thousands of objects repeat the same shared data."),
  p(16, "behavioural", "strategy", "Strategy", "A rule keeps changing (pricing, matching, eviction) and an if-chain grows around it."),
  p(17, "behavioural", "observer", "Observer", "Many parts need to hear about a change without the source knowing who they are."),
  p(18, "behavioural", "command", "Command", "You need to queue, log, retry or undo an action, so the action itself must be an object."),
  p(19, "behavioural", "state", "State", "An object acts differently by mode and its methods fill with checks of what mode it is in."),
  p(20, "behavioural", "template-method", "Template Method", "Several flows share the same skeleton and differ in a few steps."),
  p(21, "behavioural", "chain-of-responsibility", "Chain of Responsibility", "A request may be handled by one of several steps, and the sender should not know which."),
  p(22, "behavioural", "iterator", "Iterator", "You want to walk a collection without exposing how it is stored."),
  p(23, "behavioural", "mediator-and-memento", "Mediator and Memento", "Objects tangle when they talk directly, and saving state must not break encapsulation."),
  p(24, "behavioural", "visitor", "Visitor", "A new operation over a family of classes should not mean editing every class."),
  p(25, "practice", "concurrency-patterns", "Concurrency Patterns: Producer-Consumer, Thread Pool, Read-Write Lock", "Work arrives faster than it is handled, and shared state needs a plan, not locks everywhere."),
  p(26, "practice", "anti-patterns-and-refactoring", "Anti-Patterns and Refactoring to Patterns", "Patterns used for show add classes and no value; the skill is refactoring in small steps."),
  p(27, "practice", "choosing-patterns-in-an-lld-interview", "Choosing Patterns in an LLD Interview", "From the requirements to the right pattern, and saying the trade-off out loud."),
  p(28, "practice", "pattern-map-of-the-case-studies", "The Pattern Map: 22 Case Studies, One Table", "Which pattern shows up in which round, and the order to read the rounds in."),
];

export const patternBySlug = (slug: string): PatternMeta | undefined => PATTERNS.find((x) => x.slug === slug);

/** The plan the catalogue above follows (the content repo's design-patterns-plan branch). */
export const PATTERN_PLAN_PATH = "docs/design-patterns/design-patterns-plan.md";
/** Where published pattern lessons live: the same folder as the case studies, named dp-NN-<slug>.md (see patternLessonId). */
export const PATTERN_DIR = "resources/low-level-design";

/** The "core" patterns the suggested path teaches before the case studies: the ones most case studies lean on. */
export const CORE_PATTERNS = ["strategy", "observer", "state", "command", "factory-method-and-abstract-factory", "decorator"];

export const patternByLessonId = (id: string): PatternMeta | undefined => PATTERNS.find((x) => patternLessonId(x) === id);

/** One lesson's place: its file name (dp-16-strategy.md), checked against the catalogue so a stray file never becomes a page. */
export function patternSlugOfFile(name: string): string | null {
  const m = /^(dp-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*)\.md$/.exec(name);
  return m ? (patternByLessonId(m[1])?.slug ?? null) : null;
}

/** Slugs of the catalogue's lessons that have a file in `names` (the file names found in PATTERN_DIR). The rest show as "coming soon". */
export function publishedPatternSlugs(names: string[]): Set<string> {
  return new Set(names.map(patternSlugOfFile).filter((s): s is string => !!s));
}

/** The short name a chip shows (the lesson titles are long: "SOLID, Part 2: Interface Segregation, ..."). */
const CHIP_NAMES: Record<string, string> = {
  "oop-and-composition": "Composition",
  "solid-isp-dip-and-di": "Dependency injection",
  "factory-method-and-abstract-factory": "Factory",
  "mediator-and-memento": "Memento",
  "concurrency-patterns": "Concurrency",
};
export const patternChipName = (m: PatternMeta) => CHIP_NAMES[m.slug] ?? m.name;
