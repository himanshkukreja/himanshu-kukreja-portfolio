import { notFound } from "next/navigation";
import LatencyLadder from "@/components/learn/arena/games/LatencyLadder";
import Sorter from "@/components/learn/arena/games/Sorter";
import { ARENA_GAMES } from "@/lib/learn/arena/games";

// No dynamicParams = false: on Cloudflare (OpenNext) the prerendered games, reached through the course host's
// rewrite, answered 404 with it (8 Nov 2026). Unknown games still end in notFound() below.

export function generateStaticParams() {
  return ARENA_GAMES.map((g) => ({ game: g.key }));
}

export async function generateMetadata({ params }: { params: Promise<{ game: string }> }) {
  const { game } = await params;
  const g = ARENA_GAMES.find((x) => x.key === game);
  return g ? { title: `${g.name} · Arena · Himanshu Kukreja`, description: g.hook } : {};
}

export default async function ArenaGamePage({ params }: { params: Promise<{ game: string }> }) {
  const { game } = await params;
  if (game === "latency") return <LatencyLadder />;
  if (game === "store") return <Sorter which="store" />;
  if (game === "outage") return <Sorter which="outage" />;
  notFound();
}
