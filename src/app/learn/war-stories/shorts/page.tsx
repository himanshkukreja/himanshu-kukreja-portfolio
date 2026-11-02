import { redirect } from "next/navigation";

/** The war-story shorts moved into the site-wide Shorts feed. */
export default function WarShortsPage() {
  redirect("/shorts?cat=stories");
}
