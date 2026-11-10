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
 * Pattern slugs must exist in PATTERNS (scripts/tests/lld.test.mjs checks both ways).
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
  c(1, "parking-lot", "Parking Lot", "Medium", 90, "Floors, spots, tickets and fees, with two gates that can never give one spot to two cars.", ["strategy", "dependency-injection", "factory"]),
  c(2, "lru-cache", "LRU Cache", "Medium", 60, "A bounded cache with O(1) get and put and an eviction rule you can swap.", ["strategy", "composition-over-inheritance", "observer"], ["lru-cache", "lfu-cache"]),
  c(3, "rate-limiter", "Rate Limiter", "Hard", 75, "Three limiting algorithms behind one interface, built from rules and kept per key.", ["strategy", "factory", "dependency-injection"], ["token-bucket", "sliding-window-counter"]),
  c(4, "elevator-system", "Elevator System", "Hard", 90, "Several cars, hall calls and car calls, with a schedule per car and a dispatcher.", ["strategy", "state", "observer", "command"]),
  c(5, "movie-ticket-booking", "Movie Ticket Booking", "Hard", 90, "Seat holds, confirmation and expiry, with two buyers racing for the same seats.", ["strategy", "adapter", "state", "facade", "idempotency-key"]),
  c(6, "splitwise", "Splitwise", "Hard", 90, "Expenses split three ways, net balances, and the fewest payments to settle up.", ["strategy", "facade", "value-object"]),
  c(7, "vending-machine", "Vending Machine", "Medium", 60, "A coin-operated machine as four states, each answering every button.", ["state", "template-method", "strategy"]),
  c(8, "pub-sub-logger", "Logging Framework", "Hard", 90, "Formatters, sinks and filters wired as a chain, a pub-sub bus and strategies.", ["chain-of-responsibility", "observer", "strategy", "decorator"]),
  c(9, "snake-and-ladder", "Snake and Ladder", "Medium", 60, "A board game with pluggable dice and end-of-board rules, and a turn that survives a double tap.", ["strategy", "observer", "dependency-injection", "value-object"]),
  c(10, "chess", "Chess", "Hard", 90, "Pieces that know geometry and a game that decides what is legal, with undo.", ["command"]),
  c(11, "atm", "ATM", "Medium", 75, "A card, a PIN and a cash dispenser as states, with every failure after the debit reversed.", ["state", "adapter", "idempotency-key"]),
  c(12, "library-management", "Library Management", "Medium", 75, "Titles and copies, loans, reservations, fines and reminders over a month.", ["strategy", "observer", "state", "facade"]),
  c(13, "hotel-reservation", "Hotel Reservation", "Hard", 90, "Room inventory over date ranges, holds, stacked pricing and cancellation.", ["strategy", "state", "value-object", "idempotency-key"]),
  c(14, "ride-sharing", "Ride Sharing", "Hard", 90, "Riders, drivers on a grid, matching and fares, and a trip with a life cycle.", ["strategy", "decorator", "state", "facade"]),
  c(15, "food-delivery", "Food Delivery", "Hard", 90, "Carts, orders with a state machine, payments, partners and refunds.", ["state", "strategy", "adapter", "facade", "idempotency-key"]),
  c(16, "meeting-room-scheduler", "Meeting Room Scheduler", "Hard", 75, "Room calendars with conflict detection, recurring meetings and invites.", ["strategy", "observer", "value-object"]),
  c(17, "in-memory-file-system", "In-Memory File System", "Hard", 75, "Files and directories as one tree, path resolution, and a thread-safe log.", ["composite", "facade"]),
  c(18, "text-editor-undo-redo", "Text Editor with Undo and Redo", "Hard", 75, "A document, a cursor and an undo history, compared with snapshots.", ["command", "composite", "memento"]),
  c(19, "online-auction", "Online Auction", "Hard", 90, "Timed auctions with validated bids, a soft close and bidders who hear about it.", ["state", "observer", "strategy", "idempotency-key"]),
  c(20, "stock-exchange-order-book", "Stock Exchange Order Book", "Expert", 90, "A limit order book and its matching engine, fed from eight threads.", ["command", "single-writer", "value-object"]),
  c(21, "task-scheduler-dependencies", "Task Scheduler with Dependencies", "Expert", 90, "A dependency-aware scheduler with a worker pool, retries and cycle checks.", ["strategy", "producer-consumer"]),
  c(22, "key-value-store-ttl-transactions", "Key-Value Store with TTL and Transactions", "Expert", 90, "An in-memory store with expiry, nested transactions and pluggable eviction.", ["strategy"]),
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
  slug: string;
  name: string;
  group: PatternGroup;
  /** the problem it solves, in a sentence */
  problem: string;
};

const p = (group: PatternGroup, slug: string, name: string, problem: string): PatternMeta => ({ slug, name, group, problem });

export const PATTERNS: PatternMeta[] = [
  p("foundations", "solid", "SOLID in plain words", "Classes that do five jobs break whenever any one job changes."),
  p("foundations", "composition-over-inheritance", "Composition over inheritance", "A deep class tree locks behaviour in; holding other objects lets you swap it."),
  p("foundations", "dependency-injection", "Dependency injection", "A class that builds or looks up its own parts cannot be tested or changed."),
  p("foundations", "reading-uml", "Reading UML class diagrams", "You cannot discuss a design in an interview if you cannot draw it quickly."),
  p("creational", "singleton", "Singleton", "You need exactly one of something, and need to know why that is usually a trap."),
  p("creational", "factory", "Factory", "Callers hard-code which class to build, so adding a type means editing every caller."),
  p("creational", "abstract-factory", "Abstract factory", "Related objects must be made together and must match, whatever the variant."),
  p("creational", "builder", "Builder", "A constructor with ten optional arguments is unreadable and easy to get wrong."),
  p("creational", "prototype", "Prototype", "Building an object from scratch is costly, but copying a ready one is cheap."),
  p("structural", "adapter", "Adapter", "A class you must use speaks a different interface than the one your code expects."),
  p("structural", "bridge", "Bridge", "Two things vary independently, and subclassing both explodes into a class per pair."),
  p("structural", "composite", "Composite", "A single item and a group of items should be used the same way, such as a file and a folder."),
  p("structural", "decorator", "Decorator", "You want to add behaviour to one object without a subclass for every combination."),
  p("structural", "facade", "Facade", "Callers must know five classes and their order just to do one common thing."),
  p("structural", "flyweight", "Flyweight", "Millions of similar objects use too much memory when each keeps its own copy of shared data."),
  p("structural", "proxy", "Proxy", "You need to control access to an object: lazily, remotely, with a cache or a check."),
  p("behavioural", "strategy", "Strategy", "A rule keeps changing (pricing, matching, eviction) and an if-chain grows around it."),
  p("behavioural", "observer", "Observer", "Many parts need to hear about a change without the source knowing who they are."),
  p("behavioural", "state", "State", "An object acts differently by mode and its methods fill with checks of what mode it is in."),
  p("behavioural", "command", "Command", "You need to queue, log or undo an action, so the action itself must be an object."),
  p("behavioural", "chain-of-responsibility", "Chain of responsibility", "A request may be handled by one of several steps, and the sender should not know which."),
  p("behavioural", "template-method", "Template method", "Several flows share the same skeleton and differ in a few steps."),
  p("behavioural", "iterator", "Iterator", "You want to walk a collection without exposing how it is stored."),
  p("behavioural", "memento", "Memento", "You must save and restore an object's state without breaking its encapsulation."),
  p("behavioural", "mediator", "Mediator", "Objects that talk to each other directly end up tangled; route them through one place."),
  p("behavioural", "visitor", "Visitor", "A new operation over a family of classes should not mean editing every class."),
  p("practice", "value-object", "Value objects", "Money, time ranges and ids passed as raw numbers get mixed up and compared wrongly."),
  p("practice", "idempotency-key", "Idempotency keys", "A retry or a double tap must not charge, book or ship twice."),
  p("practice", "producer-consumer", "Producer and consumer", "Work arrives faster than it is handled, so the two sides need a queue between them."),
  p("practice", "single-writer", "Single writer", "Locks everywhere are slow and hard to reason about; one thread owning the state needs none."),
  p("practice", "choosing-a-pattern", "Choosing a pattern, or none", "Patterns used for show add classes and no value; the skill is knowing when to stop."),
];

export const patternBySlug = (slug: string): PatternMeta | undefined => PATTERNS.find((x) => x.slug === slug);

/** The pattern catalogue's plan file in the content repo. When it lands, the pattern loader reads it; until then the catalogue above stands. */
export const PATTERN_PLAN_PATH = "resources/plan/design-patterns-plan.md";
/** Where pattern lessons live once written: one markdown file per pattern slug (see PatternPage's expected shape in src/lib/learn/lld/pattern.ts). */
export const PATTERN_DIR = "resources/design-patterns";

/** The "core" patterns the suggested path teaches before the case studies: the ones most case studies lean on. */
export const CORE_PATTERNS = ["strategy", "observer", "state", "command", "factory", "decorator"];
