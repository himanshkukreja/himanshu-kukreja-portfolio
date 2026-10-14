import { getCourseMap } from "@/lib/learn/course";
import Notebook, { type NotebookTab } from "@/components/learn/notebook/Notebook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Notebook · Learn · Himanshu Kukreja",
  description: "Your highlights, notes and bookmarks from System Design Mastery, grouped by lesson.",
};

const TABS: NotebookTab[] = ["highlights", "notes", "bookmarks"];

export default async function NotebookPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  const map = await getCourseMap();
  const initialTab = TABS.includes(tab as NotebookTab) ? (tab as NotebookTab) : "highlights";
  if (!map) return null;
  return <Notebook map={map} initialTab={initialTab} />;
}
