"use client";

import { supabaseClient } from "@/lib/supabase-client";

/** fetch() for /api/admin/* with the signed-in user's Supabase access token attached. */
export async function adminFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const { data } = await supabaseClient.auth.getSession();
  const headers = new Headers(init.headers);
  if (data.session?.access_token) headers.set("Authorization", `Bearer ${data.session.access_token}`);
  return fetch(input, { ...init, headers, cache: "no-store" });
}

/** JSON helper: throws on non-2xx with the server's error message. */
export async function adminJson<T>(input: string, init: RequestInit = {}): Promise<T> {
  const res = await adminFetch(input, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(body?.error || `HTTP ${res.status}`), { status: res.status });
  return body as T;
}
