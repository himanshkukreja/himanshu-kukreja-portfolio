/**
 * DEV-ONLY signed-in fixture for the layout gap check (scripts/qa/layout-gaps.mjs). Honoured only when
 * NODE_ENV !== "production" (or in a local build made with NEXT_PUBLIC_QA_FIXTURE=1 for the check): `?qa=signed-in` (kept for the tab in sessionStorage) makes AuthProvider hand out a fake learner
 * and answers the learner's /api/learn/* reads with fake data, so every signed-in card (interview readiness, left-off, Today,
 * the tutor, achievements) renders at its real size. In a production build every function here returns false/null at once.
 */
const KEY = "hk.qa.signedin";

/** dev server, or a LOCAL production build made for the check with NEXT_PUBLIC_QA_FIXTURE=1 (never set in CI or on staging/prod,
 *  where this constant is false at build time and the fixture code is dead) */
const ENABLED = process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_QA_FIXTURE === "1";

export function qaSignedIn(): boolean {
  if (!ENABLED || typeof window === "undefined") return false;
  try {
    const q = new URLSearchParams(window.location.search).get("qa");
    if (q === "signed-in") window.sessionStorage.setItem(KEY, "1");
    if (q === "guest") window.sessionStorage.removeItem(KEY);
    return window.sessionStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export const QA_USER = {
  id: "00000000-0000-4000-8000-0000000000a1",
  email: "qa@example.com",
  app_metadata: {},
  user_metadata: { full_name: "Asha Learner" },
  aud: "authenticated",
  created_at: "2026-01-01T00:00:00Z",
};

export const QA_PROFILE = { id: QA_USER.id, full_name: "Asha Learner", email: "qa@example.com", avatar_url: null };

const READINESS = {
  track: "dsa",
  band: "building",
  bandLabel: "Building the foundations",
  step: 2,
  capped: "no mock interview round yet",
  evidence: { have: 3, of: 5 },
  levers: [
    { id: "lessons", label: "Finish Hashing", why: "6 lessons left in the part you are on", link: { href: "/dsa", label: "Finish Hashing" } },
    { id: "problems", label: "Solve five medium problems", why: "you have solved 12 of 150", link: { href: "/dsa/practice", label: "Open Practice" } },
    { id: "mock", label: "Take a mock round", why: "the estimate is held without one", link: { href: "/dsa/practice", label: "Start a round" } },
  ],
  inputs: [
    { id: "lessons", label: "Lessons", value: "34 of 60 lessons", score: 0.56, weight: 0.3, none: false },
    { id: "problems", label: "Problems", value: "12 of 150 solved", score: 0.08, weight: 0.3, none: false },
    { id: "review", label: "Review", value: "9 of 14 cards held", score: 0.6, weight: 0.2, none: false },
    { id: "mock", label: "Mock interviews", value: "no scored round yet", score: 0, weight: 0.2, none: true },
  ],
};

/** a fake JSON body for a learner read, or null to let the request through */
export function qaApi(url: string): unknown | null {
  if (!qaSignedIn()) return null;
  if (url.includes("/api/learn/readiness")) return { tracks: [READINESS], readings: {} };
  if (url.includes("/api/dsa/revise")) return { events: [], editorial: [] };
  if (url.includes("/api/learn/ai/chat/memory")) return { available: true, paused: false };
  return null;
}
