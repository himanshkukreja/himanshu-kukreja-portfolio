import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "How System Design Mastery works · Himanshu Kukreja",
  description: "The visual guide to the System Design Mastery course.",
};

// short link: /guide → the course guide
export default function GuideRedirect() {
  redirect("/learn/guide");
}
