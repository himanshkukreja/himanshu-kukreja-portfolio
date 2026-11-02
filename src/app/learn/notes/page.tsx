import { redirect } from "next/navigation";

// Notes live in the notebook now.
export default function NotesPage() {
  redirect("/notebook?tab=notes");
}
