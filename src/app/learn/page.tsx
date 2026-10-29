import type { Metadata } from "next";
import { redirect } from "next/navigation";

// /learn is prerendered as a redirect page, so link unfurlers (Slack, X, LinkedIn) read these tags.
export const metadata: Metadata = {
  title: "System Design Mastery · free course · Himanshu Kukreja",
  description: "A free system design course for backend engineers: 12 worlds, interview boss fights, 1,000+ quick checks, a daily challenge and weekly leagues. No sign-up to read.",
};

// One course today: /learn is its hub.
export default function LearnPage() {
  redirect("/learn/system-design-mastery");
}
