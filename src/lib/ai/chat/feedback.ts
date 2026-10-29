import "server-only";
/** Is answer feedback on (the chat_feedback table exists)? Checked once per instance every 5 minutes. */
import { supabase } from "@/lib/supabase";

let probe: { at: number; ok: boolean } | null = null;
export async function feedbackEnabled(): Promise<boolean> {
  if (probe && Date.now() - probe.at < 300_000) return probe.ok;
  const { error } = await supabase.from("chat_feedback").select("id", { count: "exact", head: true }).limit(1);
  probe = { at: Date.now(), ok: !error };
  return probe.ok;
}
