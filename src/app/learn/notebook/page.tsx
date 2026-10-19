import { getCourseMap } from "@/lib/learn/course";
import Notebook from "@/components/learn/notebook/Notebook";

export const runtime = "nodejs";
// Rendered once and served from the cache; notes, highlights and bookmarks load on the client.
export const revalidate = 86400;

export const metadata = {
  title: "Notebook · Learn · Himanshu Kukreja",
  description: "Your highlights, notes and bookmarks from System Design Mastery, grouped by lesson.",
};

export default async function NotebookPage() {
  const map = await getCourseMap();
  if (!map) return null;
  // ?tab= is applied by <Notebook> on the client so this HTML can be shared by every visitor
  return <Notebook map={map} initialTab="highlights" />;
}
