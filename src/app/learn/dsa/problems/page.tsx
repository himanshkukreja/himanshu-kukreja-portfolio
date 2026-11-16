import { permanentRedirect } from "next/navigation";

// The bank moved to /dsa/practice (the Practice tab). The middleware redirects the plain path with its query; this keeps
// a direct hit working too. /dsa/problems/<id> (the problem rooms) is unchanged.

export default async function ProblemsMoved({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(await searchParams)) if (typeof v === "string") sp.set(k, v);
  const q = sp.toString();
  permanentRedirect(`/dsa/practice${q ? `?${q}` : ""}`);
}
