import { redirect } from "next/navigation";

// Notes live in the notebook now.
export default function NotesPage() {
  redirect("/learn/notebook?tab=notes");
}
