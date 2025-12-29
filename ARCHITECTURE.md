# /learn Section - System Architecture

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         USER'S BROWSER                               │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │  Portfolio Site (himanshukukreja.in)                       │    │
│  │                                                            │    │
│  │  Navbar: Home | About | Stories | Learn ← NEW             │    │
│  └────────────────────────────────────────────────────────────┘    │
│                              │                                       │
│                              │ Click "Learn"                        │
│                              ▼                                       │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │  /learn - Course Overview                                  │    │
│  │  ┌──────────────────────────────────────────────────┐     │    │
│  │  │ Week 0: Foundations                              │     │    │
│  │  │   • foundations-part-1                           │     │    │
│  │  │   • foundations-part-2                           │     │    │
│  │  └──────────────────────────────────────────────────┘     │    │
│  │  ┌──────────────────────────────────────────────────┐     │    │
│  │  │ Week 1: Data at Scale                            │     │    │
│  │  │   • day-01-partitioning-deep-dive               │     │    │
│  │  │   • day-02-replication-tradeoffs                │     │    │
│  │  └──────────────────────────────────────────────────┘     │    │
│  └────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              │ Click lesson
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    VERCEL (Next.js Server)                          │
│                                                                      │
│  Request: GET /learn/week-01/day-01-partitioning-deep-dive         │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────┐      │
│  │  src/app/learn/[week]/[slug]/page.tsx                    │      │
│  │                                                           │      │
│  │  1. Extract params: { week: "week-01",                   │      │
│  │                       slug: "day-01-..." }               │      │
│  │                                                           │      │
│  │  2. Call: getLearningResource(week, slug)                │      │
│  └──────────────────────────────────────────────────────────┘      │
│                              │                                       │
│                              ▼                                       │
│  ┌──────────────────────────────────────────────────────────┐      │
│  │  src/lib/github.ts                                       │      │
│  │                                                           │      │
│  │  3. Check cache (1 hour TTL)                             │      │
│  │     • Hit? Return cached data                            │      │
│  │     • Miss? Fetch from GitHub API ────────────┐          │      │
│  └──────────────────────────────────────────────│────────────┘      │
│                                                  │                  │
└──────────────────────────────────────────────────│──────────────────┘
                                                   │
                                                   │ HTTPS + Token
                                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         GITHUB API                                  │
│                                                                      │
│  GET https://api.github.com/repos/                                 │
│      himanshkukreja/system-design-mastery/contents/                │
│      resources/week-01/day-01-partitioning-deep-dive.md            │
│                                                                      │
│  Headers:                                                           │
│    Authorization: Bearer github_pat_XXX                            │
│    Accept: application/vnd.github.v3.raw                           │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────┐      │
│  │  Private Repo: system-design-mastery                     │      │
│  │                                                           │      │
│  │  resources/                                              │      │
│  │  ├── system-design-learning-plan.md                      │      │
│  │  ├── week-00/                                            │      │
│  │  │   ├── foundations-part-1.md                           │      │
│  │  │   ├── foundations-part-2.md                           │      │
│  │  │   └── foundations-part-3.md                           │      │
│  │  ├── week-01/                                            │      │
│  │  │   ├── week-01-preview.md                              │      │
│  │  │   ├── day-01-partitioning-deep-dive.md  ← Fetched    │      │
│  │  │   ├── day-02-replication-tradeoffs.md                 │      │
│  │  │   └── ...                                             │      │
│  │  └── week-XX/                                            │      │
│  └──────────────────────────────────────────────────────────┘      │
│                                                                      │
│  Response: Raw markdown content                                    │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              │ Return markdown
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    VERCEL (Next.js Server)                          │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────┐      │
│  │  src/lib/markdown.ts                                     │      │
│  │                                                           │      │
│  │  4. Convert markdown to HTML                             │      │
│  │     • Parse markdown (remark-parse)                      │      │
│  │     • Support GFM (tables, task lists)                   │      │
│  │     • Transform image URLs (ImageKit)                    │      │
│  │     • Generate HTML (rehype-stringify)                   │      │
│  └──────────────────────────────────────────────────────────┘      │
│                              │                                       │
│                              ▼                                       │
│  ┌──────────────────────────────────────────────────────────┐      │
│  │  5. Render React Component                               │      │
│  │                                                           │      │
│  │  • Breadcrumb navigation                                 │      │
│  │  • Week sidebar (sticky)                                 │      │
│  │  • Markdown content (styled with Tailwind typography)    │      │
│  │  • Previous/Next navigation                              │      │
│  │  • Back to course link                                   │      │
│  └──────────────────────────────────────────────────────────┘      │
│                              │                                       │
│                              │ Send HTML                            │
│                              ▼                                       │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         USER'S BROWSER                               │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Rendered Lesson Page                                       │   │
│  │  ┌──────────────────────────────────────────────────┐       │   │
│  │  │ Breadcrumb: Learn > Week 1 > Partitioning        │       │   │
│  │  └──────────────────────────────────────────────────┘       │   │
│  │  ┌──────────┐  ┌────────────────────────────────────┐       │   │
│  │  │ Sidebar  │  │ # Partitioning Deep-Dive          │       │   │
│  │  │          │  │                                    │       │   │
│  │  │ Week 1   │  │ Understanding data partitioning... │       │   │
│  │  │ • Day 1  │  │                                    │       │   │
│  │  │ • Day 2  │  │ ```code examples```                │       │   │
│  │  │ • Day 3  │  │                                    │       │   │
│  │  └──────────┘  └────────────────────────────────────┘       │   │
│  │  ┌──────────────────────────────────────────────────┐       │   │
│  │  │ ← Previous     |     Next →                      │       │   │
│  │  └──────────────────────────────────────────────────┘       │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

## Data Flow Diagram

```
┌──────────────┐
│ User clicks  │
│ "Learn"      │
└──────┬───────┘
       │
       ▼
┌──────────────────────────────────────────────────────┐
│ Next.js App Router                                   │
│ Route: /learn                                        │
└──────┬───────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────┐
│ getAllLearningResources()                            │
│ • Fetch directory listing from GitHub                │
│ • For each week:                                     │
│   - Fetch files in week directory                   │
│   - Parse filenames → metadata                      │
│ • Sort by order (week, day, type)                   │
│ • Return: LearningResource[]                        │
└──────┬───────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────┐
│ Render Course Overview                               │
│ • Group resources by week                            │
│ • Display statistics                                 │
│ • Show week cards with lessons                      │
└──────────────────────────────────────────────────────┘

┌──────────────┐
│ User clicks  │
│ a lesson     │
└──────┬───────┘
       │
       ▼
┌──────────────────────────────────────────────────────┐
│ Next.js Dynamic Route                                │
│ Route: /learn/[week]/[slug]                         │
│ Params: { week: "week-01", slug: "day-01-..." }     │
└──────┬───────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────┐
│ getLearningResource(week, slug)                      │
│ • getAllLearningResources()                          │
│ • Find matching resource                             │
│ • fetchMarkdownContent(resource.path)                │
│ • Return: { resource, content }                      │
└──────┬───────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────┐
│ markdownToHtml(content)                              │
│ • unified() + remark-parse                           │
│ • remark-gfm (tables, task lists)                   │
│ • Transform images → ImageKit URLs                   │
│ • remark-rehype + rehype-stringify                   │
│ • Return: HTML string                                │
└──────┬───────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────┐
│ Render Lesson Page                                   │
│ • Breadcrumb                                         │
│ • Sidebar (week navigation)                          │
│ • Markdown content (dangerouslySetInnerHTML)        │
│ • Previous/Next links                                │
└──────────────────────────────────────────────────────┘
```

## Caching Strategy

```
┌─────────────────────────────────────────────────────────────┐
│                    Request Timeline                          │
└─────────────────────────────────────────────────────────────┘

T=0:00
User visits /learn/week-01/day-01-partitioning
  │
  ▼
GitHub API called (MISS)
  │ Fetch: resources/week-01/day-01-partitioning.md
  │ Cache: Store with TTL=3600s (1 hour)
  │
  ▼
Page rendered and sent to user (Slow: ~1-2s)

T=0:30 (30 seconds later)
Different user visits same URL
  │
  ▼
GitHub API NOT called (HIT)
  │ Cache: Return cached data
  │
  ▼
Page rendered and sent to user (Fast: ~200ms)

T=1:00 (1 hour later)
Another user visits same URL
  │
  ▼
Cache expired, GitHub API called (MISS)
  │ Fetch: resources/week-01/day-01-partitioning.md
  │ Cache: Store with TTL=3600s (1 hour)
  │
  ▼
Page rendered and sent to user (Slow: ~1-2s)

┌─────────────────────────────────────────────────────────────┐
│                   Cache Behavior                             │
└─────────────────────────────────────────────────────────────┘

First request:  [API Call] ─┐
                            ▼
                     [Cache Store] ─── TTL: 3600s
                            │
Subsequent requests: [Cache Hit] ──▶ Fast response
(within 1 hour)
                            │
                            ▼
After 1 hour:        [API Call] ─┐
                                  ▼
                          [Cache Store] ─── TTL: 3600s
```

## Authentication Flow

```
┌─────────────────────────────────────────────────────────────┐
│                GitHub API Authentication                     │
└─────────────────────────────────────────────────────────────┘

Step 1: Create Token (One-time setup)
┌────────────────────────────────────────┐
│ GitHub Settings                         │
│ > Developer Settings                    │
│ > Personal Access Tokens                │
│ > Fine-grained tokens                   │
│                                         │
│ Generate token with:                    │
│ • Repo: system-design-mastery          │
│ • Permission: Contents (Read-only)     │
│                                         │
│ Result: github_pat_11AAA...             │
└────────────────────────────────────────┘
         │
         ▼
Step 2: Store Token
┌────────────────────────────────────────┐
│ Local: .env                             │
│ GITHUB_PERSONAL_ACCESS_TOKEN=github... │
│                                         │
│ Vercel: Environment Variables           │
│ GITHUB_PERSONAL_ACCESS_TOKEN=github... │
└────────────────────────────────────────┘
         │
         ▼
Step 3: Use Token in Requests
┌────────────────────────────────────────┐
│ fetch(github_api_url, {                 │
│   headers: {                            │
│     'Authorization': 'Bearer ${TOKEN}', │
│     'Accept': 'application/vnd.github.v3+json' │
│   }                                     │
│ })                                      │
└────────────────────────────────────────┘
         │
         ▼
Step 4: GitHub Validates
┌────────────────────────────────────────┐
│ GitHub API:                             │
│ ✓ Token valid                           │
│ ✓ Repo access granted                  │
│ ✓ Permission sufficient                 │
│                                         │
│ Return: File content                    │
└────────────────────────────────────────┘
```

## Component Hierarchy

```
/learn
└── page.tsx (Course Overview)
    ├── Stats Cards
    │   ├── Weeks: 10
    │   ├── Resources: 26
    │   ├── Time/Day: 1 hour
    │   └── Capstones: 4
    ├── Week Cards (map over weeks)
    │   ├── Week Header
    │   │   ├── Week Number
    │   │   └── Lesson Count
    │   └── Lesson Links (map over resources)
    │       ├── Type Icon (preview/day/capstone)
    │       ├── Title
    │       ├── Day Badge (if applicable)
    │       └── Arrow Icon
    └── Footer CTA
        └── Start Learning Button

/learn/[week]/[slug]
└── page.tsx (Individual Lesson)
    ├── Breadcrumb
    │   ├── Learn (link)
    │   ├── Week X (link)
    │   └── Lesson Title (current)
    ├── Layout Grid
    │   ├── Sidebar (1 col, sticky)
    │   │   ├── Week Title
    │   │   └── Lesson List
    │   │       ├── Day 1 (link, highlighted if current)
    │   │       ├── Day 2 (link)
    │   │       └── ...
    │   └── Main Content (3 cols)
    │       ├── Header
    │       │   ├── Type Badges
    │       │   │   ├── Capstone
    │       │   │   ├── Week Preview
    │       │   │   └── Day X
    │       │   └── Title (h1)
    │       ├── Markdown Content
    │       │   └── dangerouslySetInnerHTML
    │       ├── Navigation
    │       │   ├── Previous Lesson (if exists)
    │       │   └── Next Lesson (if exists)
    │       └── Back to Course Link
```

## File Type Classification

```
┌─────────────────────────────────────────────────────────────┐
│              Filename → Type Mapping                         │
└─────────────────────────────────────────────────────────────┘

Pattern                              Type           Order
───────────────────────────────────────────────────────────────
system-design-learning-plan.md   → overview         0
foundations-part-1.md            → foundations      1
foundations-part-2.md            → foundations      2
week-01-preview.md               → week-preview     100
day-01-topic.md                  → day-content      101
day-02-topic.md                  → day-content      102
day-03-topic.md                  → day-content      103
capstone-project.md              → capstone         199

Order Calculation:
• overview: 0
• foundations: part number (1, 2, 3)
• week-preview: week_number * 100 (100, 200, 300...)
• day-content: week_number * 100 + day_number (101, 102...)
• capstone: week_number * 100 + 99 (199, 299...)
```

## Error Handling

```
┌─────────────────────────────────────────────────────────────┐
│                    Error Flow                                │
└─────────────────────────────────────────────────────────────┘

Request: /learn/week-01/day-01-partitioning
  │
  ▼
getLearningResource(week, slug)
  │
  ├─ Try: fetchGitHubContent()
  │   │
  │   ├─ Success ──▶ Return content
  │   │
  │   └─ Failure (404, 403, 500)
  │       │
  │       ├─ 404: File not found
  │       │   └─▶ return null ──▶ notFound()
  │       │
  │       ├─ 403: Rate limit / Auth error
  │       │   └─▶ throw Error ──▶ error.tsx
  │       │
  │       └─ 500: GitHub down
  │           └─▶ throw Error ──▶ error.tsx
  │
  └─ Catch: Log error, return null
      └─▶ notFound() ──▶ Next.js 404 page
```

## Security Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   Security Layers                            │
└─────────────────────────────────────────────────────────────┘

Layer 1: Token Storage
├─ .env file (git-ignored)
├─ Vercel Environment Variables (encrypted)
└─ Never exposed to client-side JavaScript

Layer 2: Token Permissions
├─ Fine-grained (not classic token)
├─ Read-only access
├─ Single repo only
└─ Expires after 1 year

Layer 3: Server-Side Execution
├─ Token used in Next.js server components only
├─ Never sent to browser
└─ API calls happen server-side

Layer 4: Rate Limiting
├─ 5,000 requests/hour (GitHub limit)
├─ 1-hour caching reduces calls
└─ ~26 requests/hour actual usage

Layer 5: Error Handling
├─ Graceful failures (return null)
├─ No sensitive data in error messages
└─ Fallback to 404 page
```

---

This architecture provides:
- ✅ Separation of content and presentation
- ✅ Dynamic updates without rebuilding
- ✅ Secure access to private content
- ✅ Optimized performance with caching
- ✅ Scalable and maintainable design
