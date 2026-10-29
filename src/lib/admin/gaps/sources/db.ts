import "server-only";
/** Paged reads for the gap sources: at most `max` rows, 1000 per request, a missing table reported as such. */
import { isMissingTable } from "@/lib/search/smart/querylog";

type PgError = { code?: string; message?: string; details?: string | null } | null;
type Page<T> = (from: number, to: number) => PromiseLike<{ data: T[] | null; error: PgError }>;

export async function readPaged<T>(page: Page<T>, max = 20_000): Promise<{ rows: T[]; missing: boolean; error?: string }> {
  const rows: T[] = [];
  for (let from = 0; from < max; from += 1000) {
    const { data, error } = await page(from, Math.min(from + 999, max - 1));
    if (error) {
      if (isMissingTable(error)) return { rows: [], missing: true };
      return { rows, missing: false, error: error.message || "read failed" };
    }
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < 1000) break;
  }
  return { rows, missing: false };
}
