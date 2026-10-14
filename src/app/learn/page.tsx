import { redirect } from "next/navigation";

// One course today: /learn is its hub.
export default function LearnPage() {
  redirect("/learn/system-design-mastery");
}
