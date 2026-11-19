/** An icon given as base64, answered with a day of caching (the head links carry ?v= to refresh browsers' copies). */
export function iconResponse(b64: string, type: string): Response {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return new Response(bytes, { headers: { "Content-Type": type, "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800" } });
}
