/**
 * POST /api/learn/ai/chat/feedback: the course chat's original feedback path, kept for pages loaded before the 12 Nov 2026
 * release. Same handler as /api/learn/ai/feedback (any rateable AI answer; { rating, wrong } still works, a note is ignored).
 */
export { POST } from "../../feedback/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
