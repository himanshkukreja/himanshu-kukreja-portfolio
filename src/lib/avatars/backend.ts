import "server-only";
/**
 * Where avatar state lives: user_profiles.avatar_url, the public "avatars" Storage bucket and the
 * avatar_uploads log (rate limit). Service-role client only: the browser never writes any of them
 * (supabase/migrations/20261101_avatars.sql).
 */
import { revalidateTag } from "next/cache";
import { supabase } from "@/lib/supabase";
import { settingsForUser } from "@/lib/share/store";
import { shareTag } from "@/lib/share/stats";
import { AVATAR_BUCKET } from "./catalog";

export const avatarBackend = {
  async getAvatar(userId: string): Promise<string | null> {
    const { data, error } = await supabase.from("user_profiles").select("avatar_url").eq("id", userId).maybeSingle();
    if (error) throw new Error(error.message);
    return (data?.avatar_url as string | null) ?? null;
  },

  /** false when the learner has no profile row yet (the sign-up trigger creates it). */
  async setAvatar(userId: string, url: string | null): Promise<boolean> {
    const { data, error } = await supabase.from("user_profiles").update({ avatar_url: url, updated_at: new Date().toISOString() }).eq("id", userId).select("id");
    if (error) throw new Error(error.message);
    return (data?.length ?? 0) > 0;
  },

  /** The photo Google gave us at sign-in (auth metadata, which Supabase refreshes on every sign-in). */
  async googlePhoto(userId: string): Promise<string | null> {
    const { data, error } = await supabase.auth.admin.getUserById(userId);
    if (error || !data?.user) return null;
    const meta = (data.user.user_metadata || {}) as Record<string, unknown>;
    const url = [meta.avatar_url, meta.picture].find((v): v is string => typeof v === "string" && /^https:\/\/[^\s"'<>]+$/.test(v));
    return url ?? null;
  },

  async putObject(path: string, bytes: Uint8Array, contentType: string): Promise<string> {
    const { error } = await supabase.storage.from(AVATAR_BUCKET).upload(path, bytes, { contentType, cacheControl: "31536000", upsert: false });
    if (error) throw Object.assign(new Error(error.message), { missingBucket: /not found|bucket/i.test(error.message) });
    return supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path).data.publicUrl;
  },

  async listObjects(prefix: string): Promise<string[]> {
    const { data, error } = await supabase.storage.from(AVATAR_BUCKET).list(prefix, { limit: 100 });
    if (error) throw new Error(error.message);
    return (data || []).filter((o) => o.name && !o.name.endsWith("/")).map((o) => `${prefix}/${o.name}`);
  },

  async removeObjects(paths: string[]): Promise<void> {
    if (!paths.length) return;
    const { error } = await supabase.storage.from(AVATAR_BUCKET).remove(paths);
    if (error) throw new Error(error.message);
  },

  /** Uploads in the last 24 h; null when the log table isn't there (migration not applied). */
  async uploadsSince(userId: string, sinceIso: string): Promise<number | null> {
    const { count, error } = await supabase.from("avatar_uploads").select("id", { count: "exact", head: true }).eq("user_id", userId).gte("created_at", sinceIso);
    if (error) return null;
    return count ?? 0;
  },

  async logUpload(userId: string, bytes: number): Promise<void> {
    await supabase.from("avatar_uploads").insert({ user_id: userId, bytes });
  },

  /** The public profile page (/u/<handle>) caches for 60 s: show the new avatar there at once. */
  async afterChange(userId: string): Promise<void> {
    try {
      const { settings } = await settingsForUser(userId);
      if (settings?.handle) revalidateTag(shareTag(settings.handle));
    } catch {
      /* the page catches up within a minute */
    }
  },
};

export type AvatarBackend = typeof avatarBackend;
