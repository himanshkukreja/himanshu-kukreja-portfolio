import { getLabSummaries } from "@/lib/learn/labs/load";
import LabsIndex from "@/components/learn/labs/LabsIndex";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Code labs · System Design Mastery",
  description:
    "Implement a rate limiter, an LRU cache, a consistent hashing ring or an outbox relay in Python, right in the browser, against hidden tests. No install, no server, works offline. Practice for the 'implement this component' interview round.",
};

export default async function LabsIndexPage() {
  const labs = await getLabSummaries();
  return <LabsIndex labs={labs} />;
}
