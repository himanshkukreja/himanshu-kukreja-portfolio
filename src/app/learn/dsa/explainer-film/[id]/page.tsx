import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getExplainer } from "@/lib/dsa/load";
import FilmPlayer from "@/components/dsa/problem/explainer/FilmPlayer";

/**
 * A problem's explainer laid out as a film (16:9 or 9:16), for scripts/explainers/film.mjs to record with its narration.
 * Local only: it answers in `next dev` or with HK_FILM=1, and is never linked or indexed.
 */
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ format?: string; theme?: string }> }) {
  if (process.env.NODE_ENV === "production" && process.env.HK_FILM !== "1") notFound();
  const [{ id }, q] = await Promise.all([params, searchParams]);
  const e = await getExplainer(id);
  if (!e) notFound();
  return <FilmPlayer explainer={e} format={q.format === "tall" ? "tall" : "wide"} theme={q.theme === "dark" ? "dark" : "light"} />;
}
