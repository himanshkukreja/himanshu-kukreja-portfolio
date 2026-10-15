import RouteLoading from "@/components/ui/loader/RouteLoading";

export default function Loading() {
  return <RouteLoading shape="grid" label="Loading the arena" cmd="./arena --boot" steps={["load games", "check today's challenge", "warm up the leaderboard"]} />;
}
