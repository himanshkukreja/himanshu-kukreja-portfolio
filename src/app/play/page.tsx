import type { Metadata } from "next";
import PlaygroundShell from "@/components/play/PlaygroundShell";

export const metadata: Metadata = {
  title: "Engineering Playground · Himanshu Kukreja",
  description:
    "Six tiny games, each about one idea that matters in production: caching, consistent hashing, circuit breakers, estimation, race conditions and incident response.",
};

export default function PlayPage() {
  return <PlaygroundShell />;
}
