"use client";

import { supabaseClient } from "@/lib/supabase-client";

/** fetch() for the learner's own /api/learn/* routes, with their Supabase access token attached. */
export async function userFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const { data } = await supabaseClient.auth.getSession();
  const headers = new Headers(init.headers);
  if (data.session?.access_token) headers.set("Authorization", `Bearer ${data.session.access_token}`);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  return fetch(input, { ...init, headers, cache: "no-store" });
}

/** JSON helper: throws on non-2xx with the server's error message. */
export async function userJson<T>(input: string, init: RequestInit = {}): Promise<T> {
  const res = await userFetch(input, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(body?.error || `HTTP ${res.status}`), { status: res.status });
  return body as T;
}
