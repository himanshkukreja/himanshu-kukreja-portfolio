import "server-only";
/**
 * The routing's server half (the classifier is lib/ai/chat/route-model.ts; the decision to really use Sonnet is
 * admitChat's, lib/ai/chat/quota.ts): was the previous answer in this chat thumbed down? The page sends the call id of
 * the answer it rated down (`prevCall`); it counts only when that row is this learner's own down vote on a chat answer.
 */
import { supabase } from "@/lib/supabase";
import { ROUTING } from "@/lib/ai/features";
import type { RouteNote } from "./quota";

export async function previousAnswerDown(userId: string, callId: number | undefined | null): Promise<boolean> {
  if (!userId || !callId || !Number.isInteger(callId) || callId <= 0) return false;
  const { data, error } = await supabase.from("chat_feedback").select("rating, call:ai_calls!inner(feature, user_id)").eq("call_id", callId).eq("user_id", userId).maybeSingle();
  if (error || !data) return false;
  const call = (data as { call?: { feature?: string; user_id?: string } | { feature?: string; user_id?: string }[] | null }).call;
  const c = Array.isArray(call) ? call[0] : call;
  return (data as { rating: number }).rating === -1 && !!c && c.user_id === userId && (ROUTING.features as string[]).includes(c.feature ?? "");
}

/** The metering row's routing fields (counts and labels only). */
export const routeMeta = (r: RouteNote | undefined) => (r ? { route: r.reason, routed: r.to } : {});
