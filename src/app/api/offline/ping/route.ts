export const dynamic = "force-dynamic";

/** Reachability check for offline reading: wifi without internet (planes) still reports onLine. */
export function GET() {
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
