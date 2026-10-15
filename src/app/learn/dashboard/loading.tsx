import RouteLoading from "@/components/ui/loader/RouteLoading";

export default function Loading() {
  return <RouteLoading shape="dashboard" label="Loading your progress" cmd="git log --stat ~/progress" steps={["load profile", "sum xp + streaks", "plot the heatmap"]} />;
}
