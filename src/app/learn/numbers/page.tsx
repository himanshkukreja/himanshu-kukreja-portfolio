import type { Metadata } from "next";
import NumbersPlayground from "@/components/learn/numbers/NumbersPlayground";

// Pure client-side tool: the reference tables ship in the page and the calculator runs in the
// browser, so a saved copy works with no connection (offline catalog: src/lib/offline/catalog.ts).
export const metadata: Metadata = {
  title: "Numbers playground · Learn · Himanshu Kukreja",
  description:
    "Latency, throughput and storage numbers every system design interview leans on, with a unit-aware calculator: type 50k QPS × 2 KB × 30 days and see the storage and bandwidth worked out step by step.",
};

export default function NumbersPage() {
  return <NumbersPlayground />;
}
