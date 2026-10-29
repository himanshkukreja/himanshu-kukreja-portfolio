import { shareAnswer, shareAnswerStatus } from "@/lib/share/answer-api";

export const runtime = "nodejs";

/** GET /api/learn/share/answer → { enabled } (is answer sharing switched on: the shared_answers table exists). */
export async function GET() {
  return shareAnswerStatus();
}

/** POST /api/learn/share/answer: same as POST /api/learn/share. */
export async function POST(request: Request) {
  return shareAnswer(request);
}
