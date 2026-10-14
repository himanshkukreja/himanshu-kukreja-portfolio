import { redirect } from "next/navigation";

// Bookmarks live in the notebook now.
export default function BookmarksPage() {
  redirect("/learn/notebook?tab=bookmarks");
}
