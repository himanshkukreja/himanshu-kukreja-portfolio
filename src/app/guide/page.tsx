import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { courseUrlFor } from "@/lib/site/hosts";

export const metadata: Metadata = {
  title: "How System Design Mastery works · Himanshu Kukreja",
  description: "The visual guide to the System Design Mastery course.",
};

// short link: /guide → the course guide (the middleware answers /guide first on both hosts)
export default function GuideRedirect() {
  redirect(courseUrlFor("/guide"));
}
