import SavedPaths from "@/components/learn/saved/SavedPaths";

export const runtime = "nodejs";
// A static shell served from the cache: saved paths are the learner's own and load on the client
// (this browser, and the profile for signed-in learners), so a view costs no function time.
export const revalidate = 86400;

export const metadata = {
  title: "Saved paths · Learn · Himanshu Kukreja",
  description: "Learning paths and search results you saved from System Design Mastery, as checklists you can follow on any device.",
  robots: { index: false, follow: true },
};

export default function SavedPathsPage() {
  return <SavedPaths />;
}
